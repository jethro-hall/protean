import { InfoHint } from '../components/InfoHint';

/**
 * Preview pane — present per the 3-pane contract, honestly stubbed until the
 * live-artefact phase (ROADMAP Phase 3). No fake content, no fake spinner.
 */
export function PreviewPane() {
  return (
    <aside aria-label="Preview" className="flex h-full flex-col bg-surface">
      <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Preview</h2>
        <InfoHint hintKey="previewPane" />
      </div>
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="max-w-[16rem] text-sm text-muted">
          Live artefacts land here in a later phase. Nothing is being generated yet.
        </p>
      </div>
    </aside>
  );
}
