# Phase Human User Test — Report

**Date:** 2026-08-01  
**Driver:** `agent-browser` **headless** (host has no `$DISPLAY`; Cursor IDE browser MCP tools were not available in this session)  
**Targets:** `http://127.0.0.1:5173/` (live GUI), design style guide + shell prototype, engine `:8787`  
**Inventory agent:** control matrix from GUI source exploration  
**Evidence:** this directory (screenshots `01`–`26`, `results.tsv`, `results.json`, SSE captures)

> Visibility note: a headed browser cannot open on this EC2 without X11. Public `https://protean.rideai.com.au` requires Authentik login. Screenshots are the watchable record unless Cursor Browser MCP is enabled or you run headed locally.

---

## Executive verdict

**Market readiness: POC-only — not ready for market.**

Core chat, domain switching, attach, worklog, telemetry, and design-system pages work. Two **designed** product capabilities fail acceptance for a human product:

1. **Stop / seize mid-turn is missing** from the live Composer (button stays ✈ with `aria-label="Streaming"`; no AbortController wiring in GUI state).
2. **Tool → artefact finance workflow** returned **empty model output** with `toolsCalled: []` on this HUT retest (only a lone SSE `done`), despite connectors being wired in lineage.

Bedrock AWS auth was valid; no temp Anthropic/OpenAI/Google keys were required or installed.

---

## Scores (0–10) — after functional verification

| Dimension | Score | Rationale |
|-----------|------:|-----------|
| **Functionality** | **6.0** | Settings, domains, attach, finance chat, medical switch, worklog, telemetry, design pages PASS. Stop FAIL. Tool+artefact path FAIL on retest. GUI artefact/steer not proven this run. |
| **Fit for purpose** | **6.5** | Multi-domain associate + streaming chat is real. Hardcoded RideAI chrome, missing Stop, flaky tool/artefact path, and no external business connectors undercut “Claude-desktop-grade workflow” claim. |
| **Best practice** | **5.0** | Engine laws largely held; CI green on main. GUI regressions (Stop), leftover hardcodes, Authentik-only public access, no a11y/failover/cost dashboard (Phase 6). |

**Overall readiness:** POC-only.

---

## Per-control results (deduped)

| Control | Result | Evidence / notes |
|---------|--------|------------------|
| Settings Fast/Strong/Finance/Medical pills | PASS | `12-settings.png` |
| Brand + composer foot after finance/strong | PASS | `13-finance-strong.png` |
| Domain → medical | PASS | `26-medical-switch-ok.png` brand `· medical` |
| Preview close / reopen | PASS | `14` / toggle |
| Rail toggle | PASS | clicked (desktop rail always visible) |
| InfoHint (telemetry) | PASS | opens; Esc dismisses |
| New conversation | PASS | |
| Attach JSON chip | PASS | `15-attach.png` |
| Live finance turn (BLUF) | PASS | streamed; worklog Read attach; TTFT 3611ms / 7.8s / miss |
| Telemetry real numbers | PASS | `17-finance-done.png` |
| Worklog present | PASS | |
| Stop button (idle) | FAIL | not in DOM |
| Stop during stream | FAIL | `aria-label` becomes `Streaming` only — `19-during-stream.png` |
| Toolchip on short GUI turn | PARTIAL | none on BLUF turn |
| Artefact UI on short GUI turn | PARTIAL | none-yet |
| API tool+artefact finance workflow | FAIL | SSE kinds=`[done]` only; empty output; `toolsCalled=[]` — `25-artefact-*.json` |
| Style guide worklog toggle | PASS | |
| Style guide (i) hint | PASS | |
| Shell prototype open | PASS | |

Counts (deduped): **22 PASS · 5 FAIL · 2 PARTIAL**

---

## Critical blockers (ranked)

1. Restore **Stop** in Composer + `AbortController` through `useTurn` (product claimed earlier; absent on `main` now).
2. Diagnose empty **tool/artefact** turns (wiredTools present, model produced nothing) — must be reliable before market claims.
3. Prove **GUI path** for datalake tools → preview artefact → steer Apply (not only API).
4. Remove / generalize **RideAI / Jeff Hall** shell hardcodes for multi-domain honesty.
5. Enable Cursor Browser MCP or headed display if owner must *watch* automation live.
6. Phase 6: a11y, cost dashboard, provider failover design.
7. External MCP (Odoo/GhostDL/email) + Bash sandbox still residual.
8. Public Authentik path not exercised in this HUT (login required).
9. Conversation rail shows global domain tag (mislabels history after switch).
10. Empty-state copy still mentions workflows that do not exist in UI.

---

## What “done” for Phase Human User Test requires

- [ ] Stop works mid-stream (seize LLM) with UI proof  
- [ ] Finance tool→boardMemo artefact works via **GUI** with preview open  
- [ ] Medical + generic live turns with brand/domain foot matching  
- [ ] All FAIL rows above cleared or explicitly waived in BUILD_LOG with owner sign-off  
- [ ] Owner watches one headed pass (Cursor Browser or local)  

Until then: **Phase Human User Test = FAIL / incomplete.**
