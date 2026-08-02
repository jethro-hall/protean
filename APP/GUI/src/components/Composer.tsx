import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { InfoHint } from './InfoHint';
import { useSendTurn, useStopTurn } from '../state/useTurn';
import { activeConversation } from '../state/appState';
import { useAppDispatch, useAppState } from '../state/useAppStore';
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENTS_PER_TURN,
  MAX_ATTACHMENT_BYTES,
  MAX_ZIP_BYTES,
} from '../config/uploads';
import { fetchProviders, type Attachment, type ModelTier, type ProviderSummary } from '../lib/api';
import { estimateTokens } from '../lib/tokenEstimate';

/** Quick model picker (Phase 6): built-in tiers + any saved provider that has a model set. */
const BUILTIN_TIER_OPTIONS: Array<{ value: string; tier: ModelTier; label: string }> = [
  { value: 'tier:fast', tier: 'fast', label: 'Fast' },
  { value: 'tier:strong', tier: 'strong', label: 'Strong' },
];

function isZipFile(file: File): boolean {
  return file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function Composer() {
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const focusedForMessageId = useRef<string | null>(null);
  const sendTurn = useSendTurn();
  const stopTurn = useStopTurn();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const conversation = activeConversation(state);
  const busy = ['waiting', 'streaming'].includes(conversation.status);

  // Phase S: a turn that ends in a genuine clarifying question gets the composer's
  // attention automatically — the reply is just the next normal turn, so this is the
  // one honest nudge (focus, not a blocking modal or fake "waiting" state machine).
  useEffect(() => {
    const last = conversation.messages.at(-1);
    if (last === undefined || last.role !== 'assistant' || last.streaming === true) return;
    const lastClarification = (last.clarifications ?? []).at(-1);
    if (lastClarification?.status !== 'complete') return;
    if (focusedForMessageId.current === last.id) return;
    focusedForMessageId.current = last.id;
    textareaRef.current?.focus();
  }, [conversation.messages]);

  const reloadProviders = (): void => {
    fetchProviders()
      .then((list) => setProviders(list.filter((p) => p.model !== undefined)))
      .catch(() => setProviders([]));
  };

  useEffect(reloadProviders, []);

  const modelPickerValue =
    state.settings.providerId !== undefined ? `provider:${state.settings.providerId}` : `tier:${state.settings.tier}`;

  const handleModelPickerChange = (value: string): void => {
    if (value.startsWith('provider:')) {
      dispatch({ type: 'setProviderId', providerId: value.slice('provider:'.length) });
    } else {
      const tier = BUILTIN_TIER_OPTIONS.find((option) => option.value === value)?.tier ?? 'fast';
      dispatch({ type: 'setTier', tier });
    }
  };

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
      if (isZipFile(file)) {
        if (file.size > MAX_ZIP_BYTES) {
          setFileError(
            `"${file.name}" is ${(file.size / 1024).toFixed(0)} KB — the zip limit is ${MAX_ZIP_BYTES / 1024} KB.`,
          );
          continue;
        }
        const base64 = arrayBufferToBase64(await file.arrayBuffer());
        next.push({
          name: file.name,
          mimeType: file.type || 'application/zip',
          encoding: 'base64',
          textContent: base64,
        });
        continue;
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
      next.push({ name: file.name, mimeType: file.type || 'text/plain', encoding: 'utf8', textContent });
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
                {file.encoding === 'base64' ? '📦' : '📄'} {file.name}
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
          <textarea
            id="composer-input"
            ref={textareaRef}
            rows={1}
            value={draft}
            placeholder="Ask anything — the active domain pack shapes the answer…"
            aria-label="Message"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit(event);
              }
            }}
          />
          {draft.trim() !== '' && (
            <span className="composer-token-estimate" aria-label="Estimated token count">
              ~{estimateTokens(draft)} tok
            </span>
          )}
          {busy ? (
            <button
              type="button"
              className="send stop"
              aria-label="Stop generating"
              onClick={stopTurn}
            >
              ■
            </button>
          ) : (
            <button
              type="submit"
              className="send"
              aria-label="Send message"
              disabled={draft.trim() === ''}
            >
              ✈
            </button>
          )}
        </div>
        <div className="composer-foot">
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
            className="toolbtn"
            aria-label="Attach files"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            📎 Attach
            {attachments.length > 0 && <span className="cnt">{attachments.length}</span>}
          </button>
          <InfoHint hintKey="attachFile" direction="up" />
          <span className="cf-item">
            <select
              className="cf-model-picker"
              aria-label="Model for the next message"
              value={modelPickerValue}
              disabled={busy}
              onFocus={reloadProviders}
              onChange={(event) => handleModelPickerChange(event.target.value)}
            >
              <optgroup label="Built-in">
                {BUILTIN_TIER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
              {providers.length > 0 && (
                <optgroup label="Your providers">
                  {providers.map((provider) => (
                    <option key={provider.id} value={`provider:${provider.id}`}>
                      {provider.label} ({provider.model})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <InfoHint hintKey="quickModelPicker" direction="up" />
          </span>
          <span className="cf-item">
            Domain · {state.settings.domainId}
            <InfoHint hintKey="domainPack" direction="up" />
          </span>
        </div>
      </form>
    </div>
  );
}
