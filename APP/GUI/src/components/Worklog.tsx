import { useState } from 'react';
import { InfoHint } from './InfoHint';
import type { Activity } from '../state/appState';

/** Worklog step kinds from the design contract (C6) — colour via data-kind only. */
export type WorklogKind = 'think' | 'tool' | 'file' | 'command' | 'subagent' | 'task' | 'watcher';

/** Map streamed Activity events onto the design-system worklog kinds (truthful). */
export function worklogKindFromActivity(activity: Activity): WorklogKind {
  if (activity.kind === 'thinking') return 'think';
  if (activity.kind === 'tool') return 'tool';
  const label = activity.label.toLowerCase();
  if (label.startsWith('read ') && label.includes('into context')) return 'file';
  return 'task';
}

/**
 * C6 Worklog — data-driven "show your working" feed.
 * Never invents steps; only renders real activities from the turn stream.
 */
export function Worklog({
  activities,
  streaming,
  totalMs,
}: {
  activities: Activity[];
  streaming: boolean;
  totalMs?: number | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (activities.length === 0) return null;

  const done = !streaming && activities.every((activity) => activity.done);
  const summary =
    activities.find((activity) => activity.kind === 'thinking')?.label ??
    activities[0]?.label ??
    'Working steps';

  return (
    <div className={`worklog${collapsed ? ' collapsed' : ''}${done ? ' done' : ''}`}>
      <button
        type="button"
        className="wl-head"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setCollapsed((value) => !value);
          }
        }}
      >
        <span className="wl-live" aria-hidden />
        <span className="wl-title">
          Worked
          <InfoHint hintKey="agentActivity" />
        </span>
        <span className="wl-sum">{summary}</span>
        <span className="wl-meta">
          <span className="wl-count num">
            {activities.length} step{activities.length === 1 ? '' : 's'}
          </span>
          {totalMs !== undefined && totalMs !== null && (
            <span className="wl-ms num">{(totalMs / 1000).toFixed(1)}s</span>
          )}
          <span className="wl-chev" aria-hidden>
            ⌄
          </span>
        </span>
      </button>
      <div className="wl-body">
        <div className="wl-steps">
          {activities.map((activity) => {
            const kind = worklogKindFromActivity(activity);
            const running = !activity.done;
            return (
              <div
                key={activity.id}
                className={`wl-step${running ? ' running' : ''}`}
                data-kind={kind}
              >
                <span className="wl-node" aria-hidden>
                  {kind === 'think' || kind === 'watcher' ? '◆' : kind === 'file' ? '📄' : '●'}
                </span>
                <div className="wl-main">
                  <div className="wl-verb">{activity.label}</div>
                  {activity.text !== '' && (
                    <div className="wl-detail">
                      {kind === 'think' ? summariseThinking(activity.text) : activity.text}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Honest summary prose for reasoning — truncate long streams for the card. */
function summariseThinking(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 480) return trimmed;
  return `${trimmed.slice(0, 480).trimEnd()}…`;
}
