import { SHELL_OPERATOR } from '../config/shell';
import { useAppDispatch, useAppState } from '../state/useAppStore';

/** C3 conversations rail — real sessions only (no design-demo fixtures). */
export function ConversationsRail() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const pinned = state.conversations.flatMap((conversation) =>
    conversation.artefacts
      .filter((artefact) => artefact.status === 'complete')
      .map((artefact) => ({
        conversationId: conversation.id,
        artefactId: artefact.id,
        title: artefact.title,
      })),
  );

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
      </div>

      <div className="conv-list">
        <div className="rail-label">Recent</div>
        {state.conversations.map((conversation) => {
          const artefactCount = conversation.artefacts.length;
          return (
            <button
              key={conversation.id}
              type="button"
              data-conv={conversation.id}
              className={`conv${conversation.id === state.activeId ? ' active' : ''}`}
              aria-current={conversation.id === state.activeId ? 'true' : undefined}
              onClick={() => dispatch({ type: 'selectConversation', id: conversation.id })}
            >
              <span className="title">{conversation.title}</span>
              <span className="meta">
                <span className={`tag domain-${state.settings.domainId}`}>
                  {state.settings.domainId}
                </span>
                <span>
                  {conversation.messages.length === 0
                    ? 'Ready'
                    : conversation.status === 'idle'
                      ? `${conversation.messages.length} msg`
                      : conversation.status}
                </span>
                {artefactCount > 0 && (
                  <span className="clip" title={`${artefactCount} artefact(s)`}>
                    📎 {artefactCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}

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
