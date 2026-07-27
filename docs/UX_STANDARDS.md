# Protean — UX Standards

> "A smart, lean, functional GUI that gets the job done. No clutter." (owner directive, 2026-07-27)
> These are binding design laws, not suggestions. Every screen is checked against them before a
> phase is called done.

---

## 1. Principles (in priority order)

1. **Clarity over decoration.** Every pixel earns its place. If an element doesn't help the user
   act or understand, it's removed. No clutter.
2. **The chat is the centre.** Left rail (conversations) · centre chat (the heart) · right preview
   pane (live artefact OR second-Claude). Settings = a small gear, top. Nothing competes with the
   conversation.
3. **Explain in place, on demand.** Never make the user leave to understand a field (see §2).
4. **Truthful state.** Loading, streaming, degraded, and error states are always visible and
   honest — never a spinner that hides a failure, never a silent empty result (Charter: no faked
   certainty).
5. **Works on every device.** Mobile / iPad / desktop from the same codebase (responsive contract,
   ARCHITECTURE §2).

---

## 2. The (i) info affordance — MANDATORY

> "Always, always have a quick (i) info symbol next to required inputs/outputs that shows what it
> is, why it's there, and if required an example — but only when hovered or clicked."

Every **required input and every output field** carries a small `(i)` marker. On **hover or click**
(hover on desktop, tap on touch), it reveals a compact tooltip/popover with three parts:

```
WHAT   — one line: what this field is.
WHY    — one line: why it's here / what it's used for.
EXAMPLE— (only when it aids clarity) a concrete sample value.
```

Rules:
- Hidden until hover/click — **zero clutter** by default. It never occupies layout space when idle.
- Accessible: keyboard-focusable, `aria-describedby` wired, dismissible with Esc, screen-reader
  readable.
- Content is **data, not code** — tooltip text lives in the field's config/contract (a `hint`
  object), never hardcoded in a component (Law 2). One reusable `<InfoHint>` component reads it.
- The EXAMPLE line is optional and only shown when it genuinely helps (owner: "if required").

Contract shape (lives with the field definition):
```ts
interface FieldHint { what: string; why: string; example?: string; }
```

---

## 3. Theme (executive "pascal" palette)

Cool near-white base, light-blue primary, warm-orange accent. Tokens (ARCHITECTURE §7):

```
--bg #F7F9FC   --surface #FFFFFF   --ink #1E2A3A   --muted #5B6B7F
--accent-blue #4C8DD6   --accent-blue-2 #7FB0E6   --accent-orange #E8894A
--line #E3E9F0   --ok #2E9E6B   --warn #E0A030   --err #C0392B
font: Inter / system-ui    mono: JetBrains Mono
```

Orange is an **accent**, used sparingly for emphasis/action — never a wash. Generous whitespace;
one clear primary action per view.

---

## 4. Sanity-check discipline — browser-verified, not just CLI

> "Don't just test in CLI via SSH — use a browser, make sure every click makes sense, the wording
> makes sense." (owner directive)

A GUI change is **not done** until it has been verified in a real browser, not merely built. The
checklist before any GUI phase is called complete:

- Every interactive element actually does what its label says (click-through in a browser).
- Wording is checked for sense and consistency — no dev-speak leaking into user-facing text.
- Every required input/output has a working `(i)` hint with what/why/(example).
- Responsive: verified at mobile, iPad, and desktop widths.
- Truthful states verified: loading, streaming, empty, degraded, error each render honestly.
- Accessibility: keyboard-navigable, focus visible, hints reachable without a mouse.

Evidence (a screenshot or a recorded click-through) goes in the BUILD_LOG / PR per Definition of
Done. "It compiles" is not evidence it works (Charter Law 1).

---

## 5. What "no clutter" forbids

No decorative icons that don't act; no always-on help text where an `(i)` would do; no more than one
primary action per view; no nested menus where a flat one works; no modal unless it's genuinely
blocking; no colour used for decoration rather than meaning.
