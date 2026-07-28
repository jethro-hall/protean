import { useEffect, useRef, useState } from 'react';
import { InfoHint } from '../components/InfoHint';
import { fetchDomains, type DomainSummary, type ModelTier } from '../lib/api';
import { useAppDispatch, useAppState } from '../state/useAppStore';

const TIERS: Array<{ id: ModelTier; label: string }> = [
  { id: 'fast', label: 'Fast' },
  { id: 'strong', label: 'Strong' },
];

export function SettingsMenu() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [domains, setDomains] = useState<DomainSummary[] | 'loading' | 'unavailable'>('loading');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetchDomains()
      .then(setDomains)
      .catch(() => setDomains('unavailable'));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onClickAway = (event: MouseEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickAway);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickAway);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="protean-settings">
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
        </div>
      )}
    </div>
  );
}
