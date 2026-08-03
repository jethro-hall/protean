import { useEffect, useRef } from 'react';
import { SHELL_EMPTY_COPY } from '../config/shell';
import { ChatTimeline } from './ChatTimeline';
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
import { formatCostUsd, formatTokenCount } from '../lib/usage';

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

function ClarificationBox({
  segment,
  message,
}: {
  segment: Extract<MessageSegment, { kind: 'clarification' }>;
  message: ChatMessage;
}) {
  const clarification = (message.clarifications ?? []).find(
    (candidate) => candidate.id === segment.clarificationId,
  );
  if (clarification === undefined) return null;
  return (
    <div className="clarification-box" role="status">
      <span className="clarification-mark" aria-hidden>
        ?
      </span>
      <div>
        <p className="clarification-text">
          {clarification.text}
          {clarification.status === 'streaming' && <span className="cursor" aria-hidden />}
        </p>
        {clarification.status === 'complete' && (
          <p className="clarification-hint">Waiting for your answer — reply below to continue.</p>
        )}
        {clarification.status === 'incomplete' && (
          <p className="clarification-hint">[stream ended before the question finished]</p>
        )}
      </div>
    </div>
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
  const toolActivities = activities.filter((activity) => activity.kind === 'tool' && activity.done);

  return (
    <>
      {showWorklog && (
        <Worklog
          activities={activities}
          streaming={message.streaming === true}
          totalMs={message.stats?.timings.totalMs}
        />
      )}
      {toolActivities.map((activity) => (
        <span key={activity.id} className="toolchip done">
          <span className="spin" aria-hidden />
          Called <code>{activity.code ?? activity.label}</code>
          {activity.text !== '' && (
            <span className="toolchip-meta"> · {activity.text.slice(0, 80)}</span>
          )}
          {activity.durationMs !== undefined && activity.durationMs > 0 && (
            <span className="ms num">{activity.durationMs}ms</span>
          )}
        </span>
      ))}
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
        if (segment.kind === 'clarification') {
          return <ClarificationBox key={segment.clarificationId} segment={segment} message={message} />;
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
    <div className={`msg ${isUser ? 'user' : 'assistant'}`} data-chat-msg-id={message.id}>
      <div className="who-ico" aria-hidden>
        {isUser ? 'JH' : 'P'}
      </div>
      <div className="bubble">
        <div className="name">
          {isUser ? 'You' : 'Protean'}
          {!isUser && (
            <span className="name-tier">
              {' '}
              ·{' '}
              {message.stats !== undefined
                ? message.stats.model
                : `${tier.charAt(0).toUpperCase() + tier.slice(1)} tier`}
            </span>
          )}
          {!isUser && message.stats?.groundingConfidence !== undefined && (
            <span className={`grounding-badge ${message.stats.groundingConfidence}`}>
              grounding: {message.stats.groundingConfidence}
              <InfoHint hintKey="groundingConfidenceBadge" />
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
            (message.activities ?? []).length === 0 && (
              <p className="waiting" role="status">
                Waiting for first token…
              </p>
            )}
          {!isUser && message.stopped === true && (
            <p className="stopped-tag" role="status">
              [stopped]
            </p>
          )}
          {!isUser && (message.stats?.unverifiedCitationClaims?.length ?? 0) > 0 && (
            <p className="banner error fabrication-banner" role="alert">
              This answer claims a lookup ("
              {message.stats?.unverifiedCitationClaims?.join('", "')}") that no tool call this
              turn actually backs — treat the citation as unverified.
              <InfoHint hintKey="fabricationBanner" />
            </p>
          )}
          {!isUser && message.stats !== undefined && (
            <div className="cite">
              TTFT <span className="num">{message.stats.timings.ttftMs ?? '–'}</span> ms · total{' '}
              <span className="num">{message.stats.timings.totalMs ?? '–'}</span> ms ·{' '}
              {message.stats.cacheHit ? 'cache hit' : 'cache miss'}
              {message.stats.usage !== null && (
                <>
                  {' · '}
                  <span className="num">{formatTokenCount(message.stats.usage.inputTokens)}</span> in ·{' '}
                  <span className="num">{formatTokenCount(message.stats.usage.outputTokens)}</span> out
                  {message.stats.costUsd !== null && (
                    <>
                      {' · '}
                      <span className="num">{formatCostUsd(message.stats.costUsd)}</span>
                    </>
                  )}
                </>
              )}
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
  const scrollRef = useRef<HTMLDivElement>(null);

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
    <>
      <div className="chat-scroll" aria-live="polite" ref={scrollRef}>
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
      <ChatTimeline messages={conversation.messages} scrollRef={scrollRef} />
    </>
  );
}
