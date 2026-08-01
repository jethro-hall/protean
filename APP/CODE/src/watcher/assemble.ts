import { randomUUID } from 'node:crypto';
import type { ToolPolicy } from '../contracts/agentLoop.js';
import type { ProteanMcpServerBinding, WiredTool } from '../contracts/connectors.js';
import type { DomainPack } from '../contracts/domainPack.js';
import type {
  AssembledTurn,
  Attachment,
  ChatMessage,
  ModelTier,
  TurnRequest,
} from '../contracts/turn.js';
import {
  ARTEFACT_PROTOCOL_PROMPT,
  DEFAULT_HISTORY_WINDOW_MESSAGES,
  NARRATION_PROTOCOL_PROMPT,
  toolsetVersionFromPolicy,
} from '../config/defaults.js';

/**
 * Watcher step 1 — ASSEMBLE (pure code, Law 4). Pulls the domain pack's system
 * prompt, windows the session history, and appends the new user input. No LLM
 * is involved on this path; its cost is measured, not assumed.
 */
export interface AssembleInput {
  request: TurnRequest;
  pack: DomainPack;
  history: ChatMessage[];
  model: string;
  toolPolicy: ToolPolicy;
  workspaceDir: string;
  datasetsDir: string;
  mcpServers: ProteanMcpServerBinding[];
  wiredTools: WiredTool[];
  historyWindow?: number;
}

export function windowHistory(history: ChatMessage[], windowSize: number): ChatMessage[] {
  if (history.length <= windowSize) return history;
  return history.slice(history.length - windowSize);
}

export function resolveTier(request: TurnRequest, pack: DomainPack): ModelTier {
  return request.tier ?? pack.tiers.default;
}

/**
 * Render pack config (persona + vocabulary + declared tools + output templates)
 * into the stable system-prompt prefix. Packs stay data-only (Law 2); switching
 * packs changes this string with zero engine logic change.
 */
export function renderPackSystemPrompt(pack: DomainPack): string {
  const sections: string[] = [pack.systemPrompt];

  const vocabEntries = Object.entries(pack.vocabulary);
  if (vocabEntries.length > 0) {
    const lines = vocabEntries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([term, meaning]) => `- ${term}: ${meaning}`);
    sections.push(`Domain vocabulary:\n${lines.join('\n')}`);
  }

  if (pack.tools.length > 0) {
    sections.push(
      `Declared domain tools (registry ids):\n` + pack.tools.map((tool) => `- ${tool}`).join('\n'),
    );
  }

  const templateEntries = Object.entries(pack.outputTemplates);
  if (templateEntries.length > 0) {
    const lines = templateEntries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, shape]) => `- ${name}: ${shape}`);
    sections.push(`Output templates:\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Render attached files into the user message deterministically (Law 4):
 * clearly-delimited fenced blocks, so the model sees exactly what was uploaded
 * and the content lands in history/cache-key/lineage like any other input.
 */
export function renderInputWithAttachments(
  input: string,
  attachments: Attachment[] | undefined,
): string {
  if (attachments === undefined || attachments.length === 0) return input;
  const blocks = attachments.map(
    (file) =>
      `Attached file "${file.name}" (${file.mimeType}):\n` +
      '```\n' +
      `${file.textContent}\n` +
      '```',
  );
  return `${input}\n\n${blocks.join('\n\n')}`;
}

/** Render live registry wiring into the dynamic (per-turn) system suffix. */
export function renderWiredToolsPrompt(wiredTools: readonly WiredTool[]): string {
  if (wiredTools.length === 0) {
    return 'Tool registry: no pack-specific connectors wired; agent-loop substrate tools only.';
  }
  const lines = wiredTools.map((tool) => {
    const live =
      tool.mcpToolNames.length > 0
        ? tool.mcpToolNames.join(', ')
        : tool.sdkTools.join(', ');
    return `- ${tool.packToolId} → ${live} (${tool.description})`;
  });
  return (
    `Live tool registry wiring (use these — do not invent connectors):\n${lines.join('\n')}`
  );
}

export function assembleTurn(input: AssembleInput): AssembledTurn {
  const {
    request,
    pack,
    history,
    model,
    toolPolicy,
    workspaceDir,
    datasetsDir,
    mcpServers,
    wiredTools,
  } = input;
  const windowSize = input.historyWindow ?? DEFAULT_HISTORY_WINDOW_MESSAGES;
  const userContent = renderInputWithAttachments(request.input, request.attachments);
  const messages: ChatMessage[] = [
    ...windowHistory(history, windowSize),
    { role: 'user', content: userContent },
  ];
  // Pack prompt = stable, cacheable prefix. Engine protocols = suffix after the
  // provider prompt-cache boundary (Claude adapter inserts the SDK marker).
  const systemPromptStatic = renderPackSystemPrompt(pack);
  const systemPromptDynamic = [
    ARTEFACT_PROTOCOL_PROMPT,
    NARRATION_PROTOCOL_PROMPT,
    renderWiredToolsPrompt(wiredTools),
  ].join('\n\n');
  return {
    turnId: randomUUID(),
    sessionId: request.sessionId,
    domainId: request.domainId,
    input: request.input,
    systemPrompt: `${systemPromptStatic}\n\n${systemPromptDynamic}`,
    systemPromptStatic,
    systemPromptDynamic,
    messages,
    tier: resolveTier(request, pack),
    model,
    toolsetVersion: toolsetVersionFromPolicy(toolPolicy),
    toolPolicy,
    workspaceDir,
    datasetsDir,
    mcpServers,
    wiredTools,
  };
}
