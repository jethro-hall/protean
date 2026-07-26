# PR — Protean

## What & why
<!-- What changed and the reason (not just the what). -->

## Roadmap phase & acceptance criterion
- Phase: <!-- e.g. Phase 0 -->
- Moves which acceptance criterion:

## The 8 laws — checklist (all must be true)
- [ ] **L1** No workarounds — root cause fixed, or a blocking issue logged (not papered over).
- [ ] **L2** Nothing hardcoded — values/decisions/domain-facts live in config/contracts/domain packs.
- [ ] **L3** Small named functions in the correct module; no god-files.
- [ ] **L4** Deterministic work done in code, not delegated to an LLM.
- [ ] **L5** No vendor SDK imported outside its adapter; core depends on interfaces.
- [ ] **L6** Full turn lineage logged via the structured logger.
- [ ] **L7** SaaS seams intact; no global mutable state; multi-tenancy NOT built.
- [ ] **L8** Best practice followed, or an ADR added.

## Evidence
- [ ] Lint + typecheck + tests pass (CI green).
- [ ] BUILD_LOG.md entry: <!-- link -->
- [ ] ADR (if architectural): <!-- link or N/A -->
- [ ] No secrets, no hardcoded domain facts, no silent fallbacks introduced.
