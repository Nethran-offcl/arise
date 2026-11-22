import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SystemWindow } from '../components/SystemWindow';
import { btnGhost, btnPrimary, Field, inputCls } from '../components/ui';
import { renamePlayer } from '../game/actions';
import { useProgress } from '../hooks';
import { useCelebrate } from '../store/celebrate';
import { useUI, type Theme } from '../store/ui';

const themes: { id: Theme; label: string }[] = [
  { id: 'system', label: 'System Blue' },
  { id: 'monarch', label: 'Shadow Monarch' },
  { id: 'minimal', label: 'Minimal' },
];

export default function Profile() {
  const { theme, setTheme } = useUI();
  const p = useProgress();
  const say = useCelebrate((s) => s.say);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (p) { setName(p.profile.name); setTitle(p.profile.title); }
    // Only fill the fields once, when the profile first loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.profile.id]);

  return (
    <div className="space-y-4">
      <SystemWindow title="Player">
        <div className="space-y-3">
          <Field label="Name"><input className={inputCls} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Title"><input className={inputCls} value={title} maxLength={32} onChange={(e) => setTitle(e.target.value)} /></Field>
          <button className={btnPrimary} onClick={async () => { await renamePlayer(name, title); say('[SYSTEM] Profile updated.'); }}>Save</button>
        </div>
      </SystemWindow>

      <SystemWindow title="Theme">
        <div className="grid grid-cols-1 gap-2">
          {themes.map((t) => (
            <button key={t.id} onClick={() => setTheme(t.id)} aria-pressed={theme === t.id}
              className={`rounded-lg border px-4 text-left ${theme === t.id ? 'border-accent text-accent' : 'border-line text-ink'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </SystemWindow>

      <SystemWindow title="More">
        <div className="grid gap-2">
          <Link to="/presets" className={`${btnGhost} flex items-center`}>Manage tasks &amp; presets</Link>
          <Link to="/settings" className={`${btnGhost} flex items-center`}>Settings, formulas &amp; demo data</Link>
        </div>
        <p className="mt-3 text-sm text-muted">The Shop opens in Phase 3.</p>
      </SystemWindow>
    </div>
  );
}
