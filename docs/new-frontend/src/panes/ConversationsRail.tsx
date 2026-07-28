import { useAppDispatch, useAppState } from '../state/useAppStore';

export function ConversationsRail() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  return (
    <nav aria-label="Conversations" className="flex h-full flex-col bg-surface">
      <div className="p-3">
        <button
          type="button"
          onClick={() => dispatch({ type: 'newConversation' })}
          className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-accent-blue px-3 text-sm font-semibold text-surface shadow-sm transition hover:brightness-105 active:translate-y-px"
        >
          <span aria-hidden className="text-base leading-none">
            +
          </span>
          New conversation
        </button>
      </div>
      <div className="px-4 pb-1 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
          Recent
        </span>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 pb-2">
        {state.conversations.map((conversation) => (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => dispatch({ type: 'selectConversation', id: conversation.id })}
              aria-current={conversation.id === state.activeId ? 'true' : undefined}
              className={`min-h-touch w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                conversation.id === state.activeId
                  ? 'bg-accent-blue-soft font-medium text-ink'
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
