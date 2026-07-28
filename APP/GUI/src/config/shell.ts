/**
 * Shell chrome labels (operator strip, brand suffix). UI identity only —
 * not domain facts. Override later via tenant config (Law 2 / Law 7 seams).
 */
export const SHELL_OPERATOR = {
  initials: 'JH',
  displayName: 'Jeff Hall',
  orgLine: 'RideAI · GhostStack',
} as const;

export const SHELL_EMPTY_COPY = {
  title: 'Start a conversation',
  body: 'Ask a question, drop a file, or pick a saved workflow. Protean shows its working and never fakes a number.',
} as const;
