import { InfoHint } from '../components/InfoHint';
import { activeConversation } from '../state/appState';
import { useAppState } from '../state/useAppStore';

/** C2 telemetry chip — last completed turn only; dashes when none (honest empty). */
export function TopbarTelemetry() {
  const state = useAppState();
  const conversation = activeConversation(state);
  const lastDone = [...conversation.messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.stats !== undefined)?.stats;

  const ttft =
    lastDone?.timings.ttftMs !== undefined && lastDone.timings.ttftMs !== null
      ? `${Math.round(lastDone.timings.ttftMs)}ms`
      : '—';
  const total =
    lastDone?.timings.totalMs !== undefined && lastDone.timings.totalMs !== null
      ? `${(lastDone.timings.totalMs / 1000).toFixed(1)}s`
      : '—';
  const cache =
    lastDone === undefined ? '—' : lastDone.cacheHit ? 'hit' : 'miss';

  return (
    <div className="telemetry" title="Live latency & cache telemetry for the last turn">
      <span className="t">
        <span>TTFT</span>
        <b className="num">{ttft}</b>
      </span>
      <span className="t tok">
        <span>total</span>
        <b className="num">{total}</b>
      </span>
      <span className={`t${cache === 'hit' ? ' cache-hit' : ''}`}>
        <span>cache</span>
        <b className="num">{cache}</b>
      </span>
      <InfoHint hintKey="turnStats" />
    </div>
  );
}
