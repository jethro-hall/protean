import { describe, expect, it } from 'vitest';
import { importDomainPackJson } from '../src/tools/authoring/importDomainPackJson.js';

const richBundle = {
  packVersion: '1.0.0',
  packType: 'llm_research_governance',
  title: 'University-Level Professional Documentation Research Governance',
  description: 'Trusted-source-only research governance pack.',
  systemPrompt: 'You are a research-governance LLM...',
  outputTemplates: {
    schema_version: '"1.0.0"',
    record_type: '"professional_documentation_research"',
  },
  validationSchema: JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['schema_version'],
  }),
  artifacts: {
    system_prompt: 'outputs/system_prompt.md',
  },
};

describe('importDomainPackJson', () => {
  it('maps a full bundle onto domainPackSchema fields deterministically', () => {
    const result = importDomainPackJson(richBundle);
    expect(result.pack.systemPrompt).toBe('You are a research-governance LLM...');
    expect(result.pack.displayName).toBe('University-Level Professional Documentation Research Governance');
    expect(result.pack.id).toBe('llm-research-governance');
    expect(result.pack.version).toBe('1.0.0');
  });

  it('maps outputTemplates directly -- already a flat Record<string,string> in both shapes', () => {
    const result = importDomainPackJson(richBundle);
    expect(result.pack.outputTemplates).toEqual({
      schema_version: '"1.0.0"',
      record_type: '"professional_documentation_research"',
    });
    expect(result.mappedFields).toContain('outputTemplates');
  });

  it('parses validationSchema (a JSON string) into validation.outputSchema as a real object', () => {
    const result = importDomainPackJson(richBundle);
    expect(result.pack.validation.outputSchema).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['schema_version'],
    });
  });

  it('accepts validationSchema already as a parsed object, not just a string', () => {
    const bundle = { ...richBundle, validationSchema: { type: 'object' } };
    const result = importDomainPackJson(bundle);
    expect(result.pack.validation.outputSchema).toEqual({ type: 'object' });
  });

  it('warns (does not throw) when validationSchema is present but unparseable', () => {
    const bundle = { ...richBundle, validationSchema: 'not valid json {' };
    const result = importDomainPackJson(bundle);
    expect(result.pack.validation.outputSchema).toBeUndefined();
    expect(result.warnings.some((w) => w.includes('validationSchema'))).toBe(true);
  });

  it('warns about description and artifacts (recognised but unmapped), never throws for them', () => {
    const result = importDomainPackJson(richBundle);
    expect(result.warnings.some((w) => w.includes('"description"'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('"artifacts"'))).toBe(true);
  });

  it('warns about a genuinely unrecognised top-level field rather than silently dropping it', () => {
    const bundle = { ...richBundle, someWeirdField: 'mystery' };
    const result = importDomainPackJson(bundle);
    expect(result.warnings.some((w) => w.includes('someWeirdField'))).toBe(true);
  });

  it('throws a specific error when systemPrompt is missing -- never fabricates a pack', () => {
    const withoutPrompt: Record<string, unknown> = { ...richBundle };
    delete withoutPrompt.systemPrompt;
    expect(() => importDomainPackJson(withoutPrompt)).toThrow(/systemPrompt/);
  });

  it('throws when systemPrompt is present but empty/whitespace-only', () => {
    expect(() => importDomainPackJson({ ...richBundle, systemPrompt: '   ' })).toThrow(/systemPrompt/);
  });

  it('throws for a non-object input rather than guessing', () => {
    expect(() => importDomainPackJson('just a string')).toThrow(/not a JSON object/);
    expect(() => importDomainPackJson(['array', 'input'])).toThrow(/not a JSON object/);
    expect(() => importDomainPackJson(null)).toThrow(/not a JSON object/);
  });

  it('falls back to a sensible default displayName and id when title/packType are absent', () => {
    const minimal = { systemPrompt: 'A minimal pack.' };
    const result = importDomainPackJson(minimal);
    expect(result.pack.displayName).toBe('Imported pack');
    expect(result.pack.id).toBe('imported-pack');
    expect(result.warnings.some((w) => w.includes('title'))).toBe(true);
  });

  it('defaults version to 0.1.0 when neither version nor packVersion is present', () => {
    const result = importDomainPackJson({ systemPrompt: 'x', title: 'T' });
    expect(result.pack.version).toBe('0.1.0');
  });

  it('produces a pack that satisfies domainPackSchema end-to-end', async () => {
    const { domainPackSchema } = await import('../src/contracts/domainPack.js');
    const result = importDomainPackJson(richBundle);
    expect(() => domainPackSchema.parse(result.pack)).not.toThrow();
  });
});
