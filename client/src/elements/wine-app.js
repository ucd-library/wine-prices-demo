import { LitElement, html, css } from 'lit';
import './search-bar.js';
import './results-list.js';
import './page-viewer.js';
import './filter-panel.js';

const EMPTY_FILTERS = {
  colors: [],
  countries: [],
  regions: [],
  varietals: [],
  vintageYearMin: null,
  vintageYearMax: null,
  priceMin: null,
  priceMax: null,
};

/**
 * Root application element. Owns search + filter state and coordinates
 * filter-panel → search-bar → results-list → page-viewer.
 */
class WineApp extends LitElement {
  static properties = {
    _results:      { state: true },
    _sql:          { state: true },
    _params:       { state: true },
    _loading:      { state: true },
    _error:        { state: true },
    _selectedPage: { state: true },
    _facets:       { state: true },
    _filters:      { state: true },
    _searched:     { state: true },
    _page:         { state: true },
    _totalPages:   { state: true },
    _total:        { state: true },
  };

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: #1a1a24;
      color: #e8e4dc;
    }

    header {
      background: #12111b;
      border-bottom: 1px solid #2d2b40;
      padding: 1.25rem 2rem;
      display: flex;
      align-items: baseline;
      gap: 1.5rem;
    }

    .wordmark {
      font-family: Georgia, serif;
      font-size: 1.4rem;
      font-weight: normal;
      color: #e8e4dc;
      letter-spacing: -0.01em;
    }

    .wordmark span { color: #ef7da4; }

    .tagline {
      font-size: 12px;
      color: #b7b0d0;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .layout {
      max-width: 1260px;
      margin: 0 auto;
      padding: 2rem;
      display: grid;
      grid-template-columns: 260px 1fr;
      gap: 2rem;
      align-items: start;
    }

    @media (max-width: 800px) {
      .layout { grid-template-columns: 1fr; }
      aside { position: static; }
    }

    aside {
      position: sticky;
      top: 1.5rem;
      max-height: calc(100vh - 3rem);
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: #2d2b40 transparent;
    }

    .empty-state {
      text-align: center;
      padding: 5rem 2rem;
      color: #b7b0d0;
    }

    .empty-state p {
      font-size: 14px;
      margin-top: 0.5rem;
    }

    .empty-heading {
      font-family: Georgia, serif;
      font-size: 1.5rem;
      font-weight: normal;
      color: #a89dc7;
    }

    .no-results {
      text-align: center;
      padding: 3rem 2rem;
      color: #b7b0d0;
      font-size: 14px;
    }

    .db-stats {
      display: flex;
      justify-content: center;
      gap: 2.5rem;
      margin-top: 2rem;
    }

    .db-stat {
      text-align: center;
    }

    .db-stat-value {
      font-family: Georgia, serif;
      font-size: 2rem;
      font-weight: normal;
      color: #ef7da4;
      line-height: 1;
    }

    .db-stat-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #a89dc7;
      margin-top: 0.35rem;
      font-weight: 600;
    }

    .pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid #2d2b40;
    }

    .pagination button {
      background: #12111b;
      border: 1px solid #2d2b40;
      color: #e8e4dc;
      padding: 0.4rem 0.85rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
      transition: border-color 0.15s, color 0.15s;
      min-width: 2.2rem;
    }

    .pagination button:hover:not(:disabled) {
      border-color: #9b3a54;
      color: #fff;
    }

    .pagination button:disabled {
      opacity: 0.35;
      cursor: default;
    }

    .pagination button.active {
      border-color: #9b3a54;
      background: #2d1420;
      color: #f8f0f3;
      cursor: default;
    }

    .pagination .page-ellipsis {
      color: #a89dc7;
      font-size: 13px;
      padding: 0 0.25rem;
      user-select: none;
    }
  `;

  constructor() {
    super();
    this._results = [];
    this._sql = '';
    this._params = [];
    this._loading = false;
    this._error = '';
    this._selectedPage = null;
    this._facets = null;
    this._filters = { ...EMPTY_FILTERS };
    this._currentQuery = '';
    this._searched = false;
    this._page = 1;
    this._totalPages = 1;
    this._total = 0;
    this._cachedConditions = null;
    this._cachedConditionParams = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._loadFacets();
  }

  async _loadFacets() {
    try {
      const res = await fetch('/api/facets');
      if (res.ok) this._facets = await res.json();
    } catch { /* non-fatal */ }
  }

  _hasActiveFilters() {
    const f = this._filters;
    return !!(
      f.colors?.length || f.countries?.length || f.regions?.length ||
      f.varietals?.length || f.vintageYearMin != null || f.vintageYearMax != null ||
      f.priceMin != null || f.priceMax != null
    );
  }

  async _doSearch() {
    if (!this._currentQuery.trim() && !this._hasActiveFilters()) {
      this._results = [];
      this._sql = '';
      this._searched = false;
      this._cachedConditions = null;
      this._cachedConditionParams = null;
      return;
    }

    this._loading = true;
    this._error = '';
    this._searched = true;
    this._page = 1;

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: this._currentQuery,
          filters: this._filters,
          page: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      this._results = data.results ?? [];
      this._sql = data.sql ?? '';
      this._params = data.params ?? [];
      this._total = data.total ?? 0;
      this._totalPages = data.totalPages ?? 1;
      this._cachedConditions = data.conditions ?? null;
      this._cachedConditionParams = data.conditionParams ?? null;
    } catch (err) {
      this._error = err.message;
    } finally {
      this._loading = false;
    }
  }

  /**
   * Navigate to a different page using cached conditions — no LLM call.
   * @param {number} newPage
   */
  async _changePage(newPage) {
    if (!this._cachedConditions || newPage < 1 || newPage > this._totalPages) return;

    this._loading = true;
    this._error = '';
    this._page = newPage;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conditions: this._cachedConditions,
          conditionParams: this._cachedConditionParams,
          page: newPage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Page load failed');
      this._results = data.results ?? [];
      this._sql = data.sql ?? '';
      this._params = data.params ?? [];
      this._total = data.total ?? 0;
      this._totalPages = data.totalPages ?? 1;
    } catch (err) {
      this._error = err.message;
    } finally {
      this._loading = false;
    }
  }

  /** @param {CustomEvent} e */
  _handleSearch(e) {
    this._currentQuery = e.detail.query ?? '';
    this._doSearch();
  }

  /** @param {CustomEvent} e */
  _handleFilterChange(e) {
    this._filters = e.detail;
    this._doSearch();
  }

  /** @param {CustomEvent} e */
  _handlePageSelect(e) {
    this._selectedPage = e.detail;
  }

  _handleViewerClose() {
    this._selectedPage = null;
  }

  /**
   * Build the list of page numbers/ellipses to display.
   * Always includes first, last, and up to 2 pages on either side of current.
   * @returns {(number|string)[]}
   */
  _pageItems() {
    const { _page: cur, _totalPages: total } = this;
    const show = new Set([1, total]);
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) show.add(i);
    const sorted = [...show].sort((a, b) => a - b);
    const items = [];
    let prev = 0;
    for (const p of sorted) {
      if (p - prev > 1) items.push('…');
      items.push(p);
      prev = p;
    }
    return items;
  }

  /**
   * @returns {import('lit').TemplateResult|string}
   */
  _renderPagination() {
    if (this._totalPages <= 1) return '';
    return html`
      <div class="pagination">
        <button
          ?disabled=${this._page <= 1 || this._loading}
          @click=${() => this._changePage(this._page - 1)}
        >&#8592; Prev</button>

        ${this._pageItems().map((item) => typeof item === 'string'
          ? html`<span class="page-ellipsis">${item}</span>`
          : html`<button
              class=${item === this._page ? 'active' : ''}
              ?disabled=${item === this._page || this._loading}
              @click=${() => this._changePage(item)}
            >${item}</button>`
        )}

        <button
          ?disabled=${this._page >= this._totalPages || this._loading}
          @click=${() => this._changePage(this._page + 1)}
        >Next &#8594;</button>
      </div>
    `;
  }

  _renderContent() {
    if (this._results.length > 0) {
      return html`
        <results-list
          .results=${this._results}
          .total=${this._total}
          @page-select=${this._handlePageSelect}
        ></results-list>
        ${this._renderPagination()}
      `;
    }
    if (this._searched && !this._loading && !this._error) {
      return html`<div class="no-results">No wines matched your search.</div>`;
    }
    if (!this._searched) {
      const stats = this._facets?.stats;
      return html`
        <div class="empty-state">
          <div class="empty-heading">Search wine history</div>
          <p>Try "California Cabernet under $15 from the 1980s" or use the filters to browse by color, region, and vintage.</p>
          ${stats ? html`
            <div class="db-stats">
              <div class="db-stat">
                <div class="db-stat-value">${stats.catalogs.toLocaleString()}</div>
                <div class="db-stat-label">Catalogs</div>
              </div>
              <div class="db-stat">
                <div class="db-stat-value">${stats.wineEntries.toLocaleString()}</div>
                <div class="db-stat-label">Wine Entries</div>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }
    return '';
  }

  render() {
    return html`
      <header>
        <div class="wordmark">Wine<span>Catalog</span></div>
        <div class="tagline">UC Davis Digital Collections · Qwen3.6 Extraction</div>
      </header>

      <div class="layout">
        <aside>
          <filter-panel
            .facets=${this._facets}
            .filters=${this._filters}
            @filter-change=${this._handleFilterChange}
          ></filter-panel>
        </aside>

        <div class="content">
          <search-bar
            ?loading=${this._loading}
            .sql=${this._sql}
            .params=${this._params}
            .error=${this._error}
            @wine-search=${this._handleSearch}
          ></search-bar>

          ${this._renderContent()}
        </div>
      </div>

      ${this._selectedPage
        ? html`<page-viewer
            .pageData=${this._selectedPage}
            @viewer-close=${this._handleViewerClose}
          ></page-viewer>`
        : ''}
    `;
  }
}

customElements.define('wine-app', WineApp);
