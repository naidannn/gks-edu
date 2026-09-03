-- Postgres 17 + pgvector: enable the extensions the app relies on.
-- Runs once, on first initialisation of an empty data volume.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
