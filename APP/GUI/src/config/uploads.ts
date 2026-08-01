/**
 * Upload limits — DATA, mirroring APP/CODE config/defaults (Law 2). The engine
 * enforces the same caps server-side; these exist so the GUI can refuse early
 * with a clear message instead of a failed request.
 */
export const MAX_ATTACHMENT_BYTES = 512 * 1024;
export const MAX_ATTACHMENTS_PER_TURN = 5;

/**
 * Zip archives get their own, larger cap: a zip is expected to hold several
 * small text files, not one — the engine unpacks it into individual
 * attachments and applies MAX_ATTACHMENT_BYTES / MAX_ATTACHMENTS_PER_TURN to
 * the *expanded* result, same as any other attachment.
 */
export const MAX_ZIP_BYTES = 2 * 1024 * 1024;

/** Text formats the composer accepts, plus zip (unpacked server-side into text attachments). */
export const ATTACHMENT_ACCEPT =
  '.json,.txt,.md,.csv,.xml,.yaml,.yml,.html,.js,.ts,.py,.sql,.log,.zip,text/*,application/json,application/zip';
