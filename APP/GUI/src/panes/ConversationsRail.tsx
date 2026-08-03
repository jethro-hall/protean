import { useEffect, useState } from 'react';
import { InfoHint } from '../components/InfoHint';
import { SHELL_OPERATOR } from '../config/shell';
import { fetchSessionMessages, fetchSessions, type SessionSummary } from '../lib/api';
import { formatCostUsd, formatTokenCount, sumConversationUsage } from '../lib/usage';
import { matchesSessionQuery, parseSessionQuery, type SearchableSession } from '../lib/sessionQuery';
import type { ChatMessage, Conversation } from '../state/appState';
import { useAppDispatch, useAppState } from '../state/useAppStore';

interface ConversationRow {
  id: string;
  title: string;
  domainId: string;
  summary: SearchableSession;
  /** Present for a conversation already open in this tab; absent for a saved-but-not-open one. */
  open: Conversation | null;
}

function searchableFromConversation(conversation: Conversation, fallbackDomainId: string): SearchableSession {
  const usage = sumConversationUsage(conversation);
  return {
    id: conversation.id,
    title: conversation.title,
    domainId: conversation.domainId ?? fallbackDomainId,
    totalCostUsd: usage.costUsd ?? 0,
    totalInputTokens: usage.inputTokens,
    totalOutputTokens: usage.outputTokens,
    turnCount: conversation.messages.filter((message) => message.role === 'assistant').length,
  };
}

function searchableFromSummary(summary: SessionSummary): SearchableSession {
  return {
    id: summary.id,
    title: summary.title,
    domainId: summary.domainId,
    totalCostUsd: summary.totalCostUsd,
    totalInputTokens: summary.totalInputTokens,
    totalOutputTokens: summary.totalOutputTokens,
    turnCount: summary.turnCount,
  };
}

/** C3 conversations rail — every open tab in this session, plus every saved conversation (Phase 2 store), searchable. */
export function ConversationsRail() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [query, setQuery] = useState('');
  const [openError, setOpenError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions()
      .then((sessions) => dispatch({ type: 'setSavedSessions', sessions }))
      .catch(() => {
        /* saved list just stays empty until the next successful turn or a reload */
      });
  }, [dispatch]);

  const pinned = state.conversations.flatMap((conversation) =>
    conversation.artefacts
      .filter((artefact) => artefact.status === 'complete')
      .map((artefact) => ({
        conversationId: conversation.id,
        artefactId: artefact.id,
        title: artefact.title,
      })),
  );

  const openIds = new Set(state.conversations.map((conversation) => conversation.id));
  const rows: ConversationRow[] = [
    ...state.conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      domainId: conversation.domainId ?? state.settings.domainId,
      summary: searchableFromConversation(conversation, state.settings.domainId),
      open: conversation,
    })),
    ...state.savedSessions
      .filter((summary) => !openIds.has(summary.id))
      .map((summary) => ({
        id: summary.id,
        title: summary.title,
        domainId: summary.domainId,
        summary: searchableFromSummary(summary),
        open: null,
      })),
  ];

  const clauses = parseSessionQuery(query);
  const visibleRows =
    clauses.length === 0 ? rows : rows.filter((row) => matchesSessionQuery(row.summary, clauses));

  const openConversation = (row: ConversationRow): void => {
    if (row.open !== null) {
      dispatch({ type: 'selectConversation', id: row.id });
      return;
    }
    setOpenError(null);
    setOpeningId(row.id);
    fetchSessionMessages(row.id)
      .then((saved) => {
        const messages: ChatMessage[] = saved.map((message) => ({
          id: crypto.randomUUID(),
          role: message.role,
          content: message.content,
        }));
        dispatch({ type: 'openSavedSession', id: row.id, title: row.title, domainId: row.domainId, messages });
      })
      .catch((cause: unknown) => {
        setOpenError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setOpeningId(null));
  };

  return (
    <>
      <div className="rail-head">
        <button
          type="button"
          className="newchat"
          onClick={() => dispatch({ type: 'newConversation' })}
        >
          <span aria-hidden>+</span> New conversation
        </button>
        <div className="rail-search">
          <span className="rail-search-ico" aria-hidden>
            ⌕
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…  cost>0.05  domain=finance"
            aria-label="Search conversations"
          />
          <InfoHint hintKey="conversationSearch" direction="down" />
        </div>
      </div>

      {openError !== null && (
        <p className="banner error rail-open-error" role="alert">
          {openError}
        </p>
      )}

      <div className="conv-list">
        <div className="rail-label">
          {clauses.length > 0 ? `${visibleRows.length} match${visibleRows.length === 1 ? '' : 'es'}` : 'Recent'}
        </div>
        {visibleRows.map((row) => {
          const conversation = row.open;
          const isActive = conversation !== null && row.id === state.activeId;
          return (
            <button
              key={row.id}
              type="button"
              data-conv={row.id}
              className={`conv${isActive ? ' active' : ''}${conversation === null ? ' saved' : ''}`}
              aria-current={isActive ? 'true' : undefined}
              disabled={openingId === row.id}
              onClick={() => openConversation(row)}
            >
              <span className="title">{row.title}</span>
              <span className="meta">
                <span className={`tag domain-${row.domainId}`}>{row.domainId}</span>
                <span>
                  {openingId === row.id
                    ? 'Opening…'
                    : conversation === null
                      ? `${row.summary.turnCount} msg`
                      : conversation.messages.length === 0
                        ? 'Ready'
                        : conversation.status === 'idle'
                          ? `${conversation.messages.length} msg`
                          : conversation.status}
                </span>
                {row.summary.totalCostUsd > 0 && (
                  <span className="cost" title={`${formatTokenCount(row.summary.totalInputTokens + row.summary.totalOutputTokens)} tokens`}>
                    {formatCostUsd(row.summary.totalCostUsd)}
                  </span>
                )}
                {conversation !== null && conversation.artefacts.filter((a) => a.status === 'complete').length > 0 && (
                  <span className="clip" title={`${conversation.artefacts.length} artefact(s)`}>
                    📎 {conversation.artefacts.length}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        {visibleRows.length === 0 && (
          <p className="rail-empty">No conversations match "{query}".</p>
        )}

        {pinned.length > 0 && (
          <>
            <div className="rail-label rail-label-spaced">Pinned artefacts</div>
            {pinned.map((pin) => (
              <button
                key={pin.artefactId}
                type="button"
                className="pin"
                onClick={() => {
                  dispatch({ type: 'selectConversation', id: pin.conversationId });
                  dispatch({
                    type: 'selectArtefact',
                    conversationId: pin.conversationId,
                    artefactId: pin.artefactId,
                  });
                }}
              >
                <span className="ico" aria-hidden>
                  ▣
                </span>
                {pin.title}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="rail-foot">
        <span className="avatar" aria-hidden>
          {SHELL_OPERATOR.initials}
        </span>
        <span className="who">
          {SHELL_OPERATOR.displayName}
          <small>{SHELL_OPERATOR.orgLine}</small>
        </span>
      </div>
    </>
  );
}
