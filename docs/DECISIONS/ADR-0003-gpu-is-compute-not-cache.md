# ADR-0003 — The GPU is compute, not a cache substrate

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Jeff (owner), Claude
- **Phase:** deferred build (design now)

## Context
The owner asked to "leverage the NVIDIA GPU to cache LLM / frontend GUI / user memory," motivated by
Claude Desktop struggling on large chats. A GPU is a compute device, not a cache substrate; "large
chats slow" is a context-management problem, not a caching one.

## Decision
The **NVIDIA L4** is used for **compute**: (1) embeddings for semantic recall, (2) an optional small
local fast-model for WatcherLLM cheap-path + long-chat compaction/summarisation, (3) warming
embeddings for active user memory. **Caching itself lives in Redis/RAM.** The real fix for large
chats is compaction + semantic retrieval (which the GPU accelerates), feeding the reasoning model a
lean context. GPU work is brokered through a single `protean-gpu` accessor (fairness + concurrency
cap); no sandbox gets raw device access. GPU is optional and degradable — nothing requires it to be
correct; absent/busy GPU falls back to the gateway fast tier.

## Alternatives considered
- **Host the primary reasoning model on the L4** — rejected: 24 GB is insufficient for frontier-model
  latency and contends with embeddings. Reasoning stays on Bedrock/API. Revisit only with evidence.

## Consequences
Clear division: Redis caches, GPU computes, Bedrock reasons. `[VERIFY]` NVIDIA Container Toolkit +
`nvidia-smi` from a container before compose declares `gpus`.
