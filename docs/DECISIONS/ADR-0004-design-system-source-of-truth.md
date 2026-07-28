# ADR-0004 — One design-system source of truth: `theme/tokens.css`, prototype CSS is the spec

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Jeff (owner), Claude
- **Phase:** Phase 1 (GUI) — reconciliation before further GUI work

## Context
Two files each declare themselves "THE single source of truth" for Protean's visual values (Law 2),
which is itself a Law 2 violation — there cannot be two:

- **A — `APP/GUI/src/theme/tokens.css`** (~40 lines, Tailwind v4 `@theme`). Imported by
  `APP/GUI/src/main.tsx`; it is the styling actually consumed by the **live, browser-accepted**
  React GUI (Phases 1–3, verified on Bedrock Sonnet-5). Thin: palette, fonts, touch target, pane
  geometry — enough for the shell that ships today.
- **B — `APP/GUI/design/protean-design-system.css`** (764 lines, 6 layers, 237 component classes).
  A rich, well-governed specification: primitive→semantic→scale token layers, a purple "reasoning"
  role reserved for the worklog thinking voice, alpha inks, elevation/z-index/motion/type scales,
  and a full component layer. **It is an orphan** — grepping `APP/GUI/src` shows it is imported by
  **zero** React/TS files. It styles only the static `protean-shell-prototype.html` /
  `protean-style-guide.html` prototype pages.

So this is not "two live systems competing." It is **one live thin system (A)** and **one unwired
rich blueprint (B)**. They already share an identical palette (same hexes), so there is no colour
conflict to resolve — only a question of which file is authoritative and how B's extra vocabulary
reaches the running app.

## Decision
**`APP/GUI/src/theme/tokens.css` is the single source of truth.** The 764-line
`protean-design-system.css` is **reclassified from "source of truth" to "design specification"** — a
reference the living app is grown *toward*, not a file the app imports. Its valuable, not-yet-needed
vocabulary (semantic role aliases, purple reasoning role, spacing/radius/shadow/z/motion/type scales)
is **ported into `tokens.css` as Tailwind `@theme` tokens on demand** — i.e. when a component about
to be built actually consumes a token — never as a bulk paste. No React component may import
`protean-design-system.css`. Its self-description as "the single source of truth" is corrected to
"the design specification" to end the Law 2 ambiguity.

## Alternatives considered
- **Promote B, retire A** (make the 764-line file the app's stylesheet) — rejected: it is
  hand-written CSS with class-based components, which fights Tailwind v4's utility/`@theme` model that
  the live GUI is already built on; adopting it would mean rewriting working, browser-accepted panes
  against 237 untested classes. High risk, no live evidence it renders correctly in React, and it
  would discard the verified Phase 1–3 UI. Revisit only with evidence that Tailwind cannot express a
  needed pattern.
- **Keep both, import both** — rejected outright: two files owning visual values is the exact Law 2
  violation this ADR exists to remove; token drift becomes inevitable.
- **Delete B entirely** — rejected: it encodes real, considered design intent (the reasoning-purple
  rule, the z-index ladder, AA-safe on-orange ink) that we want to keep porting from. Kept as spec +
  the style-guide/prototype pages, which stay useful as a visual reference.

## Consequences
- **Positive:** one file owns visual values (Law 2 restored); the live, verified GUI is preserved;
  B's design thinking is not lost — it becomes the roadmap for growing `tokens.css`; "marrying the
  GUI to the code" now has a clear meaning = incrementally porting spec tokens into the live theme as
  components need them.
- **Negative / cost:** `tokens.css` is currently thinner than the spec, so richer components must add
  their tokens as they are built (deliberate, incremental) rather than inheriting a ready-made 237-
  class library. Porting is manual and must be disciplined.
- **Locks in:** Tailwind v4 `@theme` as the token mechanism and `tokens.css` as its home.
  **Stays swappable:** re-theming (dark mode, a new domain brand) is still a token-layer swap; the
  spec's semantic-alias pattern can be adopted inside `tokens.css` to preserve that (Law 7).

## Compliance check
- **Law 2 (nothing hardcoded):** restored — exactly one file holds visual values; components consume
  tokens, never inline literals. This ADR's whole purpose.
- **Law 7 (SaaS-ready seams / swappable):** preserved — token-layer re-theming survives; adopting the
  spec's semantic aliases inside `tokens.css` keeps the "swap one layer to re-brand" property.
- **Law 8 (best-practice-or-an-ADR):** this ADR is that record. Follow-ups: (1) correct the header
  comment in `protean-design-system.css` from "single source of truth" to "design specification";
  (2) note this decision in `APP/GUI/design/DESIGN.md`.
