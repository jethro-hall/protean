# ADR-0001 — Provider-agnostic gateway/proxy with both adapters from the start

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Jeff (owner), Claude
- **Phase:** 0

## Context
The upstream LLM link is transient (Bedrock bearer/token expiry, SSO redirects, provider 429/5xx).
The app must never see that turbulence, and Protean must be able to switch or A/B providers without
touching app code (Law 5).

## Decision
One `protean-gateway` component owns all provider credentials and vendor wire protocols. The app
speaks a single internal protocol (`contracts/turn.ts`). Both the Claude (via Bedrock) adapter and
the direct-API/other-provider adapters are built behind the gateway **from the start**. The gateway
implements refresh-before-expiry, retry+backoff+jitter, a per-provider circuit breaker, and streaming
continuity (partial-on-drop, never silent truncation). Per-request provider selection via config.

## Alternatives considered
- **Single provider, add others later** — rejected: retrofitting a second provider after the app has
  leaked vendor assumptions is exactly the rework Law 5 exists to prevent.
- **App calls providers directly** — rejected: spreads credentials and transient-link handling across
  the codebase.

## Consequences
One extra internal hop (measured in Phase 0). Clean seam for A/B latency tests and failover.
Credentials live in one place. `[VERIFY]` exact Bedrock auth handshake vs live docs before Phase 0.
