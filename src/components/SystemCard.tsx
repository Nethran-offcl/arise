import { Link } from 'react-router-dom';
import { buildAdvice, generateInsights } from '../engine/system';
import { setMode } from '../game/actions';
import { regenerateDaily } from '../game/quests';
import { setGentleDay } from '../game/system';
import { useSnapshot } from '../hooks';
import { useCelebrate } from '../store/celebrate';
import { SystemWindow } from './SystemWindow';
import { btnGhost } from './ui';

const TONE = { warn: 'border-red-400/60 text-red-200', info: 'border-line text-ink', good: 'border-accent/60 text-ink' } as const;
const DOT = { warn: '⚠️', info: '💡', good: '✅' } as const;

/** Home: the System's read on you. Burnout/recovery advice, exam focus, and your top insights. */
export function SystemCard() {
  const snap = useSnapshot();
  const say = useCelebrate((s) => s.say);
  if (!snap) return null;
  const advice = buildAdvice(snap);
  const insights = generateInsights(snap, 7).filter((i) => i.id !== 'burnout').slice(0, 3);
  const worn = advice.burnout.level !== 'low' || advice.adapt.gentle;

  return (
    <SystemWindow title="System insights">
      {worn && snap.mode === 'normal' && (
        <div className="mb-3 rounded-lg border border-red-400/60 p-3 text-sm">
          <p className="font-semibold">{advice.adapt.gentle ? '🛌 Recovery day' : 'You may be running low'}</p>
          <p className="mt-1 text-muted">{advice.notes[0] ?? advice.burnout.advice} {advice.burnout.reasons.slice(0, 2).join(' ')}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {snap.forceGentle ? (
              <button className={btnGhost} onClick={async () => { await setGentleDay(false); await regenerateDaily(); say('[SYSTEM] Back to your normal quests.'); }}>Back to normal</button>
            ) : (
              <button className={btnGhost} onClick={async () => { await setGentleDay(true); await regenerateDaily(); say('[SYSTEM] Gentle quests set for today.'); }}>Gentle quests today</button>
            )}
            <button className={btnGhost} onClick={async () => { await setMode('rest'); say('[SYSTEM] Rest Day started. Penalties paused.'); }}>Start a Rest Day</button>
          </div>
        </div>
      )}

      {advice.exam.mode !== 'none' && (
        <p className="mb-3 rounded-lg border border-accent/60 p-3 text-sm">📚 {advice.exam.label}. Quests lean toward study.</p>
      )}

      {insights.length === 0 && <p className="text-sm text-muted">[SYSTEM] Log a few days and I will start spotting patterns for you.</p>}
      <ul className="space-y-2">
        {insights.map((i) => (
          <li key={i.id} className={`rounded-lg border p-3 text-sm ${TONE[i.tone]}`}>
            <p className="font-semibold">{DOT[i.tone]} {i.title}</p>
            <p className="mt-1 text-muted">{i.text}</p>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-between text-sm text-accent">
        <Link to="/stats">All analysis →</Link>
        <Link to="/review">Weekly review →</Link>
      </div>
    </SystemWindow>
  );
}
