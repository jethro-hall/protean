# `.cursor/` — Protean agent binding (file-driven)

These files are the Cursor import. Open the **`protean/`** folder as the workspace root so they load.

| Path | Role |
|------|------|
| `rules/*.mdc` | Always-on + file-scoped laws (pointers + focused constraints) |
| `agents/*.md` | Project subagents (`@name` or Task delegation) |
| `skills/*/SKILL.md` | Workflow skills the agent auto-applies by description |

Canonical law text lives in repo-root `AGENTS.md` / `.cursorrules` — do not duplicate it here.
Verify with `scripts/02-sync-agent-rules.ps1` (or `scripts/02-sync-agent-rules.sh`).
