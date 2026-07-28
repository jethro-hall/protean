import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { InfoHint } from './InfoHint';
import { useSendTurn } from '../state/useTurn';
import { activeConversation } from '../state/appState';
import { useAppState } from '../state/useAppStore';
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
    event.target.value = '';
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

  return (
    <div className="composer-wrap">
      <form className="composer" onSubmit={submit}>
        {attachments.length > 0 && (
          <div className="composer-attach">
            {attachments.map((file) => (
              <span key={file.name} className="tag">
                📄 {file.name}
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() =>
                    setAttachments((current) => current.filter((item) => item.name !== file.name))
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {fileError !== null && (
          <p className="banner error composer-file-error" role="alert">
            {fileError}
          </p>
        )}
        <div className="field">
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
          <button
            type="button"
            className="gear"
            aria-label="Attach files"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            📎
          </button>
          <InfoHint hintKey="attachFile" direction="up" />
          <textarea
            id="composer-input"
            rows={1}
            value={draft}
            placeholder="Message Protean…"
            aria-label="Message"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit(event);
              }
            }}
          />
          <InfoHint hintKey="composerInput" direction="up" />
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || draft.trim() === ''}
          >
            {busy ? 'Streaming…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
