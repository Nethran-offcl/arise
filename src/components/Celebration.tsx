import { AnimatePresence, motion } from 'framer-motion';
import { logActivity } from '../game/actions';
import { useCelebrate } from '../store/celebrate';
import { RANKS } from '../engine/ranks';
import { btnGhost, btnPrimary } from './ui';

/** Full-screen level-up / rank-up ceremony and the Penalty Quest offer. */
export function Celebration() {
  const { queue, next, announce } = useCelebrate();
  const c = queue[0];

  return (
    <AnimatePresence>
      {c && (
        <motion.div key={queue.length + c.kind} className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal>
          <motion.div className="sys-window w-full max-w-sm p-6 text-center"
            initial={{ scale: 0.8, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 14 }}>
            {c.kind === 'level' && (
              <>
                <p className="sys-title">[ System ]</p>
                <motion.p className="my-3 text-5xl font-black glow-text" animate={{ scale: [1, 1.12, 1] }} transition={{ repeat: Infinity, duration: 1.6 }}>
                  LEVEL UP
                </motion.p>
                <p className="text-3xl font-bold">Level {c.level}</p>
                <p className="mt-3 text-muted">[SYSTEM] You have grown stronger.</p>
                <p className="text-accent">+{c.points} stat points available</p>
              </>
            )}
            {c.kind === 'rank' && (
              <>
                <p className="sys-title">[ Rank Evaluation ]</p>
                <motion.div className="mx-auto my-4 flex h-28 w-28 items-center justify-center rounded-full border-2 border-accent text-6xl font-black glow-text"
                  initial={{ rotate: -90, scale: 0.3 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 80 }}>
                  {c.rank}
                </motion.div>
                <p className="text-2xl font-bold">RANK UP</p>
                <p className="mt-2 text-muted">
                  [SYSTEM] You are now a Rank {c.rank} {RANKS.find((r) => r.rank === c.rank)?.title}. Rewards increase slightly.
                </p>
              </>
            )}
            {c.kind === 'penaltyQuest' && (
              <>
                <p className="sys-title">[ Optional Penalty Quest ]</p>
                <p className="my-4 text-lg">{c.hint.text}</p>
                <p className="mb-4 text-sm text-muted">
                  No pressure. This is a small reset, not a punishment.
                  {c.refund > 0 ? ` Completing it gives back the ${c.refund.toLocaleString()} XP you lost.` : ''}
                </p>
                {c.hint.presetId && (
                  <button className={`${btnPrimary} mb-2`} onClick={async () => {
                    const r = await logActivity({ presetId: c.hint.presetId!, qty: c.hint.qty ?? 1, intensity: 'normal', ts: Date.now(), refundCap: c.refund, note: 'Penalty quest' });
                    next();
                    announce(r);
                  }}>I did it</button>
                )}
              </>
            )}
            <button className={`${c.kind === 'penaltyQuest' ? btnGhost : btnPrimary} mt-5 w-full`} onClick={next}>
              {c.kind === 'penaltyQuest' ? 'Skip' : 'Continue'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
