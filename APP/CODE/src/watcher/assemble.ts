import { randomUUID } from 'node:crypto';
import type { DomainPack } from '../contracts/domainPack.js';
import type { AssembledTurn, ChatMessage, ModelTier, TurnRequest } from '../contracts/turn.js';
import {
  ARTEFACT_PROTOCOL_PROMPT,
  DEFAULT_HISTORY_WINDOW_MESSAGES,
  TOOLSET_VERSION,
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
  historyWindow?: number;
}

export function windowHistory(history: ChatMessage[], windowSize: number): ChatMessage[] {
  if (history.length <= windowSize) return history;
  return history.slice(history.length - windowSize);
}

export function resolveTier(request: TurnRequest, pack: DomainPack): ModelTier {
  return request.tier ?? pack.tiers.default;
}

export function assembleTurn(input: AssembleInput): AssembledTurn {
  const { request, pack, history, model } = input;
  const windowSize = input.historyWindow ?? DEFAULT_HISTORY_WINDOW_MESSAGES;
  const messages: ChatMessage[] = [
    ...windowHistory(history, windowSize),
    { role: 'user', content: request.input },
  ];
  return {
    turnId: randomUUID(),
    sessionId: request.sessionId,
    domainId: request.domainId,
    input: request.input,
    systemPrompt: `${pack.systemPrompt}\n\n${ARTEFACT_PROTOCOL_PROMPT}`,
    messages,
    tier: resolveTier(request, pack),
    model,
    toolsetVersion: TOOLSET_VERSION,
  };
}
