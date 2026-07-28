import { useEffect, useRef } from 'react';
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
      className="toolchip"
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
      <span style={{ color: 'var(--muted)' }}> · {segment.artefactType}</span>
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
  // Worklog once up-front (C6); then text / artefact chips in stream order (skip activity segments)
  const nonActivity = segments.filter((segment) => segment.kind !== 'activity');
  const showWorklog = activities.length > 0;

  return (
    <>
      {showWorklog && (
        <Worklog
          activities={activities}
          streaming={message.streaming === true}
          totalMs={message.stats?.timings.totalMs}
        />
      )}
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
          <ArtefactChip key={segment.artefactId} segment={segment} conversation={conversation} />
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

function TurnStats({ message }: { message: ChatMessage }) {
  if (message.stats === undefined) return null;
  const { timings, cacheHit } = message.stats;
  return (
    <div className="cite">
      TTFT <span className="num">{timings.ttftMs ?? '–'}</span> ms · total{' '}
      <span className="num">{timings.totalMs ?? '–'}</span> ms · {cacheHit ? 'cache hit' : 'cache miss'}
      <InfoHint hintKey="turnStats" />
    </div>
  );
}

function Bubble({ message, conversation }: { message: ChatMessage; conversation: Conversation }) {
  const isUser = message.role === 'user';
  return (
    <div className={`msg ${isUser ? 'user' : 'assistant'}`}>
      <div className="who-ico" aria-hidden>
        {isUser ? 'JH' : 'P'}
      </div>
      <div className="body">
        {isUser && <AttachmentTags message={message} />}
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <SegmentFlow message={message} conversation={conversation} />
        )}
        {message.streaming === true &&
          message.content === '' &&
          (message.activities ?? []).length === 0 && (
            <p className="waiting" role="status">
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
      <div className="chat-scroll">
        <div className="thread empty-hero">
          <h2>Protean</h2>
          <p>Ask anything. Answers stream in live, with the full turn recorded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-scroll" aria-live="polite">
      <div className="thread">
        {conversation.messages.map((message) => (
          <Bubble key={message.id} message={message} conversation={conversation} />
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
