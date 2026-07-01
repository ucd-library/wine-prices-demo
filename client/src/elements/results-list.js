import { LitElement, html, css } from 'lit';
import './wine-entry-row.js';

/**
 * Display search results grouped by catalog item.
 * Fires `page-select` when a user clicks a page thumbnail.
 *
 * @fires page-select - detail: { item, page }
 * @prop {object[]} results - Grouped results from /api/search (current page only)
 * @prop {number}   total   - Total matching catalog items across all pages
 */
class ResultsList extends LitElement {
  static properties = {
    results: { type: Array },
    total:   { type: Number },
  };

  static styles = css`
    :host { display: block; }

    .summary {
      font-size: 12px;
      color: #b7b0d0;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 1.5rem;
      font-weight: 600;
    }

    .catalog-card {
      background: #12111b;
      border: 1px solid #2d2b40;
      border-radius: 8px;
      margin-bottom: 1.5rem;
      overflow: hidden;
    }

    .catalog-header {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid #2d2b40;
      display: flex;
      align-items: baseline;
      gap: 1.25rem;
      flex-wrap: wrap;
    }

    .catalog-title {
      font-family: Georgia, serif;
      font-size: 1.05rem;
      font-weight: normal;
      color: #e8e4dc;
      flex: 1;
    }

    .catalog-meta {
      font-size: 12px;
      color: #b7b0d0;
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .catalog-meta span::before {
      content: '·';
      margin-right: 1rem;
    }

    .catalog-meta span:first-child::before { content: ''; margin-right: 0; }

    .pages-section {
      padding: 1.25rem;
    }

    .pages-heading {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #a89dc7;
      font-weight: 700;
      margin-bottom: 1rem;
    }

    .page-row {
      display: flex;
      gap: 1.25rem;
      margin-bottom: 1.5rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid #1e1d2a;
      align-items: flex-start;
    }

    .page-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }

    .page-thumb {
      flex-shrink: 0;
      width: 90px;
      cursor: pointer;
      border-radius: 4px;
      overflow: hidden;
      border: 1.5px solid #2d2b40;
      transition: border-color 0.15s;
    }

    .page-thumb:hover { border-color: #9b3a54; }

    .page-thumb img {
      width: 100%;
      display: block;
      object-fit: cover;
    }

    .page-label {
      font-size: 10px;
      color: #a89dc7;
      text-align: center;
      margin-top: 0.25rem;
      font-variant-numeric: tabular-nums;
    }

    .page-entries {
      flex: 1;
      min-width: 0;
    }

    .no-entries {
      font-size: 12px;
      color: #a89dc7;
      font-style: italic;
    }
  `;

  constructor() {
    super();
    this.results = [];
    this.total = 0;
  }

  /**
   * Build the local image URL for a page.
   * @param {object} item
   * @param {object} page
   * @returns {string}
   */
  _imageUrl(item, page) {
    const shortId = item.ark.split('/').pop();
    return `/api/images/${shortId}/${page.filename}`;
  }

  /**
   * @param {object} item
   * @param {object} page
   */
  _selectPage(item, page) {
    this.dispatchEvent(new CustomEvent('page-select', {
      detail: { item, page },
      bubbles: true, composed: true,
    }));
  }

  /**
   * @param {object} item
   * @returns {import('lit').TemplateResult}
   */
  _renderItem(item) {
    return html`
      <div class="catalog-card">
        <div class="catalog-header">
          <div class="catalog-title">${item.title ?? item.ark}</div>
          <div class="catalog-meta">
            ${item.date ? html`<span>${item.date}</span>` : ''}
            ${item.creator ? html`<span>${item.creator}</span>` : ''}
            <span>${item.pages.length} matching page${item.pages.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="pages-section">
          <div class="pages-heading">Matching pages</div>
          ${item.pages.map((page) => this._renderPage(item, page))}
        </div>
      </div>
    `;
  }

  /**
   * @param {object} item
   * @param {object} page
   * @returns {import('lit').TemplateResult}
   */
  _renderPage(item, page) {
    const imgUrl = this._imageUrl(item, page);
    return html`
      <div class="page-row">
        <div class="page-thumb" @click=${() => this._selectPage(item, page)}>
          <img src=${imgUrl} alt="Page ${page.pageNumber ?? ''}" loading="lazy">
          <div class="page-label">p.${page.pageNumber ?? '?'}</div>
        </div>
        <div class="page-entries">
          ${page.wineEntries.length > 0
            ? page.wineEntries.map((entry) => html`<wine-entry-row .entry=${entry}></wine-entry-row>`)
            : html`<div class="no-entries">No wine entries extracted from this page</div>`}
        </div>
      </div>
    `;
  }

  render() {
    const entryCount = this.results.reduce((n, item) => n + item.pages.reduce((m, p) => m + p.wineEntries.length, 0), 0);
    const entryLabel = this.total > entryCount
      ? `Showing ${entryCount} of ${this.total} wine entries`
      : `${entryCount} wine entr${entryCount !== 1 ? 'ies' : 'y'}`;
    return html`
      <div class="summary">
        ${entryLabel}
        · ${this.results.length} catalog${this.results.length !== 1 ? 's' : ''}
        · ${this.results.reduce((n, i) => n + i.pages.length, 0)} pages
      </div>
      ${this.results.map((item) => this._renderItem(item))}
    `;
  }
}

customElements.define('results-list', ResultsList);
