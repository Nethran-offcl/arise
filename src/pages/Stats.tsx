import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense } from 'react';
import { SystemWindow } from '../components/SystemWindow';
import { freeStatPoints } from '../engine/levels';
import { STAT_KEYS, STAT_LABEL } from '../engine/types';
import { spendStatPoint } from '../game/actions';
import { db } from '../db/db';
import { masteryInfo } from '../engine/progress';
import { useCategories, useProgress } from '../hooks';

const StatsChart = lazy(() => import('./StatsChart'));

export default function Stats() {
  const p = useProgress();
  const cats = useCategories();
  // Effort XP per category drives mastery (+2% XP per mastery level, up to +30%).
  const effort = useLiveQuery(async () => {
    const totals: Record<string, number> = {};
    for (const l of await db.logs.toArray()) if (!l.isPenalty) totals[l.categoryId] = (totals[l.categoryId] ?? 0) + (l.effortXp ?? l.xp);
    return totals;
  }, [], {} as Record<string, number>);
  if (!p) return null;
  const free = freeStatPoints(p.level, p.profile.spentPoints);

  return (
    <div className="space-y-4">
      <SystemWindow title="Attributes">
        <Suspense fallback={<div className="h-64 grid place-items-center text-muted">Loading chart…</div>}>
          <StatsChart stats={p.profile.stats} />
        </Suspense>
      </SystemWindow>

      <SystemWindow title="Category mastery">
        <ul className="divide-y divide-line">
          {cats.filter((c) => c.kind === 'task').map((c) => {
            const m = masteryInfo(effort[c.id] ?? 0);
            return (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <span>{c.icon} {c.name}</span>
                <span className="text-right"><span className="font-semibold">Mastery {m.level}</span> <span className="text-accent">+{Math.round(m.bonus * 100)}% XP</span>
                  <span className="block text-xs text-muted">{Math.round(m.effort)} / {m.nextAt} effort to next</span></span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">The more effort you put into a category, the more every task in it pays.</p>
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
    </div>
  );
}
