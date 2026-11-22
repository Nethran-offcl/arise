import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { SystemWindow } from '../components/SystemWindow';
import { db } from '../db/db';
import { buildRuns, fmtDuration, fmtPace, runRecords, weeklyKm } from '../engine/runs';
import { dayKey } from '../engine/streak';

/** Run tracker: personal records, weekly distance and every run with its pace. */
export default function Runs() {
  const logs = useLiveQuery(() => db.logs.where('presetId').equals('run').toArray(), [], []);
  const rows = buildRuns(logs);
  const rec = runRecords(rows);
  const weeks = weeklyKm(rows, 8, dayKey(Date.now()));
  const maxKm = Math.max(1, ...weeks.map((w) => w.km));

  const card = (label: string, value: string, sub?: string) => (
    <div className="rounded-lg border border-line p-3">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="text-xl font-bold glow-text">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <Link to="/profile" className="inline-block text-accent">← Back</Link>

      <SystemWindow title="Personal records">
        <div className="grid grid-cols-2 gap-2">
          {card('Longest run', rec.longest ? `${rec.longest.km} km` : '–', rec.longest ? new Date(rec.longest.ts).toLocaleDateString() : 'Log a run')}
          {card('Fastest pace', rec.fastestPace ? fmtPace(rec.fastestPace.pace!) : '–', rec.fastestPace ? `${rec.fastestPace.km} km on ${new Date(rec.fastestPace.ts).toLocaleDateString()}` : 'Needs a run with a time')}
          {card('Best 3 km', rec.best3k ? fmtDuration(rec.best3k.minutes) : '–', rec.best3k ? 'estimated at your best pace' : 'Needs a 3 km+ run with a time')}
          {card('Best 5 km', rec.best5k ? fmtDuration(rec.best5k.minutes) : '–', rec.best5k ? 'estimated at your best pace' : 'Needs a 5 km+ run with a time')}
        </div>
        <p className="mt-3 text-sm text-muted">{rec.count} run{rec.count === 1 ? '' : 's'} · {rec.totalKm.toFixed(1)} km in total</p>
        <p className="mt-1 text-xs text-muted">Enter your total time when you log a run and the System works out pace and records. Records also pay bonus XP.</p>
      </SystemWindow>

      <SystemWindow title="Weekly distance">
        <div className="flex h-32 items-end gap-1" role="img" aria-label={'Weekly km: ' + weeks.map((w) => `${w.km.toFixed(1)}`).join(', ')}>
          {weeks.map((w) => (
            <div key={w.week} className="flex flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-[10px] text-muted">{w.km ? w.km.toFixed(1) : ''}</span>
              <div className="w-full rounded-t bg-accent" style={{ height: `${Math.max(2, (w.km / maxKm) * 90)}%`, opacity: w.km ? 1 : 0.2 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1 text-[10px] text-muted">{weeks.map((w) => <span key={w.week} className="flex-1 text-center">{w.week.slice(5)}</span>)}</div>
        <p className="mt-2 text-xs text-muted">Weeks start on Monday. A week's distance should grow by no more than 10%.</p>
      </SystemWindow>

      <SystemWindow title="All runs">
        {rows.length === 0 && <p className="text-muted">No runs yet. Log one from the Log tab.</p>}
        <ul className="divide-y divide-line text-sm">
          {rows.slice(0, 40).map((r) => (
            <li key={r.ts} className="flex items-center justify-between py-2">
              <span>{new Date(r.ts).toLocaleDateString([], { month: 'short', day: 'numeric' })} · <b>{r.km} km</b></span>
              <span className="text-muted">{r.pace ? `${fmtPace(r.pace)} · ${fmtDuration(r.minutes!)}` : 'no time'}</span>
            </li>
          ))}
        </ul>
      </SystemWindow>
    </div>
  );
}
