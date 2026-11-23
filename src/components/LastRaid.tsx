import { lastRaidRecap } from '../engine/quests';
import type { QuestRow } from '../hooks';
import { SystemWindow } from './SystemWindow';
import { Bar } from './ui';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString());

/** How last week ended, so a weekly reset never makes your progress disappear without a trace. */
export function LastRaid({ board }: { board: QuestRow[] }) {
  const r = lastRaidRecap(board, Date.now());
  if (!r) return null;
  const won = r.status === 'completed';

  return (
    <SystemWindow title="Last week's raid">
      <p className="font-semibold">{r.bossName}</p>
      <p className="mt-1 text-sm">
        {won
          ? `🏆 Defeated! You earned +${r.paidXp.toLocaleString()} XP and +${r.paidGold} gold.`
          : `The boss escaped with ${fmt(r.remaining)} HP left. You dealt ${r.percent}% of its health.`}
      </p>
      <div className="my-2"><Bar value={r.dealt} max={r.target} color={won ? 'var(--accent)' : '#f87171'} label="Last week's boss damage" /></div>
      <p className="text-xs text-muted">{fmt(r.dealt)} / {fmt(r.target)} damage · week ended {new Date(r.endedAt).toLocaleDateString([], { weekday: 'long' })}</p>

      {r.weekly.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {r.weekly.map((w) => (
            <li key={w.title} className="flex justify-between gap-2">
              <span>{w.status === 'completed' ? '✅' : '▫️'} {w.title}</span>
              <span className="shrink-0 text-muted">{fmt(w.progress)} / {fmt(w.target)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">Your logs, XP and gold from the week are all safe: they were paid when you logged. Only the boss and weekly quest bonuses reset, every Monday at 4 AM.</p>
    </SystemWindow>
  );
}
