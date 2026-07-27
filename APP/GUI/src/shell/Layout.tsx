import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ChatPane } from '../panes/ChatPane';
import { ConversationsRail } from '../panes/ConversationsRail';
import { PreviewPane } from '../panes/PreviewPane';
import { useAppDispatch, useAppState } from '../state/useAppStore';
import { SettingsMenu } from './SettingsMenu';

/**
 * Drag handle on the preview pane's left edge (desktop). Pointer capture keeps
 * the drag alive even when the cursor crosses the preview iframe.
 */
function PreviewResizeHandle({ currentWidth }: { currentWidth: number }) {
  const dispatch = useAppDispatch();
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { startX: event.clientX, startWidth: currentWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current === null) return;
    dispatch({
      type: 'setPreviewWidth',
      width: drag.current.startWidth + (drag.current.startX - event.clientX),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div
      role="separator"
      aria-label="Resize preview pane"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="hidden w-1.5 shrink-0 cursor-col-resize touch-none bg-line transition-colors hover:bg-accent-blue active:bg-accent-blue md:block"
    />
  );
}

/**
 * Responsive contract (ARCHITECTURE §2): desktop = 3 columns; iPad = chat +
 * collapsible preview; mobile = chat full-width with rail/preview as drawers.
 */
export function Layout() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-line bg-surface px-3 py-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Toggle conversations"
            onClick={() => dispatch({ type: 'toggleRail' })}
            className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink lg:hidden"
          >
            ☰
          </button>
          <span className="text-sm font-semibold tracking-wide">
            Protean<span className="text-accent-orange">.</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Toggle preview pane"
            aria-pressed={state.previewOpen}
            onClick={() => dispatch({ type: 'togglePreview' })}
            className={`flex min-h-touch items-center rounded-lg px-3 text-sm ${
              state.previewOpen ? 'text-accent-blue' : 'text-muted hover:bg-bg hover:text-ink'
            }`}
          >
            Preview
          </button>
          <SettingsMenu />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Rail: static column on desktop, drawer below lg */}
        <div className="hidden w-rail shrink-0 border-r border-line lg:block">
          <ConversationsRail />
        </div>
        {state.railOpen && (
          <div className="absolute inset-0 z-20 flex lg:hidden">
            <div className="w-rail border-r border-line shadow-xl">
              <ConversationsRail />
            </div>
            <button
              type="button"
              aria-label="Close conversations"
              onClick={() => dispatch({ type: 'toggleRail' })}
              className="flex-1 bg-ink/30"
            />
          </div>
        )}

        <ChatPane />

        {/* Preview: ONE instance — resizable side column from md up, drawer
            below md (two mounts would mean duplicate live iframes) */}
        {state.previewOpen && (
          <div
            style={{ '--preview-w': `${state.previewWidth}px` } as CSSProperties}
            className="flex max-md:absolute max-md:inset-0 max-md:z-20 md:w-[var(--preview-w)] md:shrink-0"
          >
            <button
              type="button"
              aria-label="Close preview"
              onClick={() => dispatch({ type: 'togglePreview' })}
              className="flex-1 bg-ink/30 md:hidden"
            />
            <PreviewResizeHandle currentWidth={state.previewWidth} />
            <div className="min-w-0 border-l border-line max-md:w-[85%] max-md:shadow-xl md:flex-1 md:border-l-0">
              <PreviewPane />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
