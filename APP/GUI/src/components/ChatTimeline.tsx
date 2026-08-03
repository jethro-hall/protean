import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ChatMessage } from '../state/appState';

const MIN_MESSAGES_TO_SHOW = 2;
const MIN_SCROLLABLE_PX = 80;
const ACTIVE_LINE_FRACTION = 0.3;
const TOOLTIP_MAX_CHARS = 90;

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max).trimEnd()}…` : oneLine;
}

/** Content-relative top offset (px) of `el` within `scrollEl`'s scrollable content. */
function contentRelativeTop(scrollEl: HTMLElement, el: HTMLElement): number {
  return el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;
}

/**
 * A minimap rail alongside the chat thread: one node per user turn, positioned
 * proportionally to its place in the scrollable history, with the currently-visible
 * turn highlighted. Click a node to jump there. Read-only navigation aid — never
 * blocks or duplicates the chat itself (UX law: no clutter).
 */
export function ChatTimeline({
  messages,
  scrollRef,
}: {
  messages: ChatMessage[];
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const userMessages = messages.filter((message) => message.role === 'user');
  const [percentById, setPercentById] = useState<Record<string, number>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const topByIdRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (scrollEl === null) return;

    const recompute = (): void => {
      const scrollableHeight = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (userMessages.length < MIN_MESSAGES_TO_SHOW || scrollableHeight < MIN_SCROLLABLE_PX) {
        setVisible(false);
        return;
      }
      const nextTop: Record<string, number> = {};
      const nextPercent: Record<string, number> = {};
      for (const message of userMessages) {
        const el = scrollEl.querySelector<HTMLElement>(`[data-chat-msg-id="${message.id}"]`);
        if (el === null) continue;
        const top = contentRelativeTop(scrollEl, el);
        nextTop[message.id] = top;
        nextPercent[message.id] = Math.min(100, Math.max(0, (top / scrollableHeight) * 100));
      }
      topByIdRef.current = nextTop;
      setPercentById(nextPercent);
      setVisible(true);
    };

    const updateActive = (): void => {
      const cursor = scrollEl.scrollTop + scrollEl.clientHeight * ACTIVE_LINE_FRACTION;
      let current: string | null = null;
      for (const message of userMessages) {
        const top = topByIdRef.current[message.id];
        if (top !== undefined && top <= cursor) current = message.id;
      }
      setActiveId(current);
    };

    let raf = 0;
    const onScroll = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateActive);
    };

    recompute();
    updateActive();
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', recompute);
    const resizeObserver = new ResizeObserver(() => {
      recompute();
      updateActive();
    });
    resizeObserver.observe(scrollEl);
    const thread = scrollEl.firstElementChild;
    if (thread !== null) resizeObserver.observe(thread);

    return () => {
      cancelAnimationFrame(raf);
      scrollEl.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', recompute);
      resizeObserver.disconnect();
    };
  }, [scrollRef, messages]);

  if (!visible) return null;

  return (
    <nav className="chat-timeline" aria-label="Jump to a question in this conversation">
      <div className="tl-track">
        {userMessages.map((message, index) => {
          const percent = percentById[message.id];
          if (percent === undefined) return null;
          return (
            <button
              key={message.id}
              type="button"
              className={`tl-node${message.id === activeId ? ' active' : ''}`}
              style={{ top: `${percent}%` }}
              aria-label={`Jump to question ${index + 1}: ${truncate(message.content, TOOLTIP_MAX_CHARS)}`}
              onClick={() => {
                scrollRef.current
                  ?.querySelector<HTMLElement>(`[data-chat-msg-id="${message.id}"]`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <span className="tl-tip">{truncate(message.content, TOOLTIP_MAX_CHARS)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
