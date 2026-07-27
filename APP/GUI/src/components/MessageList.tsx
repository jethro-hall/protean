import { useEffect, useRef, useState } from 'react';
import { InfoHint } from './InfoHint';
import { activeConversation, useAppState, type Activity, type ChatMessage } from '../state/store';

/** One real working step (Claude-Desktop-style). Thinking expands to its streamed text. */
function ActivityRow({ activity }: { activity: Activity }) {
  const [open, setOpen] = useState(false);
  const expandable = activity.text !== '';
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => expandable && setOpen((current) => !current)}
        aria-expanded={expandable ? open : undefined}
        className={`flex items-center gap-1.5 text-muted ${expandable ? 'hover:text-ink' : 'cursor-default'}`}
      >
        {!activity.done && (
          <span
            aria-hidden
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent-orange"
          />
        )}
        {activity.done && <span aria-hidden>✓</span>}
        <span className="font-medium">{activity.label}</span>
        {expandable && <span aria-hidden>{open ? '▾' : '▸'}</span>}
      </button>
      {(open || (!activity.done && expandable)) && (
        <p className="mt-1 max-h-40 overflow-y-auto rounded-md border border-line bg-bg px-3 py-2 whitespace-pre-wrap text-muted">
          {activity.text}
        </p>
      )}
    </div>
  );
}

function ActivityStrip({ message }: { message: ChatMessage }) {
  const activities = message.activities ?? [];
  if (activities.length === 0) return null;
  return (
    <div className="mb-2 flex flex-col gap-1.5 border-b border-line pb-2">
      <span className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
        Working steps
        <InfoHint hintKey="agentActivity" />
      </span>
      {activities.map((activity) => (
        <ActivityRow key={activity.id} activity={activity} />
      ))}
    </div>
  );
}

function AttachmentTags({ message }: { message: ChatMessage }) {
  const names = message.attachmentNames ?? [];
  if (names.length === 0) return null;
  return (
    <span className="mb-1.5 flex flex-wrap gap-1">
      {names.map((name) => (
        <span
          key={name}
          className="inline-flex items-center gap-1 rounded-full bg-surface/20 px-2 py-0.5 text-[11px]"
        >
          <span aria-hidden>📄</span>
          {name}
        </span>
      ))}
    </span>
  );
}

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
        {isUser && <AttachmentTags message={message} />}
        {!isUser && <ActivityStrip message={message} />}
        <p className="whitespace-pre-wrap">
          {message.content}
          {message.streaming === true && message.content !== '' && (
            <span aria-hidden className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent-orange align-baseline" />
          )}
        </p>
        {message.streaming === true &&
          message.content === '' &&
          (message.activities ?? []).length === 0 && (
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
