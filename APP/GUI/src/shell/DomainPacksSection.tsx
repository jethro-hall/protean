import { useEffect, useRef, useState } from 'react';
import { InfoHint } from '../components/InfoHint';
import {
  deleteDomainPackOverride,
  fetchDomainPackDetail,
  fetchDomains,
  fetchKnowledgeCollections,
  fetchMcpConnectors,
  importDomainPackJson,
  saveDomainPack,
  NEW_DOMAIN_PACK_TEMPLATE,
  type CatalogConnectorEntry,
  type DomainPackDetail,
  type DomainSummary,
  type KnowledgeCollectionSummary,
  type ModelTier,
  type PackDraftProposal,
} from '../lib/api';
import { DocumentAuthoringFlow } from './DocumentAuthoringFlow';

const TIERS: Array<{ id: ModelTier; label: string }> = [
  { id: 'fast', label: 'Fast' },
  { id: 'strong', label: 'Strong' },
];

/** Key/value rows for the pack's `vocabulary` map — add/edit/remove terms. */
function VocabularyEditor({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const entries = Object.entries(value);
  return (
    <div className="protean-settings-col">
      {entries.map(([term, meaning], index) => (
        <div key={index} className="protean-settings-row">
          <input
            type="text"
            placeholder="Term"
            value={term}
            onChange={(event) => {
              const next = { ...value };
              delete next[term];
              next[event.target.value] = meaning;
              onChange(next);
            }}
          />
          <input
            type="text"
            placeholder="Meaning"
            value={meaning}
            onChange={(event) => onChange({ ...value, [term]: event.target.value })}
          />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              const next = { ...value };
              delete next[term];
              onChange(next);
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="btn-ghost" onClick={() => onChange({ ...value, '': '' })}>
        + Add term
      </button>
    </div>
  );
}

function JsonMapEditor({
  label,
  hintKey,
  value,
  onChange,
}: {
  label: string;
  hintKey: string;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <label>
        {label} <InfoHint hintKey={hintKey} />
      </label>
      <textarea
        className="protean-settings-json-editor"
        spellCheck={false}
        value={text}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          try {
            const parsed: unknown = JSON.parse(raw);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
              setError('Must be a JSON object.');
              return;
            }
            setError(null);
            onChange(parsed as Record<string, unknown>);
          } catch (cause) {
            setError(`Invalid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
          }
        }}
      />
      {error !== null && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function PackEditor({
  initial,
  isNew,
  onSaved,
  onCancel,
}: {
  initial: DomainPackDetail;
  isNew: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<DomainPackDetail>(initial);
  const [catalog, setCatalog] = useState<Record<string, CatalogConnectorEntry>>({});
  const [collections, setCollections] = useState<KnowledgeCollectionSummary[]>([]);
  const [busy, setBusy] = useState<'saving' | 'resetting' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMcpConnectors()
      .then((data) => setCatalog(data.catalog))
      .catch(() => setCatalog({}));
    fetchKnowledgeCollections()
      .then(setCollections)
      .catch(() => setCollections([]));
  }, []);

  const idValid = /^[a-z0-9-]+$/.test(form.id);
  const canSave = idValid && form.displayName.trim() !== '' && form.systemPrompt.trim() !== '';

  const toggleTool = (toolId: string): void => {
    setForm((prev) => ({
      ...prev,
      tools: prev.tools.includes(toolId) ? prev.tools.filter((t) => t !== toolId) : [...prev.tools, toolId],
    }));
  };

  const toggleCollection = (collectionId: string): void => {
    setForm((prev) => {
      const has = prev.knowledgeCollections.includes(collectionId);
      const knowledgeCollections = has
        ? prev.knowledgeCollections.filter((c) => c !== collectionId)
        : [...prev.knowledgeCollections, collectionId];
      const knowledgeCollectionWeights = { ...prev.knowledgeCollectionWeights };
      if (has) delete knowledgeCollectionWeights[collectionId];
      else knowledgeCollectionWeights[collectionId] = knowledgeCollectionWeights[collectionId] ?? 1;
      return { ...prev, knowledgeCollections, knowledgeCollectionWeights };
    });
  };

  const setWeight = (collectionId: string, weight: number): void => {
    setForm((prev) => ({
      ...prev,
      knowledgeCollectionWeights: { ...prev.knowledgeCollectionWeights, [collectionId]: weight },
    }));
  };

  const handleSave = async () => {
    setBusy('saving');
    setError(null);
    try {
      await saveDomainPack(form);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const handleReset = async () => {
    setBusy('resetting');
    setError(null);
    try {
      await deleteDomainPackOverride(form.id);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="protean-settings-advanced">
      <label>
        Id <InfoHint hintKey="domainPackId" />
      </label>
      <input
        type="text"
        placeholder="my-custom-pack"
        value={form.id}
        disabled={!isNew}
        onChange={(event) => setForm((prev) => ({ ...prev, id: event.target.value }))}
      />
      {!idValid && (
        <p className="banner error" role="alert">
          Id must be lowercase letters/digits/- only.
        </p>
      )}

      <label>Display name</label>
      <input
        type="text"
        placeholder="My Custom Pack"
        value={form.displayName}
        onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
      />

      <label>Version</label>
      <input
        type="text"
        placeholder="0.1.0"
        value={form.version}
        onChange={(event) => setForm((prev) => ({ ...prev, version: event.target.value }))}
      />

      <label>
        System prompt <InfoHint hintKey="domainPackSystemPrompt" />
      </label>
      <textarea
        className="protean-settings-json-editor"
        value={form.systemPrompt}
        onChange={(event) => setForm((prev) => ({ ...prev, systemPrompt: event.target.value }))}
      />

      <label>Vocabulary</label>
      <VocabularyEditor
        value={form.vocabulary}
        onChange={(vocabulary) => setForm((prev) => ({ ...prev, vocabulary }))}
      />

      <label>
        Tools <InfoHint hintKey="domainPackTools" />
      </label>
      <div className="protean-settings-col">
        {Object.entries(catalog).map(([id, entry]) => (
          <label key={id} className="protean-settings-checkbox">
            <input type="checkbox" checked={form.tools.includes(id)} onChange={() => toggleTool(id)} />
            <span>
              {id} <span className="detail">— {entry.description}</span>
            </span>
          </label>
        ))}
        {Object.keys(catalog).length === 0 && (
          <p className="banner info" role="status">
            No connectors in the catalog yet — add one under the Tools tab first.
          </p>
        )}
      </div>

      <label>
        Knowledge collections &amp; weights <InfoHint hintKey="domainPackKnowledgeWeight" />
      </label>
      <div className="protean-settings-col">
        {collections.map((collection) => {
          const checked = form.knowledgeCollections.includes(collection.id);
          return (
            <div key={collection.id} className="protean-settings-row">
              <label className="protean-settings-checkbox">
                <input type="checkbox" checked={checked} onChange={() => toggleCollection(collection.id)} />
                <span>{collection.displayName}</span>
              </label>
              {checked && (
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  aria-label={`Weight for ${collection.displayName}`}
                  value={form.knowledgeCollectionWeights[collection.id] ?? 1}
                  onChange={(event) => {
                    const parsed = Number.parseFloat(event.target.value);
                    if (Number.isFinite(parsed) && parsed > 0) setWeight(collection.id, parsed);
                  }}
                />
              )}
            </div>
          );
        })}
        {collections.length === 0 && (
          <p className="banner info" role="status">
            No knowledge collections available.
          </p>
        )}
      </div>

      <JsonMapEditor
        label="Output templates"
        hintKey="domainPackOutputTemplates"
        value={form.outputTemplates}
        onChange={(outputTemplates) =>
          setForm((prev) => ({ ...prev, outputTemplates: outputTemplates as Record<string, string> }))
        }
      />

      <JsonMapEditor
        label="Validation"
        hintKey="domainPackValidation"
        value={form.validation}
        onChange={(validation) => setForm((prev) => ({ ...prev, validation }))}
      />

      <label>
        Model tiers <InfoHint hintKey="modelTier" />
      </label>
      <div className="protean-settings-row">
        <span className="cf-item">Default</span>
        {TIERS.map((tier) => (
          <button
            key={tier.id}
            type="button"
            className={`pill${form.tiers.default === tier.id ? ' on' : ''}`}
            aria-pressed={form.tiers.default === tier.id}
            onClick={() => setForm((prev) => ({ ...prev, tiers: { ...prev.tiers, default: tier.id } }))}
          >
            <span className="dot" aria-hidden />
            {tier.label}
          </button>
        ))}
      </div>
      <div className="protean-settings-row">
        <span className="cf-item">Cheap path</span>
        {TIERS.map((tier) => (
          <button
            key={tier.id}
            type="button"
            className={`pill${form.tiers.cheapPath === tier.id ? ' on' : ''}`}
            aria-pressed={form.tiers.cheapPath === tier.id}
            onClick={() => setForm((prev) => ({ ...prev, tiers: { ...prev.tiers, cheapPath: tier.id } }))}
          >
            <span className="dot" aria-hidden />
            {tier.label}
          </button>
        ))}
      </div>

      {error !== null && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}

      <div className="protean-settings-row">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy !== null}>
          Cancel
        </button>
        {!isNew && (
          <button type="button" className="btn-ghost" onClick={() => void handleReset()} disabled={busy !== null}>
            {busy === 'resetting' ? 'Resetting…' : 'Reset to default'}
          </button>
        )}
        <button
          type="button"
          className="pill on"
          disabled={!canSave || busy !== null}
          onClick={() => void handleSave()}
        >
          {busy === 'saving' ? 'Saving…' : 'Save pack'}
        </button>
      </div>
    </div>
  );
}

export function DomainPacksSection() {
  const [packs, setPacks] = useState<DomainSummary[] | 'loading' | 'unavailable'>('loading');
  const [editing, setEditing] = useState<DomainPackDetail | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [authoring, setAuthoring] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[] | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const reload = () => {
    fetchDomains()
      .then(setPacks)
      .catch(() => setPacks('unavailable'));
  };

  useEffect(reload, []);

  const openEdit = async (id: string) => {
    setLoadError(null);
    setImportWarnings(null);
    try {
      const detail = await fetchDomainPackDetail(id);
      setIsNew(false);
      setEditing(detail);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    setImportBusy(true);
    setLoadError(null);
    setImportWarnings(null);
    try {
      const raw = await file.text();
      const result = await importDomainPackJson(file.name, raw);
      if (!result.ok || result.pack === null) {
        setLoadError(result.message);
        return;
      }
      setIsNew(true);
      setEditing(result.pack);
      setImportWarnings(result.warnings);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setImportBusy(false);
    }
  };

  const openNew = (draft?: PackDraftProposal) => {
    setLoadError(null);
    setImportWarnings(null);
    setIsNew(true);
    setAuthoring(false);
    setEditing(
      draft === undefined
        ? NEW_DOMAIN_PACK_TEMPLATE
        : { ...NEW_DOMAIN_PACK_TEMPLATE, displayName: draft.displayName, systemPrompt: draft.systemPrompt, vocabulary: draft.vocabulary },
    );
  };

  const closeEditor = (didSave: boolean) => {
    setEditing(null);
    setImportWarnings(null);
    if (didSave) reload();
  };

  if (authoring) {
    return (
      <DocumentAuthoringFlow
        onDraftPackReady={(draft) => openNew(draft)}
        onDone={() => {
          setAuthoring(false);
          reload();
        }}
      />
    );
  }

  if (editing !== null) {
    return (
      <fieldset>
        <legend>
          {isNew ? 'New domain pack' : `Editing ${editing.id}`} <InfoHint hintKey="domainPack" />
        </legend>
        {importWarnings !== null && importWarnings.length > 0 && (
          <div className="banner error" role="alert">
            <div>
              <p>
                <strong>Imported as a draft — {importWarnings.length} note(s) to check before saving:</strong>{' '}
                <InfoHint hintKey="domainPackImport" />
              </p>
              <ul>
                {importWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {importWarnings !== null && importWarnings.length === 0 && (
          <p className="banner success" role="status">
            Imported cleanly — every field mapped, nothing to review.
          </p>
        )}
        <PackEditor
          key={editing.id || 'new'}
          initial={editing}
          isNew={isNew}
          onSaved={() => closeEditor(true)}
          onCancel={() => closeEditor(false)}
        />
      </fieldset>
    );
  }

  return (
    <fieldset>
      <legend>
        Domain packs <InfoHint hintKey="domainPack" />
      </legend>
      <p className="banner info" role="status">
        Editing a built-in pack (finance/medical/generic) creates a personal override — the
        checked-in pack stays untouched, and "Reset to default" removes your override.
      </p>

      {loadError !== null && (
        <p className="banner error" role="alert">
          {loadError}
        </p>
      )}
      {packs === 'loading' && (
        <p className="banner info" role="status">
          Loading domain packs…
        </p>
      )}
      {packs === 'unavailable' && (
        <p className="banner error" role="alert">
          Engine unreachable — domain packs unavailable.
        </p>
      )}
      {Array.isArray(packs) && (
        <div className="protean-settings-col">
          {packs.map((pack) => (
            <div key={pack.id} className="protean-settings-provider-row">
              <div className="meta">
                <div className="label">{pack.displayName}</div>
                <div className="detail">
                  {pack.id} · v{pack.version}
                </div>
              </div>
              <button type="button" className="btn-ghost" onClick={() => void openEdit(pack.id)}>
                Edit
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="protean-settings-row">
        <button type="button" className="btn-ghost" onClick={() => openNew()}>
          + New pack
        </button>
        <button type="button" className="btn-ghost" onClick={() => setAuthoring(true)}>
          + Build from documents
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={importBusy}
          onClick={() => importFileInputRef.current?.click()}
        >
          {importBusy ? 'Importing…' : '+ Import from JSON'}
        </button>
        <InfoHint hintKey="domainPackImport" />
        <input
          ref={importFileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void handleImportFile(event)}
        />
      </div>
    </fieldset>
  );
}
