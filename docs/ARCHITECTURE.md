# Protean — Architecture

**Companion to:** [PROJECT_CHARTER.md](PROJECT_CHARTER.md) · [ROADMAP.md](ROADMAP.md)
**Status:** Phase 0. Anything marked `[VERIFY]` must be checked against current vendor docs by
the implementing agent before it is relied on (I could not reach `docs.anthropic.com` from this
environment — egress-blocked — so SDK specifics are marked accordingly).

---

## 1. System at a glance

```
┌─────────────────────────────────────────────────────────────────────┐
│                              GUI (browser)                            │
│   left rail · CENTER CHAT · right PREVIEW PANE · top gear settings    │
└───────────────▲───────────────────────────────────────▲──────────────┘
                │ stream (SSE/WebSocket)                 │ live artefact updates
┌───────────────┴───────────────────────────────────────┴──────────────┐
│                          APP/CODE  (backend)                          │
│                                                                       │
│   ┌────────────┐   ┌──────────────┐   ┌───────────────────────────┐  │
│   │  Session/   │   │  WATCHER LLM │   │   AGENT CORE              │  │
│   │  State store│──▶│  layer       │──▶│  (Claude Agent SDK = 1st  │  │
│   │  (history)  │   │  optimise +  │   │   adapter; agentic loop,  │  │
│   └────────────┘   │  budget + log│   │   tools, subagents)       │  │
│                     └──────┬───────┘   └────────────┬──────────────┘  │
│                            │ deterministic-first     │ via            │
│                            ▼                         ▼                │
│                     ┌──────────────────────────────────────────┐     │
│                     │        LLM GATEWAY (provider-agnostic)    │     │
│                     │  adapters: claude | openai | gemini | …   │     │
│                     └──────────────────────────────────────────┘     │
│                                                                       │
│   Cross-cutting: LOGGING · TOKEN/COST TELEMETRY · CONTRACTS · CONFIG  │
│   · TOOL/CONNECTOR REGISTRY · DOMAIN PACKS                            │
└───────────────────────────────────────────────────────────────────────┘
```

Data flow (Law 4 — deterministic before generative):
`user msg → Session store → WatcherLLM (deterministic assembly + optional small-model rewrite,
fully logged) → Agent Core (Agent SDK loop, tools, subagents) → LLM Gateway → provider →
stream back → GUI + Preview Pane → artefact persisted to ARTEFACTS → everything logged to
LLMBUILD_DATA`.

---

## 2. The GUI (three panes + settings)

Layout mirrors Claude Desktop's feel with an executive, calm palette (see §7 Theme):

- **Left rail** — conversation list, new-chat, domain/workspace switch, pinned artefacts.
  Collapsible; on mobile it becomes a drawer.
- **Center — the chat.** The heart of the page. Streamed markdown, tool-call chips, inline
  citations. Always visible, always centered.
- **Right — the Preview Pane** (optional, toggle). Two modes: **(a) live artefact** — renders the
  thing being built (HTML/doc/table/workflow/code) and updates *as the model writes it*, so the
  user watches and steers; **(b) second Claude** — a parallel chat for a co-pilot conversation.
- **Top — settings** — a small gear: model/provider selection, latency vs quality tier, theme,
  domain pack, token budget. Small and out of the way by design.

**Responsive contract** `[testable]`: desktop = 3 columns; iPad = chat + collapsible preview;
mobile = chat full-width, rail and preview as drawers. Touch targets ≥ 44px; full keyboard nav;
streams never block input.

Stack `[VERIFY latest]`: **React + Vite + TypeScript**, Tailwind for the pascal/executive theme,
a lightweight state store (Zustand or React context — decide in ADR-0003), SSE or WebSocket for
streaming. No heavyweight UI framework; leanness is a product feature.

---

## 3. WatcherLLM layer — the optimiser & historian

**Purpose:** every message bound for *any* answering LLM passes through here first, to be
optimised for result and recorded. This is where Jeff's "optimise messages before they go to any
LLM, keep full input/output history" requirement lives.

**Critical design rule (from Charter §4 red-team):** the Watcher is **deterministic by default.**
Its standard path is pure code and adds negligible latency:

1. **Assemble** — pull relevant history from the Session store, apply the domain pack's system
   prompt, structure the context. (code)
2. **Budget** — compute a token budget for this turn; trim/summarise history to fit; choose the
   tier (fast vs deep) from settings + heuristics. (code)
3. **Cache-check** — compute a cache key; short-circuit on hit (see §5). (code)
4. **Optimise (conditional)** — *only* when a turn genuinely needs rewriting (ambiguous, bloated,
   or cross-model normalisation) does it call a **small, fast model** to rewrite the prompt. This
   call is itself measured and logged; if it doesn't pay for itself in result quality, it's cut.
5. **Record** — write the full {input, assembled prompt, any rewrite, output, tokens, model,
   timings, cache state} to `LLMBUILD_DATA/prompt-history`. (code)

The Watcher owns the **complete input/output history at this layer** and is the single choke point
for prompt governance (Charter §5.7). It never becomes an unmeasured extra LLM hop — that is the
explicit risk we are guarding against, and Phase 0 measures its overhead.

---

## 4. Agent Core & the Claude Agent SDK

The Agent Core runs the agentic loop: reason → call tools → observe → continue → answer, with
support for **subagents** for parallel/decomposed work. `[VERIFY]` The **Claude Agent SDK**
(TypeScript) is our first and reference implementation of this loop — it provides the harness for
tool use, the agent loop, MCP tool integration, and subagents. We wrap it behind our own
`AgentCore` interface so it is swappable (Law 5). Specific SDK entry points, option names, and
streaming APIs **must be confirmed against the current Anthropic Agent SDK docs** by the
implementing agent — I could not fetch them here.

Tools are supplied by the **Tool/Connector Registry** (typed, allowlisted per domain/tenant).
MCP servers (the pattern Protean already uses — Odoo, GhostDL, Outlook, Brave) plug in here.

Latency SLOs (targets to validate, not promises) `[measure in Phase 0]`:
- Time-to-first-token (streamed): **< 800 ms** on the fast path.
- Simple deterministic/cached turn: **< 300 ms** end-to-end (no answering-LLM call).
- Deep agentic turn: bounded by tool round-trips; must stream progress so perceived latency stays
  low.

---

## 5. Caching & token strategy (leanness is a feature)

Tiered, measured, and mostly deterministic:

- **Prompt/response cache** — deterministic cache key over {normalised prompt, model, domain,
  tool-set version}. Exact-hit returns instantly (the < 300 ms path). Store: in-memory LRU for
  the POC, pluggable to Redis later (Law 7 seam).
- **Provider-native prompt caching** `[VERIFY]` — where the provider supports caching large stable
  prefixes (system prompt, domain pack, long context), we structure prompts so the stable prefix
  is cacheable and only the tail varies. This is the single biggest token lever; the prompt
  assembler in the Watcher is built around it.
- **History compaction** — long conversations are summarised deterministically (or by a small
  model when needed) so token count grows sub-linearly.
- **Model tiering** (from RideAI charter, adapted): Tier 0 no LLM (deterministic); Tier 1 small
  fast model (routing, rewrite, classification); Tier 2 strong model (reasoning/synthesis);
  Tier 3 premium (high-value review). The Watcher picks the tier; settings can pin it.
- **Token telemetry** — every call records prompt/completion tokens and $ to
  `LLMBUILD_DATA/token-telemetry`; surfaced in the settings/telemetry view. You can't defend
  leanness you can't see (Charter §5.2).

---

## 6. Logging (the utmost standard — clear, visible, explanatory)

Logging is a first-class subsystem (`APP/CODE/src/logging`), not `console.log`. Requirements:

- **Structured** — JSON lines, one event per line, machine-parseable *and* rendered
  human-readably in a dev log view. Every event has: timestamp, correlation/turn id, layer
  (gui/watcher/agent/gateway), event type, and an **explanatory human message** ("Watcher chose
  Tier 1 rewrite because prompt exceeded 6k tokens" — not "tier=1").
- **Full lineage** — for each turn: the raw user input, assembled prompt, any Watcher rewrite,
  model + provider, tokens, cache hit/miss, every tool call and result, timings per stage, and the
  final output. This *is* the evidence trail of Charter Law 6.
- **Never logs secrets** — API keys, tokens, credentials are redacted at the boundary. (The only
  security rule that holds during the POC.)
- **Levels** — trace/debug/info/warn/error, with `error` always carrying the root cause (Law 1 —
  no swallowed errors).

---

## 7. Theme (executive, smart, calm)

Pascal / soft palette per the brief: light blue and warm orange as the accent pair on a light,
airy base. All values live in `APP/GUI/src/theme/tokens.*` (Law 2 — never inline colours).

```
--bg            #F7F9FC   (near-white, cool)
--surface       #FFFFFF
--ink           #1E2A3A   (deep slate, text)
--muted         #5B6B7F
--accent-blue   #4C8DD6   (light executive blue — primary)
--accent-blue-2 #7FB0E6
--accent-orange #E8894A   (warm orange — secondary/CTA)
--line          #E3E9F0
--ok            #2E9E6B   --warn #E0A030   --err #C0392B
font: Inter / system-ui;  mono: JetBrains Mono / ui-monospace
```
Design intent: whitespace-forward, restrained, "quietly premium". Not a toy, not a dashboard
template.

---

## 8. The stack (decisions, each with an ADR)

| Concern | Choice (POC) | ADR |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind | ADR-0001 |
| Backend runtime | Node + TypeScript (same language as Agent SDK) | ADR-0002 `[VERIFY SDK lang]` |
| Streaming | SSE first; WebSocket if bidirectional preview needs it | ADR-0003 |
| Agent loop | Claude Agent SDK behind `AgentCore` interface | ADR-0004 `[VERIFY]` |
| State/history store | In-memory + file for POC; Postgres/Redis seam for later | ADR-0005 |
| LLM gateway | Internal interface + per-provider adapters | ADR-0006 |

ADRs are one page each in `docs/DECISIONS/`. The table is the index; the ADR is the reasoning.
No stack choice is "just done" — it's done *and recorded*.

---

## 9. Module map (APP/CODE/src) — where each behaviour lives

```
agent/       AgentCore interface + Claude Agent SDK adapter; the agentic loop; subagents
gateway/     LLM Gateway interface + provider adapters (claude, openai, …); streaming normalise
watcher/     prompt assembly, token budgeting, tiering, cache-check, conditional rewrite, record
logging/     structured logger, redaction, human-readable renderer, log event contracts
contracts/   typed schemas (zod/TS types) for messages, turns, tool I/O, config — the seams
config/      runtime config loader; env/secret resolution; tenant + tier + model settings
domains/     Domain Packs (finance/, medical/, education/, generic/) — data & config only
```
GUI, PREVIEWPANE, ARTEFACTS, LLMBUILD_DATA are siblings of CODE under APP/ (see README map).
