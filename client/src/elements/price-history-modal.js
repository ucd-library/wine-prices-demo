import { LitElement, html, css } from 'lit';
import Chart from 'chart.js/auto';

// Series palette for vintage lines, drawn from the app theme.
const SERIES_COLORS = [
  '#ef7da4', '#c8d880', '#a89dc7', '#6aac72',
  '#c4973a', '#7db4ef', '#d88080', '#80d8c8',
];

/**
 * Modal graphing all known prices for a wine (producer + wine name) over
 * catalog years. Each vintage year gets its own series. Fetches data from
 * /api/price-history when opened. Fires `modal-close` when dismissed.
 *
 * @fires modal-close
 * @prop {{ wineName: string, producer: string|null }} wine
 */
class PriceHistoryModal extends LitElement {
  static properties = {
    wine:          { type: Object },
    _observations: { state: true },
    _loading:      { state: true },
    _error:        { state: true },
  };

  static styles = css`
    :host {
      display: flex;
      position: fixed;
      inset: 0;
      z-index: 200;
      background: rgba(10, 10, 18, 0.88);
      align-items: flex-start;
      justify-content: center;
      padding: 2rem;
      overflow-y: auto;
    }

    .modal {
      background: #12111b;
      border: 1px solid #2d2b40;
      border-radius: 8px;
      width: 100%;
      max-width: 900px;
      overflow: hidden;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid #2d2b40;
    }

    .modal-title {
      font-family: Georgia, serif;
      font-size: 1.1rem;
      font-weight: normal;
      color: #e8e4dc;
    }

    .modal-meta {
      font-size: 12px;
      color: #b7b0d0;
      margin-top: 0.2rem;
    }

    .close-btn {
      background: none;
      border: 1.5px solid #2d2b40;
      border-radius: 4px;
      color: #b7b0d0;
      width: 32px;
      height: 32px;
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: color 0.15s, border-color 0.15s;
    }

    .close-btn:hover { color: #e8e4dc; border-color: #b7b0d0; }

    .body {
      padding: 1.25rem;
    }

    .chart-wrap {
      position: relative;
      height: 380px;
    }

    .summary {
      font-size: 12px;
      color: #b7b0d0;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 600;
      margin-bottom: 1rem;
    }

    .status {
      text-align: center;
      padding: 3rem 2rem;
      color: #b7b0d0;
      font-size: 14px;
    }

    .status.error { color: #ef7da4; }

    .note {
      font-size: 11px;
      color: #a89dc7;
      margin-top: 0.75rem;
      font-style: italic;
    }
  `;

  constructor() {
    super();
    this.wine = null;
    this._observations = null;
    this._loading = false;
    this._error = '';
    this._chart = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._boundKeyDown = this._onKeyDown.bind(this);
    window.addEventListener('keydown', this._boundKeyDown);
    this._load();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this._boundKeyDown);
    this._destroyChart();
  }

  /** @param {KeyboardEvent} e */
  _onKeyDown(e) {
    if (e.key === 'Escape') this._close();
  }

  _close() {
    this.dispatchEvent(new CustomEvent('modal-close', { bubbles: true, composed: true }));
  }

  _destroyChart() {
    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }
  }

  /**
   * Fetch all price observations for this wine.
   */
  async _load() {
    if (!this.wine?.wineName) return;
    this._loading = true;
    this._error = '';
    try {
      const params = new URLSearchParams({ wineName: this.wine.wineName });
      if (this.wine.producer) params.set('producer', this.wine.producer);
      const res = await fetch(`/api/price-history?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load price history');
      this._destroyChart();
      this._observations = data.observations ?? [];
    } catch (err) {
      this._error = err.message;
    } finally {
      this._loading = false;
    }
  }

  /**
   * Observations that can be plotted (have a parsed catalog year).
   * @returns {object[]}
   */
  _plottable() {
    return (this._observations ?? []).filter((o) => o.catalogYear != null);
  }

  /**
   * Group plottable observations into one Chart.js dataset per vintage year.
   * @returns {object[]}
   */
  _buildDatasets() {
    const byVintage = new Map();
    for (const obs of this._plottable()) {
      const key = obs.vintageYear ?? 'nv';
      if (!byVintage.has(key)) byVintage.set(key, []);
      byVintage.get(key).push(obs);
    }

    const keys = [...byVintage.keys()].sort((a, b) => {
      if (a === 'nv') return 1;
      if (b === 'nv') return -1;
      return a - b;
    });

    return keys.map((key, i) => {
      const color = SERIES_COLORS[i % SERIES_COLORS.length];
      const points = byVintage.get(key)
        .slice()
        .sort((a, b) => a.catalogYear - b.catalogYear)
        .map((o) => ({ x: o.catalogYear, y: o.price, obs: o }));
      return {
        label: key === 'nv' ? 'Non-vintage' : `${key} vintage`,
        data: points,
        borderColor: color,
        backgroundColor: color,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2,
        tension: 0,
        showLine: true,
      };
    });
  }

  /**
   * Create/recreate the chart once observations are loaded and the
   * canvas is in the DOM.
   */
  updated() {
    if (this._chart) return;
    const canvas = this.renderRoot.querySelector('canvas');
    if (!canvas || !this._plottable().length) return;

    this._chart = new Chart(canvas, {
      type: 'scatter',
      data: { datasets: this._buildDatasets() },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Catalog year', color: '#a89dc7', font: { size: 11 } },
            ticks: { color: '#b7b0d0', callback: (v) => String(v), stepSize: 1, maxTicksLimit: 15 },
            grid: { color: '#1e1d2a' },
          },
          y: {
            title: { display: true, text: 'Bottle price (USD)', color: '#a89dc7', font: { size: 11 } },
            ticks: { color: '#b7b0d0', callback: (v) => `$${v}` },
            grid: { color: '#1e1d2a' },
            beginAtZero: true,
          },
        },
        plugins: {
          legend: {
            labels: { color: '#e8e4dc', usePointStyle: true, pointStyle: 'circle', boxHeight: 6 },
          },
          tooltip: {
            backgroundColor: '#1e1d2a',
            borderColor: '#2d2b40',
            borderWidth: 1,
            titleColor: '#e8e4dc',
            bodyColor: '#b7b0d0',
            callbacks: {
              title: (items) => `Catalog ${items[0]?.raw?.x ?? ''}`,
              label: (item) => {
                const o = item.raw.obs;
                const parts = [`$${o.price.toFixed(2)}`];
                if (o.bottleSize) parts.push(o.bottleSize);
                if (o.casePrice != null) parts.push(`case $${o.casePrice.toFixed(2)}`);
                return parts.join(' · ');
              },
              afterLabel: (item) => item.raw.obs.catalogTitle ?? '',
            },
          },
        },
      },
    });
  }

  /**
   * @returns {import('lit').TemplateResult}
   */
  _renderBody() {
    if (this._loading) return html`<div class="status">Loading price history…</div>`;
    if (this._error) return html`<div class="status error">${this._error}</div>`;

    const plottable = this._plottable();
    const total = this._observations?.length ?? 0;

    if (!plottable.length) {
      return html`<div class="status">
        ${total > 0
          ? 'Prices were found for this wine, but none of the catalogs have a usable date.'
          : 'No other prices found for this wine.'}
      </div>`;
    }

    const years = plottable.map((o) => o.catalogYear);
    const catalogs = new Set(plottable.map((o) => o.ark)).size;
    const omitted = total - plottable.length;

    return html`
      <div class="summary">
        ${plottable.length} price${plottable.length !== 1 ? 's' : ''}
        · ${catalogs} catalog${catalogs !== 1 ? 's' : ''}
        · ${Math.min(...years)}–${Math.max(...years)}
      </div>
      <div class="chart-wrap"><canvas></canvas></div>
      ${omitted > 0 ? html`<div class="note">${omitted} price${omitted !== 1 ? 's' : ''} omitted (catalog has no parseable date)</div>` : ''}
    `;
  }

  render() {
    if (!this.wine) return html``;
    return html`
      <div class="modal">
        <div class="modal-header">
          <div>
            <div class="modal-title">${this.wine.wineName}</div>
            ${this.wine.producer ? html`<div class="modal-meta">${this.wine.producer}</div>` : ''}
          </div>
          <button class="close-btn" @click=${this._close} aria-label="Close">✕</button>
        </div>
        <div class="body">${this._renderBody()}</div>
      </div>
    `;
  }
}

customElements.define('price-history-modal', PriceHistoryModal);
