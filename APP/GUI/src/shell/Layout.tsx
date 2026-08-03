import {
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ChatPane } from '../panes/ChatPane';
import { ConversationsRail } from '../panes/ConversationsRail';
import { PreviewPane } from '../panes/PreviewPane';
import { activeConversation } from '../state/appState';
import { useAppDispatch, useAppState } from '../state/useAppStore';
import { SettingsMenu } from './SettingsMenu';
import { TopbarTelemetry } from './TopbarTelemetry';
import { useMediaQuery } from './useMediaQuery';

const MOBILE_LAYOUT_QUERY = '(max-width: 760px)';

function PreviewResizeHandle({ currentWidth }: { currentWidth: number }) {
  const dispatch = useAppDispatch();
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  return (
    <div
      role="separator"
      aria-label="Resize preview pane"
      aria-orientation="vertical"
      className="protean-resize"
      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
        drag.current = { startX: event.clientX, startWidth: currentWidth };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
        if (drag.current === null) return;
        dispatch({
          type: 'setPreviewWidth',
          width: drag.current.startWidth + (drag.current.startX - event.clientX),
        });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    />
  );
}

/** Three-pane shell (C1/C2/C15) — matches design prototype chrome; live behaviour preserved. */
export function Layout() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMobile = useMediaQuery(MOBILE_LAYOUT_QUERY);
  const previousIsMobile = useRef<boolean | null>(null);
  const previewOpen = state.previewOpen;
  const railOpen = state.railOpen;
  const hasArtefacts = activeConversation(state).artefacts.length > 0;

  useEffect(() => {
    const firstRender = previousIsMobile.current === null;
    const enteredMobile = previousIsMobile.current === false && isMobile;
    if ((firstRender || enteredMobile) && isMobile && previewOpen && !hasArtefacts) {
      dispatch({ type: 'togglePreview' });
    }
    previousIsMobile.current = isMobile;
  }, [dispatch, hasArtefacts, isMobile, previewOpen]);

  const toggleRail = () => {
    if (isMobile && previewOpen) {
      dispatch({ type: 'togglePreview' });
    }
    dispatch({ type: 'toggleRail' });
  };

  const togglePreview = () => {
    if (isMobile && railOpen) {
      dispatch({ type: 'toggleRail' });
    }
    dispatch({ type: 'togglePreview' });
  };

  return (
    <div
      className={['app', previewOpen ? '' : 'preview-collapsed'].filter(Boolean).join(' ')}
      style={
        previewOpen
          ? ({ '--preview-w': `${state.previewWidth}px` } as CSSProperties)
          : undefined
      }
    >
      <header className="topbar">
        <button
          type="button"
          className="gear rail-toggle"
          aria-label="Toggle conversations"
          onClick={toggleRail}
        >
          ☰
        </button>
        <span className="brand">
          <span className="mark" aria-hidden />
          Protean{' '}
          <small>· {state.settings.domainId}</small>
        </span>
        <span className="spacer" />
        <TopbarTelemetry />
        <div className="top-actions">
          <SettingsMenu />
          <button
            type="button"
            className="gear"
            aria-label="Toggle preview pane"
            aria-pressed={previewOpen}
            title="Toggle preview pane"
            onClick={togglePreview}
          >
            ▥
          </button>
        </div>
      </header>

      {railOpen && (
        <button
          type="button"
          className="scrim rail-scrim"
          aria-label="Close conversations"
          onClick={toggleRail}
        />
      )}

      <aside className={`rail${railOpen ? ' open' : ''}`} aria-label="Conversations">
        <ConversationsRail />
      </aside>

      <ChatPane />

      <aside
        className={`preview${previewOpen ? ' open' : ''}`}
        aria-label="Preview"
        hidden={!previewOpen}
      >
        {previewOpen && (
          <>
            <button
              type="button"
              className="scrim preview-scrim"
              aria-label="Close preview"
              onClick={togglePreview}
            />
            <PreviewResizeHandle currentWidth={state.previewWidth} />
            <PreviewPane />
          </>
        )}
      </aside>
    </div>
  );
}
