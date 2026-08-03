import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { fieldHints } from '../config/fieldHints';

/** Keeps a floating tooltip fully visible regardless of where its icon sits (UX law: never
 * silently clip real content). Measured against the nearest clipping ancestor, not the
 * viewport — a tooltip inside the Settings modal (its own overflow:hidden box, itself smaller
 * than the viewport) needs its own bounds, or "plenty of room in the viewport" wrongly looks
 * safe while the modal's edge clips it anyway. */
const EDGE_PADDING_PX = 12;

interface PopAdjustment {
  vertical: 'up' | 'down';
  shiftPx: number;
  /** Capped to whatever room the chosen side actually has -- never a flat guess (Law 6-style honesty applied to layout). */
  maxHeightPx: number;
}

const DEFAULT_MAX_HEIGHT_PX = 320;

interface ClippingBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Walks up from `el` to the nearest ancestor that actually clips/scrolls its content. */
function nearestClippingBounds(el: HTMLElement): ClippingBounds {
  let node = el.parentElement;
  while (node !== null) {
    const style = window.getComputedStyle(node);
    if (/(auto|hidden|scroll|clip)/.test(`${style.overflowX} ${style.overflowY}`)) {
      return node.getBoundingClientRect();
    }
    node = node.parentElement;
  }
  return { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
}

/**
 * C11 (i) info affordance — content from FieldHint data, never hardcoded.
 * Uses design-system .info / .pop markup.
 */
export function InfoHint({
  hintKey,
  direction = 'up',
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
  const popRef = useRef<HTMLSpanElement>(null);
  const [adjust, setAdjust] = useState<PopAdjustment>({
    vertical: direction,
    shiftPx: 0,
    maxHeightPx: DEFAULT_MAX_HEIGHT_PX,
  });

  // Re-measure every time the tooltip opens -- a fixed direction/centering/height can run the box
  // off the top (clipped by a parent's overflow:hidden, e.g. an icon near the bottom of the
  // Settings modal), past the left/right edge, or simply be taller than the space available in
  // EITHER direction (a genuinely long hint). Flips toward whichever side has more room, shifts
  // horizontally to stay on-screen, and caps height to that room exactly -- content past the cap
  // scrolls inside the tooltip itself rather than being invisibly clipped by an ancestor.
  useLayoutEffect(() => {
    if (!open) return;
    const iconEl = rootRef.current;
    const popEl = popRef.current;
    if (iconEl === null || popEl === null) return;
    const iconRect = iconEl.getBoundingClientRect();
    const popRect = popEl.getBoundingClientRect();
    const bounds = nearestClippingBounds(iconEl);

    const spaceAbove = iconRect.top - bounds.top;
    const spaceBelow = bounds.bottom - iconRect.bottom;
    let vertical = direction;
    const preferredSpace = direction === 'up' ? spaceAbove : spaceBelow;
    const otherSpace = direction === 'up' ? spaceBelow : spaceAbove;
    if (popRect.height > preferredSpace - EDGE_PADDING_PX && otherSpace > preferredSpace) {
      vertical = direction === 'up' ? 'down' : 'up';
    }
    const availableSpace = vertical === 'up' ? spaceAbove : spaceBelow;
    const maxHeightPx = Math.min(480, Math.max(160, availableSpace - EDGE_PADDING_PX));

    const iconCenter = iconRect.left + iconRect.width / 2;
    const halfPopWidth = popRect.width / 2;
    let shiftPx = 0;
    const idealLeft = iconCenter - halfPopWidth;
    const idealRight = iconCenter + halfPopWidth;
    const leftBound = bounds.left + EDGE_PADDING_PX;
    const rightBound = bounds.right - EDGE_PADDING_PX;
    if (idealLeft < leftBound) {
      shiftPx = leftBound - idealLeft;
    } else if (idealRight > rightBound) {
      shiftPx = rightBound - idealRight;
    }

    setAdjust({ vertical, shiftPx, maxHeightPx });
  }, [open, direction]);

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
    adjust.vertical === 'down' ? 'below' : '',
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
      <span
        ref={popRef}
        id={popoverId}
        className="pop"
        role="tooltip"
        style={
          {
            '--pop-shift': `${adjust.shiftPx}px`,
            '--pop-max-height': `${adjust.maxHeightPx}px`,
          } as CSSProperties
        }
      >
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
