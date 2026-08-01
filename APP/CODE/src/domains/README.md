# Domain Packs — how Protean shape-shifts (Charter §3, Law 2)

A Domain Pack is **data and configuration only — no logic**. The generic engine loads a pack at
runtime and behaves as that domain's specialist without any code change. Adding a vertical (a
doctor's surgery, a university, a law firm) = adding a folder here. That is the whole trick.

## Required shape of a pack (`<domain>/pack.json`)
```jsonc
{
  "id": "finance",
  "displayName": "Finance / CFO analyst",
  "systemPrompt": "…the persona & standards for this domain…",
  "vocabulary": { /* domain terms, synonyms, abbreviations */ },
  "tools": ["search", "fileRead", "dataLakeQuery"],   // ids from the Tool/Connector Registry
  "outputTemplates": { /* named artefact templates this domain produces */ },
  "validation": { /* contracts the domain's outputs must satisfy */ },
  "tiers": { "default": "strong", "cheapPath": "fast" }, // model tiering hints
  "examples": [ /* few-shot workflow examples */ ]
}
```

## Rules
- No thresholds, prompts, or domain facts anywhere in engine code — they live in a pack (Law 2).
- A pack is validated against `contracts/domainPack.ts` on load; an invalid pack fails loud (Law 1).
- Packs are versioned; changes are logged like code (Charter §5.7).

Seed packs: `finance/` (Ride Electric — the first proving ground), `generic/` (fallback
corporate assistant), and `medical/` (GP clinic associate — Phase 4 multi-domain proof).
`education/` remains available as a later config-only add.
