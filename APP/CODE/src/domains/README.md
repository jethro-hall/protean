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
  "tools": ["search", "fileRead", "dataLakeQuery"],   // ids from config/connectors.catalog.json
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
corporate assistant), `medical/` (GP clinic associate — Phase 4 multi-domain proof), and
`llm-research-governance/` (trusted-source-only web research governance, imported
deterministically from `docs/LLM_Domain_Package/llm_research_governance_domain_pack.json` via
`tools/authoring/importDomainPackJson.ts`). `education/` remains available as a later
config-only add.

## Tool ids → live connectors (Phase 5)
Pack `tools` are **declarations only**. The Tool/Connector Registry
(`config/connectors.catalog.json` + `tools/registry.ts`) maps each id to built-in SDK tools
and/or MCP servers. Unknown ids fail loud at turn start. External stdio MCP (Odoo, GhostDL,
email) can be added to the catalog with `kind: "stdioMcp"` + `enabled: true` when credentials
exist — never hardcode secrets. `webSearch` maps to the Claude Agent SDK's built-in
`WebSearch`/`WebFetch` tools (live internet access, not an external MCP server) — the only
pack that declares it today is `llm-research-governance`.
