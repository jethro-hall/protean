import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { knowledgeCollectionSchema, type KnowledgeCollection } from '../contracts/knowledge.js';

/**
 * Loader for grounded-knowledge collections (Phase 6 POC). Collections are
 * curated JSON files under domains/<id>/knowledge/*.json, matched by their own
 * `id` field (not filename or folder), so a pack can reference a collection id
 * without knowing which domain folder curated it.
 */
function collectionFilePaths(domainsDir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(domainsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const knowledgeDir = join(domainsDir, entry.name, 'knowledge');
    if (!existsSync(knowledgeDir)) continue;
    for (const file of readdirSync(knowledgeDir, { withFileTypes: true })) {
      if (file.isFile() && file.name.endsWith('.json')) {
        out.push(join(knowledgeDir, file.name));
      }
    }
  }
  return out;
}

/** Load one collection by id. Unknown id fails loud (Law 1) — never silently empty. */
export function loadKnowledgeCollection(domainsDir: string, collectionId: string): KnowledgeCollection {
  for (const filePath of collectionFilePaths(domainsDir)) {
    let parsed;
    try {
      parsed = knowledgeCollectionSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf8')));
    } catch (cause) {
      throw new Error(`Knowledge collection file unreadable: ${filePath}`, { cause });
    }
    if (parsed.success && parsed.data.id === collectionId) return parsed.data;
  }
  throw new Error(
    `Knowledge collection "${collectionId}" not found under ${domainsDir}/*/knowledge/`,
  );
}

/** Load several collections by id, in the order requested. */
export function loadKnowledgeCollections(
  domainsDir: string,
  collectionIds: readonly string[],
): KnowledgeCollection[] {
  return collectionIds.map((id) => loadKnowledgeCollection(domainsDir, id));
}

/** Every known collection's id + display name (Phase 6 domain-pack editor: what a pack can weight/reference). */
export function listKnowledgeCollections(
  domainsDir: string,
): Array<{ id: string; displayName: string }> {
  const out: Array<{ id: string; displayName: string }> = [];
  for (const filePath of collectionFilePaths(domainsDir)) {
    const parsed = knowledgeCollectionSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf8')));
    if (parsed.success) out.push({ id: parsed.data.id, displayName: parsed.data.displayName });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
