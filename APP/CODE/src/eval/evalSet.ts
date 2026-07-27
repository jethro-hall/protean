import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Eval sets are DATA in LLMBUILD_DATA/eval-sets (Law 2). Checks are
 * deterministic (Law 4): substring presence/absence and length bounds —
 * scoring never asks a model to grade a model in this harness.
 */
export const evalChecksSchema = z.object({
  mustInclude: z.array(z.string()).default([]),
  mustNotInclude: z.array(z.string()).default([]),
  maxChars: z.number().int().positive().optional(),
});
export type EvalChecks = z.infer<typeof evalChecksSchema>;

export const evalItemSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  checks: evalChecksSchema,
});
export type EvalItem = z.infer<typeof evalItemSchema>;

export const evalSetSchema = z.object({
  id: z.string().min(1),
  description: z.string().default(''),
  domainId: z.string().min(1),
  items: z.array(evalItemSchema).min(1),
});
export type EvalSet = z.infer<typeof evalSetSchema>;

export function loadEvalSet(evalSetsDir: string, setId: string): EvalSet {
  const path = join(evalSetsDir, `${setId}.json`);
  const parsed = evalSetSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) throw new Error(`Eval set "${setId}" invalid: ${parsed.error.message}`);
  return parsed.data;
}
