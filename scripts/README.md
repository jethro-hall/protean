# scripts/ — Protean rollout automation (PowerShell)

These scripts put the foundation live and keep every tool on the same law set. They are
**path-portable** (everything is derived from the script location — no hardcoded `G:\` path) and
**idempotent** (safe to re-run). Run them from this `scripts\` folder.

> **What can and cannot be scripted — the honest split.**
> *File-driven tools* (Cursor, Claude Code / the Agent SDK) read rule files from the repo, so their
> "import" is automatic once the files exist — script `02` just verifies them.
> *Paste-only tools* (Claude Desktop Projects, ChatGPT Projects) take instructions through a text
> box; there is **no file import**. Script `03` copies the right brief to your clipboard so the
> paste is one keystroke. No script can inject those instructions for you.

## One entry point
```powershell
cd "G:\CLAUDE DATA\Ride Electric Finance Project\Ride Electric Finance\protean\scripts"
pwsh -File .\protean.ps1            # interactive menu
pwsh -File .\protean.ps1 -Step all  # preflight → rules → push
```
No `pwsh`? Use Windows PowerShell: `powershell -ExecutionPolicy Bypass -File .\protean.ps1`.

## The steps
| # | Script | What it does | Changes anything? |
|---|--------|--------------|-------------------|
| 00 | `00-preflight.ps1` | Checks git/node/npm (required) + gh/docker/aws (optional); Node>=20 gate | No (read-only) |
| 01 | `01-github-push.ps1` | Secret-guard → wire `origin` → `git push -u origin main`. You create the empty private repo first. | Yes (git remote + push) |
| 02 | `02-sync-agent-rules.ps1` | Verifies `.cursorrules`, `.cursor\rules\protean.mdc`, `CLAUDE.md`, `AGENTS.md` are present | No (read-only) |
| 03 | `03-load-brief.ps1` | Copies a Claude/ChatGPT/Cursor brief to the clipboard | No (clipboard only) |
| 04 | `04-infra-up.ps1` | `docker compose up -d protean-pg protean-cache`; forces a real `.env` password first | Yes (starts containers) |
| — | `lib\common.ps1` | Shared helpers: repo-root resolution, git-lock workaround, clipboard, guards | — |

## Recommended order (first time)
```powershell
pwsh -File .\00-preflight.ps1
# create an EMPTY private repo on github.com (no README), copy its URL
pwsh -File .\01-github-push.ps1 -RemoteUrl https://github.com/<you>/protean.git
pwsh -File .\02-sync-agent-rules.ps1
pwsh -File .\03-load-brief.ps1 -Target claude     # then paste into the Claude Desktop project
pwsh -File .\03-load-brief.ps1 -Target chatgpt    # then paste into the ChatGPT project
# open the protean\ folder in Cursor — .cursorrules loads automatically
# later, when you start Phase 2 data work:
pwsh -File .\04-infra-up.ps1
```

## Safety
- **Secrets never pushed.** `01` aborts if any `.env` or `claude_desktop_config*.json` is tracked.
- **No blind git.** The FUSE-mount lock workaround only *moves* stale `*.lock` files aside.
- **No invented passwords.** `04` refuses to start Postgres until you set a real `PG_PASSWORD`.
