import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { Segmented } from '../components/ui';
import { dayStats, generateInsights, windowStats } from '../engine/system';
import { SystemWindow } from '../components/SystemWindow';
import { freeStatPoints } from '../engine/levels';
import { STAT_KEYS, STAT_LABEL } from '../engine/types';
import { spendStatPoint } from '../game/actions';
import { db } from '../db/db';
import { MASTERY_GROUP_NAMES, masteryInfo } from '../engine/progress';
import { useCategories, useProgress, useSnapshot } from '../hooks';

const StatsChart = lazy(() => import('./StatsChart'));

export default function Stats() {
  const p = useProgress();
  const cats = useCategories();
  const snap = useSnapshot();
  const [win, setWin] = useState<'7' | '14' | '30'>('7');
  // Effort XP per category drives mastery (+2% XP per mastery level, up to +30%).
  const effort = useLiveQuery(async () => {
    const totals: Record<string, number> = {};
    for (const l of await db.logs.toArray()) if (!l.isPenalty) totals[l.categoryId] = (totals[l.categoryId] ?? 0) + (l.effortXp ?? l.xp);
    return totals;
  }, [], {} as Record<string, number>);
  if (!p) return null;
  const free = freeStatPoints(p.level, p.profile.spentPoints);
  // One mastery row per pool (Study + Core share "Mind"); every other category has its own
  const masteryRows = (() => {
    const groups = new Map<string, { id: string; label: string; effort: number }>();
    for (const c of cats) {
      if (c.kind !== 'task' || c.mastery === false) continue;
      const key = c.masteryGroup ?? c.id;
      const g = groups.get(key) ?? { id: key, label: c.masteryGroup ? MASTERY_GROUP_NAMES[c.masteryGroup] ?? c.name : `${c.icon} ${c.name}`, effort: 0 };
      g.effort += effort[c.id] ?? 0;
      groups.set(key, g);
    }
    return [...groups.values()];
  })();

  return (
    <div className="space-y-4">
      <SystemWindow title="Attributes">
        <Suspense fallback={<div className="h-64 grid place-items-center text-muted">Loading chart…</div>}>
          <StatsChart stats={p.profile.stats} />
        </Suspense>
      </SystemWindow>

      <Link to="/statguide" className="block text-sm text-accent">What feeds each stat? →</Link>

      <SystemWindow title="Category mastery">
        <ul className="divide-y divide-line">
          {masteryRows.map((c) => {
            const m = masteryInfo(c.effort);
            return (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <span>{c.label}</span>
                <span className="text-right"><span className="font-semibold">Mastery {m.level}</span> <span className="text-accent">+{Math.round(m.bonus * 100)}% XP</span>
                  <span className="block text-xs text-muted">{Math.round(m.effort)} / {m.nextAt} effort to next</span></span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">The more effort you put into a category, the more every task in it pays. Study and Core share one mastery, so reading, learning and reflecting boost your study XP too.</p>
      </SystemWindow>

      <SystemWindow title={`Stat points: ${free}`}>
        <ul className="divide-y divide-line">
          {STAT_KEYS.map((k) => (
            <li key={k} className="flex items-center justify-between py-2">
              <span><span className="font-bold">{k}</span> <span className="text-sm text-muted">{STAT_LABEL[k]}</span></span>
              <span className="flex items-center gap-3">
                <span className="text-lg font-semibold">{p.profile.stats[k]}</span>
                <button disabled={free < 1} onClick={() => spendStatPoint(k)} aria-label={`Spend a point on ${STAT_LABEL[k]}`}
                  className="h-11 w-11 rounded-lg border border-accent text-xl text-accent disabled:border-line disabled:text-muted">+</button>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Stats rise automatically from what you log. You also gain 3 free points per level.</p>
      </SystemWindow>

      {snap && (() => {
        const n = Number(win) as 7 | 14 | 30;
        const w = windowStats(dayStats(snap, n), snap.sleepTargetHours);
        const list = generateInsights(snap, n);
        return (
          <SystemWindow title="System analysis">
            <Segmented label="Time window" value={win} onChange={setWin} options={[{ id: '7', label: '7 days' }, { id: '14', label: '14 days' }, { id: '30', label: '30 days' }]} />
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
              <div><dt className="text-xs text-muted">ACTIVE DAYS</dt><dd className="text-lg font-bold">{w.activeDays}/{n}</dd></div>
              <div><dt className="text-xs text-muted">AVG SLEEP</dt><dd className="text-lg font-bold">{w.avgSleep !== null ? `${w.avgSleep.toFixed(1)} h` : '–'}</dd></div>
              <div><dt className="text-xs text-muted">RUNNING</dt><dd className="text-lg font-bold">{w.runKm.toFixed(1)} km</dd></div>
              <div><dt className="text-xs text-muted">STUDY</dt><dd className="text-lg font-bold">{w.studyHours.toFixed(1)} h</dd></div>
              <div><dt className="text-xs text-muted">HARD DAYS</dt><dd className="text-lg font-bold">{w.hardDays}</dd></div>
              <div><dt className="text-xs text-muted">SLIPS</dt><dd className="text-lg font-bold">{w.penalties}</dd></div>
            </dl>
            <ul className="mt-3 space-y-2">
              {list.length === 0 && <li className="text-sm text-muted">Nothing to report yet. Keep logging.</li>}
              {list.map((i) => (
                <li key={i.id} className={`rounded-lg border p-3 text-sm ${i.tone === 'warn' ? 'border-red-400/60' : i.tone === 'good' ? 'border-accent/60' : 'border-line'}`}>
                  <p className="font-semibold">{i.tone === 'warn' ? '⚠️' : i.tone === 'good' ? '✅' : '💡'} {i.title}</p>
                  <p className="mt-1 text-muted">{i.text}</p>
                </li>
              ))}
            </ul>
            <Link to="/review" className="mt-3 block text-sm text-accent">Open the weekly review →</Link>
          </SystemWindow>
        );
      })()}
    </div>
  );
}
