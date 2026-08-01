import { useEffect, useState } from 'react';
import { InfoHint } from '../components/InfoHint';
import { AdminResultPanel } from './AdminResultPanel';
import {
  deleteProvider,
  fetchProviders,
  listProviderModels,
  saveProvider,
  testProvider,
  type ProviderAdminResult,
  type ProviderDraftConfig,
  type ProviderSummary,
  type ProviderType,
} from '../lib/api';

const PROVIDER_TYPES: Array<{ id: ProviderType; label: string }> = [
  { id: 'anthropic', label: 'Anthropic direct' },
  { id: 'bedrock', label: 'AWS Bedrock' },
  { id: 'openai-compatible', label: 'OpenAI-compatible' },
];

function draftIsComplete(type: ProviderType, form: FormState): boolean {
  if (form.label.trim() === '') return false;
  if (type === 'anthropic') return form.apiKey.trim() !== '';
  if (type === 'bedrock') return form.awsRegion.trim() !== '' && form.bearerToken.trim() !== '';
  return form.baseUrl.trim() !== '' && form.apiKey.trim() !== '';
}

function draftConfig(type: ProviderType, form: FormState): ProviderDraftConfig {
  if (type === 'anthropic') return { type, apiKey: form.apiKey.trim() };
  if (type === 'bedrock') return { type, awsRegion: form.awsRegion.trim(), bearerToken: form.bearerToken.trim() };
  return { type, baseUrl: form.baseUrl.trim(), apiKey: form.apiKey.trim() };
}

interface FormState {
  label: string;
  apiKey: string;
  awsRegion: string;
  bearerToken: string;
  baseUrl: string;
}

const EMPTY_FORM: FormState = { label: '', apiKey: '', awsRegion: '', bearerToken: '', baseUrl: '' };

export function ProvidersModelsSection() {
  const [providers, setProviders] = useState<ProviderSummary[] | 'loading' | 'unavailable'>('loading');
  const [type, setType] = useState<ProviderType>('anthropic');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState<'testing' | 'listing' | 'saving' | null>(null);
  const [result, setResult] = useState<ProviderAdminResult | null>(null);
  const [rowResult, setRowResult] = useState<{ id: string; result: ProviderAdminResult } | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);

  const reload = () => {
    fetchProviders()
      .then(setProviders)
      .catch(() => setProviders('unavailable'));
  };

  useEffect(reload, []);

  const complete = draftIsComplete(type, form);

  const handleTest = async () => {
    setBusy('testing');
    setResult(null);
    try {
      setResult(await testProvider(draftConfig(type, form)));
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : String(error), log: [] });
    } finally {
      setBusy(null);
    }
  };

  const handleListModels = async () => {
    setBusy('listing');
    setResult(null);
    setSelectedModel(undefined);
    try {
      setResult(await listProviderModels(draftConfig(type, form)));
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : String(error), log: [] });
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    setBusy('saving');
    try {
      await saveProvider({
        label: form.label.trim(),
        config: draftConfig(type, form),
        ...(selectedModel !== undefined ? { model: selectedModel } : {}),
      });
      setForm(EMPTY_FORM);
      setResult(null);
      setSelectedModel(undefined);
      reload();
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : String(error), log: [] });
    } finally {
      setBusy(null);
    }
  };

  const handleRowTest = async (id: string) => {
    setRowBusy(id);
    setRowResult(null);
    try {
      setRowResult({ id, result: await testProvider({ id }) });
    } catch (error) {
      setRowResult({ id, result: { ok: false, message: error instanceof Error ? error.message : String(error), log: [] } });
    } finally {
      setRowBusy(null);
    }
  };

  const handleRowDelete = async (id: string) => {
    setRowBusy(id);
    try {
      await deleteProvider(id);
      reload();
    } catch (error) {
      setRowResult({ id, result: { ok: false, message: error instanceof Error ? error.message : String(error), log: [] } });
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <fieldset>
      <legend>
        Providers &amp; models <InfoHint hintKey="providersModels" />
      </legend>

      <div className="protean-settings-segmented">
        {PROVIDER_TYPES.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`pill${type === option.id ? ' on' : ''}`}
            aria-pressed={type === option.id}
            onClick={() => {
              setType(option.id);
              setResult(null);
            }}
          >
            <span className="dot" aria-hidden />
            {option.label}
          </button>
        ))}
      </div>

      <div className="protean-settings-advanced">
        <label>
          Label <InfoHint hintKey="providerLabel" />
        </label>
        <input
          type="text"
          placeholder="e.g. My Claude account"
          value={form.label}
          onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
        />

        {type === 'anthropic' && (
          <>
            <label>
              API key <InfoHint hintKey="providerApiKey" />
            </label>
            <input
              type="password"
              placeholder="sk-ant-..."
              value={form.apiKey}
              onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
            />
          </>
        )}

        {type === 'bedrock' && (
          <>
            <label>
              AWS region <InfoHint hintKey="providerAwsRegion" />
            </label>
            <input
              type="text"
              placeholder="us-east-1"
              value={form.awsRegion}
              onChange={(event) => setForm((prev) => ({ ...prev, awsRegion: event.target.value }))}
            />
            <label>
              Bedrock API key (bearer token) <InfoHint hintKey="providerBearerToken" />
            </label>
            <input
              type="password"
              placeholder="ABSK..."
              value={form.bearerToken}
              onChange={(event) => setForm((prev) => ({ ...prev, bearerToken: event.target.value }))}
            />
          </>
        )}

        {type === 'openai-compatible' && (
          <>
            <label>
              Base URL <InfoHint hintKey="providerBaseUrl" />
            </label>
            <input
              type="url"
              placeholder="https://your-endpoint.example.com/v1"
              value={form.baseUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
            />
            <label>
              API key <InfoHint hintKey="providerApiKey" />
            </label>
            <input
              type="password"
              placeholder="sk-..."
              value={form.apiKey}
              onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
            />
          </>
        )}

        <div className="protean-settings-row">
          <button
            type="button"
            className="btn-ghost"
            disabled={!complete || busy !== null}
            onClick={() => void handleTest()}
          >
            {busy === 'testing' ? 'Testing…' : 'Test connection'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!complete || busy !== null}
            onClick={() => void handleListModels()}
          >
            {busy === 'listing' ? 'Listing…' : 'List available models'}
          </button>
          <button
            type="button"
            className="pill on"
            disabled={!complete || busy !== null}
            onClick={() => void handleSave()}
          >
            {busy === 'saving' ? 'Saving…' : selectedModel !== undefined ? `Save provider (${selectedModel})` : 'Save provider'}
          </button>
        </div>

        {result !== null && <AdminResultPanel result={result} />}

        {result?.ok === true && result.models !== undefined && result.models.length > 0 && (
          <>
            <label>
              Model for the quick picker <InfoHint hintKey="providerModel" />
            </label>
            <select value={selectedModel ?? ''} onChange={(event) => setSelectedModel(event.target.value || undefined)}>
              <option value="">Don’t set one yet</option>
              {result.models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {providers === 'loading' && (
        <p className="banner info" role="status">
          Loading saved providers…
        </p>
      )}
      {providers === 'unavailable' && (
        <p className="banner error" role="alert">
          Engine unreachable — saved providers unavailable.
        </p>
      )}
      {Array.isArray(providers) && providers.length > 0 && (
        <div className="protean-settings-col">
          {providers.map((provider) => (
            <div key={provider.id} className="protean-settings-provider-row">
              <div className="meta">
                <div className="label">{provider.label}</div>
                <div className="detail">
                  {provider.type}
                  {provider.detail !== '' ? ` · ${provider.detail}` : ''} · {provider.secretRedacted}
                  {provider.model !== undefined ? ` · ${provider.model}` : ' · no model set'}
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost"
                disabled={rowBusy === provider.id}
                onClick={() => void handleRowTest(provider.id)}
              >
                {rowBusy === provider.id ? '…' : 'Test'}
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={rowBusy === provider.id}
                onClick={() => void handleRowDelete(provider.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
      {rowResult !== null && <AdminResultPanel result={rowResult.result} />}
    </fieldset>
  );
}
