import { useState } from 'react';
import { InfoHint } from './InfoHint';
import type { Activity, WorklogKind } from '../state/appState';

/** Map streamed Activity events onto the design-system worklog kinds (truthful). */
export function worklogKindFromActivity(activity: Activity): WorklogKind {
  if (activity.worklogKind !== undefined) return activity.worklogKind;
  if (activity.kind === 'thinking') return 'think';
  if (activity.kind === 'tool') return 'tool';
  const label = activity.label.toLowerCase();
  if (label.startsWith('read ') || label.includes('file')) return 'file';
  if (label.includes('plan')) return 'watcher';
  return 'task';
}

const WL_PATHS: Record<WorklogKind, string> = {
  watcher:
    '<path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="3"/>',
  think:
    '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-6 6a1.5 1.5 0 0 0 2.1 2.1l6-6a4 4 0 0 0 5.4-5.4l-2.3 2.3-2.1-2.1z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  command: '<path d="M4 17l6-6-6-6M12 19h8"/>',
  subagent: '<circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/>',
  task: '<path d="M20 6 9 17l-5-5"/>',
};

/**
 * C6 Worklog — prototype markup; data-driven kinds only (no invented steps).
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
  const sum =
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
        <span className="wl-sum">{sum}</span>
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
                <span
                  className="wl-node"
                  aria-hidden
                  dangerouslySetInnerHTML={{
                    __html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${WL_PATHS[kind]}</svg>`,
                  }}
                />
                <div className="wl-main">
                  <div className="wl-verb-row">
                    <span className="wl-verb">
                      {activity.label}
                      {activity.code !== undefined && activity.code !== '' && (
                        <code>{activity.code}</code>
                      )}
                      {activity.badge !== undefined && activity.badge !== '' && (
                        <span className="wl-badge">{activity.badge}</span>
                      )}
                    </span>
                    {activity.durationMs !== undefined && activity.durationMs > 0 && (
                      <span className="wl-ms num">{activity.durationMs}ms</span>
                    )}
                  </div>
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

function summariseThinking(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 480) return trimmed;
  return `${trimmed.slice(0, 480).trimEnd()}…`;
}
