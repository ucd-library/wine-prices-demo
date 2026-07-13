-- Adds the simple-search generated column + trigram index to an existing
-- database. init.sql only runs on first container start, so apply this to
-- any DB created before the search_text column existed:
--
--   docker compose exec -T db psql -U wine -d wine_prices < schema/migrations/001-search-text.sql
--
-- Idempotent — safe to run more than once.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE wine_entries ADD COLUMN IF NOT EXISTS search_text TEXT GENERATED ALWAYS AS (
  COALESCE(wine_name,'')   || ' ' || COALESCE(producer,'')    || ' ' ||
  COALESCE(vineyard,'')    || ' ' || COALESCE(description,'') || ' ' ||
  COALESCE(varietal,'')    || ' ' || COALESCE(region,'')      || ' ' ||
  COALESCE(appellation,'') || ' ' || COALESCE(country,'')
) STORED;

CREATE INDEX IF NOT EXISTS wine_entries_search_trgm_idx ON wine_entries USING gin (search_text gin_trgm_ops);

ANALYZE wine_entries;
