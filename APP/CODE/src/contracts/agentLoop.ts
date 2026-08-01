import { z } from 'zod';

/**
 * Dynamic agent-loop tool policy (Phase 5 substrate pulled forward 2026-07-28).
 * Configured via PROTEAN_AGENT_* env; mapped to Claude Agent SDK Options in the
 * gateway adapter. Not a scripted workflow — open-ended tools + maxTurns.
 *
 * Permission modes match @anthropic-ai/claude-agent-sdk PermissionMode.
 */

export const permissionModeSchema = z.enum([
  'default',
  'acceptEdits',
  'bypassPermissions',
  'plan',
  'dontAsk',
  'auto',
]);
export type PermissionMode = z.infer<typeof permissionModeSchema>;

export const toolPolicySchema = z.object({
  /** Tools the SDK may load (e.g. Read, Grep, Glob). Empty = single-shot answer. */
  availableTools: z.array(z.string()),
  /** Subset the model is allowed to invoke. */
  allowedTools: z.array(z.string()),
  /** Claude Agent SDK maxTurns — multi-step loop ceiling. */
  maxTurns: z.number().int().positive(),
  permissionMode: permissionModeSchema,
});
export type ToolPolicy = z.infer<typeof toolPolicySchema>;

/**
 * Single-shot / rewrite path: omit tools so the adapter stays maxTurns=1 with
 * no file tools. Used when GatewayRequest.toolPolicy is absent.
 */
export const NO_TOOLS_POLICY: ToolPolicy = {
  availableTools: [],
  allowedTools: [],
  maxTurns: 1,
  permissionMode: 'dontAsk',
};
