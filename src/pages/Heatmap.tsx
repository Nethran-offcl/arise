import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SystemWindow } from '../components/SystemWindow';
import { db, getSetting } from '../db/db';
import { buildHeatmap, type HeatCell } from '../engine/heatmap';
import { computeStreak, dayKey } from '../engine/streak';

const WEEKS = 13;
const OPACITY = [0.07, 0.3, 0.5, 0.75, 1];

/** Calendar heatmap of daily effort with flames on your current streak. */
export default function Heatmap() {
  const [picked, setPicked] = useState<HeatCell | null>(null);
  const data = useLiveQuery(async () => {
    const now = Date.now();
    const [logs, paused] = await Promise.all([db.logs.where('ts').above(now - 366 * 86_400_000).toArray(), getSetting<string[]>('pausedDays', [])]);
    const pausedSet = new Set(paused);
    const streak = computeStreak(logs, pausedSet, now);
    const grid = buildHeatmap(logs.map((l) => ({ ts: l.ts, effortXp: l.effortXp ?? l.xp, isPenalty: l.isPenalty })), pausedSet, dayKey(now), WEEKS, streak);
    return { grid, streak, active: grid.flat().filter((c) => c.level > 0).length };
  }, []);

  if (!data) return null;
  const cell = picked ?? data.grid.flat().find((c) => c.day === dayKey(Date.now()))!;

  return (
    <div className="space-y-4">
      <Link to="/profile" className="inline-block text-accent">← Back</Link>
      <SystemWindow title="Activity calendar">
        <p className="mb-3 text-sm text-muted">🔥 {data.streak}-day streak · {data.active} active days in the last {WEEKS} weeks</p>
        <div className="flex gap-1" role="grid" aria-label="Activity heatmap">
          <div className="flex flex-col gap-1 pt-0 text-[10px] text-muted" aria-hidden>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="flex h-6 items-center">{d}</span>)}
          </div>
          {data.grid.map((col, w) => (
            <div key={w} className="flex flex-1 flex-col gap-1">
              {col.map((c) => (
                <button key={c.day} role="gridcell" aria-label={`${c.day}: ${c.effort} effort`} onClick={() => setPicked(c)} disabled={c.future}
                  className={`relative h-6 w-full rounded-[4px] border p-0 ${picked?.day === c.day ? 'border-ink' : 'border-transparent'}`}
                  style={{ minHeight: 0, background: c.future ? 'transparent' : 'var(--accent)', opacity: c.future ? 0.15 : OPACITY[c.level] }}>
                  {c.flame && <span className="absolute inset-0 flex items-center justify-center text-[10px]" aria-hidden>🔥</span>}
                  {c.paused && !c.flame && c.level === 0 && <span className="absolute inset-0 flex items-center justify-center text-[8px]" aria-hidden>💤</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-1 text-xs text-muted">
          Less {OPACITY.map((o, i) => <span key={i} className="h-3 w-3 rounded-[3px]" style={{ background: 'var(--accent)', opacity: o }} />)} More
        </div>
        <div className="mt-4 rounded-lg border border-line p-3 text-sm" aria-live="polite">
          <p className="font-semibold">{cell.day}{cell.flame ? ' 🔥' : ''}{cell.paused ? ' 💤 rest' : ''}</p>
          <p className="text-muted">{cell.logs ? `${cell.effort} effort XP across ${cell.logs} log${cell.logs === 1 ? '' : 's'}` : 'Nothing logged.'}</p>
        </div>
        <p className="mt-2 text-xs text-muted">Colours compare each day with your own best days, so they stay meaningful as you level up.</p>
      </SystemWindow>
    </div>
  );
}
