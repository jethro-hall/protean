import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { InfoHint } from './InfoHint';
import { useSendTurn } from '../state/useTurn';
import { activeConversation, useAppState } from '../state/store';
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENTS_PER_TURN,
  MAX_ATTACHMENT_BYTES,
} from '../config/uploads';
import type { Attachment } from '../lib/api';

export function Composer() {
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendTurn = useSendTurn();
  const state = useAppState();
  const busy = ['waiting', 'streaming'].includes(activeConversation(state).status);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input = draft.trim();
    if (input === '' || busy) return;
    setDraft('');
    setFileError(null);
    sendTurn(input, attachments);
    setAttachments([]);
  };

  const onFilesPicked = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ''; // allow re-picking the same file
    setFileError(null);
    const next = [...attachments];
    for (const file of files) {
      if (next.length >= MAX_ATTACHMENTS_PER_TURN) {
        setFileError(`Up to ${MAX_ATTACHMENTS_PER_TURN} files per message.`);
        break;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setFileError(
          `"${file.name}" is ${(file.size / 1024).toFixed(0)} KB — the limit is ${MAX_ATTACHMENT_BYTES / 1024} KB.`,
        );
        continue;
      }
      const textContent = await file.text();
      if (textContent.trim() === '') {
        setFileError(`"${file.name}" is empty.`);
        continue;
      }
      next.push({ name: file.name, mimeType: file.type || 'text/plain', textContent });
    }
    setAttachments(next);
  };

  const removeAttachment = (name: string) => {
    setAttachments((current) => current.filter((file) => file.name !== name));
  };

  return (
    <form onSubmit={submit} className="border-t border-line bg-surface p-3">
      <div className="mx-auto max-w-3xl">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((file) => (
              <span
                key={file.name}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 text-xs"
              >
                <span aria-hidden>📄</span>
                <span className="max-w-[12rem] truncate">{file.name}</span>
                <span className="text-muted">{(file.textContent.length / 1024).toFixed(1)} KB</span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => removeAttachment(file.name)}
                  className="text-muted hover:text-err"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {fileError !== null && <p className="mb-2 text-xs text-err">{fileError}</p>}
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="composer-input">
            Message
          </label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            onChange={(event) => void onFilesPicked(event)}
            className="hidden"
            aria-hidden
            tabIndex={-1}
          />
          <div className="flex min-h-touch flex-1 items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2 focus-within:border-accent-blue">
            <button
              type="button"
              aria-label="Attach files"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="text-muted hover:text-accent-blue disabled:cursor-not-allowed disabled:opacity-40"
            >
              📎
            </button>
            <InfoHint hintKey="attachFile" direction="up" />
            <textarea
              id="composer-input"
              rows={1}
              value={draft}
              placeholder="Message Protean…"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit(event);
                }
              }}
              className="max-h-40 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted"
            />
            <InfoHint hintKey="composerInput" direction="up" />
          </div>
          <button
            type="submit"
            disabled={busy || draft.trim() === ''}
            className="min-h-touch rounded-xl bg-accent-blue px-4 text-sm font-medium text-surface hover:bg-accent-blue-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Streaming…' : 'Send'}
          </button>
        </div>
      </div>
    </form>
  );
}
