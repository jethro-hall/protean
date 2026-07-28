import { useState, type FormEvent } from 'react';
import { InfoHint } from '../components/InfoHint';
import { activeConversation, type Artefact } from '../state/appState';
import { useAppDispatch, useAppState } from '../state/useAppStore';
import { useSendTurn } from '../state/useTurn';

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

/** C8 Preview pane — live artefacts + steer bar (prototype). */
export function PreviewPane() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const sendTurn = useSendTurn();
  const [steer, setSteer] = useState('');
  const conversation = activeConversation(state);
  const labels = artefactLabels(conversation.artefacts);
  const artefact =
    conversation.artefacts.find((candidate) => candidate.id === conversation.activeArtefactId) ??
    conversation.artefacts.at(-1);
  const busy = ['waiting', 'streaming'].includes(conversation.status);

  const applySteer = (event: FormEvent) => {
    event.preventDefault();
    const text = steer.trim();
    if (text === '' || busy) return;
    setSteer('');
    sendTurn(`Steer the artefact: ${text}`);
  };

  return (
    <>
      <div className="preview-head">
        <span className="ptitle">
          Live preview
          <InfoHint hintKey="previewPane" />
        </span>
        <span className="spacer" />
        <div className="seg" role="tablist" aria-label="Preview mode">
          <button type="button" className="on">
            Artefact
          </button>
        </div>
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
      <form className="steer" onSubmit={applySteer}>
        <input
          value={steer}
          onChange={(event) => setSteer(event.target.value)}
          placeholder="Steer the artefact — “add a risks row”, “make it a chart”…"
          aria-label="Steer the artefact"
          disabled={busy || artefact === undefined}
        />
        <button className="go" type="submit" disabled={busy || artefact === undefined || steer.trim() === ''}>
          Apply
        </button>
        <InfoHint hintKey="previewPane" />
      </form>
    </>
  );
}

function StatusBadge({ status }: { status: Artefact['status'] }) {
  const label =
    status === 'streaming' ? 'Building…' : status === 'complete' ? 'Complete' : 'Incomplete';
  const tone = status === 'streaming' ? 'info' : status === 'complete' ? 'ok' : 'warn';
  return <span className={`tag status-${tone}`}>{label}</span>;
}

function ArtefactView({ artefact, label }: { artefact: Artefact; label: string }) {
  if (artefact.artefactType === 'html') {
    const srcDoc = `<!doctype html><html><head>
<meta charset="utf-8"/>
<link rel="stylesheet" href="/design/protean-design-system.css"/>
<style>body{margin:0;background:transparent;font-family:var(--font)}</style>
</head><body>${artefact.content}</body></html>`;
    return (
      <iframe
        className="artefact-frame"
        title={label}
        sandbox="allow-same-origin"
        srcDoc={srcDoc}
      />
    );
  }
  return (
    <div className="paper">
      <div className="doc-meta">
        <strong>{label}</strong>
        <span className="meta-line">
          <span className="eyebrow">{artefact.artefactType}</span>
          {artefact.status === 'streaming' && ' · still streaming'}
        </span>
      </div>
      <div className="doc">
        <pre className="mono">{artefact.content}</pre>
      </div>
    </div>
  );
}
