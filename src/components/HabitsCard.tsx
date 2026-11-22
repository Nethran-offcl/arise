import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { dayKey, dayStartTs } from '../engine/streak';
import { logActivity } from '../game/actions';
import { useCelebrate } from '../store/celebrate';
import { Bar } from './ui';
import { SystemWindow } from './SystemWindow';

const GOAL_L = 2;
const MEALS = [
  { id: 'healthy-meal', icon: '😊', label: 'Good' },
  { id: 'meal-okay', icon: '😐', label: 'Okay' },
  { id: 'p-junk', icon: '😕', label: 'Not great' },
] as const;

/** One-tap meal quality and water for today. Quality only: no calories, no restrictions. */
export function HabitsCard() {
  const announce = useCelebrate((s) => s.announce);
  const today = useLiveQuery(async () => {
    const logs = await db.logs.where('ts').above(dayStartTs(dayKey(Date.now())) - 1).toArray();
    const meals: Record<string, number> = {};
    let water = 0;
    for (const l of logs) {
      if (l.presetId === 'water' && !l.isPenalty) water += l.qty;
      if (MEALS.some((m) => m.id === l.presetId)) meals[l.presetId] = (meals[l.presetId] ?? 0) + 1;
    }
    return { meals, water };
  }, [], { meals: {} as Record<string, number>, water: 0 });

  const log = async (presetId: string, qty: number) => announce(await logActivity({ presetId, qty, intensity: 'normal', ts: Date.now() }));

  return (
    <SystemWindow title="Today's habits">
      <div className="mb-1 flex justify-between text-sm">
        <span>💧 Water</span>
        <span className={today.water >= GOAL_L ? 'text-accent' : 'text-muted'}>{today.water.toFixed(2).replace(/\.?0+$/, '')} / {GOAL_L} L{today.water >= GOAL_L ? ' ✓' : ''}</span>
      </div>
      <Bar value={today.water} max={GOAL_L} label="Water today" color="#38bdf8" />
      <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
        {[0.25, 0.5, 1].map((l) => (
          <button key={l} className="rounded-lg border border-line" onClick={() => void log('water', l)}>+{l >= 1 ? `${l} L` : `${l * 1000} ml`}</button>
        ))}
      </div>

      <p className="mb-1 mt-4 text-sm">🍽️ Meals today</p>
      <div className="grid grid-cols-3 gap-2 text-sm">
        {MEALS.map((m) => (
          <button key={m.id} className="rounded-lg border border-line py-1" onClick={() => void log(m.id, 1)}>
            <span className="block text-xl">{m.icon}</span>
            {m.label}{today.meals[m.id] ? ` · ${today.meals[m.id]}` : ''}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">A quick quality check, nothing more. No calories and no food rules. Tapped by mistake? Delete it from the Log tab.</p>
    </SystemWindow>
  );
}
