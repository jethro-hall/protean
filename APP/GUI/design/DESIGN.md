# Protean — Design System Governance (`APP/GUI/design/`)

> The single source of visual truth for every Protean surface. This document governs
> `protean-design-system.css`. If a change touches how the product *looks*, the rule lives here.
> Owner directive: set the standard now so nothing is retrofitted (mirrors `NAMING_AND_LAYOUT.md`).

---

## 1. What's in this folder

| File | Role |
|---|---|
| `protean-design-system.css` | **The** stylesheet. Tokens + base + every component. The only styling any page links. |
| `protean-style-guide.html` | Living reference. Renders every token and component with do/don't notes. Reads token values *live* from the CSS via `getComputedStyle` — it mirrors the code, it does not duplicate it. |
| `protean-shell-prototype.html` | The interactive three-pane shell prototype (self-contained; predates the extracted CSS). The design system was distilled from it. |
| `DESIGN.md` | This file. |

**Promoted (ADR-0005):** live React theme is `APP/GUI/src/theme/` —
`tokens.css` (Layers 1–3) + `base.css` (Layer 4) + `components.css` (Layer 5) + thin `app.css` glue.
`design/protean-design-system.css` remains the visual specification (style guide + prototype link it).
Visual edits land in `design/` first, then re-promote into `src/theme/`.

---

## 2. Why a token system at all (Law 2)

Law 2 says **nothing is hardcoded** — decisions, values and domain facts live in config/contracts/
tokens, not inline literals. In CSS terms: a component must never contain a raw `#hex`, `rgba()` or a
magic `px`. It references a *role-named token*. That is what lets us re-theme (dark mode, a second
tenant's brand, a different domain's accent) by editing one layer instead of hunting literals across
the codebase — and what stops two pages drifting into two slightly-different blues.

---

## 3. The six layers

```
Layer 0  RESET            — box-sizing, margin zero-out. No design decisions.
Layer 1  PRIMITIVES       — raw values live HERE AND ONLY HERE. --c-blue-600:#4C8DD6; etc.
Layer 2  SEMANTIC          — role aliases: --accent-blue: var(--c-blue-600). The vocabulary pages use.
Layer 3  SCALE             — space / radius / shadow / z / type / motion / layout tokens.
Layer 4  BASE              — element defaults (body, .num, focus ring, reduced-motion).
Layer 5  COMPONENTS        — C1…C16. Each reads ONLY Layer 2–3 tokens.
```

**The consumer rule (the one you must not break):**
A component or page may reference **Layer 2 (semantic) and Layer 3 (scale) tokens only**, plus the
documented component classes. It must never reach into a Layer 1 primitive (`--c-blue-600`) and must
never write a raw hex, rgba or px. Raw values are legal in **Layer 1 only**.

This is mechanically verifiable — see §6. The build should fail if a literal appears outside Layer 1.

---

## 4. The colour contract (read before adding any colour)

- **Blue** is the one system + primary-action colour. Buttons, links, focus ring, selection, tool nodes.
- **Orange** is the single warm accent — artefacts, the steer bar, subagents. **At most one orange
  element per view.** It earns attention precisely because it's rare.
- **Purple (`--think`)** is reserved **exclusively** for model reasoning in the worklog ("thinking" +
  "watcher/plan" steps). It appears **nowhere else** in the product. Don't borrow it for a generic accent.
- **Green / amber / red** are **status only** (ok / warn / error, and positive / negative figures).
  Never decorative.

Worklog step-kind → colour (driven by `data-kind`, never inline):
`tool · file · command` → blue · `subagent` → orange · `think · watcher` → purple · `task` → green.

---

## 5. Typography & numbers

Inter for prose; **JetBrains Mono + `tabular-nums` for every figure** — the CFO-tool signature.
Any number carries `.num` (plus `.pos` / `.neg` for sign). Accounting style: `$1,234.56`,
negatives in parentheses `($1,234.56)` and coloured red, nil as `$0.00`. Sizes come from the
`--fz-*` scale; never hardcode a font-size.

---

## 6. Change process (what requires what)

| Change | Requires |
|---|---|
| Use existing tokens/components on a new page | Nothing — that's the happy path. |
| Add a **component** (Layer 5) using existing tokens | Add it with a `C## · NAME` header + one-line WHAT/USE; add a panel to the style guide. |
| Add a **new token** (Layer 1 primitive + Layer 2/3 alias) | A note in this file's changelog (§8). Reuses an existing ramp where possible. |
| Change a **semantic/scale token's value or meaning** (Layers 2–3) | A note here **and an ADR** in `docs/DECISIONS/` — it affects every consumer. |
| Add a **new colour family** or change the colour contract (§4) | An ADR. This is an architectural call. |

**Verification gate (run on every change to the CSS):**

1. **No leaked literals** — `#hex` / `rgba()` appear in **Layer 1 only**. Zero in Layers 2–5.
2. **Every `var()` resolves** — no reference to an undefined token.
3. **Contrast** — body/reading text pairs meet WCAG AA (≥4.5:1); UI-accent, status and large-figure
   colours meet ≥3:1 (AA-large). Compute it; don't eyeball it.
4. **Style guide still renders** — every component class it uses exists; every token it reads resolves.
5. **Browser click-through** — the GUI law (UX §4) requires opening the page in a real browser and
   verifying interaction/visuals. This **cannot be done in the build VM** (no browser installable) and
   is an **owner action**. Never claim it was done when it wasn't (Law 1).

Last automated run (2026-07-27): 134 tokens defined · 679 `var()` refs · 0 unresolved · 0 literals
outside Layer 1 · all guide-read tokens resolve · contrast table logged in BUILD_LOG. Browser
click-through: **pending owner** (VM has no browser).

---

## 7. Building a new page (the whole contract)

```html
<!-- 1. Link the system. It is the only thing that styles the page. -->
<link rel="stylesheet" href="protean-design-system.css">
```
```css
/* 2. Compose with documented classes + Layer 2/3 tokens ONLY. */
.my-panel {
  padding: var(--s-6);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r);
  box-shadow: var(--shadow-sm);
}
/* ✗ never:  padding: 14px;  background: #fff;  color: #4C8DD6; */
```
Reuse a component class if one fits. Genuinely page-only styles go in a **namespaced** block
(e.g. `.sg-*` in the style guide) so they can't leak into the system. Need a value the tokens don't
offer? That's a gap — add a token per §6, don't inline a literal.

---

## 8. Changelog

- **2026-07-27** — v0.1. Extracted the design system from the shell prototype into a 6-layer
  `protean-design-system.css`; added the C6 worklog component (the "show your working" feed) and its
  reserved-purple reasoning contract; built the living style guide. Added primitives `--c-ink-a18`,
  `--c-blue-200`, glass/banner/tooltip tints; pointed `--shadow-pop` and `--wl-rail` at them so Layers
  2–5 hold zero literals. Verified: 0 leaked literals, 0 unresolved tokens, AA contrast on text pairs.
  Browser click-through pending owner (no browser in the build VM).
