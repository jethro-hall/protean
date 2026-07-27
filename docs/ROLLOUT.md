# Protean — Foundation Rollout Plan

**Purpose:** get the foundations *correct* before a line of product code — version control live,
every AI tool bound to the same laws, the dev toolchain proven, and the infra ready — so Phase 0
(the SDK latency spike) starts on solid ground.

**Companion to:** [PROJECT_CHARTER.md](PROJECT_CHARTER.md) · [ROADMAP.md](ROADMAP.md) ·
[../scripts/README.md](../scripts/README.md)

---

## The one truth that shapes this plan

AI tools split into two camps, and only one can be scripted:

| Camp | Tools | How they get the rules | Automatable? |
|------|-------|------------------------|--------------|
| **File-driven** | Cursor, Claude Code / Agent SDK | Read rule files from the repo (`.cursorrules`, `.cursor/rules/*.mdc`, `CLAUDE.md`, `AGENTS.md`) | **Yes** — the files *are* the import |
| **Paste-only** | Claude Desktop Projects, ChatGPT Projects | Instructions typed into a web/app text box | **No** — clipboard-load the brief, then paste |

So "create scripts for import into Cursor, Claude and whatever else" resolves to: **generate the
rule files the file-driven tools auto-read, and clipboard-load the briefs for the paste-only ones.**
No script can inject a Claude Desktop / ChatGPT project instruction — that step is always a human paste.

---

## Rollout at a glance

```
  Step 1  Preflight        →  00-preflight.ps1     (tools present? Node>=20?)
  Step 2  Agent rules      →  02-sync-agent-rules  (Cursor + Claude Code auto-load — verify)
  Step 3  GitHub live      →  01-github-push.ps1   (secret-guard → remote → push main)
  Step 4  Paste briefs     →  03-load-brief.ps1    (Claude Desktop + ChatGPT projects)
  Step 5  Infra ready      →  04-infra-up.ps1      (Postgres+pgvector, Redis — when Phase 2 nears)
  Step 6  Phase 0 gate     →  hand to Cursor/Claude under the rules; build the latency spike
```

Run everything from `protean\scripts\`. One entry point: `pwsh -File .\protean.ps1`.

---

## Step 1 — Preflight (prove the toolchain)
**Do:** `pwsh -File .\00-preflight.ps1`
**Why first:** every later step assumes git/node exist; find gaps now, not mid-push.
**Required:** git, node (>=20), npm. **Optional:** gh, docker (Step 5), aws (Bedrock lookup).
**Done when:** the table shows no `GAP (required)` and Node >= 20. Read-only — changes nothing.

## Step 2 — Agent rules (bind the file-driven tools)
**Do:** `pwsh -File .\02-sync-agent-rules.ps1`
**Why:** confirms the four rule files exist so Cursor and Claude Code load Protean's 8 laws
automatically. These are thin pointers to the canonical `AGENTS.md`/`.cursorrules` — no duplicated
law text, so nothing drifts.
**Files verified:** `.cursorrules` (Cursor classic), `.cursor\rules\protean.mdc` (Cursor modern),
`CLAUDE.md` (Claude Code / SDK), `AGENTS.md` (any agent — canonical).
**Done when:** all four report present.

## Step 3 — GitHub live (version control on)
**Prereq (you):** create an **empty PRIVATE** repo on github.com — no README, licence, or .gitignore.
**Do:** `pwsh -File .\01-github-push.ps1 -RemoteUrl https://github.com/<you>/protean.git`
**What it does:** refuses to run if any `.env`/`claude_desktop_config*.json` is tracked (secret
guard) → sets local git identity if missing → wires `origin` (idempotent) → `git push -u origin main`.
**Done when:** the script prints the live repo URL and `git status` is clean.
**If push fails:** repo not created yet / wrong URL / auth. Fix and re-run — the remote is already set.

## Step 4 — Paste briefs (bind the paste-only tools)
**Do:**
`pwsh -File .\03-load-brief.ps1 -Target claude` → paste into your **Claude Desktop** Project instructions.
`pwsh -File .\03-load-brief.ps1 -Target chatgpt` → paste into your **ChatGPT** Project instructions.
**Why manual:** these products have no file import; the script just puts the exact brief on your
clipboard. Cursor needs nothing here — it auto-loads `.cursorrules` when you open the folder.
**Done when:** both projects carry the brief and answer "what are the 8 laws?" correctly.

## Step 5 — Infra ready (only when Phase 2 data work nears)
**Prereq:** Docker Desktop running; copy `infra\.env.example` → `infra\.env` and set a real `PG_PASSWORD`.
**Do:** `pwsh -File .\04-infra-up.ps1`  (`-Status` / `-Down` to inspect or stop).
**What it does:** `docker compose up -d protean-pg protean-cache`; refuses to start while the
password is still `change-me`. Not needed for Phase 0 (SDK spike runs on-host).
**Done when:** both containers report healthy.

## Step 6 — Phase 0 gate (start building, under the rules)
**Do:** open `protean\` in Cursor (rules auto-load) or start a Claude Code session in the repo.
Suggested first prompt (also in `project-briefs/CURSOR_SETUP.md`):
> "Read .cursorrules, AGENTS.md and docs/{PROJECT_CHARTER,ARCHITECTURE,INFRASTRUCTURE,ROADMAP}.md.
> Confirm the 8 laws and the Phase 0 acceptance test back to me in your own words before writing
> any code. Then propose the Phase 0 file plan under APP/CODE/src. Challenge anything that looks wrong."
**Phase 0 acceptance (from ROADMAP):** a streamed answer through `AgentCore → Gateway → Claude
Agent SDK` with per-stage timings logged, matching Claude-Desktop answer quality; a second identical
run returns from cache in < 300 ms; numbers recorded in `LLMBUILD_DATA/token-telemetry` and the BUILD_LOG.
**Blocker to clear first:** SDK option/field names + Bedrock model IDs are `[VERIFY]` — confirm
against docs.claude.com (needs the docs egress allowlist + a fresh session) and
`aws bedrock list-inference-profiles --region ap-southeast-2`.

---

## Definition of "foundation correct"
- [ ] `00-preflight` passes (git, node>=20, npm).
- [ ] Repo pushed to a private GitHub remote; `git status` clean.
- [ ] `02-sync-agent-rules` shows all four rule files present.
- [ ] Claude Desktop + ChatGPT projects carry the pasted brief.
- [ ] `claude_desktop_config.EGRESS_PATCHED.json` deleted (secrets); `.env` files gitignored.
- [ ] BUILD_LOG updated with this rollout.
- [ ] (When Phase 2 nears) `infra\.env` has a real password and the stack comes up healthy.

## Safety rails baked into the scripts
No hardcoded paths (all derived from script location). Idempotent (safe to re-run). Secret guard
blocks pushing `.env`/config. Git-lock workaround only *moves* stale `*.lock` (never blind `rm -rf`).
No invented DB password. All consistent with Charter §Security and the 8 laws.
