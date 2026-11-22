import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { getSetting, setSetting } from '../db/db';
import { dayKey, dayStartTs } from '../engine/streak';
import { buildAdvice } from '../engine/system';
import { DAY_TYPE_LABEL, dayType } from '../game/schedule';
import { useProgress, useQuestBoard, useSnapshot, useTodayFlags } from '../hooks';
import { btnPrimary } from './ui';

const greeting = (hour: number) => (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');

/** The first screen of each day: a System greeting, today's quests, and anything you should know. */
export function Ritual({ ready }: { ready: boolean }) {
  const today = dayKey(Date.now());
  const last = useLiveQuery(() => getSetting<string | null>('lastRitual', null), [], undefined);
  const enabled = useLiveQuery(() => getSetting<boolean>('ritualEnabled', true), [], undefined);
  const p = useProgress();
  const snap = useSnapshot();
  const board = useQuestBoard();
  const flags = useTodayFlags();

  const show = ready && enabled === true && last !== undefined && last !== today && !!p && !!snap;
  const dismiss = () => setSetting('lastRitual', today);

  const dailies = board.filter((r) => r.q.kind === 'daily' && r.q.periodStart === dayStartTs(today) && r.q.status !== 'skipped');
  const boss = board.find((r) => r.q.kind === 'boss' && r.q.status === 'active' && (r.q.periodEnd ?? 0) > Date.now());
  const advice = snap ? buildAdvice(snap) : null;

  return (
    <AnimatePresence>
      {show && p && snap && advice && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal aria-label="Daily login">
          <motion.div className="sys-window w-full max-w-sm p-5" initial={{ y: 24, scale: 0.96 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 140, damping: 16 }}>
            <p className="sys-title">[ System ]</p>
            <p className="mt-2 text-2xl font-bold glow-text">{greeting(new Date().getHours())}, {p.profile.name}.</p>
            <p className="mt-1 text-muted">[SYSTEM] {dailies.length ? 'Daily Quest has arrived.' : 'Welcome back.'} Today is a {DAY_TYPE_LABEL[dayType(flags, snap.mode)].toLowerCase()}.</p>

            <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
              <div><dt className="text-xs text-muted">LEVEL</dt><dd className="font-bold">{p.level}</dd></div>
              <div><dt className="text-xs text-muted">STREAK</dt><dd className="font-bold">🔥 {snap.streak}</dd></div>
              <div><dt className="text-xs text-muted">ENERGY</dt><dd className="font-bold">{p.profile.hp}%</dd></div>
            </dl>

            {dailies.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm">
                {dailies.slice(0, 5).map((r) => <li key={r.q.id}>⚔️ {r.q.title}</li>)}
              </ul>
            )}
            {boss && <p className="mt-3 text-sm text-muted">Raid: {boss.q.bossName} · HP {Math.max(0, Math.round(boss.target - boss.progress)).toLocaleString()}</p>}
            {advice.notes[0] && <p className="mt-3 rounded-lg border border-line p-2 text-sm text-accent">{advice.notes[0]}</p>}

            <button className={`${btnPrimary} mt-5`} onClick={() => void dismiss()}>Begin</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
