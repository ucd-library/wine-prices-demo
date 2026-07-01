import { LitElement, html, css } from 'lit';

const COLOR_CHIP = {
  red:       '#7a2b40',
  white:     '#5a6b3a',
  rosé:      '#8b4a5e',
  sparkling: '#3a5a6b',
  dessert:   '#6b5a2b',
  fortified: '#5a3a6b',
};

/**
 * Single extracted wine entry. Shows a compact summary row, with
 * expanded detail when the `expanded` attribute is set.
 *
 * @prop {object} entry - wine_entries row
 * @prop {boolean} expanded - Show all fields instead of summary
 */
class WineEntryRow extends LitElement {
  static properties = {
    entry:    { type: Object },
    expanded: { type: Boolean },
  };

  static styles = css`
    :host { display: block; }

    .row {
      padding: 0.6rem 0;
      border-bottom: 1px solid #1e1d2a;
      font-size: 13px;
    }

    :host(:last-of-type) .row { border-bottom: none; }

    .top {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .wine-name {
      font-weight: 600;
      color: #e8e4dc;
      flex: 1;
    }

    .chip {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      padding: 0.15rem 0.55rem;
      border-radius: 20px;
      white-space: nowrap;
      background: #1e1d2a;
      color: #a89eb8;
    }

    .chip.color-chip {
      background-color: var(--chip-bg, #1e1d2a);
      color: #f0ecf5;
    }

    .price {
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      color: #c8d880;
      white-space: nowrap;
    }

    .meta {
      margin-top: 0.3rem;
      font-size: 12px;
      color: #b7b0d0;
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .meta span { white-space: nowrap; }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 0.35rem 1.5rem;
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid #1e1d2a;
    }

    .field { font-size: 12px; }
    .field-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #a89dc7;
      font-weight: 700;
    }
    .field-value { color: #a89eb8; margin-top: 0.1rem; }

    .confidence-high   { color: #6aac72; }
    .confidence-medium { color: #c4973a; }
    .confidence-low    { color: #ef7da4; }
  `;

  constructor() {
    super();
    this.entry = {};
    this.expanded = false;
  }

  /**
   * Format a price value with dollar sign.
   * @param {number|null} price
   * @returns {string}
   */
  _fmt(price) {
    if (price == null) return '';
    return `$${parseFloat(price).toFixed(2)}`;
  }

  /**
   * Render a labeled field, omitting it when value is null/empty.
   * @param {string} label
   * @param {*} value
   * @returns {import('lit').TemplateResult|string}
   */
  _field(label, value) {
    if (value == null || value === '') return '';
    return html`
      <div class="field">
        <div class="field-label">${label}</div>
        <div class="field-value">${value}</div>
      </div>
    `;
  }

  render() {
    const e = this.entry;
    const chipColor = COLOR_CHIP[e.color] ?? '#2d2b40';

    const confClass = {
      high: 'confidence-high',
      medium: 'confidence-medium',
      low: 'confidence-low',
    }[e.confidence] ?? '';

    return html`
      <div class="row">
        <div class="top">
          <div class="wine-name">${e.wineName ?? '(unnamed)'}</div>
          ${e.color ? html`<span class="chip color-chip" style="--chip-bg:${chipColor}">${e.color}</span>` : ''}
          ${e.vintageYear ? html`<span class="chip">${e.vintageYear}</span>` : ''}
          ${e.price != null ? html`<div class="price">${this._fmt(e.price)}</div>` : ''}
        </div>

        <div class="meta">
          ${e.producer ? html`<span>${e.producer}</span>` : ''}
          ${e.varietal ? html`<span>· ${e.varietal}</span>` : ''}
          ${e.region ? html`<span>· ${e.region}</span>` : ''}
          ${e.country ? html`<span>· ${e.country}</span>` : ''}
        </div>

        ${this.expanded ? html`
          <div class="detail-grid">
            ${this._field('Vineyard', e.vineyard)}
            ${this._field('Appellation', e.appellation)}
            ${this._field('Bottle size', e.bottleSize)}
            ${this._field('Case price', this._fmt(e.casePrice))}
            ${this._field('Rating', e.rating ? `${e.rating} pts` : null)}
            ${this._field('Importer', e.importer)}
            ${e.description ? html`
              <div class="field" style="grid-column: 1 / -1;">
                <div class="field-label">Notes</div>
                <div class="field-value">${e.description}</div>
              </div>` : ''}
            ${e.confidence ? html`
              <div class="field">
                <div class="field-label">Confidence</div>
                <div class="field-value ${confClass}">${e.confidence}</div>
              </div>` : ''}
          </div>` : ''}
      </div>
    `;
  }
}

customElements.define('wine-entry-row', WineEntryRow);
