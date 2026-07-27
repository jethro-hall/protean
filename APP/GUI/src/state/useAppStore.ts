import { useContext, type Dispatch } from 'react';
import type { Action, AppState } from './appState';
import { DispatchContext, StateContext } from './appStateContext';

/** Hooks only — no component exports, so Fast Refresh stays compatible. */
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
