import { LitElement, html, css } from 'lit';

// Extraction occasionally misreads a vintage year (bad OCR), which can pollute
// the facet min/max with garbage. Clamp the UI to a sane, fixed range instead
// of trusting the extracted bounds.
const MIN_VINTAGE_YEAR = 1800;
const CURRENT_DECADE = Math.floor(new Date().getFullYear() / 10) * 10;

const COLOR_META = {
  red:       { label: 'Red',       bg: '#7a2b40' },
  white:     { label: 'White',     bg: '#5a6b3a' },
  rosé:      { label: 'Rosé',      bg: '#8b4a5e' },
  sparkling: { label: 'Sparkling', bg: '#3a5a6b' },
  dessert:   { label: 'Dessert',   bg: '#6b5a2b' },
  fortified: { label: 'Fortified', bg: '#5a3a6b' },
};

/**
 * Left-sidebar filter panel. Fully controlled — reads from `filters` prop,
 * fires `filter-change` with a new filter object on every interaction.
 *
 * @fires filter-change - detail: updated filter object
 * @prop {object} facets - Counts and ranges from /api/facets
 * @prop {object} filters - Current filter selections (owned by parent)
 */
class FilterPanel extends LitElement {
  static properties = {
    facets:   { type: Object },
    filters:  { type: Object },
    _open:    { state: true },
  };

  static styles = css`
    :host {
      display: block;
      font-size: 13px;
    }

    .panel {
      background: #12111b;
      border: 1px solid #2d2b40;
      border-radius: 8px;
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.875rem 1rem;
      border-bottom: 1px solid #2d2b40;
    }

    .panel-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #b7b0d0;
    }

    .clear-btn {
      background: none;
      border: 1px solid #2d2b40;
      border-radius: 4px;
      color: #ef7da4;
      font-size: 11px;
      font-family: inherit;
      padding: 0.2rem 0.6rem;
      cursor: pointer;
      transition: border-color 0.15s;
    }

    .clear-btn:hover { border-color: #9b3a54; }

    .section { border-bottom: 1px solid #2d2b40; }
    .section:last-child { border-bottom: none; }

    .section-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 0.7rem 1rem;
      background: none;
      border: none;
      cursor: pointer;
      font-family: inherit;
      color: #a89eb8;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.09em;
      text-align: left;
    }

    .section-toggle:hover { color: #e8e4dc; }

    .section-toggle .chevron {
      font-size: 9px;
      color: #a89dc7;
      transition: transform 0.15s;
    }

    .section-toggle.open .chevron { transform: rotate(90deg); }

    .section-badge {
      background: #9b3a54;
      color: #f8f0f3;
      border-radius: 10px;
      font-size: 10px;
      padding: 0.1rem 0.45rem;
      margin-left: 0.4rem;
      font-weight: 700;
    }

    .section-body { padding: 0.25rem 1rem 0.875rem; }

    /* Color chips */
    .color-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .color-chip {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.3rem 0.65rem 0.3rem 0.45rem;
      border-radius: 20px;
      border: 1.5px solid transparent;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
      font-weight: 600;
      background: #1e1d2a;
      color: #a89eb8;
      transition: border-color 0.12s, color 0.12s;
    }

    .color-chip:hover { border-color: #a89dc7; color: #e8e4dc; }

    .color-chip.active {
      border-color: var(--chip-border);
      background: var(--chip-bg);
      color: #f8f0f3;
    }

    .color-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--chip-border);
      flex-shrink: 0;
    }

    .chip-count {
      font-size: 10px;
      font-weight: 400;
      opacity: 0.7;
    }

    /* Checkbox lists */
    .check-list {
      max-height: 180px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: #2d2b40 transparent;
    }

    .check-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.3rem 0;
      cursor: pointer;
      color: #a89eb8;
      transition: color 0.12s;
    }

    .check-item:hover { color: #e8e4dc; }
    .check-item.active { color: #e8e4dc; }

    .check-item input[type="checkbox"] {
      accent-color: #9b3a54;
      width: 13px;
      height: 13px;
      flex-shrink: 0;
      cursor: pointer;
    }

    .check-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .check-count {
      font-size: 11px;
      color: #a89dc7;
      flex-shrink: 0;
      font-variant-numeric: tabular-nums;
    }

    /* Decade row */
    .decade-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-bottom: 0.75rem;
    }

    .decade-btn {
      padding: 0.25rem 0.6rem;
      background: #1e1d2a;
      border: 1.5px solid #2d2b40;
      border-radius: 4px;
      color: #a89eb8;
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
      transition: border-color 0.12s, color 0.12s;
    }

    .decade-btn:hover { border-color: #b7b0d0; color: #e8e4dc; }

    .decade-btn.active {
      border-color: #9b3a54;
      background: #2d1420;
      color: #e8e4dc;
    }

    /* Range inputs */
    .range-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .range-row label {
      font-size: 11px;
      color: #b7b0d0;
      white-space: nowrap;
    }

    .range-input {
      flex: 1;
      min-width: 0;
      background: #1e1d2a;
      border: 1.5px solid #2d2b40;
      border-radius: 4px;
      color: #e8e4dc;
      font-size: 12px;
      font-family: inherit;
      padding: 0.3rem 0.5rem;
      outline: none;
      transition: border-color 0.15s;
    }

    .range-input:focus { border-color: #9b3a54; }
    .range-input::placeholder { color: #a89dc7; }

    .year-inputs { margin-top: 0.5rem; }
  `;

  constructor() {
    super();
    this.facets = null;
    this.filters = {};
    this._open = { color: false, country: false, region: false, varietal: false, vintage: false, price: false };
  }

  /**
   * Emit a new filter state to the parent.
   * @param {object} patch - Partial filter overrides
   */
  _emit(patch) {
    this.dispatchEvent(new CustomEvent('filter-change', {
      detail: { ...this.filters, ...patch },
      bubbles: true,
      composed: true,
    }));
  }

  /**
   * Toggle a value in an array filter (colors, countries, etc.).
   * @param {string} key
   * @param {string} value
   */
  _toggleList(key, value) {
    const current = this.filters[key] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    this._emit({ [key]: next });
  }

  /**
   * Apply a decade shortcut — clicking an already-active decade clears it.
   * @param {number} decade - e.g. 1970
   */
  _applyDecade(decade) {
    const isActive =
      this.filters.vintageYearMin === decade &&
      this.filters.vintageYearMax === decade + 9;
    this._emit({
      vintageYearMin: isActive ? null : decade,
      vintageYearMax: isActive ? null : decade + 9,
    });
  }

  /** @param {Event} e */
  _onYearMin(e) {
    const val = e.target.value.trim();
    this._emit({ vintageYearMin: val ? parseInt(val, 10) : null });
  }

  /** @param {Event} e */
  _onYearMax(e) {
    const val = e.target.value.trim();
    this._emit({ vintageYearMax: val ? parseInt(val, 10) : null });
  }

  /** @param {Event} e */
  _onPriceMin(e) {
    const val = e.target.value.trim();
    this._emit({ priceMin: val ? parseFloat(val) : null });
  }

  /** @param {Event} e */
  _onPriceMax(e) {
    const val = e.target.value.trim();
    this._emit({ priceMax: val ? parseFloat(val) : null });
  }

  _clearAll() {
    this._emit({
      colors: [], countries: [], regions: [], varietals: [],
      vintageYearMin: null, vintageYearMax: null,
      priceMin: null, priceMax: null,
    });
  }

  /** @param {string} key */
  _toggleSection(key) {
    this._open = { ...this._open, [key]: !this._open[key] };
  }

  _hasAny() {
    const f = this.filters;
    return (
      f.colors?.length || f.countries?.length || f.regions?.length ||
      f.varietals?.length || f.vintageYearMin != null || f.vintageYearMax != null ||
      f.priceMin != null || f.priceMax != null
    );
  }

  /**
   * @param {string} key
   * @param {string} title
   * @param {number} activeCount
   * @param {import('lit').TemplateResult} body
   */
  _section(key, title, activeCount, body) {
    const open = this._open[key];
    return html`
      <div class="section">
        <button
          class="section-toggle ${open ? 'open' : ''}"
          @click=${() => this._toggleSection(key)}
        >
          <span>
            ${title}
            ${activeCount ? html`<span class="section-badge">${activeCount}</span>` : ''}
          </span>
          <span class="chevron">▶</span>
        </button>
        ${open ? html`<div class="section-body">${body}</div>` : ''}
      </div>
    `;
  }

  _renderColors() {
    const selected = this.filters.colors ?? [];
    const facetColors = this.facets?.colors ?? [];
    return this._section('color', 'Color', selected.length, html`
      <div class="color-grid">
        ${facetColors.map(({ value, count }) => {
          const meta = COLOR_META[value] ?? { label: value, bg: '#2d2b40' };
          const active = selected.includes(value);
          return html`
            <button
              class="color-chip ${active ? 'active' : ''}"
              style="--chip-bg:${meta.bg}33; --chip-border:${meta.bg}"
              @click=${() => this._toggleList('colors', value)}
            >
              <span class="color-dot" style="background:${meta.bg}"></span>
              ${meta.label}
              <span class="chip-count">${count}</span>
            </button>
          `;
        })}
      </div>
    `);
  }

  /**
   * @param {string} sectionKey
   * @param {string} title
   * @param {string} filterKey
   * @param {{ value: string, count: number }[]} items
   */
  _renderChecklist(sectionKey, title, filterKey, items) {
    const selected = this.filters[filterKey] ?? [];
    return this._section(sectionKey, title, selected.length, html`
      <div class="check-list">
        ${items.map(({ value, count }) => {
          const checked = selected.includes(value);
          return html`
            <label class="check-item ${checked ? 'active' : ''}">
              <input
                type="checkbox"
                .checked=${checked}
                @change=${() => this._toggleList(filterKey, value)}
              >
              <span class="check-label" title=${value}>${value}</span>
              <span class="check-count">${count}</span>
            </label>
          `;
        })}
      </div>
    `);
  }

  _renderVintage() {
    const { vintageYearMin, vintageYearMax } = this.filters;
    const activeCount = (vintageYearMin != null ? 1 : 0) + (vintageYearMax != null ? 1 : 0);

    // Build decade buttons from a fixed range rather than the extracted data
    // range, since misread years can otherwise produce bogus decades.
    const decades = [];
    for (let d = MIN_VINTAGE_YEAR; d <= CURRENT_DECADE; d += 10) decades.push(d);

    return this._section('vintage', 'Vintage Year', activeCount ? 1 : 0, html`
      ${decades.length > 0 ? html`
        <div class="decade-row">
          ${decades.map((d) => {
            const active = vintageYearMin === d && vintageYearMax === d + 9;
            return html`
              <button
                class="decade-btn ${active ? 'active' : ''}"
                @click=${() => this._applyDecade(d)}
              >${d}s</button>
            `;
          })}
        </div>
      ` : ''}
      <div class="range-row year-inputs">
        <label>From</label>
        <input
          type="number"
          class="range-input"
          placeholder="${MIN_VINTAGE_YEAR}"
          min="${MIN_VINTAGE_YEAR}"
          max="${CURRENT_DECADE + 9}"
          .value=${vintageYearMin != null ? String(vintageYearMin) : ''}
          @change=${this._onYearMin}
        >
        <label>To</label>
        <input
          type="number"
          class="range-input"
          placeholder="${CURRENT_DECADE + 9}"
          min="${MIN_VINTAGE_YEAR}"
          max="${CURRENT_DECADE + 9}"
          .value=${vintageYearMax != null ? String(vintageYearMax) : ''}
          @change=${this._onYearMax}
        >
      </div>
    `);
  }

  _renderPrice() {
    const { min: dataMin, max: dataMax } = this.facets?.price ?? {};
    const { priceMin, priceMax } = this.filters;
    const activeCount = (priceMin != null ? 1 : 0) + (priceMax != null ? 1 : 0);

    return this._section('price', 'Price', activeCount ? 1 : 0, html`
      <div class="range-row">
        <label>$</label>
        <input
          type="number"
          class="range-input"
          placeholder="Min"
          min="0"
          step="0.01"
          .value=${priceMin != null ? String(priceMin) : ''}
          @change=${this._onPriceMin}
        >
        <label>–</label>
        <input
          type="number"
          class="range-input"
          placeholder="Max"
          min="0"
          step="0.01"
          .value=${priceMax != null ? String(priceMax) : ''}
          @change=${this._onPriceMax}
        >
      </div>
      ${dataMin != null ? html`
        <div style="font-size:11px;color:#a89dc7;margin-top:0.4rem">
          Range in dataset: $${parseFloat(dataMin).toFixed(2)} – $${parseFloat(dataMax).toFixed(2)}
        </div>
      ` : ''}
    `);
  }

  render() {
    if (!this.facets) {
      return html`
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Filters</span></div>
          <div style="padding:1.25rem;color:#a89dc7;font-size:12px;">Loading…</div>
        </div>
      `;
    }

    return html`
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Filters</span>
          ${this._hasAny()
            ? html`<button class="clear-btn" @click=${this._clearAll}>Clear all</button>`
            : ''}
        </div>

        ${this._renderColors()}
        ${this._renderChecklist('country', 'Country', 'countries', this.facets.countries ?? [])}
        ${this._renderChecklist('region', 'Region', 'regions', this.facets.regions ?? [])}
        ${this._renderChecklist('varietal', 'Varietal', 'varietals', this.facets.varietals ?? [])}
        ${this._renderVintage()}
        ${this._renderPrice()}
      </div>
    `;
  }
}

customElements.define('filter-panel', FilterPanel);
