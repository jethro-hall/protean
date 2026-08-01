import type { ProviderAdminResult } from '../lib/api';

/**
 * Shared pass/fail display for any admin "Test" action (provider connection,
 * MCP connector). Full log always visible -- never collapsed away -- and the
 * message is always the specific, actionable one the backend produced, never
 * a bare "error".
 */
export function AdminResultPanel({ result }: { result: ProviderAdminResult }) {
  return (
    <>
      <p className={`banner ${result.ok ? 'success' : 'error'}`} role={result.ok ? 'status' : 'alert'}>
        {result.message}
      </p>
      {result.models !== undefined && result.models.length > 0 && (
        <div className="protean-settings-model-list">
          {result.models.map((model) => (
            <span key={model} className="tag">
              {model}
            </span>
          ))}
        </div>
      )}
      {result.log.length > 0 && <div className="protean-settings-log">{result.log.join('\n')}</div>}
    </>
  );
}
