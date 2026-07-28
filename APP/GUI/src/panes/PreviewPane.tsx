import { InfoHint } from '../components/InfoHint';
import { activeConversation, type Artefact } from '../state/appState';
import { useAppDispatch, useAppState } from '../state/useAppStore';

function artefactLabels(artefacts: Artefact[]): Map<string, string> {
  const totals = new Map<string, number>();
  for (const artefact of artefacts) {
    totals.set(artefact.title, (totals.get(artefact.title) ?? 0) + 1);
  }
  const running = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const artefact of artefacts) {
    const version = (running.get(artefact.title) ?? 0) + 1;
    running.set(artefact.title, version);
    labels.set(
      artefact.id,
      (totals.get(artefact.title) ?? 1) > 1 ? `${artefact.title} · v${version}` : artefact.title,
    );
  }
  return labels;
}

function contentSizeLabel(content: string): string {
  const kb = content.length / 1024;
  return kb >= 1 ? `${kb.toFixed(1)} KB` : `${content.length} chars`;
}

/** C8 Preview pane — live artefacts; truthful status. */
export function PreviewPane() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const conversation = activeConversation(state);
  const labels = artefactLabels(conversation.artefacts);
  const artefact =
    conversation.artefacts.find((candidate) => candidate.id === conversation.activeArtefactId) ??
    conversation.artefacts.at(-1);

  return (
    <>
      <div className="preview-head">
        <span className="ptitle">
          Live preview
          <InfoHint hintKey="previewPane" />
        </span>
        <span className="spacer" />
        {artefact !== undefined && <StatusBadge status={artefact.status} />}
        <button
          type="button"
          className="gear"
          aria-label="Close preview"
          onClick={() => dispatch({ type: 'togglePreview' })}
        >
          ×
        </button>
      </div>
      {conversation.artefacts.length > 1 && (
        <nav className="preview-tabs" aria-label="Artefacts">
          {conversation.artefacts.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={`pill${candidate.id === artefact?.id ? ' on' : ''}`}
              onClick={() =>
                dispatch({
                  type: 'selectArtefact',
                  conversationId: conversation.id,
                  artefactId: candidate.id,
                })
              }
            >
              {labels.get(candidate.id) ?? candidate.title}
            </button>
          ))}
        </nav>
      )}
      <div className="preview-body">
        {artefact === undefined ? (
          <div className="empty-preview">
            <p>
              No artefacts in this conversation yet. Ask for a document, table, or page and it will
              build here live.
            </p>
          </div>
        ) : (
          <ArtefactView artefact={artefact} label={labels.get(artefact.id) ?? artefact.title} />
        )}
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: Artefact['status'] }) {
  const label =
    status === 'streaming' ? 'Building…' : status === 'complete' ? 'Complete' : 'Incomplete';
  const tone =
    status === 'streaming' ? 'info' : status === 'complete' ? 'ok' : 'warn';
  return <span className={`tag status-${tone}`}>{label}</span>;
}

function ArtefactView({ artefact, label }: { artefact: Artefact; label: string }) {
  return (
    <div className="paper">
      <div className="doc-meta">
        <strong>{label}</strong>
        <span className="meta-line">
          <span className="eyebrow">{artefact.artefactType}</span> ·{' '}
          <span className="num">{contentSizeLabel(artefact.content)}</span>
          {artefact.status === 'streaming' && ' · still streaming'}
        </span>
      </div>
      <div className="doc">
        {artefact.artefactType === 'html' ? (
          <iframe title={artefact.title} sandbox="" srcDoc={artefact.content} />
        ) : (
          <pre className="mono">{artefact.content}</pre>
        )}
      </div>
      {artefact.savedPath !== null && (
        <p className="saved-path" title={artefact.savedPath}>
          Saved: {artefact.savedPath}
        </p>
      )}
    </div>
  );
}
