import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Bar, btnPrimary, Segmented } from '../components/ui';
import { SystemWindow } from '../components/SystemWindow';
import { HabitsCard } from '../components/HabitsCard';
import { SystemCard } from '../components/SystemCard';
import { TodayQuests } from '../components/TodayQuests';
import { rankInfoForLevel, RANKS } from '../engine/ranks';
import { setHp, setMode } from '../game/actions';
import { dayKey, daysBetween } from '../engine/streak';
import { useBackupDue, useMode, useModeDay, useProgress, useRecentLogs, useStreak } from '../hooks';
import { useCelebrate } from '../store/celebrate';

/** Rank colours: steel, green, blue, violet, red, gold. */
const RANK_COLOR: Record<string, string> = { E: '#9fb0d0', D: '#4ade80', C: '#38bdf8', B: '#a78bfa', A: '#fb7185', S: '#fbbf24' };

const MODE_TEXT = {
  normal: '',
  rest: 'Rest Day active: penalties and streak loss are paused. HP recovers.',
  sick: 'Sick/Injury Mode active: penalties and streak loss are paused. Take care of yourself.',
} as const;

export default function Home() {
  const p = useProgress();
  const mode = useMode();
  const streak = useStreak();
  const modeDay = useModeDay();
  const backupDue = useBackupDue();
  const recent = useRecentLogs(3);
  const say = useCelebrate((s) => s.say);

  if (!p) return <p className="text-muted">Loading the System…</p>;
  const { profile, level, into, needed, rank } = p;

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <SystemWindow title="Status">
          <div className="flex items-center gap-4">
            <div className="rank-wrap shrink-0" style={{ '--rank': RANK_COLOR[rank.rank] } as React.CSSProperties}>
              <div className="rank-badge" role="img" aria-label={`Rank ${rank.rank}`}><span>{rank.rank}</span></div>
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-bold glow-text">{profile.name}</p>
              <p className="truncate text-sm text-muted">{profile.title} · {rank.title}</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-sm"><span>Level {level}</span><span className="text-muted">{into.toLocaleString()} / {needed.toLocaleString()} XP</span></div>
              <Bar value={into} max={needed} label="Experience" />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-sm"><span>HP / Energy</span><span className="text-muted">{profile.hp} / {profile.maxHp}</span></div>
              <Bar value={profile.hp} max={profile.maxHp} color="#34d399" label="HP" />
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div><dt className="text-xs text-muted">GOLD</dt><dd className="text-lg font-bold">🪙 {profile.gold}</dd></div>
            <div><dt className="text-xs text-muted">STREAK</dt><dd className="text-lg font-bold">🔥 {streak}</dd></div>
            <div><dt className="text-xs text-muted">NEXT RANK</dt><dd className="text-lg font-bold">{nextRankLabel(level)}</dd></div>
          </dl>
        </SystemWindow>
      </motion.div>

      {mode !== 'normal' && (
        <p className="sys-window p-3 text-sm text-accent" role="status">
          [SYSTEM] {MODE_TEXT[mode]}
          {mode === 'sick' && modeDay && (() => {
            const n = daysBetween(modeDay, dayKey(Date.now())) + 1;
            return ` Day ${n}.${n > 7 ? ' Feeling better? Switch back to Normal when you are ready.' : ''}`;
          })()}
        </p>
      )}

      <HabitsCard />

      {backupDue && (
        <Link to="/settings" className="sys-window block p-3 text-sm text-accent">
          [SYSTEM] Your data lives only on this phone. Tap to save a backup file.
        </Link>
      )}

      <SystemWindow title="Today">
        <Link to="/log" className={`${btnPrimary} flex items-center justify-center`}>＋ Log a task</Link>
        <TodayQuests />
      </SystemWindow>

      <SystemWindow title="Energy check-in">
        <p className="mb-2 text-sm text-muted">How does your body actually feel? The System can't know, so you decide. This sets your HP bar.</p>
        <input type="range" min={0} max={profile.maxHp} step={5} value={profile.hp} onChange={(e) => void setHp(Number(e.target.value))}
          aria-label="Energy" className="h-11 w-full accent-[var(--accent)]" />
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
          <button className="rounded-lg border border-line" onClick={() => void setHp(100)}>Fully rested</button>
          <button className="rounded-lg border border-line" onClick={() => void setHp(60)}>Okay</button>
          <button className="rounded-lg border border-line" onClick={() => void setHp(20)}>Drained</button>
        </div>
      </SystemWindow>

      <SystemCard />

      <SystemWindow title="Recovery mode">
        <Segmented label="Play mode" value={mode} options={[{ id: 'normal', label: 'Normal' }, { id: 'rest', label: 'Rest day' }, { id: 'sick', label: 'Sick / injured' }]}
          onChange={async (m) => { await setMode(m); say(m === 'normal' ? '[SYSTEM] Back to normal mode.' : '[SYSTEM] Penalties paused. Rest well.'); }} />
      </SystemWindow>

      {recent.length > 0 && (
        <SystemWindow title="Latest">
          <ul className="space-y-1 text-sm">
            {recent.map((l) => (
              <li key={l.id} className="flex justify-between"><span>{l.label}</span><span className={l.isPenalty ? 'text-red-300' : 'text-accent'}>{l.xp > 0 ? '+' : ''}{l.xp} XP</span></li>
            ))}
          </ul>
        </SystemWindow>
      )}
    </div>
  );
}

function nextRankLabel(level: number): string {
  const cur = rankInfoForLevel(level);
  const nextLevel = RANKS.map((r) => r.minLevel).find((l) => l > level);
  return cur.rank === 'S' || !nextLevel ? 'MAX' : `Lv ${nextLevel}`;
}
