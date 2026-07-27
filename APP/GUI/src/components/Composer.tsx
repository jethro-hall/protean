import { useState, type FormEvent } from 'react';
import { InfoHint } from './InfoHint';
import { useSendTurn } from '../state/useTurn';
import { activeConversation, useAppState } from '../state/store';

export function Composer() {
  const [draft, setDraft] = useState('');
  const sendTurn = useSendTurn();
  const state = useAppState();
  const busy = ['waiting', 'streaming'].includes(activeConversation(state).status);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input = draft.trim();
    if (input === '' || busy) return;
    setDraft('');
    sendTurn(input);
  };

  return (
    <form onSubmit={submit} className="border-t border-line bg-surface p-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <label className="sr-only" htmlFor="composer-input">
          Message
        </label>
        <div className="flex min-h-touch flex-1 items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2 focus-within:border-accent-blue">
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
    </form>
  );
}
