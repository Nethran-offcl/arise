import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, btnGhost, btnPrimary, Segmented } from '../components/ui';
import { SystemWindow } from '../components/SystemWindow';
import { cancelFocus, claimFocus, FOCUS_CHOICES, focusProgress, getFocus, startFocus } from '../game/focus';
import { play } from '../lib/sfx';
import { useCelebrate } from '../store/celebrate';

const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Pomodoro focus timer. It keeps counting while the app is closed, and pays INT / Discipline XP when you finish. */
export default function Focus() {
  const timer = useLiveQuery(() => getFocus(), [], undefined);
  const announce = useCelebrate((s) => s.announce);
  const say = useCelebrate((s) => s.say);
  const [minutes, setMinutes] = useState('25');
  const [task, setTask] = useState<'focus' | 'study'>('focus');
  const [now, setNow] = useState(Date.now());
  const [breakEnd, setBreakEnd] = useState<number | null>(null);
  const alerted = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const prog = timer ? focusProgress(timer, now) : null;
  useEffect(() => {
    if (prog?.done && !alerted.current) { alerted.current = true; play('quest'); }
    if (!timer) alerted.current = false;
  }, [prog?.done, timer]);

  const breakLeft = breakEnd ? Math.max(0, breakEnd - now) : 0;

  return (
    <div className="space-y-4">
      <Link to="/profile" className="inline-block text-accent">← Back</Link>

      {timer === undefined && null}
      {timer === null && (
        <SystemWindow title="Focus timer">
          <p className="mb-3 text-sm text-muted">Work with no distractions for a set time. Finish it and you earn XP for Intelligence and Discipline.</p>
          <p className="mb-1 text-xs uppercase tracking-wider text-muted">Length</p>
          <div className="mb-3 grid grid-cols-4 gap-2">
            {FOCUS_CHOICES.map((m) => (
              <button key={m} aria-pressed={minutes === String(m)} onClick={() => setMinutes(String(m))}
                className={`rounded-lg border ${minutes === String(m) ? 'border-accent text-accent' : 'border-line'}`}>{m} min</button>
            ))}
          </div>
          <Segmented label="Counts as" value={task} onChange={setTask} options={[{ id: 'focus', label: 'Focus session' }, { id: 'study', label: 'Study hours' }]} />
          <button className={`${btnPrimary} mt-4`} onClick={() => { void startFocus(Number(minutes), task); setBreakEnd(null); }}>Start focusing</button>
          {breakLeft > 0 && <p className="mt-3 text-center text-accent">Break: {mmss(breakLeft)}. Stretch, drink water, rest your eyes.</p>}
        </SystemWindow>
      )}

      {timer && prog && (
        <SystemWindow title={prog.done ? 'Session complete' : 'Focusing'}>
          <p className="text-center text-6xl font-black tabular-nums glow-text" aria-live="off">{prog.done ? '00:00' : mmss(prog.remainingMs)}</p>
          <div className="my-4"><Bar value={prog.fraction * 100} max={100} label="Focus progress" /></div>
          {prog.done ? (
            <button className={btnPrimary} onClick={async () => {
              const r = await claimFocus();
              if (r) { announce(r); setBreakEnd(Date.now() + 5 * 60_000); }
            }}>Claim reward</button>
          ) : (
            <>
              <p className="text-center text-sm text-muted">You can leave the app. The timer keeps counting and your reward will wait for you.</p>
              <button className={`${btnGhost} mt-3 w-full`} onClick={() => { if (confirm('Stop this session? You will not earn XP for it.')) { void cancelFocus(); say('[SYSTEM] Session cancelled. No penalty.'); } }}>Cancel</button>
            </>
          )}
        </SystemWindow>
      )}
    </div>
  );
}
