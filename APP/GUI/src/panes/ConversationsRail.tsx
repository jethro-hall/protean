import { useAppDispatch, useAppState } from '../state/useAppStore';

export function ConversationsRail() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  return (
    <>
      <div className="rail-head">
        <button
          type="button"
          className="newchat"
          onClick={() => dispatch({ type: 'newConversation' })}
        >
          + New conversation
        </button>
      </div>
      <div className="eyebrow rail-label">Recent</div>
      <div className="conv-list">
        {state.conversations.map((conversation) => (
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
              {conversation.artefacts.length > 0
                ? `${conversation.artefacts.length} artefact${conversation.artefacts.length === 1 ? '' : 's'}`
                : conversation.status === 'idle'
                  ? 'Ready'
                  : conversation.status}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
