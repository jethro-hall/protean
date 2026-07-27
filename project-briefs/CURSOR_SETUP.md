# Protean — Cursor Setup

How to point Cursor at this project so it builds to the standard.

## 1. Open the repo
Open the `protean/` folder as the Cursor workspace root. Cursor auto-loads `.cursorrules` from the
root — that file is the enforced law set (mirror of `AGENTS.md`). Nothing to configure for that.

## 2. Give Cursor the fuller context
`.cursorrules` is the hard constraints. For the *why* and the full picture, tell Cursor to read
(and keep in context) these, in order:
1. `docs/PROJECT_CHARTER.md` — the constitution (vision + 8 laws + reasoning)
2. `docs/ARCHITECTURE.md` — system design
3. `docs/INFRASTRUCTURE.md` — gateway, DBs, GPU, Docker, sandbox, disk
4. `docs/NAMING_AND_LAYOUT.md` — naming + layout + Docker standard
5. `docs/UX_STANDARDS.md` — GUI laws ((i) affordance, no clutter, browser-verify)
6. `docs/ROADMAP.md` — phases (build Phase 0 first)
7. `AGENTS.md` — the agent workflow contract

Suggested first prompt to Cursor:
> "Read .cursorrules, docs/PROJECT_CHARTER.md, docs/ARCHITECTURE.md, docs/INFRASTRUCTURE.md,
> docs/NAMING_AND_LAYOUT.md, docs/UX_STANDARDS.md and docs/ROADMAP.md. Confirm the 8 laws and the
> Phase 0 acceptance test back to me in your own words before writing any code. Then propose the
> Phase 0 file plan under APP/CODE/src. Challenge anything that looks wrong."

## 3. Recommended Cursor settings
- **Model:** a strong coding model for implementation; you can use a cheaper one for boilerplate.
- **Rules for AI (global, optional):** paste the "WORKING WITH THE OWNER" + "WHEN UNSURE" blocks
  from `.cursorrules` so the challenge-before-comply behaviour holds even outside this repo.
- **Privacy:** this repo will hold real infra details and (in env files) secrets. Ensure Cursor's
  privacy mode is on and that `.env`/secret files stay gitignored (they already are).
- **Format on save + ESLint/Prettier:** enable once the toolchain lands in Phase 0 so Law 3
  (small clean functions) and consistent style are automatic.

## 4. Phase 0 target (what to build first)
See `APP/CODE/README.md`. A minimal vertical slice: `contracts/turn.ts`, `gateway/LlmGateway.ts` +
`gateway/adapters/claude.ts`, `agent/AgentCore.ts` + `agent/adapters/claudeSdk.ts`,
`logging/logger.ts`, `watcher/assemble.ts` + `watcher/cache.ts`, and a streaming entrypoint that
records TTFT + total latency. Acceptance: streamed answer through AgentCore→Gateway→Claude Agent SDK
matching Claude-Desktop quality; second identical run < 300 ms from cache; numbers logged.

## 5. Every change
Plan → small typed functions → lint+tests pass → browser-verify if GUI → append `docs/CHAT/BUILD_LOG.md`
→ conventional commit → push. Deviations from best practice need a one-page ADR in `docs/DECISIONS/`.
