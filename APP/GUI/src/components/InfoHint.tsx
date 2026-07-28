import { useEffect, useId, useRef, useState } from 'react';
import { fieldHints } from '../config/fieldHints';

/**
 * C11 (i) info affordance — content from FieldHint data, never hardcoded.
 * Uses design-system .info / .pop markup.
 */
export function InfoHint({
  hintKey,
  direction = 'down',
}: {
  hintKey: string;
  direction?: 'down' | 'up';
}) {
  const hint = fieldHints[hintKey];
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

  const className = [
    'info',
    direction === 'up' ? 'below' : '',
    open ? 'open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      ref={rootRef}
      className={className}
      tabIndex={0}
      role="button"
      aria-label="Field information"
      aria-expanded={open}
      aria-describedby={open ? popoverId : undefined}
      onClick={() => setPinned((value) => !value)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setPinned((value) => !value);
        }
      }}
    >
      i
      <span id={popoverId} className="pop" role="tooltip">
        <span className="row">
          <span className="k">What</span>
          <span className="v">{hint.what}</span>
        </span>
        <span className="row">
          <span className="k">Why</span>
          <span className="v">{hint.why}</span>
        </span>
        {hint.example !== undefined && (
          <span className="row">
            <span className="k">e.g.</span>
            <span className="v">
              <span className="eg">{hint.example}</span>
            </span>
          </span>
        )}
      </span>
    </span>
  );
}
