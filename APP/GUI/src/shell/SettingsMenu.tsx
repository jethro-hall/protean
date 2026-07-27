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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-lg text-muted hover:bg-bg hover:text-ink focus:outline-2 focus:outline-accent-blue"
      >
        ⚙
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-72 rounded-xl border border-line bg-surface p-4 shadow-lg">
          <fieldset>
            <legend className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Model tier <InfoHint hintKey="modelTier" />
            </legend>
            <div className="mt-2 flex gap-2">
              {TIERS.map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  aria-pressed={state.settings.tier === tier.id}
                  onClick={() => dispatch({ type: 'setTier', tier: tier.id })}
                  className={`min-h-touch flex-1 rounded-lg border px-3 text-sm ${
                    state.settings.tier === tier.id
                      ? 'border-accent-blue bg-accent-blue text-surface'
                      : 'border-line text-muted hover:border-accent-blue hover:text-ink'
                  }`}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-4">
            <legend className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Domain pack <InfoHint hintKey="domainPack" />
            </legend>
            {domains === 'loading' && (
              <p className="mt-2 text-sm text-muted" role="status">
                Loading domains…
              </p>
            )}
            {domains === 'unavailable' && (
              <p className="mt-2 text-sm text-err" role="alert">
                Engine unreachable — domain list unavailable.
              </p>
            )}
            {Array.isArray(domains) && (
              <div className="mt-2 flex flex-col gap-1.5">
                {domains.map((domain) => (
                  <button
                    key={domain.id}
                    type="button"
                    aria-pressed={state.settings.domainId === domain.id}
                    onClick={() => dispatch({ type: 'setDomain', domainId: domain.id })}
                    className={`min-h-touch rounded-lg border px-3 text-left text-sm ${
                      state.settings.domainId === domain.id
                        ? 'border-accent-blue text-ink'
                        : 'border-line text-muted hover:border-accent-blue hover:text-ink'
                    }`}
                  >
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
