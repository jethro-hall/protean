# AGENTS.md — Contract for every AI agent working on Protean

This file is the operating contract for **any** AI agent (Claude via the Agent SDK, Cursor, or a
future agent) that touches this repository. Cursor reads `.cursorrules` (a mirror of this file's
laws). Claude reads this. **If you are an agent and you are reading this: these rules bind you.**

Read [docs/PROJECT_CHARTER.md](docs/PROJECT_CHARTER.md) fully before writing anything. This file
is the short, enforceable version.

---

## The 8 laws (from the Charter — obey without exception)

1. **No workarounds. Root-cause only.** No silent fallbacks, no `catch{}` that hides a failure,
   no "temporary" patch. If you cannot fix the cause now, **stop and log a blocking issue** in
   `docs/CHAT/BUILD_LOG.md` and open a GitHub issue — do not paper over it.
2. **Nothing hardcoded that is a decision, value, or domain fact.** All such things go in
   `config/`, `contracts/`, or a Domain Pack. Colours, model names, thresholds, prompts,
   endpoints → externalised and named. (Protocol constants may be named constants in a config
   module — never literals buried in logic.)
3. **Small, named functions in the right module.** One nameable job per function. Match the
   module map (agent/gateway/watcher/logging/contracts/config/domains). No god-files.
4. **Deterministic before generative.** If code can compute it, code computes it. LLMs compose
   and reason; they are never the source of a fact code could produce.
5. **Provider-agnostic core.** Never import a vendor SDK outside its adapter in `gateway/` or
   `agent/`. Business logic talks to interfaces only.
6. **Evidence & traceability.** Every turn's full lineage is logged (input, prompt, rewrite,
   model, tokens, cache, tools, output, timings).
7. **SaaS-ready, single-tenant-happy.** Leave multi-tenant seams (tenant-scoped config, no global
   mutable state); do not build multi-tenancy now.
8. **Best practice, or an ADR.** Deviate from a known best practice only with a one-page ADR in
   `docs/DECISIONS/`.

## Mandatory workflow for every change

1. **Confirm the phase.** Only work on the current phase (see ROADMAP). If the task belongs to a
   later phase, say so and stop.
2. **Plan in the open.** State what you'll change and which laws apply before coding.
3. **Write it** as small named functions with typed contracts.
4. **Verify.** Run the tests/linter; for a non-trivial change add a test. A change is not done if
   tests fail (Charter "done means done").
5. **Log it.** Append to `docs/CHAT/BUILD_LOG.md`: the user request, what you changed, and your
   response/summary. Significant design changes also get an entry with the chat excerpt.
6. **Commit & push** per `CONTRIBUTING.md`. Every meaningful step is committed so another agent
   can take over cold.

## When you hit a wall (this is where workarounds are tempting — don't)

- Missing API detail / can't verify something (e.g. an SDK signature)? Mark it `[VERIFY]`, check
  the current official docs, and if still blocked, **log the blocker** — never guess and never
  stub a fake that hides the gap.
- Something is broken? Fix the cause. If you can't, log a blocking issue with a clear title,
  reproduction, and what a proper fix would require. A designed, logged, surfaced fallback
  (e.g. provider failover) is allowed; a silent one is a Law 1 violation.

## What you must never do

- Never commit secrets. Read them from env/secret-store; redact them in logs.
- Never hardcode a domain fact, threshold, prompt, or colour into logic.
- Never delete or rewrite history in `docs/CHAT/BUILD_LOG.md` (append-only).
- Never claim a phase is complete without its acceptance test passing and logged.

## Ground truth you can rely on
- Charter, Architecture, Roadmap in `docs/`.
- The module map in `ARCHITECTURE.md §9`.
- The build log is the shared memory across agents — read the tail before you start.

## Cursor Cloud specific instructions

Durable, non-obvious notes for agents starting in a Cursor Cloud VM (dependencies already
installed by the startup update script — `npm ci` in `APP/CODE` and `APP/GUI`).

- **No monorepo tool.** There is no root `package.json`. The two runnable apps are separate npm
  packages: the backend engine `APP/CODE` and the frontend `APP/GUI`. Run npm scripts from inside
  each directory. Standard scripts are already in each package's `package.json` (`dev`, `start`,
  `build`, `typecheck`, `lint`, `test`); don't reinvent them.
- **Run order (dev):** start the engine first (`cd APP/CODE && npm run dev`, port `8787`), then the
  GUI (`cd APP/GUI && npm run dev`, port `5173`). The GUI proxies `/api/*` to the engine origin
  (`PROTEAN_ENGINE_ORIGIN`, default `http://localhost:8787`, see `APP/GUI/vite.config.ts`).
- **Vite binds to `localhost` (IPv6), not `127.0.0.1`.** Use `http://localhost:5173/` — a curl to
  `127.0.0.1:5173` returns connection refused. The engine answers on both `localhost` and
  `127.0.0.1`.
- **Live chat turns need LLM provider credentials — they are NOT in the repo or the base VM.** The
  engine boots, and `GET /healthz` + `GET /api/domains` work with no creds, but `POST /api/turn`
  fails loudly by design (Law 1: no silent fallback) with e.g. `No model configured for tier
  "fast"`. To run a real turn, create a repo-root `.env` (copy `.env.example`) and set either the
  AWS Bedrock path (`CLAUDE_CODE_USE_BEDROCK=1`, `AWS_REGION=ap-southeast-2`,
  `AWS_BEARER_TOKEN_BEDROCK`, plus a model in `PROTEAN_STRONG_MODEL`/`ANTHROPIC_MODEL` and
  `PROTEAN_FAST_MODEL`) or the direct Anthropic path (`ANTHROPIC_API_KEY` + models). The `generic`
  domain defaults to the `fast` tier, so `PROTEAN_FAST_MODEL` must be set for a default turn; the
  `finance` pack uses the `strong` tier. BUILD_LOG records live proofs on Bedrock with
  `au.anthropic.claude-sonnet-5`. Provide credentials via Cursor Secrets, never commit them.
- **State is file-backed, no external DB required.** Sessions, prompt history, token telemetry and
  uploads persist as files under `APP/LLMBUILD_DATA/`; artefacts under `APP/ARTEFACTS/`. Postgres,
  Redis, Qdrant and the GPU service in `infra/docker-compose.yml` are future seams and are NOT
  wired into the engine yet — do not assume Docker is needed to run or test the app. (Docker is
  also not installed in the base VM.) The LLM Gateway runs in-process inside `APP/CODE`, not as a
  separate container.
- **Agent tools:** the Claude Agent SDK loop is restricted to `Read,Grep,Glob`. `Bash` is refused
  at config load until a sandbox is proven (see `config/loadConfig.ts` and BUILD_LOG 2026-07-28).
- **Headless checks (no creds, no GUI):** `npm test` (vitest, LLM mocked), `npm run typecheck`,
  `npm run lint` in `APP/CODE`; `npm run lint` and `npm run build` in `APP/GUI`. These mirror
  `.github/workflows/ci.yml`.
