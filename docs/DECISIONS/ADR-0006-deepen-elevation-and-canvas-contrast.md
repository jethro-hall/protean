# ADR-0006 — Deepen elevation (shadow) ramp and canvas/surface contrast

**Status:** accepted
**Date:** 2026-08-02
**Deciders:** Jeff (owner), Claude
**Phase:** Phase 6 (owner-directed GUI polish, precedent: ADR-0005)

## Context
Owner directed a full visual polish pass ("professionalise the CSS... bring it to life... every
page every function"), watched live over the VNC session already in use for this session's browser
QA. Live inspection showed the design system's own component classes were already correctly wired
to the elevation tokens (`--shadow-sm`/`--shadow`/`--shadow-pop`/`--shadow-lift`/`--shadow-tip`) —
this was not a wiring gap — but the token *values* themselves were too faint to read as real depth
(`--shadow-sm` was `0 1px 2px` at 6% opacity; `--surface` `#FFFFFF` against `--bg` `#F7F9FC` differ
by only a few luminance points). The net effect: cards, the composer, the settings modal, and the
worklog all rendered nearly flush with the page instead of visibly lifted.

A second, concrete bug found in the same pass: the empty-state icon (`.empty .ei`) sized a bare
text glyph (`✎`) in a 40×40px box with no `font-size` set and no background — it rendered as a tiny,
off-weight character floating in empty space rather than a proper icon.

## Decision
1. **Deepen the elevation ramp** (Layer 3 scale tokens) — each shadow step now pairs a tight
   near-shadow with a soft far-shadow (the standard two-layer elevation technique), roughly doubling
   perceived lift on `--shadow-sm`/`--shadow` (the two most-used steps) without changing which alpha
   primitives exist (reuses the already-defined `--c-ink-a06/a14/a18/a28`, no new Layer 1 literals).
2. **Deepen `--c-paper`** (Layer 1, the app canvas) from `#F7F9FC` to `#F2F5F9` so `--surface` cards
   separate from the canvas on their own merit, not only via shadow.
3. **Add elevation to two previously-flat structural panels**: `.topbar` (`--shadow-sm`) and `.rail`
   (a two-layer edge shadow) — both were bordered but shadowless, reading as flush with content.
4. **Fix the empty-state icon** (`.empty .ei`): a properly-sized (22px), centred glyph inside a
   56px soft blue-wash circular badge with an inset hairline — matches the existing badge treatment
   already used elsewhere (`.avatar`, `.clarification-mark`).
5. **Polish this session's own newer components** (`.grounding-badge`, `.clarification-box`,
   `.clarification-mark`) to the same elevation standard — they were added ad hoc across Phases
   Q/R/S without the shadow/gradient treatment the rest of the system already carries.

Applied first in `design/protean-design-system.css` (the canonical spec per `DESIGN.md`), then
re-promoted into `src/theme/{tokens,components,app}.css` (ADR-0005's promoted runtime copy) — both
copies now match, no drift introduced.

## Alternatives considered
- **Leave shadow values, add heavier borders instead** — rejected: borders alone don't read as
  elevation (no light/depth cue), and the existing hairline-border language is already correct and
  shouldn't be duplicated/thickened just to compensate for weak shadows.
- **Introduce a whole new "dramatic" shadow style (large, saturated, coloured shadows)** — rejected:
  would break the restrained, professional character the color contract (DESIGN.md §4) already
  establishes (blue as the one system colour, orange rationed to one element per view). Depth, not
  decoration, was the actual gap.
- **Only fix the live `src/theme/` copy, skip re-promoting into `design/`** — rejected: `DESIGN.md`
  is explicit that `design/` is upstream of `src/theme/`; skipping it would immediately drift the
  style guide from the shipped app again, the exact problem ADR-0005 fixed.

## Consequences
- **Positive:** every surface that already reads a `--shadow*` token (dozens of components across
  every page — cards, popovers, the composer, worklog, settings modal, badges) gets real visible
  depth from one token-layer change, with zero component-file edits required for the vast majority
  of surfaces. The empty state and this session's newer components now match the system's existing
  craft level.
- **Cost:** the canvas is very slightly darker (`#F7F9FC` → `#F2F5F9`, a ~2% luminance shift) —
  re-verified AA contrast on body text pairs holds (ink `#1E2A3A` on `#F2F5F9` is still far above
  4.5:1; this shift is imperceptible for text contrast purposes, it only affects surface separation).
- **Locks in:** the two-layer near+far shadow *technique* as the house elevation style going forward;
  future new components should follow the same pattern rather than inventing single-layer shadows.

## Compliance check
- **Law 2** (nothing hardcoded): all changes stayed within Layer 1 (primitives) and Layer 3 (scale)
  token definitions; zero new raw hex/rgba literals introduced outside Layer 1, verified by grep.
- **Law 8** (best-practice-or-an-ADR): this ADR is that record — DESIGN.md §6 requires an ADR for
  any change to a semantic/scale token's value, which this is.
