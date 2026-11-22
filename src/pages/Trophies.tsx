import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Bar } from '../components/ui';
import { SystemWindow } from '../components/SystemWindow';
import { equipTitle, loadTrophyRows } from '../game/trophies';
import { useProfile } from '../hooks';
import { useCelebrate } from '../store/celebrate';

/** Trophy page: everything you have earned, progress toward the rest, and titles you can wear. */
export default function Trophies() {
  const rows = useLiveQuery(() => loadTrophyRows(), []);
  const profile = useProfile();
  const say = useCelebrate((s) => s.say);
  if (!rows) return null;
  const done = rows.filter((r) => r.done);
  const titles = done.filter((r) => r.trophy.title);

  return (
    <div className="space-y-4">
      <Link to="/profile" className="inline-block text-accent">← Back</Link>

      <SystemWindow title={`Trophies ${done.length} / ${rows.length}`}>
        <Bar value={done.length} max={rows.length} label="Trophies earned" />
      </SystemWindow>

      <SystemWindow title="Titles">
        <p className="mb-2 text-sm text-muted">Wearing: <b className="text-ink">{profile?.title ?? '...'}</b></p>
        {titles.length === 0 && <p className="text-sm text-muted">Unlock trophies to earn titles.</p>}
        <div className="flex flex-wrap gap-2">
          {titles.map((r) => (
            <button key={r.trophy.id} aria-pressed={profile?.title === r.trophy.title}
              className={`rounded-full border px-3 text-sm ${profile?.title === r.trophy.title ? 'border-accent text-accent' : 'border-line text-ink'}`}
              onClick={async () => { await equipTitle(r.trophy.title!); say(`[SYSTEM] You now wear "${r.trophy.title}".`); }}>
              {r.trophy.icon} {r.trophy.title}
            </button>
          ))}
        </div>
      </SystemWindow>

      <SystemWindow title="All trophies">
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.trophy.id} className={r.done ? '' : 'opacity-70'}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{r.done ? r.trophy.icon : '🔒'} {r.trophy.name}</p>
                <span className="shrink-0 text-xs text-muted">{r.done ? (r.unlockedAt ? new Date(r.unlockedAt).toLocaleDateString() : 'earned') : `${Math.min(r.value, r.trophy.target).toLocaleString(undefined, { maximumFractionDigits: 1 })} / ${r.trophy.target}`}</span>
              </div>
              <p className="text-xs text-muted">{r.trophy.desc}{r.trophy.title ? ` Title: ${r.trophy.title}.` : ''}</p>
              {!r.done && <div className="mt-1"><Bar value={r.value} max={r.trophy.target} label={r.trophy.name} /></div>}
            </li>
          ))}
        </ul>
      </SystemWindow>
    </div>
  );
}
