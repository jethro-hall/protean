import { useReducer, type ReactNode } from 'react';
import { initialState, reducer } from './appState';
import { DispatchContext, StateContext } from './appStateContext';

/** Provider only — sole export so Vite Fast Refresh can remount it cleanly. */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  );
}
