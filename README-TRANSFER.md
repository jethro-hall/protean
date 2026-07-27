# Protean — Design System + Worklog transfer bundle

Generated 2026-07-28. Drop this into the Protean repo to give Cursor the worklog UI, the governed
design system, and the binding rules to build every future page against them.

## What's inside (paths are repo-relative — unzip at the repo root to place everything correctly)

```
APP/GUI/design/
  protean-shell-prototype.html   # interactive 3-pane shell WITH the Claude-Desktop-style worklog
  protean-design-system.css      # THE stylesheet — 6-layer token system (Layers 1..5), C1..C16
  protean-style-guide.html       # living reference; open this first (reads tokens live from the CSS)
  DESIGN.md                      # governance: layers, colour contract, change process, verify gate
.cursor/rules/
  design-system.mdc              # BINDING Cursor rule — token-only styling + worklog/(i) contracts
  gui-ux.mdc                     # existing GUI rule, updated to cross-reference the design system
```

## How to install

**Option A — you have the repo (recommended).** The commit is already made locally as `cdfa74f` on
`main` (1 ahead of origin). From the repo root just push:

```bash
cd "G:\CLAUDE DATA\protean"
git push origin main
```

That's it — the files are already on disk and committed. This zip is a portable copy / backup.

**Option B — apply the zip to a fresh checkout.** Unzip at the repo root so the paths above land in
place, then commit:

```bash
cd <repo-root>
unzip protean-design-bundle.zip        # overwrites the 6 files above; nothing else touched
git add APP/GUI .cursor/rules/design-system.mdc .cursor/rules/gui-ux.mdc
git commit -m "feat(gui): worklog stream + governed design system + Cursor rule"
git push origin main
```

## How Cursor uses this

- `.cursor/rules/design-system.mdc` has `globs: APP/GUI/**` — Cursor **auto-attaches** it whenever you
  edit anything under `APP/GUI/`. It enforces: token-only styling (no raw hex/rgba/px outside Layer 1),
  the colour contract (blue=system, orange=one-per-view, purple=reasoning-only, green/amber/red=status),
  the data-driven worklog contract, the (i) affordance, truthful states, and the verification gate.
- Tell Cursor: *"Build the <X> page against the Protean design system"* and it will have the rule + the
  style guide + DESIGN.md in context.

## Two honest notes (do not skip)

1. **Browser click-through was NOT done** — it was built and verified statically only (JS parses, tags
   balance, every class + token resolves, WCAG AA contrast computed on text pairs). The build
   environment has no browser. Per UX §4, opening the style guide and prototype in a real browser
   (desktop / iPad / mobile) to confirm the worklog collapses smoothly, steps reveal during streaming,
   and the (i) popovers behave is an **owner action still outstanding**.
2. **This is Phase-0 design work** — the prototype + system, not the wired React GUI. At Phase 1 the CSS
   promotes to `APP/GUI/src/theme/` (tokens/base/components split) and Tailwind config is generated FROM
   these tokens. See DESIGN.md §1.

Full change record: `docs/CHAT/BUILD_LOG.md` (entry dated 2026-07-27).
