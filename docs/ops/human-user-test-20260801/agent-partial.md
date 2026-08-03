# Phase Human User Test — partial notes (subagent aborted)

**Status:** STOPPED by parent — do not use `agent-browser` from this subagent; parent owns the browser session.

**Stopped at:** After design artefacts (A) only. Sections B–G not exercised by this subagent.

## Environment (verified before browser work)

| Check | Result |
|-------|--------|
| Driver | `agent-browser` 0.25.4 (`/home/ec2-user/.local/bin/agent-browser`) |
| Display | `DISPLAY=` empty → headless + screenshots intended |
| Engine | `http://127.0.0.1:8787/healthz` → `{"ok":true}` HTTP 200 |
| GUI | `http://127.0.0.1:5173/` HTTP 200 (Vite) |
| Domains API | `GET /api/domains` returned 3 packs: `finance`, `generic`, `medical` |
| Evidence dir | `/var/dcf/protean/docs/ops/human-user-test-20260801/` |

Processes observed: engine via `tsx src/server.ts`; GUI via `vite --host 0.0.0.0 --port 5173 --strictPort`.

## Collision note

Subagent ran `agent-browser close --all` then opened style guide / shell prototype. That likely collided with the parent session. Parent should resume from a clean `open` of the intended URL and ignore any mid-flight state from this subagent.

## Evidence files written by this subagent

| File | What |
|------|------|
| `healthz.json` | Engine health |
| `domains.json` | Domains API payload (3 packs) |
| `02-style-guide-initial.png` | Style guide load |
| `02-style-guide-snapshot.txt` | Interactive snapshot |
| `03-style-guide-worklog-collapsed.png` | After worklog click (see caveat) |
| `04-style-guide-worklog-expanded.png` | After re-click |
| `05-style-guide-infohint-open.png` | After (i) “About restated GP” click |
| `06-style-guide-infohint-dismissed.png` | After Escape |
| `07-shell-prototype.png` | Shell prototype load |
| `07-shell-prototype-snapshot.txt` | Full a11y tree |

Pre-existing from earlier attempt (may be orphaned): `00-open.log`, `01-live-gui-initial.png`, `01-snapshot.txt`.

## Partial results — A. Design artefacts

### Style guide (`/design/protean-style-guide.html`)

| Control | Tentative | Notes |
|---------|-----------|-------|
| Swatches / tokens visible | PASS (visual) | Colour / typography / spacing / buttons sections present in snapshot + screenshot `02` |
| Worklog expand/collapse | PARTIAL / unverified | Clicked `@e27` (worklog summary); post-click snapshot still showed `expanded=true`. May be a11y-attr lag, wrong ref semantics, or toggle not wired on static demo. Screenshots `03`/`04` exist — parent should re-verify visually |
| (i) hint open | PASS (likely) | Clicked `@e29` “About restated GP”; eval reported `hintVisible: true`; `05` |
| Esc dismiss hint | PASS (likely) | After Escape, eval `visiblePops: 0`; `06` |

### Shell prototype (`/design/protean-shell-prototype.html`)

| Control | Tentative | Notes |
|---------|-----------|-------|
| 3 panes present | PASS | Eval: `aside.rail` (264px), `main.chat` (756px), `aside.preview` (420px) at 1440×900; screenshot `07` |
| Prototype chrome | Observed only | Brand “Protean · Finance”, TTFT/tokens chips, Settings, New conversation, Rail foot “Jeff Hall / RideAI · GhostStack”, worklog demo — static prototype, not live React |

## Not done (parent must complete)

- **B.** Live shell chrome (rail ☰, preview ▥, settings gear, telemetry, brand domain id, InfoHints)
- **C.** Settings (Fast/Strong, domain finance→generic→medical, `/api/domains`)
- **D.** Conversations rail (new, select, foot identity / RideAI hardcode)
- **E.** Live composer turns (generic+strong ping, attach, finance tools, medical persona, artefacts, worklog, **Stop button**)
- **F.** Preview close/reopen/resize/empty vs content
- **G.** Error paths (oversized attach, empty-state copy)
- Scoring 0–10 ×3, market readiness, `REPORT.md`, `results.json`

## Suggested parent resume order

1. Do **not** `close --all` if other agents may share the machine; use `--session` isolation if available, or exclusive ownership.
2. Open live GUI `http://127.0.0.1:5173/` with viewport 1440×900.
3. Continue matrix from **B** through **G**; keep screenshot numbering from `08-…` (or renumber fully in final report).
4. Treat A results above as draft only — re-spot-check worklog toggle on style guide.

## Deliverables not written by this subagent

- `REPORT.md` — not written
- `results.json` — not written
- Scores / market readiness — not scored (insufficient coverage)
