---
name: protean-phase0
description: Executes Protean Phase 0 — the measured Claude Agent SDK latency spike. Use when building AgentCore, the LLM Gateway Claude adapter, structured logging, streaming entrypoint, or cache timing for Phase 0 acceptance.
---

# Protean Phase 0 — Latency spike

## Goal
Streamed answer through `AgentCore → Gateway → Claude Agent SDK`, with per-stage timings logged,
Claude-Desktop-grade answer quality; second identical run from cache **< 300 ms**.

## Build only this slice
Under `APP/CODE/src` (see `APP/CODE/README.md`):
- `contracts/turn.ts`
- `gateway/LlmGateway.ts` + `gateway/adapters/claude.ts`
- `agent/AgentCore.ts` + `agent/adapters/claudeSdk.ts`
- `logging/logger.ts`
- `watcher/assemble.ts` + `watcher/cache.ts` (deterministic assemble/cache only — no generative
  WatcherLLM rewrite yet; that is Phase 2)
- Streaming entrypoint that records TTFT + total latency

## Hard constraints
- Vendor SDK imports only inside adapters (Law 5).
- No GUI (Phase 1). No Qdrant, no multi-tenant, no security theatre beyond secret hygiene.
- Confirm SDK API against live docs: `@anthropic-ai/claude-agent-sdk` `query({ prompt, options })`,
  `Options.model`. Bedrock: `CLAUDE_CODE_USE_BEDROCK=1` + `AWS_REGION` + `ANTHROPIC_MODEL` +
  `AWS_BEARER_TOKEN_BEDROCK` (see `.env.example`). Pin model IDs from
  `aws bedrock list-inference-profiles --region ap-southeast-2` before hardcoding in config.
- Unverifiable → `[VERIFY]` + BUILD_LOG blocker. Never stub a fake that hides the gap.

## Acceptance evidence
Record numbers in `APP/LLMBUILD_DATA/token-telemetry` and append `docs/CHAT/BUILD_LOG.md`.
Done only when the acceptance test in ROADMAP Phase 0 passes with evidence.
