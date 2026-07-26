# APP/CODE — backend engine

The generic engine. Knows nothing about any domain (Law 2). Module map (ARCHITECTURE §9):

```
src/
  agent/       AgentCore interface + Claude Agent SDK adapter; agentic loop; subagents
  gateway/     LLM Gateway interface + provider adapters; streaming normalisation
  watcher/     prompt assembly · token budgeting · tiering · cache-check · conditional rewrite · record
  logging/     structured logger · secret redaction · human-readable renderer · event contracts
  contracts/   typed schemas (messages, turns, tool I/O, config) — the boundaries
  config/      runtime config loader · env/secret resolution · tier/model/tenant settings
  domains/     Domain Packs (finance/ medical/ education/ generic/) — DATA & CONFIG ONLY, no logic
```

## Phase 0 target (first code to write — see ROADMAP)
A minimal vertical slice that proves latency, streaming, and provider-agnosticism:

1. `contracts/turn.ts` — the typed shape of a turn (input, prompt, output, tokens, timings).
2. `gateway/LlmGateway.ts` — the interface; `gateway/adapters/claude.ts` — the first adapter
   `[VERIFY Agent SDK API]`.
3. `agent/AgentCore.ts` — interface; `agent/adapters/claudeSdk.ts` — wraps the Claude Agent SDK
   loop behind it.
4. `logging/logger.ts` — structured, redacting, human-readable.
5. `watcher/assemble.ts` + `watcher/cache.ts` — deterministic assembly + cache-check only
   (no rewrite model yet — measure the baseline first).
6. A tiny entrypoint that streams a response and **records TTFT + total latency** to
   `../LLMBUILD_DATA/token-telemetry/` and the BUILD_LOG.

Acceptance: streamed answer through `AgentCore → Gateway → Claude Agent SDK`; second identical
run is a < 300 ms cache hit; numbers logged. Then, and only then, Phase 1 (GUI).
