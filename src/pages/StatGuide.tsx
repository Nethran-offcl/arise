import { Link } from 'react-router-dom';
import { SystemWindow } from '../components/SystemWindow';
import { presetWeights } from '../engine/formula';
import { STAT_KEYS, STAT_LABEL } from '../engine/types';
import { useCategories, usePresets } from '../hooks';

/** Which activities raise which stat. Built live from your own tasks, so your custom ones appear too. */
export default function StatGuide() {
  const cats = useCategories();
  const presets = usePresets();
  const catOf = (id: string) => cats.find((c) => c.id === id);

  return (
    <div className="space-y-4">
      <Link to="/stats" className="inline-block text-accent">← Back</Link>
      <SystemWindow title="What feeds each stat">
        <p className="text-sm text-muted">Every task shares its stat gain between one or more stats. The percentage is that task's share. Gym sessions, push-ups and pull-ups feed Strength; cardio feeds Agility and Vitality; study, reading and work feed Intelligence, and so on.</p>
      </SystemWindow>

      {STAT_KEYS.map((k) => {
        const rows = presets
          .filter((p) => !p.isPenalty)
          .map((p) => ({ p, share: presetWeights(p, catOf(p.categoryId)?.weights ?? {})[k] ?? 0 }))
          .filter((r) => r.share > 0)
          .sort((a, b) => b.share - a.share || a.p.name.localeCompare(b.p.name));
        return (
          <SystemWindow key={k} title={`${k} · ${STAT_LABEL[k]}`}>
            {rows.length === 0 && <p className="text-sm text-muted">Nothing feeds this stat yet. You can still spend free stat points on it.</p>}
            <ul className="divide-y divide-line text-sm">
              {rows.map(({ p, share }) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>{p.name}<span className="text-xs text-muted"> · {catOf(p.categoryId)?.name}</span></span>
                  <span className="shrink-0 font-semibold text-accent">{Math.round(share * 100)}%</span>
                </li>
              ))}
            </ul>
          </SystemWindow>
        );
      })}
      <p className="text-xs text-muted">You also earn 3 free stat points per level to put into any stat.</p>
    </div>
  );
}
