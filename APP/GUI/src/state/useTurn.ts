import { useCallback } from 'react';
import { streamTurn } from '../lib/api';
import { useAppDispatch, useAppState, activeConversation } from './store';

/** Send the user's input as a turn on the active conversation and stream the reply in. */
export function useSendTurn(): (input: string) => void {
  const state = useAppState();
  const dispatch = useAppDispatch();

  return useCallback(
    (input: string) => {
      const conversation = activeConversation(state);
      const conversationId = conversation.id;
      const messageId = crypto.randomUUID();
      dispatch({
        type: 'userMessage',
        conversationId,
        message: { id: crypto.randomUUID(), role: 'user', content: input },
      });
      dispatch({ type: 'assistantStart', conversationId, messageId });

      void streamTurn({
        input,
        sessionId: conversationId,
        domainId: state.settings.domainId,
        tier: state.settings.tier,
        onEvent: (event) => {
          if (event.type === 'text') {
            dispatch({ type: 'assistantDelta', conversationId, messageId, text: event.text });
          } else if (event.type === 'artefact-start') {
            dispatch({
              type: 'artefactStart',
              conversationId,
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
      }).catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        dispatch({ type: 'turnError', conversationId, messageId, message });
      });
    },
    [state, dispatch],
  );
}
