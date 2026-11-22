import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { SystemWindow } from '../components/SystemWindow';
import { MUSCLES } from '../engine/lifts';
import { deleteExercise, loadExerciseStats } from '../game/lifts';

const kg = (n: number) => `${Math.round(n * 10) / 10}`;

/** Strength tracker: every exercise you have saved, with your records and how far you have come. */
export default function Lifts() {
  const stats = useLiveQuery(() => loadExerciseStats(), []);
  if (!stats) return null;
  const used = stats.filter((s) => s.entries.length > 0);

  return (
    <div className="space-y-4">
      <Link to="/profile" className="inline-block text-accent">← Back</Link>

      <SystemWindow title="Strength tracker">
        <p className="text-sm text-muted">{used.length === 0 ? 'No lifts yet. Log a Gym session and add exercises with their weight.' : `${used.length} exercise${used.length === 1 ? '' : 's'} tracked. Each is compared only with its own history.`}</p>
        <Link to="/log" className="mt-2 block text-sm text-accent">＋ Log a gym session (Log tab → Strength)</Link>
      </SystemWindow>

      {MUSCLES.map((m) => {
        const rows = stats.filter((s) => s.exercise.muscle === m.id && s.entries.length > 0);
        if (!rows.length) return null;
        return (
          <SystemWindow key={m.id} title={`${m.icon} ${m.label}`}>
            <ul className="divide-y divide-line">
              {rows.map((s) => (
                <li key={s.exercise.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{s.exercise.name}</p>
                    {s.change !== null && <span className={`shrink-0 text-sm ${s.change >= 0 ? 'text-accent' : 'text-muted'}`}>{s.change >= 0 ? '+' : ''}{Math.round(s.change * 100)}% since your first</span>}
                  </div>
                  <dl className="mt-1 grid grid-cols-3 gap-2 text-center text-sm">
                    <div><dt className="text-xs text-muted">HEAVIEST</dt><dd className="font-bold">{kg(s.heaviest!.weight)} kg × {s.heaviest!.reps}</dd></div>
                    <div><dt className="text-xs text-muted">EST. MAX</dt><dd className="font-bold">{kg(s.best!.e1rm)} kg</dd></div>
                    <div><dt className="text-xs text-muted">LAST</dt><dd className="font-bold">{kg(s.entries[0].weight)} × {s.entries[0].reps}</dd></div>
                  </dl>
                  <p className="mt-1 text-xs text-muted">{s.entries.length} session{s.entries.length === 1 ? '' : 's'} · last on {new Date(s.entries[0].ts).toLocaleDateString()}</p>
                </li>
              ))}
            </ul>
          </SystemWindow>
        );
      })}

      <SystemWindow title="Saved exercises">
        <p className="mb-2 text-xs text-muted">The list you pick from when you log. Removing one keeps your old records.</p>
        <ul className="divide-y divide-line text-sm">
          {stats.map((s) => (
            <li key={s.exercise.id} className="flex items-center justify-between py-2">
              <span>{s.exercise.name} <span className="text-muted">· {MUSCLES.find((m) => m.id === s.exercise.muscle)?.label}</span></span>
              <button className="px-2 text-red-300" onClick={async () => { if (confirm(`Remove "${s.exercise.name}" from your list? Your past records are kept.`)) await deleteExercise(s.exercise.id); }}>Remove</button>
            </li>
          ))}
        </ul>
      </SystemWindow>
    </div>
  );
}
