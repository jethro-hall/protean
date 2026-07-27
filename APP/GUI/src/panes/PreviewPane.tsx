import { InfoHint } from '../components/InfoHint';
import { activeConversation, useAppDispatch, useAppState, type Artefact } from '../state/store';

/**
 * Preview pane — renders artefacts live as they stream from the engine
 * (ROADMAP Phase 3). HTML renders in a sandboxed iframe; everything else
 * shows as monospaced source. Status is always truthful.
 */
export function PreviewPane() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const conversation = activeConversation(state);
  const artefact =
    conversation.artefacts.find((candidate) => candidate.id === conversation.activeArtefactId) ??
    conversation.artefacts.at(-1);

  return (
    <aside aria-label="Preview" className="flex h-full flex-col bg-surface">
      <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Preview</h2>
        <InfoHint hintKey="previewPane" />
        {artefact !== undefined && <StatusBadge status={artefact.status} />}
      </div>
      {conversation.artefacts.length > 1 && (
        <nav aria-label="Artefacts" className="flex gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
          {conversation.artefacts.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() =>
                dispatch({
                  type: 'selectArtefact',
                  conversationId: conversation.id,
                  artefactId: candidate.id,
                })
              }
              className={`rounded px-2 py-1 text-xs whitespace-nowrap ${
                candidate.id === artefact?.id
                  ? 'bg-accent-blue-soft text-ink'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {candidate.title}
            </button>
          ))}
        </nav>
      )}
      {artefact === undefined ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <p className="max-w-[16rem] text-sm text-muted">
            No artefacts in this conversation yet. Ask for a document, table, or page and it will
            build here live.
          </p>
        </div>
      ) : (
        <ArtefactView artefact={artefact} />
      )}
    </aside>
  );
}

function StatusBadge({ status }: { status: Artefact['status'] }) {
  const label =
    status === 'streaming' ? 'Building\u2026' : status === 'complete' ? 'Complete' : 'Incomplete';
  return (
    <span
      className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${
        status === 'streaming'
          ? 'bg-accent-blue-soft text-accent-blue'
          : status === 'complete'
            ? 'bg-ok-soft text-ok'
            : 'bg-warn-soft text-warn'
      }`}
    >
      {label}
    </span>
  );
}

function ArtefactView({ artefact }: { artefact: Artefact }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline gap-2 border-b border-line px-4 py-2">
        <span className="truncate text-sm font-medium">{artefact.title}</span>
        <span className="text-[11px] text-muted uppercase">{artefact.artefactType}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {artefact.artefactType === 'html' ? (
          <iframe
            title={artefact.title}
            sandbox=""
            srcDoc={artefact.content}
            className="h-full w-full border-0 bg-white"
          />
        ) : (
          <pre className="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {artefact.content}
          </pre>
        )}
      </div>
      {artefact.savedPath !== null && (
        <div className="border-t border-line px-4 py-2">
          <p className="truncate text-[11px] text-muted" title={artefact.savedPath}>
            Saved: {artefact.savedPath}
          </p>
        </div>
      )}
    </div>
  );
}
