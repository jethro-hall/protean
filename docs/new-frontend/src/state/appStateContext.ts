import { createContext, type Dispatch } from 'react';
import type { Action, AppState } from './appState';

/** Shared contexts — no components, so Fast Refresh never patches this file as a component module. */
export const StateContext = createContext<AppState | null>(null);
export const DispatchContext = createContext<Dispatch<Action> | null>(null);
