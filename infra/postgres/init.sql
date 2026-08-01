-- Protean pgvector bootstrap (Phase M — Grounded Knowledge v2, ADR-0002).
-- Applied automatically by the postgres image's docker-entrypoint-initdb.d on
-- first container start only (mounted read-only in docker-compose.yml).

CREATE EXTENSION IF NOT EXISTS vector;

-- Tracks which numbered migration files (this one plus any future ones under
-- infra/postgres/migrations/) have been applied. No ORM in this repo -- a
-- small tracked-by-id table is enough (Law: small, named, no god-files).
CREATE TABLE IF NOT EXISTS _migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- One row per embedded KnowledgeChunk (contracts/knowledge.ts). Fixed at 1024
-- dims -- verified against Voyage AI's current docs: voyage-4, voyage-finance-2,
-- and voyage-law-2 (the models this app's embedding adapter uses) all default
-- to 1024-dimension output.
CREATE TABLE IF NOT EXISTS knowledge_chunk_embeddings (
  chunk_id text PRIMARY KEY,
  collection_id text NOT NULL,
  embedding vector(1024) NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_chunk_embeddings_hnsw
  ON knowledge_chunk_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS knowledge_chunk_embeddings_collection_idx
  ON knowledge_chunk_embeddings (collection_id);

INSERT INTO _migrations (id) VALUES ('0001_init_pgvector') ON CONFLICT DO NOTHING;
