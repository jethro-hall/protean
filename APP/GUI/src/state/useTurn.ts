import { useCallback } from 'react';
import { streamTurn, type Attachment } from '../lib/api';
import { activeConversation } from './appState';
import { useAppDispatch, useAppState } from './useAppStore';

/** One in-flight turn's abort handle per conversation — ephemeral UI wiring, not app state. */
const activeTurnAborts = new Map<string, AbortController>();

function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError';
}

/** Stop the active conversation's in-flight turn, if any (Stop button in Composer). */
export function useStopTurn(): () => void {
  const state = useAppState();
  return useCallback(() => {
    const conversationId = activeConversation(state).id;
    activeTurnAborts.get(conversationId)?.abort();
  }, [state]);
}

/** Send the user's input (plus any attached files) as a turn and stream the reply in. */
export function useSendTurn(): (input: string, attachments?: Attachment[]) => void {
  const state = useAppState();
  const dispatch = useAppDispatch();

  return useCallback(
    (input: string, attachments?: Attachment[]) => {
      const conversation = activeConversation(state);
      const conversationId = conversation.id;
      const messageId = crypto.randomUUID();
      dispatch({
        type: 'userMessage',
        conversationId,
        message: {
          id: crypto.randomUUID(),
          role: 'user',
          content: input,
          ...(attachments !== undefined && attachments.length > 0
            ? { attachmentNames: attachments.map((file) => file.name) }
            : {}),
        },
      });
      dispatch({ type: 'assistantStart', conversationId, messageId });

      const controller = new AbortController();
      activeTurnAborts.set(conversationId, controller);

      void streamTurn({
        input,
        sessionId: conversationId,
        domainId: state.settings.domainId,
        tier: state.settings.tier,
        ...(attachments !== undefined && attachments.length > 0 ? { attachments } : {}),
        grounded: state.settings.grounded,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'text') {
            dispatch({ type: 'assistantDelta', conversationId, messageId, text: event.text });
          } else if (event.type === 'activity-start') {
            dispatch({
              type: 'activityStart',
              conversationId,
              messageId,
              activityId: event.activityId,
              kind: event.kind,
              label: event.label,
            });
          } else if (event.type === 'activity-delta') {
            dispatch({
              type: 'activityDelta',
              conversationId,
              messageId,
              activityId: event.activityId,
              text: event.text,
            });
          } else if (event.type === 'activity-end') {
            dispatch({ type: 'activityEnd', conversationId, messageId, activityId: event.activityId });
          } else if (event.type === 'artefact-start') {
            dispatch({
              type: 'artefactStart',
              conversationId,
              messageId,
              artefactId: event.artefactId,
              artefactType: event.artefactType,
              title: event.title,
            });
          } else if (event.type === 'artefact-delta') {
            dispatch({
              type: 'artefactDelta',
              conversationId,
              artefactId: event.artefactId,
              text: event.text,
            });
          } else if (event.type === 'artefact-end') {
            dispatch({
              type: 'artefactEnd',
              conversationId,
              artefactId: event.artefactId,
              complete: event.complete,
              savedPath: event.savedPath,
            });
          } else if (event.type === 'done') {
            dispatch({ type: 'assistantDone', conversationId, messageId, stats: event });
          } else {
            dispatch({ type: 'turnError', conversationId, messageId, message: event.message });
          }
        },
      })
        .catch((cause: unknown) => {
          if (isAbortError(cause)) {
            dispatch({ type: 'assistantStopped', conversationId, messageId });
          } else {
            const message = cause instanceof Error ? cause.message : String(cause);
            dispatch({ type: 'turnError', conversationId, messageId, message });
          }
        })
        .finally(() => {
          if (activeTurnAborts.get(conversationId) === controller) {
            activeTurnAborts.delete(conversationId);
          }
        });
    },
    [state, dispatch],
  );
}
