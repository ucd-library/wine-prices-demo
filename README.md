# Wine Catalog Search

A proof-of-concept application that harvests historical wine price catalog scans from the [UC Davis Digital Collections](https://digital.ucdavis.edu), extracts structured wine pricing data from the page images using a vision LLM, and exposes a natural-language search interface over the resulting dataset.

## Architecture

```
UC Davis LDP  →  Harvester  →  PostgreSQL  ←  API (Express)  ←  Browser (Lit)
                               ↑
                           Extractor (Qwen3.6 vision)
```

Three services share a single Postgres database:

| Service | Description |
|---------|-------------|
| **harvester** | Crawls the LDP collection sitemap, stores item metadata and page lists |
| **extractor** | Sends each page image to Qwen3.6 via vLLM, parses the JSON response, stores wine entries |
| **api** | Express server — search, facets, and image proxy endpoints; serves the bundled client |

The client is a single-page Lit web component app. Natural-language queries are translated to parameterized SQL WHERE clauses by the LLM at search time.

## Prerequisites

- Docker + Docker Compose
- Access to a vLLM server running Qwen3.6 (or compatible OpenAI-compatible endpoint)
- Node 20+ (only needed for local client builds)

## Setup

**1. Copy and configure environment variables:**

```bash
cp .env.example .env
```

Edit `.env` — the minimum required changes:

```bash
SAMWISE_BASE_URL=http://your-vllm-host:8000   # required
DATABASE_URL=postgresql://wine:wine@db:5432/wine_prices
```

**2. Build the client bundle:**

```bash
npm install
npm run build
```

**3. Start the API and database:**

```bash
docker compose up -d --build
```

The app is served at `http://localhost:3000`.

## Data Pipeline

The harvester and extractor run as one-shot commands via Docker Compose profiles.

### Harvest — crawl item metadata and page lists

```bash
# Full collection
docker compose run --rm harvester node services/harvester/index.js crawl

# Single item
docker compose run --rm harvester node services/harvester/index.js crawl --ark d7610s

# Download page images to local storage (optional — extractor falls back to remote URLs)
docker compose run --rm harvester node services/harvester/index.js download
```

### Extract — run vision LLM over page images

```bash
# All unprocessed pages
docker compose run --rm extractor node services/extractor/index.js run

# Single item by DB id
docker compose run --rm extractor node services/extractor/index.js run --item-id 42

# Re-run a specific page
docker compose run --rm extractor node services/extractor/index.js run --page-id 123 --reprocess

# Override the model for this run
docker compose run --rm extractor node services/extractor/index.js run --model qwen3.6:72b
```

Extraction runs with configurable concurrency (`EXTRACT_CONCURRENCY` env var, default 2). Each worker streams tokens from the LLM and displays live progress in the terminal.

## Configuration

All configuration is via environment variables (loaded from `.env` if present).

| Variable | Default | Description |
|----------|---------|-------------|
| `SAMWISE_BASE_URL` | — | **Required.** Base URL of the OpenAI-compatible vLLM endpoint |
| `SAMWISE_MODEL` | `qwen3.6-fast:35b` | Model used for extraction and search |
| `SAMWISE_SEARCH_MODEL` | _(same as above)_ | Optional override for SQL-generation queries only |
| `SAMWISE_API_KEY` | _(empty)_ | API key if the endpoint requires one |
| `DATABASE_URL` | — | **Required.** Postgres connection string |
| `LDP_HOST` | `https://digital.ucdavis.edu` | Base URL of the LDP/digital collections server |
| `COLLECTION_ARK` | `ark:/13030/c8pc37z3` | ARK of the wine catalog collection |
| `SEARCH_MODE` | `simple` | `simple` — every search word ILIKE-matches the trigram-indexed `search_text` column (name, producer, vineyard, description, varietal, region, appellation, country). `llm` — natural-language WHERE-clause generation via Samwise |
| `IMAGE_DIR` | `/data/images` | Local path for cached page images |
| `GCS_BUCKET` | _(empty)_ | If set, page images are read from this GCS bucket instead of `IMAGE_DIR`; object paths match `pages.image_path` (`<shortArk>/<filename>`). Auth via application default credentials |
| `CRAWL_CONCURRENCY` | `3` | Parallel requests during harvesting |
| `EXTRACT_CONCURRENCY` | `2` | Parallel LLM calls during extraction |
| `PORT` | `3000` | API server port |

## Database

Schema is auto-applied from `schema/init.sql` on first container start. Databases created before a schema change need the migrations in `schema/migrations/` applied manually:

```bash
docker compose exec -T db psql -U wine -d wine_prices < schema/migrations/001-search-text.sql
```

Three tables: `items` → `pages` → `wine_entries`. Each wine entry records name, producer, vineyard, vintage year, color, varietal, region, appellation, country, price, case price, bottle size, rating, importer, description, and an LLM confidence level (high / medium / low).

**Backup and restore:**

```bash
# Dump
docker compose exec db pg_dump -U wine -Fc wine_prices > wine_prices.pgdump

# Restore
docker compose exec -T db pg_restore -U wine -d wine_prices --clean --if-exists < wine_prices.pgdump
```

## Development

**Client — watch mode:**

```bash
npm run build:watch
```

Source is baked into the Docker image at build time, so API or extractor changes require a rebuild:

```bash
docker compose up -d --build api
```

**Diagnose a single item:**

```bash
node tools/diagnose-item.js <ark-or-short-id>
```

## Cloud Run Deployment

Scripts live in `devops/`; all settings (project, region, service sizing, and
the service's environment variables) are in `devops/config.sh`.

```bash
# Build the image with Cloud Build and push to Artifact Registry
./devops/build.sh

# Deploy to Cloud Run (us-west1); prints the service URL
./devops/deploy.sh

# Pin a tag through both steps
TAG=v2 ./devops/build.sh && TAG=v2 ./devops/deploy.sh
```

The deployed service runs the API only (`SEARCH_MODE=simple`, no LLM needed),
reads the database from PGFarm with the readonly `pgfarm-public` user, and
serves page images from the GCS bucket named in `GCS_BUCKET`. The PGFarm
database must have `schema/migrations/001-search-text.sql` applied and
`GRANT SELECT ON items, pages, wine_entries TO "pgfarm-public"` run by an
admin.

## Tech Stack

- **Backend:** Node 20, Express, node-postgres (`pg`)
- **Frontend:** Lit 3 web components, Rollup
- **LLM:** Qwen3.6 35B via vLLM (OpenAI-compatible API)
- **Database:** PostgreSQL 16
- **Image processing:** sharp (resize before sending to LLM)
- **Infrastructure:** Docker Compose
