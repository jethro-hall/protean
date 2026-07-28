# Protean — human test card (design system + live GUI)

Services run as **systemd --user** units (`protean-engine`, `protean-gui`) — not a Cursor terminal.
Reinstall / restart: `bash scripts/install-gui-services.sh` · `systemctl --user restart protean-gui`

## Open these (in order)

| # | What | URL |
|---|---|---|
| 1 | Living style guide (tokens + C1–C16, worklog, (i)) | http://127.0.0.1:5173/design/protean-style-guide.html |
| 2 | Interactive 3-pane shell prototype (Claude-Desktop-style worklog) | http://127.0.0.1:5173/design/protean-shell-prototype.html |
| 3 | Live React GUI (engine-backed chat / uploads / preview) | http://127.0.0.1:5173/ |
| 4 | Engine health | http://127.0.0.1:8787/healthz |

Bound as `0.0.0.0` — replace `127.0.0.1` with this host’s LAN/public IP if testing from another machine
(e.g. `http://agents.rideai.com.au:5173/` when security groups allow).

**Public host:** Vite must allow the Host header — set `PROTEAN_GUI_ALLOWED_HOSTS` (default
includes `protean.rideai.com.au`). If Caddy still proxies that hostname to Agentic Workflow
Studio (`agentic_workflow_web:3000`), you will not see this GUI until the edge is re-pointed
at `host.docker.internal:5173` / the host Vite port.

## Click-through checklist (owner)

Style guide
- [ ] Colour swatches resolve (no broken tokens)
- [ ] Worklog demo expands/collapses; purple = reasoning only
- [ ] (i) popover on “Restated GP” appears on hover/focus; Esc dismisses

Shell prototype
- [ ] 3 panes readable on desktop / iPad / mobile widths
- [ ] Worklog steps stream / collapse smoothly
- [ ] Steer bar / preview / composer feel uncluttered

Live React GUI
- [ ] Send a message; answer streams; TTFT shows
- [ ] Attach a small JSON/text file; stage chip appears
- [ ] Artefact opens preview; drag-resize works
- [ ] Confirm look matches style guide / prototype (paper bg, blue primary, Inter/JetBrains, C6 worklog on activity) — design CSS is promoted into `src/theme/` (ADR-0005)

## Logs

- `APP/LLMBUILD_DATA/logs/protean-engine.log`
- `APP/LLMBUILD_DATA/logs/protean-gui.log`
