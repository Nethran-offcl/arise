import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Bar } from '../components/ui';
import { SystemWindow } from '../components/SystemWindow';
import { SHADOW_BONUS, SHADOW_CAP, SHADOW_DAYS, shadowBonusFor } from '../engine/shadows';
import { loadHabits } from '../game/shadows';
import { useCategories } from '../hooks';

/** Shadow Army: habits you kept for 21 days are extracted as Shadows with a permanent XP bonus. */
export default function Shadows() {
  const data = useLiveQuery(() => loadHabits(), []);
  const cats = useCategories();
  if (!data) return null;
  const catName = (id: string) => cats.find((c) => c.id === id);
  const perCat: Record<string, number> = {};
  for (const s of data.army) perCat[s.categoryId] = (perCat[s.categoryId] ?? 0) + 1;

  return (
    <div className="space-y-4">
      <Link to="/profile" className="inline-block text-accent">← Back</Link>

      <SystemWindow title="Your army">
        {data.army.length === 0 && <p className="text-muted">[SYSTEM] No Shadows yet. Keep a habit going for {SHADOW_DAYS} days to extract one.</p>}
        <ul className="space-y-2">
          {data.army.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-lg border border-accent/50 p-3">
              <span>👤 <b>{s.name}</b><span className="block text-xs text-muted">Extracted {new Date(s.extractedAt).toLocaleDateString()}</span></span>
              <span className="text-accent">+{Math.round(SHADOW_BONUS * 100)}% {catName(s.categoryId)?.name ?? s.categoryId}</span>
            </li>
          ))}
        </ul>
        {data.army.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            Active bonuses: {Object.entries(perCat).map(([id, n]) => `${catName(id)?.name ?? id} +${Math.round(shadowBonusFor(n) * 100)}%`).join(', ')} (max +{Math.round(SHADOW_CAP * 100)}% per category).
          </p>
        )}
      </SystemWindow>

      <SystemWindow title="In training">
        {data.training.length === 0 && <p className="text-muted">Log a task on a few days and it will appear here.</p>}
        <ul className="space-y-3">
          {data.training.map((h) => (
            <li key={h.preset.id}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{h.preset.name}</span>
                <span className="text-muted">{h.progress.count} / {SHADOW_DAYS} days</span>
              </div>
              <Bar value={h.progress.count} max={SHADOW_DAYS} label={`${h.preset.name} shadow training`} />
              <p className="mt-1 text-xs text-muted">
                {h.progress.daysLeft === 0 ? 'Do it today to keep the chain.' : `Keep it going within ${h.progress.daysLeft} day${h.progress.daysLeft === 1 ? '' : 's'}.`}
                {' '}({h.cadence >= 7 ? 'weekly habit: up to a week between sessions' : h.cadence === 2 ? 'daily habit: skip at most a day' : 'every few days is fine'})
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Rest days, sick days and Rest Day Passes never break a chain. If you miss too long, training restarts from zero.</p>
      </SystemWindow>
    </div>
  );
}
