# Protean — Roadmap (phased build)

**Companion to:** [PROJECT_CHARTER.md](PROJECT_CHARTER.md) · [ARCHITECTURE.md](ARCHITECTURE.md)
**Governing rule:** one phase at a time. A phase is *done* only when its acceptance test passes
and the build log records the evidence (Charter §6, "done means done").

The ordering is deliberate: **get to a measured Claude Agent SDK latency spike as fast as
possible** (your top priority), *then* build outward. We prove the hard, risky things (latency,
provider-agnosticism, the Watcher's overhead) before we polish.

---

## Phase 0 — Foundation & the latency spike  ✅ DONE
**Evidence:** `docs/CHAT/BUILD_LOG.md` (2026-07-27 live spike) +
`APP/LLMBUILD_DATA/token-telemetry/spike-2026-07-27T05-48-41-742Z.json` — run 2 cache hit
**0.56 ms** (&lt; 300 ms gate).

**Goal:** a running, instrumented "hello, streamed answer" through the real Claude Agent SDK, with
timings, so we have *measured* latency numbers before any product is built.

Deliverables:
- Repo skeleton (this) on GitHub with charter, architecture, roadmap, agent rules, CI stub.
- `AgentCore` interface + **Claude Agent SDK adapter** wired to Bedrock/Anthropic `[VERIFY creds]`.
- `LLM Gateway` interface with the Claude adapter behind it (Law 5 from day one).
- Streaming to a bare terminal/HTTP endpoint (no GUI yet) with **per-stage timings logged**.
- Structured logging subsystem emitting human-readable lineage.

**Acceptance test:** send a prompt; receive a *streamed* response through `AgentCore →
Gateway → Claude Agent SDK`; the log shows time-to-first-token and total latency; the same
prompt on a second run hits the cache and returns in < 300 ms. Numbers recorded in
`LLMBUILD_DATA/token-telemetry` and `docs/CHAT/BUILD_LOG.md`.

**Exit criterion:** we can state Protean's real TTFT and per-turn latency with evidence — and
decide whether the WatcherLLM hop (Phase 2) is affordable.

---

## Phase 1 — The three-pane GUI shell  ✅ DONE
**Evidence:** BUILD_LOG Phase 1–3 sign-off + ADR-0005 design-system promote +
`docs/new-frontend` prototype parity (owner-directed theme).

**Goal:** the executive-themed UI with center chat + left rail + settings gear, streaming the
Phase 0 backend. Preview pane present but stubbed.

**Acceptance test:** on desktop, iPad, and mobile viewports, a user sends a message and watches a
streamed reply in the center pane; theme matches §7; responsive contract holds; settings gear
switches model tier. TTFT visibly < 800 ms on the fast path.

---

## Phase 2 — WatcherLLM layer + history store  ✅ DONE
**Evidence:** BUILD_LOG — Watcher overhead bench + live A/B; rewrite cut (does not pay for itself).

**Goal:** insert the deterministic-first Watcher and the Session/history store. Prove the Watcher
adds negligible latency on the deterministic path and *measurably improves results* when it does
rewrite (needs the eval harness — built here).

**Acceptance test:** full input/output history persists across restarts; the Watcher's added
latency on the deterministic path is < 50 ms `[measure]`; an A/B on the eval set shows the
conditional rewrite improves a scored result, or the rewrite is cut. All logged.

---

## Phase 3 — The live Preview Pane (the differentiator)  ✅ DONE
**Evidence:** BUILD_LOG — live Bedrock artefact stream into preview + save under `APP/ARTEFACTS/`.

**Goal:** the interactive artefact surface — the model builds an HTML/doc/table/workflow and the
user watches it update live and steers it. Optional "second Claude" mode.

**Acceptance test:** user asks for an artefact; it renders and updates *during* generation; user
issues a follow-up ("make the header blue") and sees the change apply live; the artefact is
saved to `APP/ARTEFACTS/` and logged.

---

## Phase 4 — Domain Packs & the multi-domain proof  ✅ DONE
**Evidence:** `docs/CHAT/BUILD_LOG.md` (Phase 4 multi-domain proof) — finance ↔ generic ↔
medical pack switch with distinct systemPrompt/vocabulary/tools/templates in lineage.

**Goal:** prove shape-shifting. Ship Domain Packs (finance = Ride Electric; + medical) as
**config only**, no engine change beyond deterministic pack rendering into the prompt.

**Acceptance test:** switching the domain pack in settings changes system prompt, tools,
vocabulary, and output templates with zero code change; domains produce correct, traceable
output. This validates Charter §3 and Law 2.

---

## Phase 5 — Tool/Connector Registry & real workflows  ← WE ARE HERE
**Goal:** register real tools (MCP servers: Odoo, GhostDL, search, email) and run a genuine
multi-step workflow end-to-end (e.g. the TFM reconciliation, or a finance question) inside
Protean. Dynamic agent-loop substrate (Read/Grep/Glob, maxTurns) was pulled forward; Bash +
MCP registry remain.

**Acceptance test:** a real business workflow runs through Protean, calls tools, produces a
correct artefact with full evidence lineage.

---

## Phase 6 — Hardening for real use (still pre-SaaS)
**Goal:** eval coverage, cost telemetry dashboard, graceful provider failover (designed, logged —
not a workaround), accessibility pass.

---

## Backlog / next-phase (explicitly NOT now — Charter §6)
- Security, auth, RBAC, tenant isolation (deferred by owner decision until POC proven).
- Multi-tenant SaaS control plane.
- Additional providers beyond the first two adapters.
- Voice, mobile-native shells, offline.

Any new idea is triaged into: **current phase / next phase / backlog**. If it doesn't fit the
current phase's acceptance test, it waits — and the triage decision is logged.
