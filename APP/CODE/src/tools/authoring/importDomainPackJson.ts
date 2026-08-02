/**
 * Deterministic domain-pack JSON import (Law 4 -- this is a structural field
 * mapping, not synthesis, so no LLM is involved). Recognises the common
 * "packVersion / packType / title / systemPrompt / outputTemplates /
 * validationSchema" bundle shape used by external prompt-governance tooling
 * and maps it onto Protean's own domainPackSchema. `outputTemplates` in that
 * shape is already a flat Record<string,string> -- an exact structural match
 * for domainPackSchema's own `outputTemplates` field, so it maps directly,
 * no transformation needed. `validationSchema` has no direct Protean field;
 * it lands in `validation.outputSchema`, which the schema already types as
 * z.unknown() for exactly this kind of arbitrary governance metadata.
 *
 * Never guesses a missing systemPrompt from unrelated data -- if the
 * recognisable shape isn't present, this fails loud (Law 1) rather than
 * fabricating a pack. Every field it can't map is reported, never silently
 * dropped -- mirrors the same "review before anything is lost" discipline as
 * the PDF chunker's completeness check.
 */
import type { DomainPack } from '../../contracts/domainPack.js';

export interface DomainPackImportReport {
  pack: DomainPack;
  mappedFields: string[];
  warnings: string[];
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  return slug !== '' ? slug : 'imported-pack';
}

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'packVersion',
  'packType',
  'title',
  'description',
  'systemPrompt',
  'outputTemplates',
  'validationSchema',
  'artifacts',
  'id',
  'displayName',
  'version',
]);

export function importDomainPackJson(raw: unknown): DomainPackImportReport {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Uploaded file is not a JSON object -- cannot import.');
  }
  const obj = raw as Record<string, unknown>;

  const systemPrompt = typeof obj.systemPrompt === 'string' ? obj.systemPrompt.trim() : '';
  if (systemPrompt === '') {
    throw new Error(
      'No non-empty "systemPrompt" field found -- this does not look like a domain-pack-shaped file. Nothing was imported.',
    );
  }

  const mappedFields: string[] = ['systemPrompt'];
  const warnings: string[] = [];

  const title =
    typeof obj.title === 'string' && obj.title.trim() !== ''
      ? obj.title
      : typeof obj.displayName === 'string' && obj.displayName.trim() !== ''
        ? obj.displayName
        : null;
  const displayName = title ?? 'Imported pack';
  if (title !== null) {
    mappedFields.push('title/displayName');
  } else {
    warnings.push('No "title"/"displayName" field found -- defaulted to "Imported pack"; rename before saving.');
  }

  const idSource =
    typeof obj.id === 'string' && obj.id.trim() !== ''
      ? obj.id
      : typeof obj.packType === 'string' && obj.packType.trim() !== ''
        ? obj.packType
        : displayName;
  if (typeof obj.id === 'string' || typeof obj.packType === 'string') mappedFields.push('id/packType');
  const id = slugify(idSource);

  const version =
    typeof obj.version === 'string' && obj.version.trim() !== ''
      ? obj.version
      : typeof obj.packVersion === 'string' && obj.packVersion.trim() !== ''
        ? obj.packVersion
        : '0.1.0';
  if (typeof obj.version === 'string' || typeof obj.packVersion === 'string') mappedFields.push('version/packVersion');

  const outputTemplates: Record<string, string> = {};
  if (obj.outputTemplates !== undefined) {
    if (typeof obj.outputTemplates === 'object' && obj.outputTemplates !== null && !Array.isArray(obj.outputTemplates)) {
      for (const [key, value] of Object.entries(obj.outputTemplates as Record<string, unknown>)) {
        outputTemplates[key] = typeof value === 'string' ? value : JSON.stringify(value);
      }
      mappedFields.push('outputTemplates');
    } else {
      warnings.push('"outputTemplates" was present but not an object -- ignored.');
    }
  }

  const validation: Record<string, unknown> = {};
  if (obj.validationSchema !== undefined) {
    try {
      validation.outputSchema =
        typeof obj.validationSchema === 'string' ? JSON.parse(obj.validationSchema) : obj.validationSchema;
      mappedFields.push('validationSchema -> validation.outputSchema');
    } catch (cause) {
      warnings.push(
        `"validationSchema" was present but could not be parsed as JSON -- not imported (${cause instanceof Error ? cause.message : String(cause)}).`,
      );
    }
  }

  if (typeof obj.description === 'string' && obj.description.trim() !== '') {
    warnings.push('"description" was present but Protean packs have no matching field -- not imported.');
  }
  if (obj.artifacts !== undefined) {
    warnings.push('"artifacts" (external file path references) does not apply inside Protean -- ignored.');
  }
  for (const key of Object.keys(obj)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      warnings.push(`Field "${key}" is not recognised by the importer -- not mapped (still present in your original file).`);
    }
  }

  return {
    pack: {
      id,
      displayName,
      version,
      systemPrompt,
      vocabulary: {},
      tools: [],
      knowledgeCollections: [],
      knowledgeCollectionWeights: {},
      outputTemplates,
      validation,
      tiers: { default: 'strong', cheapPath: 'fast' },
      examples: [],
      hints: {},
    },
    mappedFields,
    warnings,
  };
}
