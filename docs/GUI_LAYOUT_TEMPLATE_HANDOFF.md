# GUI layout/template handoff — Protean chat shell

Written for a fresh engineer/agent (e.g. Cursor) picking this up without prior context.
Everything below was verified live, in a real browser, against the running dev server at
`localhost:5173` — not assumed from reading CSS. Screenshots and computed-style dumps for every
item exist in this session's tool output if you need to re-derive them.

## 0. Read this first: why this doc exists

The owner reported the deployed GUI (`https://protean.rideai.com.au`) still looking broken after
multiple rounds of fixes verified against the local dev server. Investigated and confirmed:

- `protean.rideai.com.au` → Caddy → Authentik SSO gate → reverse-proxies to the **exact same** Vite
  dev server on host port `5173` that was used for all local verification. Same code, same process,
  no separate build/deploy step, no duplicate server on that port (checked `ss -ltnp`).
- Caddy adds **zero** cache headers on that route (checked `Caddyfile` directly) — it's a bare
  `reverse_proxy`.
- The app has no service worker (checked — none registered, none in the codebase).

**If you fix something here and it still "doesn't work" on the live domain**, the fault is almost
certainly a stale asset cached in the *browser* being used to check it (or a stale tab that was
open before the fix landed), not the server. Before concluding a fix didn't work:

1. Hard refresh (Ctrl+Shift+R / Cmd+Shift+R), or better, open DevTools → Network tab → check
   "Disable cache" → reload.
2. Confirm in the Network tab that `components.css` / `app.css` / the main JS bundle actually
   returned a fresh `200`, and eyeball the response body for the specific rule you expect.
3. Try a true private/incognito window (not just "a narrow window") to rule out any
   extension/profile-level interference.
4. Confirm you're actually pointed at `protean.rideai.com.au` and not a cached tab / different
   port / different hostname.

If, after all four of those, the live behavior still genuinely differs from `localhost:5173`,
that's a real infra bug worth escalating (e.g. an unexpected CDN/WAF in front of the domain that
wasn't visible from this box) — but confirm the above first, because every "still broken" report
this session that was actually re-verified turned out to be either (a) a genuinely different bug
than the one just fixed, or (b) not yet checked against a freshly-fetched asset.

## 1. Where the design system lives, and the one rule that caused most of the bugs

Import order, `src/theme/index.css`:

```
@import './fonts.css';
@import './tokens.css';      /* design tokens: colors, spacing, --rail-w, --preview-w, etc. */
@import './base.css';
@import './components.css';  /* the component library, C1–C16 sections, alphabetical-ish */
@import './app.css';         /* app-only glue — loads LAST */
```

**`app.css` loads after `components.css`.** Any selector in `app.css` with equal-or-lower
specificity than one in `components.css` wins outright, *regardless of which file's media query
"sounds" more specific*. This exact mistake caused two separate real bugs this session (see §3).
Rule going forward: `components.css` is the single source of truth for the responsive contract
(§2) and any core component's structural CSS custom properties. `app.css` should only add
page-glue that doesn't re-declare a property components.css already owns for the same selector.

Also: **`<button>` elements do not fill their block container's width by default**, even once
`display` is overridden to `flex`/`grid` — this is a genuine cross-browser quirk (buttons keep
fit-content/shrink-to-fit outer sizing regardless of inner display value; `<div>` does not have
this behavior). Any full-width button-based row (nav items, list rows) needs an explicit
`width: 100%`, and once you add that, remember buttons also default to `text-align: center` —
reset it explicitly if you want left-aligned content.

## 2. The responsive contract (C15, `components.css`)

Three tiers, by design:

| Width | Rail | Preview |
|---|---|---|
| >1180px (desktop) | 3rd grid column, in-flow | 3rd grid column, in-flow |
| 761–1180px ("iPad") | off-canvas `position:fixed` drawer, `transform: translateX(-100%)` / `.rail.open{transform:none}` | **still in-flow as a grid column**, NOT a drawer — width comes from `var(--preview-w)`, must be clamped (see §3.6) |
| ≤760px (mobile) | off-canvas drawer (same mechanism as iPad tier) | off-canvas `position:fixed` drawer, `transform: translateX(100%)` / `.preview.open{transform:none}` |

`--preview-w` default is `420px` (`tokens.css`), user-draggable via `PreviewResizeHandle`
(`shell/Layout.tsx`) between `PREVIEW_WIDTH_MIN_PX=320` and `PREVIEW_WIDTH_MAX_PX=880`
(`state/appState.ts`) — **the drag handler has no viewport-awareness**, so it can be dragged to
880px on a wide monitor and stay there when the window later shrinks. Any layout math involving
`--preview-w` must assume it can be up to 880px regardless of current window width.

`Layout.tsx` sets `--preview-w` as an **inline style directly on `.app`**
(`style={{'--preview-w': ...}}`). Inline styles beat any stylesheet rule short of `!important` —
you cannot re-clamp this custom property from a stylesheet `:root` rule (also: redeclaring
`--preview-w` in terms of itself on the same selector is a genuine CSS cycle, not "the previous
cascade value" — it resolves to invalid, not a smaller number). **Clamp at the point of use**
instead, e.g. `grid-template-columns: 0 1fr min(var(--preview-w), 45vw)`, never by trying to
redefine the custom property itself.

## 3. Bugs found and fixed this session (don't reintroduce these)

All in `APP/GUI/src/`.

1. **`.preview` position clobbered on narrow viewports.** `app.css` had an unconditional
   `.preview { position: relative }` that beat `components.css`'s off-canvas `position: fixed`
   rule at ≤760px (later file, same specificity). Fixed by scoping app.css's rule to
   `@media (min-width: 761px)`. (`theme/app.css`)
2. **Grid items forced wider than viewport.** CSS Grid items default to `min-width: auto`
   (content-based), which can force the whole grid wider than the viewport. Added
   `min-width: 0` to `.chat` and `.rail`. (`theme/components.css`)
3. **Topbar pills mid-text wrapping.** Added `.topbar > * { white-space: nowrap }` (keeping
   `.topbar .spacer { flex: 1 }` as the one flexible child), `overflow-x: auto` on `.topbar`
   itself as the escape valve for genuine overflow.
4. **`white-space: nowrap` inheriting into DOM-nested but visually-escaped subtrees.** The
   Settings modal and InfoHint tooltip are DOM children of a `.topbar > *` element even though
   they visually escape via `position: fixed` — CSS inheritance follows the DOM tree, not layout,
   so they silently inherited `nowrap` too. Fixed with explicit `white-space: normal` resets at
   `.settings-modal-scrim` and `.info .pop`.
5. **Settings-modal horizontal scrollbar.** `overflow-y: auto` on `.settings-modal-body` with no
   explicit `overflow-x` computes the other axis to `auto` too (CSS Overflow spec) — combined with
   a non-wrapping button row, this created an unwanted horizontal scrollbar. Fixed with
   `overflow-x: hidden` plus `flex-wrap: wrap` on the button row.
6. **Rail/preview drawer scrim permanently invisible and unclickable.** `Layout.tsx` rendered
   `className="scrim rail-scrim"` / `"scrim preview-scrim"`, but the CSS only lights a scrim up via
   a `.show` class (`.scrim{opacity:0} .scrim.show{opacity:1;pointer-events:auto}`) that was never
   added. The drawer looked like it "did nothing" when opened at narrow widths — no dimming, no
   click-outside-to-close. Fixed by adding `show` to both scrim buttons' `className`.
   (`shell/Layout.tsx`)
7. **`--preview-w` uncapped between 761–1180px, could crush the chat pane to near-zero.** A
   desktop-dragged preview width (up to 880px) kept its exact pixel reservation in
   `grid-template-columns` even after the window shrank into the "iPad" tier — e.g. a 1000px
   window with an 880px-wide preview left chat exactly `120px`. Fixed at the point of use:
   `grid-template-columns: 0 1fr min(var(--preview-w), 45vw)` (see §2 for why this can't be fixed
   via a `:root` override). Also removed a now-redundant, partially-broken
   `.preview { width: min(var(--preview-w), 92vw) }` rule in `app.css` that only shrank the
   element's own box without freeing the grid track space back to chat.
8. **Domain-pack display name overflowing the topbar.** The active-domain pill
   (`shell/SettingsMenu.tsx`) rendered `displayName` raw with no length cap — a pack named
   "University-Level Professional Documentation Research Governance" pushed the whole topbar
   wider, forcing a horizontal scrollbar. Fixed: wrapped the label in
   `<span className="pill-domain-label" title={domainLabel}>`, CSS
   `max-width: 220px; overflow: hidden; text-overflow: ellipsis;` — full name still available via
   the `title` attribute on hover.
9. **Rail search input text hard-clipped instead of ellipsized.** `.rail-search input` had no
   `text-overflow`/`overflow`/`white-space`, so long placeholder or query text (e.g. the example
   `Search…  cost>0.05  domain=finance`) just got cut off mid-character. Fixed with the standard
   three-property ellipsis combo.
10. **Conversation rail needing horizontal scroll.** `.conv-list { overflow-y: auto }` with no
    explicit `overflow-x` — same spec quirk as item 5 — plus a non-wrapping `.meta` row (domain
    tag + message count + cost) wide enough to trigger it. Fixed with `overflow-x: hidden` on
    `.conv-list`, `flex-wrap: nowrap; min-width: 0; overflow: hidden` on `.conv .meta`, and
    `flex: none; white-space: nowrap` on its children so the tag/count/cost don't wrap internally.
11. **Root cause of why conversation-row titles never showed an ellipsis at all**: `.conv` is a
    `<button>` — per §1, it was sizing itself to its own title text (measured: 134px–536px per
    row, inside a 263px-wide rail) instead of filling the rail, so `.title`'s
    `text-overflow: ellipsis` had no constrained box to ever clip against. Fixed with
    `width: 100%` on `.conv` and on `.conv .title`. This surfaced button's default
    `text-align: center` (invisible before, since the box exactly matched its content width) —
    reset to `text-align: left` on `.conv`.

## 4. Verification checklist for any further layout work

Test at minimum these widths (all with the Live Preview pane **open**, since that's when the
broken states actually show): **320, 375, 700, 761, 900, 1000, 1180, 1181, 1400, 1920px.**

For each: no horizontal scrollbar anywhere (topbar, rail, conv-list, main app), composer never
overlaps or gets squeezed below usability, preview drawer (when open) actually dims/blocks the
rest of the app at ≤1180px and is dismissible by clicking the dimmed area, conversation rail rows
show ellipsized single-line titles with no internal wrapping.

Also test with an artificially long domain-pack `displayName` (the `llm-research-governance` pack
already has one: "University-Level Professional Documentation Research Governance") — this is the
best stress-test for topbar overflow regressions.
