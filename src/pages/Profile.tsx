import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShopPanel } from '../components/ShopPanel';
import { SystemWindow } from '../components/SystemWindow';
import { btnGhost, btnPrimary, Field, inputCls, Segmented } from '../components/ui';
import { renamePlayer } from '../game/actions';
import { useProgress } from '../hooks';
import { useCelebrate } from '../store/celebrate';
import { useUI, type Theme } from '../store/ui';

const themes: { id: Theme; label: string; colors: [string, string] }[] = [
  { id: 'system', label: 'System Blue', colors: ['#4aa3ff', '#7a8bff'] },
  { id: 'monarch', label: 'Shadow Monarch', colors: ['#a66bff', '#d06bff'] },
  { id: 'crimson', label: 'Crimson Sovereign', colors: ['#ff4d5e', '#ff9d4d'] },
  { id: 'gold', label: 'Divine Gold', colors: ['#ffcf4a', '#fff1a8'] },
  { id: 'emerald', label: 'Emerald Gate', colors: ['#2dffb0', '#3ad0ff'] },
  { id: 'frost', label: 'Frozen Abyss', colors: ['#7fe3ff', '#c7f1ff'] },
  { id: 'void', label: 'Void Neon', colors: ['#ff3df2', '#3dfcff'] },
  { id: 'minimal', label: 'Minimal', colors: ['#d4d4d8', '#a1a1aa'] },
];

export default function Profile() {
  const { theme, setTheme } = useUI();
  const p = useProgress();
  const say = useCelebrate((s) => s.say);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [tab, setTab] = useState<'player' | 'shop'>('player');

  useEffect(() => {
    if (p) { setName(p.profile.name); setTitle(p.profile.title); }
    // Only fill the fields once, when the profile first loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.profile.id]);

  return (
    <div className="space-y-4">
      <Segmented label="Section" value={tab} onChange={setTab} options={[{ id: 'player', label: 'Profile' }, { id: 'shop', label: '🪙 Shop & bag' }]} />
      {tab === 'shop' ? <ShopPanel /> : <>
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
              className={`flex items-center gap-3 rounded-lg border px-4 text-left ${theme === t.id ? 'border-accent text-accent' : 'border-line text-ink'}`}>
              <span aria-hidden className="h-6 w-6 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]})`, boxShadow: `0 0 10px ${t.colors[0]}` }} />
              {t.label}
            </button>
          ))}
        </div>
      </SystemWindow>

      <SystemWindow title="Tools">
        <div className="grid grid-cols-2 gap-2">
          {[
            ['/runs', '🏃 Run tracker'], ['/sleep', '😴 Sleep tracker'], ['/heatmap', '🔥 Calendar'], ['/shadows', '👤 Shadow Army'],
            ['/trophies', '🏆 Trophies & titles'], ['/focus', '🎯 Focus timer'], ['/journal', '📓 Journal'], ['/review', '📊 Weekly review'],
          ].map(([to, label]) => <Link key={to} to={to} className={`${btnGhost} flex items-center`}>{label}</Link>)}
        </div>
        <div className="mt-2 grid gap-2">
          <Link to="/presets" className={`${btnGhost} flex items-center`}>Manage tasks &amp; presets</Link>
          <Link to="/settings" className={`${btnGhost} flex items-center`}>Settings, formulas &amp; demo data</Link>
        </div>
      </SystemWindow>
      </>}
    </div>
  );
}
