import { useEffect, useState } from 'react';
import { InfoHint } from '../components/InfoHint';
import { AdminResultPanel } from './AdminResultPanel';
import {
  deleteMcpConnector,
  fetchMcpConnectors,
  saveMcpConnector,
  testMcpConnector,
  STDIO_MCP_TEMPLATE,
  type CatalogConnectorEntry,
  type McpOverlayEntry,
  type ProviderAdminResult,
  type StdioMcpConnectorEntry,
} from '../lib/api';

type ParsedEntry =
  | { ok: true; entry: StdioMcpConnectorEntry }
  | { ok: false; error: string };

/**
 * Light client-side shape check for fast feedback while typing -- the
 * authoritative validation is the server's zod schema, exercised on every
 * Test/Save call. This just catches obvious problems before a round trip.
 */
function parseStdioMcpJson(raw: string): ParsedEntry {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, error: 'Must be a JSON object.' };
  }
  const obj = value as Record<string, unknown>;
  if (obj.kind !== 'stdioMcp') {
    return { ok: false, error: '"kind" must be "stdioMcp" -- the only connector type addable here.' };
  }
  if (typeof obj.serverId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(obj.serverId)) {
    return { ok: false, error: '"serverId" is required and must be letters/digits/-/_ only.' };
  }
  if (typeof obj.command !== 'string' || obj.command.trim() === '') {
    return { ok: false, error: '"command" is required.' };
  }
  if (typeof obj.description !== 'string' || obj.description.trim() === '') {
    return { ok: false, error: '"description" is required.' };
  }
  const toolNames = obj.toolNames;
  if (!Array.isArray(toolNames) || toolNames.length === 0 || !toolNames.every((t) => typeof t === 'string')) {
    return { ok: false, error: '"toolNames" is required and must be a non-empty array of strings.' };
  }
  const args = Array.isArray(obj.args) ? (obj.args as string[]) : [];
  const envFrom = Array.isArray(obj.envFrom) ? (obj.envFrom as string[]) : [];
  const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : true;
  return {
    ok: true,
    entry: {
      kind: 'stdioMcp',
      serverId: obj.serverId,
      command: obj.command,
      args,
      envFrom,
      toolNames: toolNames as string[],
      description: obj.description,
      enabled,
    },
  };
}

function CatalogList({ catalog }: { catalog: Record<string, CatalogConnectorEntry> }) {
  const entries = Object.entries(catalog);
  if (entries.length === 0) return null;
  return (
    <div className="protean-settings-col">
      {entries.map(([id, entry]) => (
        <div key={id} className="protean-settings-provider-row">
          <div className="meta">
            <div className="label">{id}</div>
            <div className="detail">{entry.kind} · {entry.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function McpToolsSection() {
  const [catalog, setCatalog] = useState<Record<string, CatalogConnectorEntry>>({});
  const [overlay, setOverlay] = useState<McpOverlayEntry[] | 'loading' | 'unavailable'>('loading');
  const [connectorId, setConnectorId] = useState('myCustomTool');
  const [json, setJson] = useState(() => JSON.stringify(STDIO_MCP_TEMPLATE, null, 2));
  const [busy, setBusy] = useState<'testing' | 'saving' | null>(null);
  const [result, setResult] = useState<ProviderAdminResult | null>(null);
  const [tested, setTested] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const reload = () => {
    fetchMcpConnectors()
      .then((data) => {
        setCatalog(data.catalog);
        setOverlay(data.overlay);
      })
      .catch(() => setOverlay('unavailable'));
  };

  useEffect(reload, []);

  const parsed = parseStdioMcpJson(json);
  const connectorIdValid = /^[a-zA-Z0-9_-]+$/.test(connectorId);

  const handleTest = async () => {
    if (!parsed.ok) return;
    setBusy('testing');
    setResult(null);
    try {
      const testResult = await testMcpConnector(parsed.entry);
      setResult(testResult);
      setTested(testResult.ok);
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : String(error), log: [] });
      setTested(false);
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    if (!parsed.ok || !connectorIdValid) return;
    setBusy('saving');
    try {
      await saveMcpConnector(connectorId, parsed.entry);
      setResult(null);
      setTested(false);
      reload();
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : String(error), log: [] });
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (id: string) => {
    setRowBusy(id);
    try {
      await deleteMcpConnector(id);
      reload();
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <fieldset>
      <legend>
        MCP / Tools <InfoHint hintKey="mcpTools" />
      </legend>

      <p className="banner info" role="status">
        Only stdio MCP servers (external processes) can be added here — built-in tools require code
        to exist in the engine. Saved connectors appear in the catalog; a domain pack must still
        reference the connector id to actually use it in a conversation.
      </p>

      <div className="protean-settings-advanced">
        <label>
          Connector id <InfoHint hintKey="mcpConnectorId" />
        </label>
        <input
          type="text"
          placeholder="myCustomTool"
          value={connectorId}
          onChange={(event) => setConnectorId(event.target.value)}
        />
        {!connectorIdValid && (
          <p className="banner error" role="alert">
            Connector id must be letters/digits/-/_ only.
          </p>
        )}

        <label>
          Connector JSON <InfoHint hintKey="mcpJson" />
        </label>
        <textarea
          className="protean-settings-json-editor"
          spellCheck={false}
          value={json}
          onChange={(event) => {
            setJson(event.target.value);
            setTested(false);
            setResult(null);
          }}
        />
        {!parsed.ok && (
          <p className="banner error" role="alert">
            {parsed.error}
          </p>
        )}

        <div className="protean-settings-row">
          <button
            type="button"
            className="btn-ghost"
            disabled={!parsed.ok || busy !== null}
            onClick={() => void handleTest()}
          >
            {busy === 'testing' ? 'Testing…' : 'Test'}
          </button>
          <button
            type="button"
            className="pill on"
            disabled={!parsed.ok || !connectorIdValid || busy !== null}
            title={tested ? 'Tested successfully' : 'Untested -- saves anyway'}
            onClick={() => void handleSave()}
          >
            {busy === 'saving' ? 'Saving…' : tested ? 'Save connector' : 'Save anyway (untested)'}
          </button>
        </div>

        {result !== null && <AdminResultPanel result={result} />}
      </div>

      {overlay === 'loading' && (
        <p className="banner info" role="status">
          Loading MCP connectors…
        </p>
      )}
      {overlay === 'unavailable' && (
        <p className="banner error" role="alert">
          Engine unreachable — MCP connectors unavailable.
        </p>
      )}

      <p className="rail-label">Catalog (built-in + saved)</p>
      <CatalogList catalog={catalog} />

      {Array.isArray(overlay) && overlay.length > 0 && (
        <>
          <p className="rail-label">Saved by you</p>
          <div className="protean-settings-col">
            {overlay.map((item) => (
              <div key={item.connectorId} className="protean-settings-provider-row">
                <div className="meta">
                  <div className="label">{item.connectorId}</div>
                  <div className="detail">
                    {item.entry.command} {item.entry.args.join(' ')}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={rowBusy === item.connectorId}
                  onClick={() => void handleDelete(item.connectorId)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </fieldset>
  );
}
