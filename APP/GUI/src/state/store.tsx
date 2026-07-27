import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import type { ActivityKind, ArtefactType, ModelTier, TurnDone } from '../lib/api';

/** One real working step of a turn (thinking, tool run, engine stage). */
export interface Activity {
  id: string;
  kind: ActivityKind;
  label: string;
  text: string;
  done: boolean;
}

export interface Artefact {
  id: string;
  artefactType: ArtefactType;
  title: string;
  content: string;
  status: 'streaming' | 'complete' | 'incomplete';
  savedPath: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Streaming truth (UX law: honest states). */
  streaming?: boolean;
  stats?: TurnDone;
  /** Names of files the user attached to this message. */
  attachmentNames?: string[];
  /** The turn's real working steps, shown Claude-Desktop-style above the answer. */
  activities?: Activity[];
}

export type ConversationStatus = 'idle' | 'waiting' | 'streaming' | 'error';

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  artefacts: Artefact[];
  activeArtefactId: string | null;
  status: ConversationStatus;
  errorMessage?: string;
}

export interface Settings {
  tier: ModelTier;
  domainId: string;
}

export interface AppState {
  conversations: Conversation[];
  activeId: string;
  settings: Settings;
  railOpen: boolean;
  previewOpen: boolean;
}

export type Action =
  | { type: 'newConversation' }
  | { type: 'selectConversation'; id: string }
  | { type: 'userMessage'; conversationId: string; message: ChatMessage }
  | { type: 'assistantStart'; conversationId: string; messageId: string }
  | { type: 'assistantDelta'; conversationId: string; messageId: string; text: string }
  | { type: 'assistantDone'; conversationId: string; messageId: string; stats: TurnDone }
  | {
      type: 'activityStart';
      conversationId: string;
      messageId: string;
      activityId: string;
      kind: ActivityKind;
      label: string;
    }
  | {
      type: 'activityDelta';
      conversationId: string;
      messageId: string;
      activityId: string;
      text: string;
    }
  | { type: 'activityEnd'; conversationId: string; messageId: string; activityId: string }
  | {
      type: 'artefactStart';
      conversationId: string;
      artefactId: string;
      artefactType: ArtefactType;
      title: string;
    }
  | { type: 'artefactDelta'; conversationId: string; artefactId: string; text: string }
  | {
      type: 'artefactEnd';
      conversationId: string;
      artefactId: string;
      complete: boolean;
      savedPath: string | null;
    }
  | { type: 'selectArtefact'; conversationId: string; artefactId: string }
  | { type: 'turnError'; conversationId: string; messageId: string; message: string }
  | { type: 'setTier'; tier: ModelTier }
  | { type: 'setDomain'; domainId: string }
  | { type: 'toggleRail' }
  | { type: 'togglePreview' };

const TITLE_MAX_CHARS = 44;

export function newConversationId(): string {
  return crypto.randomUUID();
}

function emptyConversation(): Conversation {
  return {
    id: newConversationId(),
    title: 'New conversation',
    messages: [],
    artefacts: [],
    activeArtefactId: null,
    status: 'idle',
  };
}

export function initialState(): AppState {
  const first = emptyConversation();
  return {
    conversations: [first],
    activeId: first.id,
    settings: { tier: 'fast', domainId: 'generic' },
    railOpen: false,
    previewOpen: false,
  };
}

function updateConversation(
  state: AppState,
  id: string,
  update: (conversation: Conversation) => Conversation,
): AppState {
  return {
    ...state,
    conversations: state.conversations.map((conversation) =>
      conversation.id === id ? update(conversation) : conversation,
    ),
  };
}

function updateArtefact(
  conversation: Conversation,
  artefactId: string,
  update: (artefact: Artefact) => Artefact,
): Conversation {
  return {
    ...conversation,
    artefacts: conversation.artefacts.map((artefact) =>
      artefact.id === artefactId ? update(artefact) : artefact,
    ),
  };
}

function updateMessage(
  conversation: Conversation,
  messageId: string,
  update: (message: ChatMessage) => ChatMessage,
): Conversation {
  return {
    ...conversation,
    messages: conversation.messages.map((message) =>
      message.id === messageId ? update(message) : message,
    ),
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'newConversation': {
      const conversation = emptyConversation();
      return {
        ...state,
        conversations: [conversation, ...state.conversations],
        activeId: conversation.id,
      };
    }
    case 'selectConversation':
      return { ...state, activeId: action.id, railOpen: false };
    case 'userMessage':
      return updateConversation(state, action.conversationId, (conversation) => ({
        ...conversation,
        title:
          conversation.messages.length === 0
            ? action.message.content.slice(0, TITLE_MAX_CHARS)
            : conversation.title,
        messages: [...conversation.messages, action.message],
        status: 'waiting',
        errorMessage: undefined,
      }));
    case 'assistantStart':
      return updateConversation(state, action.conversationId, (conversation) => ({
        ...conversation,
        messages: [
          ...conversation.messages,
          { id: action.messageId, role: 'assistant', content: '', streaming: true },
        ],
        status: 'waiting',
      }));
    case 'assistantDelta':
      return updateConversation(state, action.conversationId, (conversation) => ({
        ...updateMessage(conversation, action.messageId, (message) => ({
          ...message,
          content: message.content + action.text,
        })),
        status: 'streaming',
      }));
    case 'assistantDone':
      return updateConversation(state, action.conversationId, (conversation) => ({
        ...updateMessage(conversation, action.messageId, (message) => ({
          ...message,
          streaming: false,
          stats: action.stats,
        })),
        status: 'idle',
      }));
    case 'activityStart':
      return updateConversation(state, action.conversationId, (conversation) =>
        updateMessage(conversation, action.messageId, (message) => ({
          ...message,
          activities: [
            ...(message.activities ?? []),
            { id: action.activityId, kind: action.kind, label: action.label, text: '', done: false },
          ],
        })),
      );
    case 'activityDelta':
      return updateConversation(state, action.conversationId, (conversation) =>
        updateMessage(conversation, action.messageId, (message) => ({
          ...message,
          activities: (message.activities ?? []).map((activity) =>
            activity.id === action.activityId
              ? { ...activity, text: activity.text + action.text }
              : activity,
          ),
        })),
      );
    case 'activityEnd':
      return updateConversation(state, action.conversationId, (conversation) =>
        updateMessage(conversation, action.messageId, (message) => ({
          ...message,
          activities: (message.activities ?? []).map((activity) =>
            activity.id === action.activityId ? { ...activity, done: true } : activity,
          ),
        })),
      );
    case 'artefactStart': {
      const next = updateConversation(state, action.conversationId, (conversation) => ({
        ...conversation,
        artefacts: [
          ...conversation.artefacts,
          {
            id: action.artefactId,
            artefactType: action.artefactType,
            title: action.title,
            content: '',
            status: 'streaming' as const,
            savedPath: null,
          },
        ],
        activeArtefactId: action.artefactId,
      }));
      // an artefact starting is the one moment the preview pane opens itself
      return action.conversationId === state.activeId ? { ...next, previewOpen: true } : next;
    }
    case 'artefactDelta':
      return updateConversation(state, action.conversationId, (conversation) =>
        updateArtefact(conversation, action.artefactId, (artefact) => ({
          ...artefact,
          content: artefact.content + action.text,
        })),
      );
    case 'artefactEnd':
      return updateConversation(state, action.conversationId, (conversation) =>
        updateArtefact(conversation, action.artefactId, (artefact) => ({
          ...artefact,
          status: action.complete ? 'complete' : 'incomplete',
          savedPath: action.savedPath,
        })),
      );
    case 'selectArtefact':
      return {
        ...updateConversation(state, action.conversationId, (conversation) => ({
          ...conversation,
          activeArtefactId: action.artefactId,
        })),
        previewOpen: true,
      };
    case 'turnError':
      return updateConversation(state, action.conversationId, (conversation) => ({
        ...conversation,
        // drop the assistant placeholder if nothing streamed; keep partial output/steps honestly
        messages: conversation.messages
          .filter(
            (message) =>
              !(
                message.id === action.messageId &&
                message.content === '' &&
                (message.activities === undefined || message.activities.length === 0)
              ),
          )
          .map((message) =>
            message.id === action.messageId ? { ...message, streaming: false } : message,
          ),
        status: 'error',
        errorMessage: action.message,
      }));
    case 'setTier':
      return { ...state, settings: { ...state.settings, tier: action.tier } };
    case 'setDomain':
      return { ...state, settings: { ...state.settings, domainId: action.domainId } };
    case 'toggleRail':
      return { ...state, railOpen: !state.railOpen };
    case 'togglePreview':
      return { ...state, previewOpen: !state.previewOpen };
    default:
      return state;
  }
}

const StateContext = createContext<AppState | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useAppState(): AppState {
  const state = useContext(StateContext);
  if (state === null) throw new Error('useAppState outside AppStateProvider');
  return state;
}

export function useAppDispatch(): Dispatch<Action> {
  const dispatch = useContext(DispatchContext);
  if (dispatch === null) throw new Error('useAppDispatch outside AppStateProvider');
  return dispatch;
}

export function activeConversation(state: AppState): Conversation {
  const found = state.conversations.find((conversation) => conversation.id === state.activeId);
  if (found === undefined) throw new Error('active conversation missing');
  return found;
}
