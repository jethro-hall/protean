# CLAUDE.md — Protean

> Auto-loaded by Claude Code / the Claude Agent SDK when this repo is the working directory.
> This is a **pointer**, not a second copy of the rules. The canonical, enforceable law set is
> [`AGENTS.md`](AGENTS.md). Do not restate the laws here — one source of truth, no drift.

## Read before you write (in order)
1. [`AGENTS.md`](AGENTS.md) — the operating contract + the 8 laws (short, enforceable).
2. [`docs/PROJECT_CHARTER.md`](docs/PROJECT_CHARTER.md) — the constitution (vision + reasoning).
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design + the module map (§9).
4. [`docs/INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md) — gateway, DBs, cache/GPU, Docker, sandbox.
5. [`docs/NAMING_AND_LAYOUT.md`](docs/NAMING_AND_LAYOUT.md) — naming + layout + Docker standard.
6. [`docs/UX_STANDARDS.md`](docs/UX_STANDARDS.md) — GUI laws: (i) affordance, no clutter, browser-verify.
7. [`docs/ROADMAP.md`](docs/ROADMAP.md) — the phases. **Build the current phase only.**
8. [`docs/CHAT/BUILD_LOG.md`](docs/CHAT/BUILD_LOG.md) — shared cross-agent memory. **Read the tail first.**

## The five things that bind every session
- **Challenge before you comply.** Only do what's asked if it is the true and correct way; otherwise
  question it with logic and offer the better path. Don't flatter. Don't rubber-stamp. (Owner's law.)
- **Evidence or nothing.** Never guess, never fabricate an API or a number. Unverifiable → mark
  `[VERIFY]`, check official docs, and if still blocked **log the blocker** — never hide a gap in a stub.
- **Phase discipline.** Confirm the current phase (ROADMAP) before coding. Later-phase work waits.
- **The 8 laws are hard constraints.** No workarounds; nothing hardcoded; small named functions;
  deterministic before generative; provider-agnostic core; full lineage logged; SaaS-ready seams;
  best-practice-or-an-ADR. Full text in `AGENTS.md`.
- **Every change:** plan → small typed functions → lint+tests pass → browser-verify if GUI →
  append `docs/CHAT/BUILD_LOG.md` → conventional commit → push.

## Current phase
**Read `docs/ROADMAP.md` — do not trust a cached phase here.** As of 2026-07-28: Phases 0–3 are
✅ done (evidence in ROADMAP + BUILD_LOG). **Current: Phase 4 — Domain Packs & the multi-domain
proof.** Owner-directed theme/GUI work under ADR-0005 is already landed; further GUI polish is not
a Phase 0 gate.
