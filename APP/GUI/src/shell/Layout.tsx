import { ChatPane } from '../panes/ChatPane';
import { ConversationsRail } from '../panes/ConversationsRail';
import { PreviewPane } from '../panes/PreviewPane';
import { useAppDispatch, useAppState } from '../state/store';
import { SettingsMenu } from './SettingsMenu';

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

        {/* Preview: side column from md up, drawer on mobile */}
        {state.previewOpen && (
          <>
            <div className="hidden w-preview shrink-0 border-l border-line md:block">
              <PreviewPane />
            </div>
            <div className="absolute inset-0 z-20 flex md:hidden">
              <button
                type="button"
                aria-label="Close preview"
                onClick={() => dispatch({ type: 'togglePreview' })}
                className="flex-1 bg-ink/30"
              />
              <div className="w-[85%] border-l border-line shadow-xl">
                <PreviewPane />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
