# ADR-0006 — Executive palette & scale refinement (design tokens v0.2)

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Jeff (owner), Cursor agent
- **Phase:** Owner-directed theme polish (under ADR-0005)
- **Scope:** Token *values* only (Layer 1 primitives + Layer 3 scale). The colour **contract**
  (blue = system/primary, orange = single warm accent, purple = reasoning only, green/amber/red =
  status) is unchanged. No component was re-roled; no new colour family was added.

## Context
Owner directive: "fix up colours, layout and tighten the template down — sleek business look,
everything deliberate and easy." A browser review of the live shell surfaced two concrete problems
beyond taste:

1. **The primary blue failed WCAG AA.** `--c-blue-600: #4C8DD6` is ~2.6:1 on white, yet it is used
   as link text (`.cite a`), inline `code`, section headings (`.doc h2`), and as the fill behind
   **white** button labels (`.newchat`, `.btn-primary`, `.send`). Both the blue-on-white text and
   the white-on-blue labels were below the 4.5:1 AA threshold the DESIGN.md verification gate (§6.3)
   requires.
2. **Low-contrast greys + weak hierarchy.** Muted text (`--c-ink-500`) and washed selected states
   read as faint; the shell felt sparse rather than intentional.

DESIGN.md §6 requires an ADR to change a Layer 2–3 token's value/meaning. Changing Layer 1 primitive
values (the palette hexes) re-themes every consumer, so this ADR records the whole refinement in one
place rather than scattering unlogged value changes.

## Decision
Refine token **values** (not roles) in both the spec (`design/protean-design-system.css`) and the
promoted live theme (`src/theme/tokens.css`, `components.css`):

**Layer 1 — palette**
- `--c-blue-600` `#4C8DD6 → #2F6FCF` — deep executive azure, **4.9:1 on white (AA)**. Fixes both
  the blue-text and white-on-blue-label contrast failures at once.
- `--c-blue-400` `#7FB0E6 → #6AA0E2`, `--c-blue-200 → #CDDFF4`, `--c-blue-050 → #E6F0FC`,
  `--c-blue-025 → #F0F6FD` — ramp re-balanced around the deeper primary so hovers, the worklog rail,
  and selected washes stay legible.
- `--c-ink-900` `#1E2A3A → #15202E` (crisper primary ink); `--c-ink-500` `#5B6B7F → #50617A`
  (muted text now ~6:1 — clears AA).
- `--c-line-200` `#E3E9F0 → #E0E7F0` (marginally crisper hairline); `--c-paper` `#F7F9FC → #F4F7FB`
  (cooler canvas so white surfaces lift).
- Shadow/scrim inks (`--c-ink-a*`) and `--c-line-a70` rebased onto the new ink/line RGB so elevation
  tone matches the deeper palette.

**Layer 3 — scale (tighten the template)**
- Radii `--r-sm 7→6`, `--r 10→9`, `--r-lg 14→12` — crisper, more deliberate corners.
- `--rail-w 264→252`, `--topbar-h 52→50` — tighter chrome, more room for content.

**Component (token-only)**
- `.conv.active` gains a crisp `--accent-blue` border + inset accent bar + semibold title so the
  selected conversation is unmistakable.

## Alternatives considered
- **Leave the palette, only bump component contrast** — rejected: the failure is in the primitive,
  so fixing it once at Layer 1 fixes every consumer (the point of the token system).
- **Navy/slate corporate palette** — rejected: colder and less distinctive; the azure keeps
  Protean's identity while reading premium.
- **Skip the ADR, just edit values** — rejected: DESIGN.md §6 gates Layer 2–3 value changes on an
  ADR (Law 8).

## Consequences
- **Positive:** AA restored on the primary action colour and muted text; a more confident,
  intentional executive look; one-layer change, zero new literals outside Layer 1.
- **Cost:** every surface shifts slightly bluer/crisper; browser re-verify required (done).
- **Locks in:** the colour *contract* is untouched, so future re-themes still swap Layer 1/2 only.

## Compliance
- **Law 2:** all new values live in Layer 1 primitives / Layer 3 scale; Layers 2–5 hold zero
  literals (verified — see BUILD_LOG).
- **Law 8:** this ADR records the token-value deviation; DESIGN.md §8 changelog updated.
- **UX §4 / DESIGN.md §6.5:** browser click-through performed in this pass (not deferred).
