/**
 * Conversation-search query language for the rail's search box. Deterministic,
 * pure string parsing (Law 4 — no LLM involved for something code can compute).
 * Supports plain substring words (ANDed) plus dimensional comparisons over a
 * session's own real numbers: cost>0.05, tokens<2000, messages>=4, domain=finance.
 */
export interface SearchableSession {
  id: string;
  title: string;
  domainId: string;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Turn count doubles as the "messages" search dimension (user+assistant pair per turn). */
  turnCount: number;
}

type NumericField = 'cost' | 'tokens' | 'messages';
type Operator = '>' | '>=' | '<' | '<=' | '=' | '!=';

export type SessionQueryClause =
  | { field: NumericField; op: Operator; value: string }
  | { field: 'domain'; op: '=' | '!='; value: string }
  | { field: 'text'; op: '='; value: string };

const NUMERIC_FIELD_ALIASES: Record<string, NumericField> = {
  cost: 'cost',
  $: 'cost',
  usd: 'cost',
  tokens: 'tokens',
  tok: 'tokens',
  token: 'tokens',
  messages: 'messages',
  message: 'messages',
  msg: 'messages',
  msgs: 'messages',
  turns: 'messages',
};
const DOMAIN_FIELD_ALIASES = new Set(['domain', 'pack']);

const OPERATOR_GROUP = '(>=|<=|!=|>|<|=)';
const OPERATOR_SPACING_RE = new RegExp(`\\s*${OPERATOR_GROUP}\\s*`, 'g');
const CLAUSE_RE = new RegExp(`^([a-zA-Z$]+)${OPERATOR_GROUP}(.+)$`);

/** "cost > 0.05" and "cost>0.05" both parse the same way. */
function normaliseOperatorSpacing(raw: string): string {
  return raw.replace(OPERATOR_SPACING_RE, '$1');
}

export function parseSessionQuery(raw: string): SessionQueryClause[] {
  const normalised = normaliseOperatorSpacing(raw.trim());
  if (normalised === '') return [];
  return normalised
    .split(/\s+/)
    .filter((token) => token !== '')
    .map((token): SessionQueryClause => {
      const match = CLAUSE_RE.exec(token);
      if (match === null) return { field: 'text', op: '=', value: token.toLowerCase() };
      const [, rawField, op, value] = match;
      const field = (rawField ?? '').toLowerCase();
      const numericField = NUMERIC_FIELD_ALIASES[field];
      if (numericField !== undefined) {
        return { field: numericField, op: op as Operator, value: value ?? '' };
      }
      if (DOMAIN_FIELD_ALIASES.has(field) && (op === '=' || op === '!=')) {
        return { field: 'domain', op, value: value ?? '' };
      }
      // Not a recognised field=operator pair (e.g. a stray ">" in free text) — treat the whole token as text.
      return { field: 'text', op: '=', value: token.toLowerCase() };
    });
}

function numericValue(session: SearchableSession, field: NumericField): number {
  if (field === 'cost') return session.totalCostUsd;
  if (field === 'tokens') return session.totalInputTokens + session.totalOutputTokens;
  return session.turnCount;
}

function compareNumeric(actual: number, op: Operator, rawTarget: string): boolean {
  const target = Number(rawTarget);
  if (Number.isNaN(target)) return false;
  switch (op) {
    case '>':
      return actual > target;
    case '<':
      return actual < target;
    case '>=':
      return actual >= target;
    case '<=':
      return actual <= target;
    case '=':
      return actual === target;
    case '!=':
      return actual !== target;
  }
}

function matchesClause(session: SearchableSession, clause: SessionQueryClause): boolean {
  if (clause.field === 'text') return session.title.toLowerCase().includes(clause.value);
  if (clause.field === 'domain') {
    const equal = session.domainId.toLowerCase() === clause.value.toLowerCase();
    return clause.op === '!=' ? !equal : equal;
  }
  return compareNumeric(numericValue(session, clause.field), clause.op, clause.value);
}

/** Every clause must match (AND) — the same expectation a plain-text multi-word search already implies. */
export function matchesSessionQuery(
  session: SearchableSession,
  clauses: SessionQueryClause[],
): boolean {
  return clauses.every((clause) => matchesClause(session, clause));
}
