---
name: protean-adr
description: Writes Protean Architecture Decision Records under docs/DECISIONS/. Use when a best-practice deviation or stack choice needs an ADR (Law 8), or when creating ADR-XXXX files.
---

# Protean ADR writer

## When
Any hard architectural call or deviation from known best practice (Law 8).

## How
1. Copy structure from `docs/DECISIONS/ADR-0000-template.md`.
2. Next number = max existing `ADR-XXXX` + 1. Slug = short kebab topic.
3. Sections: Context · Decision · Alternatives considered · Consequences.
4. Keep to one page. Link from `docs/ARCHITECTURE.md` stack/ADR index if one exists.
5. Mention the ADR in the BUILD_LOG entry and commit footer (`ADR: docs/DECISIONS/ADR-000X-….md`).

## Do not
- Rewrite history of prior ADRs; supersede with a new ADR that points at the old one.
- Bury decisions only in chat — if it binds the build, it is an ADR.
