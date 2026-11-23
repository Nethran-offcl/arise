import { payout } from '../engine/quests';
import { acceptQuest, canUndoQuest, restoreQuest, skipQuest, unacceptQuest } from '../game/quests';
import type { QuestRow } from '../hooks';
import { useCelebrate } from '../store/celebrate';
import { Bar, btnGhost } from './ui';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString());

const BADGE: Record<string, string> = {
  offered: 'New',
  active: 'Accepted',
  completed: 'Done ✓',
  failed: 'Expired',
  skipped: 'Skipped',
};

interface Props {
  row: QuestRow;
  level: number;
  rankMult: number;
  /** Hide Accept/Skip (used for the boss and milestones). */
  passive?: boolean;
  /** Today's free replacement is still available (skipping a daily quest gives you a new one). */
  canReplace?: boolean;
  /** Title of the quest that replaced this one when it was skipped. */
  replacedByTitle?: string;
}

/** One quest: title, live progress, what it pays right now, and Accept / Skip. */
export function QuestCard({ row, level, rankMult, passive, canReplace, replacedByTitle }: Props) {
  const say = useCelebrate((s) => s.say);
  const { q, progress, target } = row;
  const pay = payout(q, level, rankMult);
  const done = q.status === 'completed';
  const closed = q.status === 'failed' || q.status === 'skipped';
  const shown = Math.min(progress, target);

  return (
    <li className={`rounded-lg border p-3 ${done ? 'border-accent/60' : 'border-line'} ${closed ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{q.title}</p>
          {q.desc && <p className="text-xs text-muted">{q.desc}</p>}
        </div>
        <span className={`shrink-0 rounded-full border px-2 text-xs ${done ? 'border-accent text-accent' : 'border-line text-muted'}`}>
          {q.status === 'active' && ['boss', 'milestone', 'custom'].includes(q.kind) ? 'In progress' : BADGE[q.status]}
        </span>
      </div>

      {!done && !closed && (
        <div className="mt-2">
          <Bar value={shown} max={target} label={q.title} color={q.kind === 'boss' ? '#f87171' : 'var(--accent)'} />
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>
              {q.kind === 'boss' ? `Boss HP ${fmt(Math.max(0, target - progress))} / ${fmt(target)}` : `${fmt(shown)} / ${fmt(target)} ${q.unit}`}
            </span>
            <span className="text-accent">+{(done ? q.paidXp ?? pay.xp : pay.xp).toLocaleString()} XP · +{pay.gold} gold</span>
          </div>
        </div>
      )}
      {done && <p className="mt-1 text-xs text-accent">Paid +{(q.paidXp ?? 0).toLocaleString()} XP · +{q.paidGold ?? 0} gold</p>}

      {!passive && (q.status === 'offered' || q.status === 'active') && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          {q.status === 'offered'
            ? <button className="min-h-11 rounded-lg bg-accent font-semibold text-black" onClick={() => void acceptQuest(q.id!)}>Accept</button>
            : canUndoQuest(q)
              ? <button className={btnGhost} onClick={() => void unacceptQuest(q.id!)}>Undo accept</button>
              : <span className="flex items-center text-xs text-muted">Counts automatically as you log.</span>}
          <button className={btnGhost} onClick={async () => {
            const { replacement } = await skipQuest(q.id!);
            say(replacement ? `[SYSTEM] Skipped. A free replacement took its place: ${replacement.title}` : q.kind === 'daily' ? '[SYSTEM] Skipped. Today\'s free replacement is already used.' : '[SYSTEM] Skipped.', 5000);
          }}>{q.kind === 'daily' && canReplace ? 'Skip → new quest' : 'Skip'}</button>
        </div>
      )}
      {q.status === 'skipped' && replacedByTitle && <p className="mt-1 text-xs text-muted">Replaced by: {replacedByTitle}</p>}
      {!passive && q.status === 'active' && canUndoQuest(q) && <p className="mt-1 text-xs text-muted">Counts automatically as you log.</p>}
      {!passive && q.status === 'skipped' && canUndoQuest(q) && (q.periodEnd === null || q.periodEnd > Date.now()) && (
        <button className={`${btnGhost} mt-2 text-sm`} onClick={() => void restoreQuest(q.id!)}>Undo skip</button>
      )}
    </li>
  );
}
