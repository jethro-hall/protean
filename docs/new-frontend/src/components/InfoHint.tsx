import { useEffect, useId, useRef, useState } from 'react';
import { fieldHints } from '../config/fieldHints';

/**
 * The mandatory (i) affordance (UX_STANDARDS §2): hidden until hover/click,
 * keyboard-focusable, Esc-dismissable, aria-described. Content comes from
 * config data — never from the component.
 */
export function InfoHint({ hintKey, direction = 'down' }: { hintKey: string; direction?: 'down' | 'up' }) {
  const hint = fieldHints[hintKey];
  // hover is transient; a click PINS the popover until Esc/click-away (touch support)
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;
  const popoverId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setPinned(false);
      setHovered(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onClickAway = (event: MouseEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickAway);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickAway);
    };
  }, [open]);

  if (hint === undefined) return null;

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label="Field information"
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        onClick={() => setPinned((value) => !value)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-line text-[10px] leading-none text-muted hover:border-accent-blue hover:text-accent-blue focus:outline-2 focus:outline-accent-blue"
      >
        i
      </button>
      {open && (
        <span
          id={popoverId}
          role="tooltip"
          className={`absolute right-0 z-30 w-64 rounded-md border border-line bg-surface p-3 text-left text-xs font-normal normal-case tracking-normal shadow-lg ${
            direction === 'down' ? 'top-5' : 'bottom-5'
          }`}
        >
          <span className="block font-semibold text-ink">{hint.what}</span>
          <span className="mt-1 block text-muted">{hint.why}</span>
          {hint.example !== undefined && (
            <span className="mt-1 block font-mono text-[11px] text-accent-blue">
              e.g. {hint.example}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
