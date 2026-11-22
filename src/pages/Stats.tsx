import { lazy, Suspense } from 'react';
import { SystemWindow } from '../components/SystemWindow';
import { freeStatPoints } from '../engine/levels';
import { STAT_KEYS, STAT_LABEL } from '../engine/types';
import { spendStatPoint } from '../game/actions';
import { useProgress } from '../hooks';

const StatsChart = lazy(() => import('./StatsChart'));

export default function Stats() {
  const p = useProgress();
  if (!p) return null;
  const free = freeStatPoints(p.level, p.profile.spentPoints);

  return (
    <div className="space-y-4">
      <SystemWindow title="Attributes">
        <Suspense fallback={<div className="h-64 grid place-items-center text-muted">Loading chart…</div>}>
          <StatsChart stats={p.profile.stats} />
        </Suspense>
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
