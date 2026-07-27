# ADR-0002 — PostgreSQL + pgvector for the POC; Qdrant deferred behind a seam

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Jeff (owner), Claude
- **Phase:** 0 (seam) / vector use lands Phase 2+

## Context
Protean needs relational truth (conversations, turns, lineage, config) and semantic vectors
(long-chat memory, recall). The owner initially expected two DB services (Qdrant + Postgres). For a
POC the vector volume is small.

## Decision
Use **PostgreSQL with the `pgvector` extension** as the single store for the POC — relational truth
plus vectors in one service (`protean-pg`). Access vectors through a `VectorStore` interface (Law 7
seam). **Qdrant is deferred**: it becomes an adapter swap, triggered by measured scale/filtering/
sharding needs, recorded in a follow-up ADR — not stood up now.

## Alternatives considered
- **Qdrant from day one** — rejected for the POC: a second service to run, operate, and fail before
  its scale advantages are needed. (Owner agreed after challenge.)
- **In-memory vectors** — rejected: not durable; loses user memory.

## Consequences
One fewer container in the POC. A clean interface means Qdrant later is additive, not a rewrite.
Postgres remains the system of record; if any cache disagrees, Postgres wins.
