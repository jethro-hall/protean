import { useState } from 'react';
import { InfoHint } from '../components/InfoHint';
import { AdminResultPanel } from './AdminResultPanel';
import {
  ingestPdf,
  proposeChunkMetadata,
  proposePackDraft,
  saveKnowledgeCollection,
  verifyChunkFidelity,
  type ChunkFidelityReport,
  type ChunkProposal,
  type KnowledgeChunkDraft,
  type PackDraftProposal,
  type ProviderAdminResult,
} from '../lib/api';

interface ChunkReview {
  chunk: KnowledgeChunkDraft;
  heading: string;
  summary: string;
  included: boolean;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:application/pdf;base64,XXXX -- strip the prefix
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * "Build from documents" (Phase P) -- upload PDF(s), let the model propose
 * headings/summaries strictly from each chunk's own real text, review every
 * proposal against its literal source excerpt, then save only what's
 * accepted. Nothing reaches the collection/pack/embeddings until the final
 * explicit save -- this screen is the human-review guardrail itself.
 */
export function DocumentAuthoringFlow({
  onDraftPackReady,
  onDone,
}: {
  onDraftPackReady: (draft: PackDraftProposal) => void;
  onDone: () => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ChunkReview[]>([]);
  const [busy, setBusy] = useState<
    'uploading' | 'checking-fidelity' | 'proposing-chunks' | 'proposing-pack' | 'saving' | null
  >(null);
  const [result, setResult] = useState<ProviderAdminResult | null>(null);
  const [fidelityReport, setFidelityReport] = useState<ChunkFidelityReport | null>(null);
  const [fidelityError, setFidelityError] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState('');
  const [collectionDisplayName, setCollectionDisplayName] = useState('');
  const [packDraft, setPackDraft] = useState<PackDraftProposal | null>(null);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    setBusy('uploading');
    setResult(null);
    setFidelityReport(null);
    setFidelityError(null);
    let ingestOutcome: Awaited<ReturnType<typeof ingestPdf>> | null = null;
    try {
      const base64 = await fileToBase64(file);
      const outcome = await ingestPdf(file.name, base64);
      ingestOutcome = outcome;
      if (!outcome.ok) {
        setResult({ ok: false, message: outcome.message, log: outcome.log });
        return;
      }
      setFileName(file.name);
      setCollectionDisplayName(file.name.replace(/\.pdf$/i, ''));
      setCollectionId(
        file.name
          .replace(/\.pdf$/i, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, ''),
      );
      setReviews(
        outcome.chunks.map((chunk) => ({ chunk, heading: chunk.heading, summary: '', included: true })),
      );
      setResult({ ok: true, message: outcome.message, log: outcome.log });
    } catch (cause) {
      setResult({ ok: false, message: cause instanceof Error ? cause.message : String(cause), log: [] });
    } finally {
      setBusy(null);
    }
    if (ingestOutcome === null || !ingestOutcome.ok) return;

    // LLM oversight check (owner-directed) -- runs automatically, before the
    // human reviews anything, comparing the deterministic chunks against the
    // real source text. Best-effort: a failed check is shown, never silent,
    // but never blocks the review screen either (Law 1: degrade, don't hide).
    setBusy('checking-fidelity');
    try {
      const outcome = await verifyChunkFidelity(ingestOutcome.pages, ingestOutcome.chunks);
      if (outcome.ok && outcome.report !== null) {
        setFidelityReport(outcome.report);
      } else {
        setFidelityError(outcome.message);
      }
    } catch (cause) {
      setFidelityError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const handleProposeChunks = async () => {
    setBusy('proposing-chunks');
    setResult(null);
    try {
      const outcome = await proposeChunkMetadata(reviews.map((review) => review.chunk));
      if (!outcome.ok) {
        setResult({ ok: false, message: outcome.message, log: outcome.log });
        return;
      }
      const byId = new Map<string, ChunkProposal>(outcome.proposals.map((proposal) => [proposal.chunkId, proposal]));
      setReviews((prev) =>
        prev.map((review) => {
          const proposal = byId.get(review.chunk.id);
          return proposal !== undefined
            ? { ...review, heading: proposal.heading, summary: proposal.summary }
            : review;
        }),
      );
      setResult({ ok: true, message: outcome.message, log: outcome.log });
    } catch (cause) {
      setResult({ ok: false, message: cause instanceof Error ? cause.message : String(cause), log: [] });
    } finally {
      setBusy(null);
    }
  };

  const handleProposePack = async () => {
    setBusy('proposing-pack');
    setResult(null);
    try {
      const included = reviews.filter((review) => review.included);
      const outcome = await proposePackDraft(
        fileName ?? 'Uploaded document',
        included.map((review) => ({ heading: review.heading, summary: review.summary || review.heading })),
      );
      if (!outcome.ok || outcome.draft === null) {
        setResult({ ok: false, message: outcome.message, log: outcome.log });
        return;
      }
      setPackDraft(outcome.draft);
      setResult({ ok: true, message: outcome.message, log: outcome.log });
    } catch (cause) {
      setResult({ ok: false, message: cause instanceof Error ? cause.message : String(cause), log: [] });
    } finally {
      setBusy(null);
    }
  };

  const handleSaveCollection = async () => {
    setBusy('saving');
    setResult(null);
    try {
      const included = reviews.filter((review) => review.included);
      const chunks: KnowledgeChunkDraft[] = included.map((review) => ({
        ...review.chunk,
        heading: review.heading,
      }));
      const outcome = await saveKnowledgeCollection(collectionId, collectionDisplayName, chunks);
      setResult({ ok: outcome.ok, message: outcome.message, log: outcome.log });
    } catch (cause) {
      setResult({ ok: false, message: cause instanceof Error ? cause.message : String(cause), log: [] });
    } finally {
      setBusy(null);
    }
  };

  const collectionIdValid = /^[a-z0-9-]+$/.test(collectionId);
  const includedCount = reviews.filter((review) => review.included).length;

  return (
    <fieldset>
      <legend>
        Build from documents <InfoHint hintKey="domainPackBuildFromDocuments" />
      </legend>
      <p className="banner info" role="status">
        Every heading/summary below is proposed by the model from that chunk's own real text only —
        review each against its source excerpt. Nothing saves until you click "Save collection."
      </p>

      {fileName === null && (
        <div className="protean-settings-advanced">
          <label>
            Upload a PDF <InfoHint hintKey="domainPackBuildFromDocuments" />
          </label>
          <input type="file" accept="application/pdf,.pdf" onChange={(event) => void handleUpload(event)} disabled={busy !== null} />
        </div>
      )}

      {result !== null && <AdminResultPanel result={result} />}

      {busy === 'checking-fidelity' && (
        <p className="banner info" role="status">
          Running a completeness check — comparing the extracted chunks against the real source text…
        </p>
      )}
      {fidelityError !== null && (
        <p className="banner error" role="alert">
          Completeness check failed: {fidelityError}. Review the chunks below extra carefully before
          saving — this check did not run.
        </p>
      )}
      {fidelityReport !== null && fidelityReport.verdict === 'clean' && (
        <p className="banner success" role="status">
          Completeness check passed — every chunk traces back to the source text, nothing appears
          missing or added. <InfoHint hintKey="chunkFidelityCheck" />
        </p>
      )}
      {fidelityReport !== null && fidelityReport.verdict === 'issues-found' && (
        <div className="banner error" role="alert">
          <div>
            <p>
              <strong>Completeness check found possible issues</strong> — review these against the
              source excerpts below before saving. <InfoHint hintKey="chunkFidelityCheck" />
            </p>
            {fidelityReport.missingFacts.length > 0 && (
              <>
                <p className="detail">Possibly missing from the chunks (present in the source):</p>
                <ul>
                  {fidelityReport.missingFacts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              </>
            )}
            {fidelityReport.suspiciousAdditions.length > 0 && (
              <>
                <p className="detail">In the chunks but not found in the source:</p>
                <ul>
                  {fidelityReport.suspiciousAdditions.map((addition) => (
                    <li key={addition}>{addition}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {reviews.length > 0 && (
        <>
          <div className="protean-settings-row">
            <button type="button" className="btn-ghost" onClick={() => void handleProposeChunks()} disabled={busy !== null}>
              {busy === 'proposing-chunks' ? 'Proposing…' : 'Propose headings & summaries'}
            </button>
          </div>

          <div className="protean-settings-col">
            {reviews.map((review, index) => (
              <div key={review.chunk.id} className="protean-settings-provider-row protean-settings-row-top">
                <label className="protean-settings-checkbox">
                  <input
                    type="checkbox"
                    checked={review.included}
                    onChange={(event) =>
                      setReviews((prev) =>
                        prev.map((r, i) => (i === index ? { ...r, included: event.target.checked } : r)),
                      )
                    }
                  />
                </label>
                <div className="meta protean-settings-advanced">
                  <label>Heading</label>
                  <input
                    type="text"
                    value={review.heading}
                    onChange={(event) =>
                      setReviews((prev) => prev.map((r, i) => (i === index ? { ...r, heading: event.target.value } : r)))
                    }
                  />
                  <label>Summary (model-proposed, from this chunk only)</label>
                  <input
                    type="text"
                    placeholder="Click 'Propose headings & summaries' above"
                    value={review.summary}
                    onChange={(event) =>
                      setReviews((prev) => prev.map((r, i) => (i === index ? { ...r, summary: event.target.value } : r)))
                    }
                  />
                  <label>Source excerpt (real extracted text — verify against this)</label>
                  <p className="detail whitespace-pre-wrap">{review.chunk.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="protean-settings-advanced">
            <label>Collection id</label>
            <input type="text" value={collectionId} onChange={(event) => setCollectionId(event.target.value)} />
            {!collectionIdValid && (
              <p className="banner error" role="alert">
                Collection id must be lowercase letters/digits/- only.
              </p>
            )}
            <label>Collection display name</label>
            <input type="text" value={collectionDisplayName} onChange={(event) => setCollectionDisplayName(event.target.value)} />
          </div>

          <div className="protean-settings-row">
            <button
              type="button"
              className="pill on"
              disabled={busy !== null || !collectionIdValid || includedCount === 0}
              onClick={() => void handleSaveCollection()}
            >
              {busy === 'saving' ? 'Saving…' : `Save collection (${includedCount} chunk${includedCount === 1 ? '' : 's'})`}
            </button>
            <button type="button" className="btn-ghost" onClick={() => void handleProposePack()} disabled={busy !== null || includedCount === 0}>
              {busy === 'proposing-pack' ? 'Proposing…' : 'Also propose a pack draft'}
            </button>
          </div>

          {packDraft !== null && (
            <div className="protean-settings-advanced">
              <p className="banner info" role="status">
                Pack draft proposed from the reviewed sections above — click below to open it in the
                pack editor for final review before saving.
              </p>
              <label>Display name</label>
              <p className="detail">{packDraft.displayName}</p>
              <label>System prompt</label>
              <p className="detail whitespace-pre-wrap">{packDraft.systemPrompt}</p>
              <label>Vocabulary</label>
              <p className="detail">
                {Object.entries(packDraft.vocabulary)
                  .map(([term, meaning]) => `${term}: ${meaning}`)
                  .join(' · ')}
              </p>
              <div className="protean-settings-row">
                <button type="button" className="pill on" onClick={() => onDraftPackReady(packDraft)}>
                  Open in pack editor
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="protean-settings-row">
        <button type="button" className="btn-ghost" onClick={onDone} disabled={busy !== null}>
          Done
        </button>
      </div>
    </fieldset>
  );
}
