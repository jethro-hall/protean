import { useEffect, useState } from 'react';
import { InfoHint } from '../components/InfoHint';
import { fetchDomains, type DomainSummary, type ModelTier, type ResponseDepth } from '../lib/api';
import { useAppDispatch, useAppState } from '../state/useAppStore';

const TIERS: Array<{ id: ModelTier; label: string }> = [
  { id: 'fast', label: 'Fast' },
  { id: 'strong', label: 'Strong' },
];

/** undefined = "Standard" (platform default) — always one pill selected, like Tier above. */
const RESPONSE_DEPTHS: Array<{ id: ResponseDepth | undefined; label: string }> = [
  { id: undefined, label: 'Standard' },
  { id: 'hscLevel', label: 'HSC Level' },
  { id: 'uniDegree', label: 'Uni Degree' },
  { id: 'professor', label: 'Professor' },
];

/** Domain pill + settings gear, opening the full Settings modal. */
export function SettingsMenu() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [domains, setDomains] = useState<DomainSummary[] | 'loading' | 'unavailable'>('loading');

  useEffect(() => {
    fetchDomains()
      .then(setDomains)
      .catch(() => setDomains('unavailable'));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const domainLabel =
    Array.isArray(domains)
      ? (domains.find((domain) => domain.id === state.settings.domainId)?.displayName ??
        state.settings.domainId)
      : state.settings.domainId;

  return (
    <div className="protean-settings">
      <button
        type="button"
        className="pill domain"
        title="Active domain pack — click to switch"
        onClick={() => setOpen(true)}
      >
        <span className="dot" aria-hidden />
        <span>{domainLabel}</span>
      </button>
      <button
        type="button"
        className="gear"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ⚙
      </button>
      {open && (
        <div
          className="settings-modal-scrim"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-modal-header">
              <h2>Settings</h2>
              <button
                type="button"
                className="settings-modal-close"
                aria-label="Close settings"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="settings-modal-body">
              <div className="protean-settings-panel">
                <fieldset>
                  <legend>
                    Model tier <InfoHint hintKey="modelTier" />
                  </legend>
                  <div className="protean-settings-row">
                    {TIERS.map((tier) => (
                      <button
                        key={tier.id}
                        type="button"
                        className={`pill${state.settings.tier === tier.id ? ' on' : ''}`}
                        aria-pressed={state.settings.tier === tier.id}
                        onClick={() => dispatch({ type: 'setTier', tier: tier.id })}
                      >
                        <span className="dot" aria-hidden />
                        {tier.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend>
                    Domain pack <InfoHint hintKey="domainPack" />
                  </legend>
                  {domains === 'loading' && (
                    <p className="banner info" role="status">
                      Loading domains…
                    </p>
                  )}
                  {domains === 'unavailable' && (
                    <p className="banner error" role="alert">
                      Engine unreachable — domain list unavailable.
                    </p>
                  )}
                  {Array.isArray(domains) && (
                    <div className="protean-settings-col">
                      {domains.map((domain) => (
                        <button
                          key={domain.id}
                          type="button"
                          className={`pill domain${state.settings.domainId === domain.id ? ' on' : ''}`}
                          aria-pressed={state.settings.domainId === domain.id}
                          onClick={() => dispatch({ type: 'setDomain', domainId: domain.id })}
                        >
                          <span className="dot" aria-hidden />
                          {domain.displayName}
                        </button>
                      ))}
                    </div>
                  )}
                </fieldset>

                <fieldset>
                  <legend>
                    Grounded knowledge (POC) <InfoHint hintKey="groundedKnowledge" />
                  </legend>
                  <label className="protean-settings-checkbox">
                    <input
                      type="checkbox"
                      checked={state.settings.grounded}
                      onChange={(event) =>
                        dispatch({ type: 'setGrounded', grounded: event.target.checked })
                      }
                    />
                    <span>Ground answers in curated domain sources (experimental)</span>
                  </label>
                </fieldset>

                <fieldset>
                  <legend>
                    Response depth <InfoHint hintKey="responseDepth" />
                  </legend>
                  <div className="protean-settings-row protean-settings-row-wrap">
                    {RESPONSE_DEPTHS.map((depth) => (
                      <button
                        key={depth.label}
                        type="button"
                        className={`pill${state.settings.responseDepth === depth.id ? ' on' : ''}`}
                        aria-pressed={state.settings.responseDepth === depth.id}
                        onClick={() => dispatch({ type: 'setResponseDepth', responseDepth: depth.id })}
                      >
                        <span className="dot" aria-hidden />
                        {depth.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend>Runtime &amp; agent behavior</legend>
                  <div className="protean-settings-advanced">
                    <label>
                      Token budget override <InfoHint hintKey="advancedTurnTokenBudget" />
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={64000}
                      placeholder="Use selected depth preset"
                      value={state.settings.turnTokenBudget ?? ''}
                      onChange={(event) => {
                        const raw = event.target.value;
                        const parsed = raw === '' ? undefined : Number.parseInt(raw, 10);
                        dispatch({
                          type: 'setTurnTokenBudget',
                          turnTokenBudget:
                            parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
                        });
                      }}
                    />
                    <label>
                      Max steps <InfoHint hintKey="agentMaxTurns" />
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      placeholder="Use server default"
                      value={state.settings.agentMaxTurns ?? ''}
                      onChange={(event) => {
                        const raw = event.target.value;
                        const parsed = raw === '' ? undefined : Number.parseInt(raw, 10);
                        dispatch({
                          type: 'setAgentMaxTurns',
                          agentMaxTurns:
                            parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
                        });
                      }}
                    />
                  </div>
                </fieldset>

                {/* Providers & models (Phase E) and MCP / Tools (Phase F) land as
                    additional fieldsets here, same pattern as the ones above. */}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
