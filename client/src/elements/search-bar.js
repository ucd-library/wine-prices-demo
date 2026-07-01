import { LitElement, html, css } from 'lit';

/**
 * Natural-language search input. Fires a `wine-search` event on submit.
 * Shows the generated SQL in a collapsible panel — the key demo moment.
 *
 * @fires wine-search - detail: { query: string, model?: string }
 * @prop {boolean} loading
 * @prop {string} sql - Generated SQL to display
 * @prop {Array} params - Query parameter values to interpolate into SQL display
 * @prop {string} error
 */
class SearchBar extends LitElement {
  static properties = {
    loading:    { type: Boolean },
    sql:        { type: String },
    params:     { type: Array },
    error:      { type: String },
    _sqlOpen:   { state: true },
    _query:     { state: true },
  };

  static styles = css`
    :host { display: block; margin-bottom: 2rem; }

    .search-wrap {
      display: flex;
      gap: 0.75rem;
      align-items: stretch;
    }

    input[type="text"] {
      flex: 1;
      background: #12111b;
      border: 1.5px solid #2d2b40;
      border-radius: 6px;
      color: #e8e4dc;
      font-size: 15px;
      padding: 0.75rem 1rem;
      outline: none;
      transition: border-color 0.15s;
      font-family: inherit;
    }

    input[type="text"]:focus { border-color: #9b3a54; }
    input[type="text"]::placeholder { color: #a89dc7; }

    button {
      background: #9b3a54;
      color: #f8f6f2;
      border: none;
      border-radius: 6px;
      padding: 0 1.5rem;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
      transition: background 0.15s;
    }

    button:hover:not(:disabled) { background: #b8445f; }
    button:disabled { opacity: 0.5; cursor: default; }

    .error {
      margin-top: 0.75rem;
      padding: 0.6rem 1rem;
      background: #2d1420;
      border: 1px solid #9b3a54;
      border-radius: 4px;
      font-size: 13px;
      color: #e87a8e;
    }

    .sql-panel {
      margin-top: 1rem;
    }

    .sql-toggle {
      background: none;
      border: none;
      color: #b7b0d0;
      font-size: 12px;
      cursor: pointer;
      padding: 0;
      font-family: inherit;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .sql-toggle:hover { color: #a89eb8; }

    .sql-toggle::before {
      content: '▶';
      font-size: 9px;
      transition: transform 0.15s;
    }

    .sql-toggle.open::before { transform: rotate(90deg); }

    pre {
      margin: 0.5rem 0 0;
      background: #12111b;
      border: 1px solid #2d2b40;
      border-radius: 6px;
      padding: 1rem 1.25rem;
      font-size: 12px;
      font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
      color: #a89eb8;
      overflow-x: auto;
      white-space: pre-wrap;
      line-height: 1.7;
    }
  `;

  constructor() {
    super();
    this.loading = false;
    this.sql = '';
    this.params = [];
    this.error = '';
    this._sqlOpen = false;
    this._query = '';
  }

  /**
   * Interpolate $n placeholders with their actual param values for display.
   * Arrays render as Postgres array literals; strings are single-quoted.
   * @param {string} sql
   * @param {Array} params
   * @returns {string}
   */
  _interpolate(sql, params) {
    return sql.replace(/\$(\d+)/g, (_, n) => {
      const val = params[parseInt(n, 10) - 1];
      if (val === null || val === undefined) return 'NULL';
      if (Array.isArray(val)) {
        const inner = val.map((v) => String(v).replace(/'/g, "''"));
        return `'{${inner.join(',')}}'`;
      }
      if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
      return String(val);
    });
  }

  /** @param {SubmitEvent} e */
  _submit(e) {
    e.preventDefault();
    if (this.loading) return;
    this.dispatchEvent(new CustomEvent('wine-search', {
      detail: { query: this._query.trim() },
      bubbles: true, composed: true,
    }));
  }

  /** @param {InputEvent} e */
  _onInput(e) {
    this._query = e.target.value;
  }

  render() {
    return html`
      <form @submit=${this._submit}>
        <div class="search-wrap">
          <input
            type="text"
            placeholder="e.g. California Cabernet under $15 from the 1980s"
            .value=${this._query}
            @input=${this._onInput}
            ?disabled=${this.loading}
            autocomplete="off"
          >
          <button type="submit" ?disabled=${this.loading}>
            ${this.loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      ${this.error ? html`<div class="error">${this.error}</div>` : ''}

      ${this.sql ? html`
        <div class="sql-panel">
          <button
            class="sql-toggle ${this._sqlOpen ? 'open' : ''}"
            @click=${() => { this._sqlOpen = !this._sqlOpen; }}
          >Generated SQL</button>
          ${this._sqlOpen ? html`<pre>${this._interpolate(this.sql, this.params)}</pre>` : ''}
        </div>
      ` : ''}
    `;
  }
}

customElements.define('search-bar', SearchBar);
