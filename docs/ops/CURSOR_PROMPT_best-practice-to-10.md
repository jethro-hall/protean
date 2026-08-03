# Cursor prompt — Protean best practice 5 → 10

Copy everything below the line into a **new** Agent chat (workspace root: `/var/dcf/protean`).

---

You are working on **Protean** at `/var/dcf/protean` on branch `main` (post Phase 5 merge).

## Context
Phase Human User Test scored:
- Functionality **6.0 / 10**
- Fit for purpose **6.5 / 10**
- Best practice **5.0 / 10**
- Market readiness: **POC-only**

Evidence: `docs/ops/human-user-test-20260801/REPORT.md`  
Control inventory was done against `APP/GUI/src`. Obey `AGENTS.md` / `.cursorrules` (8 laws). Append `docs/CHAT/BUILD_LOG.md`. No secrets in git. Prefer Bedrock via existing `.env` / `aws login` — do not invent keys.

## Objective
Raise **best practice toward 10/10** by making designed behaviour real, proven, and honest — not by papering over gaps.

### Must fix first (unblock HUT / jump ~5 → 7–8)
1. **Restore Stop mid-turn** in live GUI:
   - Composer: while streaming, show Stop (not only `aria-label="Streaming"` on Send).
   - Wire `AbortController` through `useTurn` → `POST /api/turn` abort → engine seize (BUILD_LOG previously claimed this; code on `main` is missing it).
   - Prove: start a long turn → Stop → partial/`[stopped]` in session history; screenshot + BUILD_LOG.
2. **Fix empty tool→artefact path**:
   - HUT retest failed: finance tool workflow returned SSE `kinds=['done']` only, `toolsCalled=[]`, empty output, despite `wiredTools` including `dataLakeQuery`.
   - Must work via **GUI**: finance domain → ask for dataset summarize / boardMemo → toolchips → preview artefact → optional steer Apply → lineage has tools + artefact tags.
   - No temp scripts that fake the UI.
3. **Re-run a focused Human User Test** on Stop + artefact path (headless `agent-browser` OK if Cursor Browser MCP still empty on SSH). Update `docs/ops/human-user-test-20260801/` or a dated follow-up folder.

### Then (→ ~8–9)
4. Remove or config-drive RideAI / Jeff Hall / GhostStack hardcodes (`APP/GUI/src/config/shell.ts`, avatars, empty copy).
5. Domain-agnostic (or pack-driven) hints / empty states / steer placeholders; fix misleading global domain tags on old conversations.

### Then Phase 6 hardening (→ ~9–10)
6. Cost/token telemetry surface beyond topbar chips.
7. Designed, logged provider failover (no silent fallback).
8. Eval coverage for pack + tool workflows in CI.
9. Accessibility pass (keyboard, focus, labels, contrast).
10. Bash only behind proven sandbox; external MCP only when catalogued + credentialed + failure-logged.

## Constraints
- One phase of work at a time; ship Stop + artefact reliability before Phase 6 polish.
- Commit on a feature branch; do not force-push `main`. Ask before push/PR if unclear.
- Public URL `https://protean.rideai.com.au` is behind Authentik; local GUI `http://127.0.0.1:5173`, engine `:8787`.
- Cursor IDE browser MCP often has empty tools over SSH — use `agent-browser` + screenshots if needed.

## Done means
- Stop proven in GUI.
- Finance tool→artefact proven in GUI with lineage.
- BUILD_LOG entry with evidence paths.
- Short scorecard: what moved best-practice score and what’s left for 10/10.

Start by inspecting `APP/GUI/src/components/Composer.tsx`, `APP/GUI/src/state/useTurn.ts`, and the HUT report, then implement Stop first.
