import { useAppDispatch, useAppState } from '../state/store';

export function ConversationsRail() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  return (
    <nav aria-label="Conversations" className="flex h-full flex-col bg-surface">
      <div className="p-3">
        <button
          type="button"
          onClick={() => dispatch({ type: 'newConversation' })}
          className="min-h-touch w-full rounded-xl border border-line px-3 text-left text-sm font-medium hover:border-accent-blue hover:text-accent-blue"
        >
          + New conversation
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 pb-2">
        {state.conversations.map((conversation) => (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => dispatch({ type: 'selectConversation', id: conversation.id })}
              aria-current={conversation.id === state.activeId ? 'true' : undefined}
              className={`min-h-touch w-full truncate rounded-lg px-3 py-2 text-left text-sm ${
                conversation.id === state.activeId
                  ? 'bg-bg font-medium text-ink'
                  : 'text-muted hover:bg-bg hover:text-ink'
              }`}
            >
              {conversation.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
