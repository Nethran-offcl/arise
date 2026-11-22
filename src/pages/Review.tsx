import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SystemWindow } from '../components/SystemWindow';
import { Segmented } from '../components/ui';
import { shiftDay } from '../engine/streak';
import { loadWeeklyReview } from '../game/system';

type Which = 'last' | 'current';

/** The System's weekly review: what went well, what slipped, and the plan for next week. */
export default function Review() {
  const [which, setWhich] = useState<Which>('last');
  const r = useLiveQuery(() => loadWeeklyReview(which), [which]);

  return (
    <div className="space-y-4">
      <Link to="/" className="inline-block text-accent">← Back</Link>
      <Segmented<Which> label="Which week" value={which} onChange={setWhich} options={[{ id: 'last', label: 'Last week' }, { id: 'current', label: 'This week so far' }]} />

      {!r && <p className="text-muted">Preparing your review…</p>}
      {r && (
        <>
          <SystemWindow title={`Week of ${r.weekKey}`}>
            <p className="text-xl font-bold glow-text">{r.headline}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
              <div><dt className="text-xs text-muted">ACTIVE DAYS</dt><dd className="text-lg font-bold">{r.stats.activeDays}/7</dd></div>
              <div><dt className="text-xs text-muted">QUESTS</dt><dd className="text-lg font-bold">{r.stats.questsCompleted}</dd></div>
              <div><dt className="text-xs text-muted">RUNNING</dt><dd className="text-lg font-bold">{r.stats.runKm.toFixed(1)} km</dd></div>
              <div><dt className="text-xs text-muted">AVG SLEEP</dt><dd className="text-lg font-bold">{r.stats.avgSleep !== null ? `${r.stats.avgSleep.toFixed(1)} h` : '–'}</dd></div>
              <div><dt className="text-xs text-muted">STUDY</dt><dd className="text-lg font-bold">{r.stats.studyHours.toFixed(1)} h</dd></div>
              <div><dt className="text-xs text-muted">EFFORT</dt><dd className="text-lg font-bold">{r.stats.effortChange === null ? r.stats.effort : `${r.stats.effortChange >= 0 ? '+' : ''}${Math.round(r.stats.effortChange * 100)}%`}</dd></div>
            </dl>
          </SystemWindow>

          <SystemWindow title="Wins">
            <ul className="space-y-1 text-sm">{r.wins.map((w) => <li key={w}>✅ {w}</li>)}</ul>
          </SystemWindow>
          <SystemWindow title="To improve">
            <ul className="space-y-1 text-sm">{r.weak.map((w) => <li key={w}>💡 {w}</li>)}</ul>
          </SystemWindow>
          <SystemWindow title={`Plan for the week of ${shiftDay(r.weekKey, 7)}`}>
            <ul className="space-y-1 text-sm">{r.plan.map((w) => <li key={w}>➡️ {w}</li>)}</ul>
          </SystemWindow>
          <p className="text-xs text-muted">[SYSTEM] This review is worked out on your phone from your own logs, no internet needed. The AI coach (Phase 5) can rewrite it with more personality.</p>
        </>
      )}
    </div>
  );
}
