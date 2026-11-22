import { Link } from 'react-router-dom';
import { dayKey, dayStartTs } from '../engine/streak';
import { useMode, useQuestBoard } from '../hooks';
import { Bar } from './ui';

/** Compact summary for Home: today's daily quests and the weekly boss. */
export function TodayQuests() {
  const board = useQuestBoard();
  const mode = useMode();
  const todayStart = dayStartTs(dayKey(Date.now()));
  const dailies = board.filter((r) => r.q.kind === 'daily' && r.q.periodStart === todayStart && r.q.status !== 'skipped');
  const done = dailies.filter((r) => r.q.status === 'completed').length;
  const boss = board.find((r) => r.q.kind === 'boss' && (r.q.status === 'active' || r.q.status === 'completed') && (r.q.periodEnd ?? 0) > Date.now());

  return (
    <div className="mt-3 space-y-3">
      {dailies.length > 0 ? (
        <Link to="/quests" className="block">
          <div className="mb-1 flex justify-between text-sm"><span>Daily quests</span><span className="text-muted">{done} / {dailies.length} done</span></div>
          <Bar value={done} max={dailies.length} label="Daily quests" />
        </Link>
      ) : (
        <p className="text-sm text-muted">{mode === 'normal' ? 'No daily quests yet. Open the Quests tab.' : 'Rest/Sick mode: no daily quests today. Recover well.'}</p>
      )}
      {boss && (
        <Link to="/quests" className="block">
          <div className="mb-1 flex justify-between text-sm"><span>{boss.q.bossName}</span><span className="text-muted">{boss.q.status === 'completed' ? 'Defeated ✓' : `HP ${Math.max(0, Math.round(boss.target - boss.progress)).toLocaleString()}`}</span></div>
          <Bar value={Math.min(boss.progress, boss.target)} max={boss.target} color="#f87171" label="Boss progress" />
        </Link>
      )}
    </div>
  );
}
