import { useState } from 'react';
import { InfoHint } from '../components/InfoHint';
import { AdminResultPanel } from './AdminResultPanel';
import {
  ingestPdf,
  ingestUrl,
  proposeChunkMetadata,
  proposePackDraft,
  saveKnowledgeCollection,
  verifyChunkFidelity,
  type ChunkFidelityReport,
  type ChunkProposal,
  type ExtractedPageDraft,
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

/** A completeness check is inherently per-source (its own chunks against its own raw pages), so a
 * multi-source collection keeps one entry per source rather than one report clobbering the last. */
interface FidelityCheckEntry {
  sourceLabel: string;
  report: ChunkFidelityReport | null;
  error: string | null;
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * "Build from documents" (Phase P, extended for URL-sourced ingestion) --
 * upload PDF(s) and/or paste source URLs (e.g. citations from a research
 * chat turn), let the model propose headings/summaries strictly from each
 * chunk's own real text, review every proposal against its literal source
 * excerpt, then save only what's accepted. Nothing reaches the
 * collection/pack/embeddings until the final explicit save -- this screen is
 * the human-review guardrail itself, for however many sources feed into it.
 */
export function DocumentAuthoringFlow({
  onDraftPackReady,
  onDone,
}: {
  onDraftPackReady: (draft: PackDraftProposal, collectionId: string) => void;
  onDone: () => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ChunkReview[]>([]);
  const [busy, setBusy] = useState<'uploading' | 'fetching-url' | 'proposing-chunks' | 'proposing-pack' | 'saving' | null>(
    null,
  );
  const [checkingFidelity, setCheckingFidelity] = useState(false);
  const [result, setResult] = useState<ProviderAdminResult | null>(null);
  const [fidelityChecks, setFidelityChecks] = useState<FidelityCheckEntry[]>([]);
  const [collectionId, setCollectionId] = useState('');
  const [collectionDisplayName, setCollectionDisplayName] = useState('');
  const [packDraft, setPackDraft] = useState<PackDraftProposal | null>(null);
  const [urlInput, setUrlInput] = useState('');

  /** Names the collection from the FIRST source only -- returns whether a name is now set. */
  const maybeNameCollection = (sourceLabel: string, alreadyNamed: boolean): boolean => {
    if (alreadyNamed) return true;
    setFileName(sourceLabel);
    const base = sourceLabel.replace(/\.pdf$/i, '');
    setCollectionDisplayName(base);
    setCollectionId(slugify(base));
    return true;
  };

  /** Appends one source's chunks to the running review list and runs its own completeness check. */
  const applyIngestOutcome = async (
    outcome: { chunks: KnowledgeChunkDraft[]; pages: ExtractedPageDraft[] },
    sourceLabel: string,
  ) => {
    setReviews((prev) => [
      ...prev,
      ...outcome.chunks.map((chunk) => ({ chunk, heading: chunk.heading, summary: '', included: true })),
    ]);
    setCheckingFidelity(true);
    try {
      const fidelity = await verifyChunkFidelity(outcome.pages, outcome.chunks);
      setFidelityChecks((prev) => [
        ...prev,
        { sourceLabel, report: fidelity.ok ? fidelity.report : null, error: fidelity.ok ? null : fidelity.message },
      ]);
    } catch (cause) {
      setFidelityChecks((prev) => [
        ...prev,
        { sourceLabel, report: null, error: cause instanceof Error ? cause.message : String(cause) },
      ]);
    } finally {
      setCheckingFidelity(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    setBusy('uploading');
    setResult(null);
    try {
      const base64 = await fileToBase64(file);
      const outcome = await ingestPdf(file.name, base64);
      if (!outcome.ok) {
        setResult({ ok: false, message: outcome.message, log: outcome.log });
        return;
      }
      maybeNameCollection(file.name, fileName !== null);
      setResult({ ok: true, message: outcome.message, log: outcome.log });
      setBusy(null);
      await applyIngestOutcome(outcome, file.name);
      return;
    } catch (cause) {
      setResult({ ok: false, message: cause instanceof Error ? cause.message : String(cause), log: [] });
    }
    setBusy(null);
  };

  const handleFetchUrls = async () => {
    const urls = urlInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (urls.length === 0) return;
    setBusy('fetching-url');
    setResult(null);
    let named = fileName !== null;
    let successCount = 0;
    const log: string[] = [];
    for (const url of urls) {
      try {
        const outcome = await ingestUrl(url);
        if (!outcome.ok) {
          log.push(`"${url}": ${outcome.message}`);
          continue;
        }
        named = maybeNameCollection(url, named);
        successCount += 1;
        log.push(outcome.message);
        await applyIngestOutcome(outcome, url);
      } catch (cause) {
        log.push(`"${url}": ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    }
    setUrlInput('');
    setBusy(null);
    setResult({ ok: successCount > 0, message: `Fetched ${successCount} of ${urls.length} URL(s) successfully.`, log });
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
  const locked = busy !== null || checkingFidelity;

  return (
    <fieldset>
      <legend>
        Build from documents <InfoHint hintKey="domainPackBuildFromDocuments" />
      </legend>
      <p className="banner info" role="status">
        Every heading/summary below is proposed by the model from that chunk's own real text only —
        review each against its source excerpt. Nothing saves until you click "Save collection."
      </p>

      <div className="protean-settings-advanced">
        <label>
          {reviews.length === 0 ? 'Upload a PDF' : 'Add another source (PDF)'}{' '}
          <InfoHint hintKey="domainPackBuildFromDocuments" />
        </label>
        <input type="file" accept="application/pdf,.pdf" onChange={(event) => void handleUpload(event)} disabled={locked} />

        <label>
          {reviews.length === 0 ? 'Or paste source URL(s)' : 'Or paste more source URL(s)'} — one per line{' '}
          <InfoHint hintKey="domainPackIngestUrl" />
        </label>
        <textarea
          rows={3}
          value={urlInput}
          onChange={(event) => setUrlInput(event.target.value)}
          placeholder={'https://www.legislation.qld.gov.au/...\nhttps://www.racgp.org.au/...'}
          disabled={locked}
        />
        <div className="protean-settings-row">
          <button type="button" className="btn-ghost" onClick={() => void handleFetchUrls()} disabled={locked || urlInput.trim() === ''}>
            {busy === 'fetching-url' ? 'Fetching…' : 'Fetch URL(s)'}
          </button>
        </div>
      </div>

      {result !== null && <AdminResultPanel result={result} />}

      {checkingFidelity && (
        <p className="banner info" role="status">
          Running a completeness check — comparing the extracted chunks against the real source text…
        </p>
      )}
      {fidelityChecks.map((entry, index) => (
        <div key={`${entry.sourceLabel}-${index}`}>
          {entry.error !== null && (
            <p className="banner error" role="alert">
              Completeness check for "{entry.sourceLabel}" failed: {entry.error}. Review its chunks below
              extra carefully before saving — this check did not run.
            </p>
          )}
          {entry.report !== null && entry.report.verdict === 'clean' && (
            <p className="banner success" role="status">
              Completeness check for "{entry.sourceLabel}" passed — every chunk traces back to the source
              text, nothing appears missing or added. <InfoHint hintKey="chunkFidelityCheck" />
            </p>
          )}
          {entry.report !== null && entry.report.verdict === 'issues-found' && (
            <div className="banner error" role="alert">
              <div>
                <p>
                  <strong>Completeness check for "{entry.sourceLabel}" found possible issues</strong> —
                  review these against the source excerpts below before saving.{' '}
                  <InfoHint hintKey="chunkFidelityCheck" />
                </p>
                {entry.report.missingFacts.length > 0 && (
                  <>
                    <p className="detail">Possibly missing from the chunks (present in the source):</p>
                    <ul>
                      {entry.report.missingFacts.map((fact) => (
                        <li key={fact}>{fact}</li>
                      ))}
                    </ul>
                  </>
                )}
                {entry.report.suspiciousAdditions.length > 0 && (
                  <>
                    <p className="detail">In the chunks but not found in the source:</p>
                    <ul>
                      {entry.report.suspiciousAdditions.map((addition) => (
                        <li key={addition}>{addition}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

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
                  <label>Source</label>
                  <p className="detail">
                    {review.chunk.sourceTitle} · <span className="mono">{review.chunk.sourceUrl}</span>
                  </p>
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
                pack editor for final review before saving. It will already reference the collection
                you just saved.
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
                <button
                  type="button"
                  className="pill on"
                  disabled={!collectionIdValid}
                  onClick={() => onDraftPackReady(packDraft, collectionId)}
                >
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
