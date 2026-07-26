# Contributing to Protean — GitHub & logging discipline

Applies to humans and AI agents equally. The rules exist so **any agent can take over the build
cold** from GitHub + the build log. See [AGENTS.md](AGENTS.md) for the coding laws; this file is
about *process*.

---

## Branching

- `main` — always green (lint + tests pass). Never commit directly for non-trivial work.
- `phase/<n>-<slug>` — one branch per roadmap phase (e.g. `phase/0-latency-spike`).
- `feat/<slug>`, `fix/<slug>`, `chore/<slug>` — units of work off the phase branch.
- Short-lived branches. Merge via PR.

## Commits (Conventional Commits)

```
<type>(<scope>): <subject>

<body: what & why — not just what>
<footer: BUILD_LOG updated: yes | ADR: docs/DECISIONS/ADR-000X.md | Closes #issue>
```
Types: `feat fix chore docs refactor test perf build`. Scope = module (`watcher`, `gateway`,
`gui`, `agent`, …). **Every meaningful step is its own commit** — the git history is part of the
audit trail (Charter Law 6). Small, frequent, described commits over big opaque ones.

## Pull requests

A PR must:
1. Pass CI (lint + typecheck + tests). Red CI = not mergeable (Law 1: no workarounds to get green).
2. State which roadmap phase it advances and which acceptance criterion it moves.
3. Confirm the 8 laws are upheld (a checklist in the PR template).
4. Link its `BUILD_LOG.md` entry and any ADR.
5. Never introduce a secret, a hardcoded domain fact, or a silent fallback.

## The BUILD_LOG — mandatory, append-only

`docs/CHAT/BUILD_LOG.md` is the shared memory of the project. **Every significant design or build
change requested by the user and done by an agent gets an entry**, containing:

- date + agent + phase,
- the **user request** (verbatim or faithfully summarised),
- what changed (files, decision),
- the **agent's response/summary** (what was done and why),
- links to the commit(s) and any ADR.

For substantial design conversations, drop the relevant **chat excerpt** into
`docs/CHAT/sessions/<date>-<slug>.md` and link it from the log entry. The log is **append-only** —
never edit or delete past entries; correct with a new entry.

## Architecture Decision Records

Any hard architectural call → a one-page ADR in `docs/DECISIONS/ADR-XXXX-<slug>.md` (context,
decision, alternatives, consequences). The stack table in `ARCHITECTURE.md §8` indexes them.

## Definition of done (per Charter)

Source proven · contracts typed · tests pass · manual check passes · UI reflects truth · errors
explicit · BUILD_LOG updated · committed & pushed. Anything less is "in progress".

## What goes to GitHub

Everything: source, docs, ADRs, the build log, and — per the owner's instruction — the generated
artefacts and LLM build data (`APP/ARTEFACTS`, `APP/LLMBUILD_DATA`) so the full construction is
reproducible and any agent can reconstruct context. (Exception: never the secrets — see
`.gitignore`.)
