import { useEffect, useRef } from 'react';
import { InfoHint } from './InfoHint';
import { activeConversation, useAppState, type ChatMessage } from '../state/store';

function TurnStats({ message }: { message: ChatMessage }) {
  if (message.stats === undefined) return null;
  const { timings, cacheHit } = message.stats;
  return (
    <span className="mt-1 flex items-center gap-1 text-[11px] text-muted">
      TTFT {timings.ttftMs ?? '–'} ms · total {timings.totalMs ?? '–'} ms ·{' '}
      {cacheHit ? 'cache hit' : 'cache miss'}
      <InfoHint hintKey="turnStats" direction="up" />
    </span>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          isUser
            ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-accent-blue px-4 py-2.5 text-sm text-surface'
            : 'max-w-[85%] rounded-2xl rounded-bl-sm border border-line bg-surface px-4 py-2.5 text-sm'
        }
      >
        <p className="whitespace-pre-wrap">
          {message.content}
          {message.streaming === true && message.content !== '' && (
            <span aria-hidden className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent-orange align-baseline" />
          )}
        </p>
        {message.streaming === true && message.content === '' && (
          <p className="text-xs italic text-muted" role="status">
            Waiting for first token…
          </p>
        )}
        {!isUser && <TurnStats message={message} />}
      </div>
    </div>
  );
}

export function MessageList() {
  const state = useAppState();
  const conversation = activeConversation(state);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation.messages]);

  if (conversation.messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <div>
          <h2 className="text-lg font-semibold">Protean</h2>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Ask anything. Answers stream in live, with the full turn recorded.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4" aria-live="polite">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {conversation.messages.map((message) => (
          <Bubble key={message.id} message={message} />
        ))}
        {conversation.status === 'error' && conversation.errorMessage !== undefined && (
          <div role="alert" className="rounded-md border border-err bg-surface px-4 py-2.5 text-sm text-err">
            <strong>The turn failed.</strong> {conversation.errorMessage}
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
