import { useEffect, useRef } from 'react';
import { SHELL_EMPTY_COPY } from '../config/shell';
import { InfoHint } from './InfoHint';
import { Worklog } from './Worklog';
import {
  activeConversation,
  type Artefact,
  type ChatMessage,
  type Conversation,
  type MessageSegment,
} from '../state/appState';
import { useAppDispatch, useAppState } from '../state/useAppStore';

function ArtefactChip({
  segment,
  conversation,
}: {
  segment: Extract<MessageSegment, { kind: 'artefact' }>;
  conversation: Conversation;
}) {
  const dispatch = useAppDispatch();
  const artefact: Artefact | undefined = conversation.artefacts.find(
    (candidate) => candidate.id === segment.artefactId,
  );
  const status = artefact?.status ?? 'streaming';
  return (
    <button
      type="button"
      className={`toolchip${status === 'complete' ? ' done' : ''}`}
      onClick={() =>
        dispatch({
          type: 'selectArtefact',
          conversationId: conversation.id,
          artefactId: segment.artefactId,
        })
      }
    >
      <span className="spin" aria-hidden />
      {status === 'streaming' ? 'Building' : 'Opened'} <code>{segment.title}</code>
      <span className="toolchip-meta"> · {segment.artefactType}</span>
    </button>
  );
}

function SegmentFlow({
  message,
  conversation,
}: {
  message: ChatMessage;
  conversation: Conversation;
}) {
  const segments = message.segments ?? [];
  const activities = message.activities ?? [];
  const nonActivity = segments.filter((segment) => segment.kind !== 'activity');
  const showWorklog = activities.length > 0;

  return (
    <>
      {showWorklog && (
        <Worklog
          activities={activities}
          streaming={message.streaming === true}
          totalMs={message.stats?.timings.totalMs}
          summary={message.worklogSummary}
        />
      )}
      {(message.toolChips ?? []).map((chip) => (
        <span key={`${chip.tool}-${chip.arg}`} className="toolchip done">
          <span className="spin" aria-hidden />
          Called <code>{chip.tool}</code>
          <span className="toolchip-meta"> · {chip.arg}</span>
          <span className="ms num">{chip.ms}ms</span>
        </span>
      ))}
      {message.bodyHtml !== undefined && message.bodyHtml !== '' ? (
        <div
          className="assistant-html"
          dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
        />
      ) : (
        <>
          {nonActivity.length === 0 && !showWorklog && (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
          {nonActivity.map((segment, index) => {
            if (segment.kind === 'text') {
              return (
                <p key={`text-${index}`} className="whitespace-pre-wrap">
                  {segment.text}
                  {message.streaming === true && index === nonActivity.length - 1 && (
                    <span className="cursor" aria-hidden />
                  )}
                </p>
              );
            }
            return (
              <ArtefactChip
                key={segment.artefactId}
                segment={segment}
                conversation={conversation}
              />
            );
          })}
        </>
      )}
      {message.bodyHtml !== undefined &&
        nonActivity
          .filter((segment) => segment.kind === 'artefact')
          .map((segment) =>
            segment.kind === 'artefact' ? (
              <ArtefactChip
                key={segment.artefactId}
                segment={segment}
                conversation={conversation}
              />
            ) : null,
          )}
    </>
  );
}

function AttachmentTags({ message }: { message: ChatMessage }) {
  const names = message.attachmentNames ?? [];
  if (names.length === 0) return null;
  return (
    <span className="mb-attach">
      {names.map((name) => (
        <span key={name} className="tag">
          📄 {name}
        </span>
      ))}
    </span>
  );
}

function Bubble({
  message,
  conversation,
  tier,
}: {
  message: ChatMessage;
  conversation: Conversation;
  tier: string;
}) {
  const isUser = message.role === 'user';
  return (
    <div className={`msg ${isUser ? 'user' : 'assistant'}`}>
      <div className="who-ico" aria-hidden>
        {isUser ? 'JH' : 'P'}
      </div>
      <div className="bubble">
        <div className="name">
          {isUser ? 'You' : 'Protean'}
          {!isUser && (
            <span className="name-tier">
              {' '}
              · {tier.charAt(0).toUpperCase() + tier.slice(1)} tier
            </span>
          )}
        </div>
        <div className="body">
          {isUser && <AttachmentTags message={message} />}
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <SegmentFlow message={message} conversation={conversation} />
          )}
          {!isUser &&
            message.streaming === true &&
            message.content === '' &&
            (message.activities ?? []).length === 0 &&
            message.bodyHtml === undefined && (
              <p className="waiting" role="status">
                Waiting for first token…
              </p>
            )}
          {!isUser && (message.cite?.length ?? 0) > 0 && (
            <div className="cite">
              Sources:{' '}
              {message.cite!.map((source, index) => (
                <span key={source}>
                  {index > 0 && ' · '}
                  <a href="#" onClick={(event) => event.preventDefault()}>
                    {source}
                  </a>
                </span>
              ))}
              <InfoHint hintKey="turnStats" />
            </div>
          )}
        </div>
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
      <div className="chat-scroll">
        <div className="empty">
          <div className="ei" aria-hidden>
            ✎
          </div>
          <h3>{SHELL_EMPTY_COPY.title}</h3>
          <p>{SHELL_EMPTY_COPY.body}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-scroll" aria-live="polite">
      <div className="thread">
        {conversation.messages.map((message) => (
          <Bubble
            key={message.id}
            message={message}
            conversation={conversation}
            tier={state.settings.tier}
          />
        ))}
        {conversation.status === 'error' && conversation.errorMessage !== undefined && (
          <div className="banner error" role="alert">
            <strong>The turn failed.</strong> {conversation.errorMessage}
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
