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
