# ADR-0005 — Promote design-system CSS into the live React theme

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Jeff (owner), Cursor agent
- **Supersedes (in part):** ADR-0004's "never import `protean-design-system.css`" / "Tailwind-only port on demand"
- **Phase:** Phase 1 theme completion (owner-directed)

## Context
ADR-0004 kept `src/theme/tokens.css` (thin Tailwind `@theme`) as the live SOT and treated
`APP/GUI/design/protean-design-system.css` as an unwired specification, because promoting the
764-line class library risked rewriting a verified shell without owner approval of the look.

The owner has now directed: use the design-bundle CSS/templates to adapt the front end that already
exists. `DESIGN.md` §1 and `design-system.mdc` already prescribe the promote path:
`tokens.css` (Layers 1–3) + `base.css` (Layer 4) + `components.css` (Layer 5). That owner signal
is the evidence ADR-0004 said was required to revisit.

## Decision
1. **Promote** the design-system layers into `APP/GUI/src/theme/{tokens,base,components}.css`.
2. **Live React shell consumes those classes** (C1 shell, C5 chat, C6 worklog, C7 composer, C8
   preview, C11 info, C12 banners). Behaviour (streaming, uploads, artefacts, resize) is preserved.
3. **`APP/GUI/design/protean-design-system.css` remains the design specification** and the source
   the style-guide/prototype pages link; the promoted theme files are the app runtime copy. Drift is
   prevented by treating `design/` as canonical for visual edits — changes land there first, then
   are re-promoted (or a single shared import path is introduced later with another ADR).
4. Tailwind may remain only as a thin utility assist during migration; **no second palette**. Any
   `@theme` colour aliases map to Layer 2 semantic tokens, never duplicate hexes.

## Alternatives considered
- **Keep ADR-0004, reimplement the look in Tailwind utilities only** — rejected for this pass:
  owner asked to use the CSS/templates; C6 worklog and shell grid are already specified as classes.
- **Import `design/protean-design-system.css` directly from React** — deferred: prefer an explicit
  promote into `src/theme/` so the app runtime boundary stays clear (DESIGN.md §1).

## Consequences
- **Positive:** one governed look on the live GUI; Law 2 restored at the theme layer; prototype and
  app converge.
- **Cost:** components leave Tailwind-heavy class strings for design-system classes; browser
  re-verify required.
- **Locks in:** design-system class contracts (worklog kinds, colour roles) for the React shell.

## Compliance
- Law 2 / 8: this ADR records the deviation from ADR-0004.
- Law 1: no fake worklog steps; map real activity events to `data-kind` only.
