import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import config from '../../config/index.js';
import { imageExists, getImageStream } from '../../lib/image-store.js';
import searchRouter from './routes/search.js';
import itemsRouter from './routes/items.js';
import facetsRouter from './routes/facets.js';
import priceHistoryRouter from './routes/price-history.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
const CLIENT_HTML = path.join(CLIENT_DIST, 'index.html');

app.use(express.json({ limit: '1mb' }));

// API routes
app.use('/api/search', searchRouter);
app.use('/api/items', itemsRouter);
app.use('/api/facets', facetsRouter);
app.use('/api/price-history', priceHistoryRouter);

/**
 * Serve catalog page images from the configured backend — a GCS bucket when
 * GCS_BUCKET is set, otherwise the local image volume.
 * Path: /api/images/:shortArk/:filename
 */
app.get('/api/images/:shortArk/:filename', async (req, res) => {
  const { shortArk, filename } = req.params;
  // Reject path traversal attempts
  if (!/^\w+$/.test(shortArk) || !/^[\w.-]+$/.test(filename)) {
    return res.status(400).send('Bad request');
  }
  const subpath = `${shortArk}/${filename}`;
  if (!(await imageExists(subpath))) {
    return res.status(404).send('Image not found');
  }
  res.type(path.extname(filename) || 'application/octet-stream');
  getImageStream(subpath)
    .on('error', (err) => {
      console.error(`image read failed ${subpath}: ${err.message}`);
      if (!res.headersSent) res.status(500).send('Image read failed');
      else res.end();
    })
    .pipe(res);
});

// Static client bundle
app.use(express.static(CLIENT_DIST));

// SPA fallback — all non-API routes serve index.html
app.get('*', (req, res) => {
  if (fs.existsSync(CLIENT_HTML)) {
    res.sendFile(CLIENT_HTML);
  } else {
    res.status(503).send('Client not built — run: npm run build');
  }
});

app.listen(config.api.port, () => {
  console.log(`API listening on http://localhost:${config.api.port}`);
});
