/**
 * Upload limits — DATA, mirroring APP/CODE config/defaults (Law 2). The engine
 * enforces the same caps server-side; these exist so the GUI can refuse early
 * with a clear message instead of a failed request.
 */
export const MAX_ATTACHMENT_BYTES = 512 * 1024;
export const MAX_ATTACHMENTS_PER_TURN = 5;

/** Text formats the composer accepts (binary formats arrive in a later phase). */
export const ATTACHMENT_ACCEPT =
  '.json,.txt,.md,.csv,.xml,.yaml,.yml,.html,.js,.ts,.py,.sql,.log,text/*,application/json';
