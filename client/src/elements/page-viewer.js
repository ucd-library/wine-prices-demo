import { LitElement, html, css } from 'lit';
import './wine-entry-row.js';

/**
 * Full-page modal showing a catalog page image alongside all extracted wine entries.
 * Fires `viewer-close` when dismissed.
 *
 * @fires viewer-close
 * @prop {{ item: object, page: object }} pageData
 */
class PageViewer extends LitElement {
  static properties = {
    pageData: { type: Object },
  };

  static styles = css`
    :host {
      display: flex;
      position: fixed;
      inset: 0;
      z-index: 100;
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
      max-width: 1100px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      overflow: hidden;
      min-height: 0;
    }

    @media (max-width: 700px) {
      .modal { grid-template-columns: 1fr; }
    }

    .modal-header {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid #2d2b40;
    }

    .modal-title {
      font-family: Georgia, serif;
      font-size: 1rem;
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

    .image-panel {
      border-right: 1px solid #2d2b40;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      background: #0f0e17;
    }

    .image-panel img {
      width: 100%;
      border-radius: 4px;
      display: block;
    }

    .image-link {
      font-size: 11px;
      color: #a89dc7;
      text-align: center;
      word-break: break-all;
      text-decoration: none;
    }

    .image-link:hover {
      color: #e8e4dc;
      text-decoration: underline;
    }

    .entries-panel {
      padding: 1.25rem;
      overflow-y: auto;
      max-height: 80vh;
    }

    .entries-heading {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #a89dc7;
      font-weight: 700;
      margin-bottom: 1rem;
    }

    .no-entries {
      font-size: 13px;
      color: #a89dc7;
      font-style: italic;
      padding: 1rem 0;
    }
  `;

  constructor() {
    super();
    this.pageData = null;
  }

  _close() {
    this.dispatchEvent(new CustomEvent('viewer-close', { bubbles: true, composed: true }));
  }

  /** @param {KeyboardEvent} e */
  _onKeyDown(e) {
    if (e.key === 'Escape') this._close();
  }

  connectedCallback() {
    super.connectedCallback();
    this._boundKeyDown = this._onKeyDown.bind(this);
    window.addEventListener('keydown', this._boundKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this._boundKeyDown);
  }

  render() {
    if (!this.pageData) return html``;
    const { item, page } = this.pageData;
    const shortId = item.ark.split('/').pop();
    const imgUrl = `/api/images/${shortId}/${page.filename}`;

    return html`
      <div class="modal">
        <div class="modal-header">
          <div>
            <div class="modal-title">${item.title ?? item.ark}</div>
            <div class="modal-meta">
              ${item.date ?? ''} ${item.creator ? '· ' + item.creator : ''} · Page ${page.pageNumber ?? '?'}
            </div>
          </div>
          <button class="close-btn" @click=${this._close} aria-label="Close">✕</button>
        </div>

        <div class="image-panel">
          <img src=${imgUrl} alt="Catalog page ${page.pageNumber}">
          <a class="image-link" href=${imgUrl} target="_blank" rel="noopener">${page.filename}</a>
        </div>

        <div class="entries-panel">
          <div class="entries-heading">
            ${page.wineEntries?.length ?? 0} extracted wine entr${(page.wineEntries?.length ?? 0) !== 1 ? 'ies' : 'y'}
          </div>
          ${page.wineEntries?.length > 0
            ? page.wineEntries.map((entry) => html`<wine-entry-row .entry=${entry} expanded></wine-entry-row>`)
            : html`<div class="no-entries">No wine entries were extracted from this page.</div>`}
        </div>
      </div>
    `;
  }
}

customElements.define('page-viewer', PageViewer);
