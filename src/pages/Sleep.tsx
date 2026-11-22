import { Link } from 'react-router-dom';
import { SystemWindow } from '../components/SystemWindow';
import { sleepReport } from '../engine/system';
import { useSnapshot } from '../hooks';

const fmtBed = (m: number | null) => {
  if (m === null) return '';
  const t = (m + 12 * 60) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** Sleep tracker: how much you slept, your sleep debt, and how regular your bedtime is. */
export default function SleepPage() {
  const snap = useSnapshot();
  if (!snap) return null;
  const r = sleepReport(snap, 14);
  const bars = r.nights.slice(-14);

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
      <SystemWindow title="Sleep · last 14 days">
        <div className="grid grid-cols-2 gap-2">
          {card('Average', r.avg !== null ? `${r.avg.toFixed(1)} h` : '–', `Target ${r.target.toFixed(0)} h`)}
          {card('Sleep debt', `${r.debt.toFixed(1)} h`, 'Hours short of target')}
          {card('Consistency', r.consistency !== null ? `${r.consistency}/100` : '–', r.consistency !== null ? 'How steady your bedtime is' : 'Needs 3 nights with a bedtime')}
          {card('Good nights', `${r.goodNights}`, '7 hours or more')}
        </div>
        <Link to="/log" className="mt-3 block text-sm text-accent">＋ Log last night's sleep (Log tab)</Link>
      </SystemWindow>

      <SystemWindow title="Nightly sleep">
        {bars.length === 0 && <p className="text-muted">No sleep logged yet. Use "Log last night's sleep" on the Log tab.</p>}
        {bars.length > 0 && (
          <>
            <div className="relative flex h-36 items-end gap-1" role="img" aria-label={'Hours slept: ' + bars.map((b) => b.hours.toFixed(1)).join(', ')}>
              <div className="absolute inset-x-0 border-t border-dashed border-accent/60" style={{ bottom: `${(r.target / 12) * 100}%` }} aria-hidden />
              {bars.map((b) => (
                <div key={b.day} className="flex flex-1 flex-col items-center justify-end">
                  <span className="mb-0.5 text-[10px] text-muted">{b.hours.toFixed(1)}</span>
                  <div className={`w-full rounded-t ${b.hours >= 7 ? 'bg-accent' : 'bg-red-400/70'}`} style={{ height: `${Math.min(100, (b.hours / 12) * 100)}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1 text-[10px] text-muted">{bars.map((b) => <span key={b.day} className="flex-1 text-center">{b.day.slice(8)}</span>)}</div>
            <p className="mt-2 text-xs text-muted">Dashed line = your {r.target.toFixed(0)} h target. Blue bars are 7 hours or more.</p>
            <ul className="mt-3 divide-y divide-line text-sm">
              {[...bars].reverse().slice(0, 7).map((b) => (
                <li key={b.day} className="flex justify-between py-1"><span>{b.day}</span><span className="text-muted">{b.hours.toFixed(1)} h{b.bedMinutes !== null ? ` · bed ${fmtBed(b.bedMinutes)}` : ''}</span></li>
              ))}
            </ul>
          </>
        )}
      </SystemWindow>
    </div>
  );
}
