CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS items (
  id           SERIAL PRIMARY KEY,
  ark          TEXT UNIQUE NOT NULL,
  title        TEXT,
  date         TEXT,
  creator      TEXT,
  publisher    TEXT,
  description  TEXT,
  page_count   INTEGER DEFAULT 0,
  ldp_metadata JSONB,
  harvested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS items_ark_idx ON items (ark);

CREATE TABLE IF NOT EXISTS pages (
  id               SERIAL PRIMARY KEY,
  item_id          INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  filename         TEXT NOT NULL,
  page_number      INTEGER,
  image_url        TEXT NOT NULL,
  image_path       TEXT,
  text_url         TEXT,
  processed        BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at     TIMESTAMPTZ,
  llm_raw_response JSONB,
  UNIQUE(item_id, filename)
);

CREATE INDEX IF NOT EXISTS pages_item_id_idx  ON pages (item_id);
CREATE INDEX IF NOT EXISTS pages_processed_idx ON pages (processed) WHERE processed = FALSE;

CREATE TABLE IF NOT EXISTS wine_entries (
  id           SERIAL PRIMARY KEY,
  page_id      INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  item_id      INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  wine_name    TEXT,
  producer     TEXT,
  vineyard     TEXT,
  vintage_year INTEGER,
  color        TEXT,
  varietal     TEXT,
  region       TEXT,
  appellation  TEXT,
  country      TEXT,
  price        NUMERIC(10,2),
  case_price   NUMERIC(10,2),
  bottle_size  TEXT,
  rating       INTEGER,
  importer     TEXT,
  description  TEXT,
  currency     TEXT DEFAULT 'USD',
  confidence   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  -- Concatenated text fields for simple search (one trigram-indexed ILIKE
  -- per search word instead of an OR across every column)
  search_text  TEXT GENERATED ALWAYS AS (
    COALESCE(wine_name,'')   || ' ' || COALESCE(producer,'')    || ' ' ||
    COALESCE(vineyard,'')    || ' ' || COALESCE(description,'') || ' ' ||
    COALESCE(varietal,'')    || ' ' || COALESCE(region,'')      || ' ' ||
    COALESCE(appellation,'') || ' ' || COALESCE(country,'')
  ) STORED
);

CREATE INDEX IF NOT EXISTS wine_entries_item_id_idx     ON wine_entries (item_id);
CREATE INDEX IF NOT EXISTS wine_entries_page_id_idx     ON wine_entries (page_id);
CREATE INDEX IF NOT EXISTS wine_entries_vintage_year_idx ON wine_entries (vintage_year);
CREATE INDEX IF NOT EXISTS wine_entries_color_idx       ON wine_entries (color);
CREATE INDEX IF NOT EXISTS wine_entries_region_idx      ON wine_entries (region);
CREATE INDEX IF NOT EXISTS wine_entries_price_idx       ON wine_entries (price);
CREATE INDEX IF NOT EXISTS wine_entries_varietal_idx    ON wine_entries (varietal);
CREATE INDEX IF NOT EXISTS wine_entries_country_idx     ON wine_entries (country);
CREATE INDEX IF NOT EXISTS wine_entries_search_trgm_idx ON wine_entries USING gin (search_text gin_trgm_ops);
