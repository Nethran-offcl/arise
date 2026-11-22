import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db, type LogEntry } from '../db/db';
import { computeReward, presetWeights } from '../engine/formula';
import { rankInfoForLevel } from '../engine/ranks';
import { dayKey } from '../engine/streak';
import { deleteLog, logActivity, updateLog } from '../game/actions';
import { DEFAULT_SLEEP_GOAL, getSleepGoal, getSleepTargets, SLEEP_ON_TIME_GRACE_MIN, sleepOnTime, sleepWindow } from '../game/sleep';
import { useCategories, useFormula, usePresets, useProgress } from '../hooks';
import { useCelebrate } from '../store/celebrate';
import { btnGhost, btnPrimary, Field, inputCls } from './ui';

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const localTime = (ts: number) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** Log last night's sleep by bedtime and wake time. Hours are worked out for you. */
export function SleepForm({ existing, onDone }: { existing?: LogEntry; onDone: () => void }) {
  const targets = useLiveQuery(getSleepTargets, [], undefined);
  const goal = useLiveQuery(getSleepGoal, [], DEFAULT_SLEEP_GOAL);
  const formula = useFormula();
  const cats = useCategories();
  const presets = usePresets();
  const progress = useProgress();
  const announce = useCelebrate((s) => s.announce);
  const announceQuests = useCelebrate((s) => s.announceQuests);
  const say = useCelebrate((s) => s.say);

  // New entry: if it is still before your usual wake time, "last night" means yesterday morning's wake-up
  const defaultWake = () => {
    const n = new Date();
    const usual = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 7, 0).getTime();
    return n.getTime() >= usual ? n.getTime() : n.getTime() - 86_400_000;
  };
  const wake0 = existing?.sleep?.wake ?? existing?.ts ?? defaultWake();
  const bed0 = existing?.sleep?.bed ?? (existing ? existing.ts - existing.qty * 3_600_000 : undefined);
  const [wakeDate, setWakeDate] = useState(localDate(wake0));
  const [bedTime, setBedTime] = useState(bed0 ? localTime(bed0) : '');
  const [wakeTime, setWakeTime] = useState(existing ? localTime(wake0) : '');
  const [another, setAnother] = useState(false);
  const [busy, setBusy] = useState(false);

  // Fill from your sleep targets (Settings) until you type something
  const bed = bedTime || targets?.bed || '23:00';
  const wake = wakeTime || targets?.wake || '07:00';
  const win = sleepWindow(wakeDate, bed, wake);
  const future = win.wakeTs > Date.now() + 5 * 60_000;
  const valid = win.hours >= 0.5 && win.hours <= 16 && !future;
  const onTime = !!targets && sleepOnTime(win.bedTs, targets.bed);
  const wakeDay = dayKey(win.wakeTs);

  const sameDay = useLiveQuery(
    () => db.logs.where('presetId').equals('sleep-hours').filter((l) => dayKey(l.ts) === wakeDay && l.id !== existing?.id).count(),
    [wakeDay, existing?.id],
    0,
  );

  const preset = presets.find((p) => p.id === 'sleep-hours');
  const preview = useMemo(() => {
    if (!preset || !valid) return '';
    const level = progress?.level ?? 1;
    const cat = cats.find((c) => c.id === preset.categoryId);
    const r = computeReward(preset, win.hours, 'normal', { formula, level, rankRewardMult: rankInfoForLevel(level).rewardMult, weights: presetWeights(preset, cat?.weights ?? {}) });
    return `+${r.xp.toLocaleString()} XP · +${r.gold} gold · HP +${r.hp}${win.hours > (preset.rewardCap ?? 99) ? ` (only the first ${preset.rewardCap} h earn rewards)` : ''}`;
  }, [preset, valid, win.hours, formula, cats, progress?.level]);

  async function save() {
    if (!valid) return;
    setBusy(true);
    try {
      const input = { presetId: 'sleep-hours', qty: Math.round(win.hours * 100) / 100, intensity: 'normal' as const, ts: win.wakeTs, sleep: { bed: win.bedTs, wake: win.wakeTs } };
      if (existing?.id) {
        announceQuests(await updateLog(existing.id, input));
        say('[SYSTEM] Sleep updated.');
      } else {
        announce(await logActivity(input));
        // "Slept on time" bonus, once per day, only if your bedtime was within the grace period of your target
        if (onTime && (await db.presets.get('sleep-ontime'))) {
          const done = await db.logs.where('presetId').equals('sleep-ontime').filter((l) => dayKey(l.ts) === wakeDay).count();
          if (!done) announce(await logActivity({ presetId: 'sleep-ontime', qty: 1, intensity: 'normal', ts: win.wakeTs }));
        }
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-lg font-semibold">😴 Sleep</p>
      <Field label="Woke up on">
        <input className={inputCls} type="date" value={wakeDate} max={localDate(Date.now())} onChange={(e) => setWakeDate(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Went to bed"><input className={inputCls} type="time" value={bed} onChange={(e) => setBedTime(e.target.value)} /></Field>
        <Field label="Woke up"><input className={inputCls} type="time" value={wake} onChange={(e) => setWakeTime(e.target.value)} /></Field>
      </div>
      <div className="rounded-lg border border-line bg-black/30 p-3 text-sm" aria-live="polite">
        <p className={valid ? 'text-accent' : 'text-red-300'}>
          {valid ? `${Math.floor(win.hours)} h ${Math.round((win.hours % 1) * 60)} min of sleep` : future ? 'That wake time is still in the future. Pick the day and time you actually woke up.' : 'That does not look right: check the times (0.5 to 16 hours).'}
        </p>
        {valid && <p className="mt-1 text-xs text-muted">{preview}</p>}
        {valid && <p className="mt-1 text-xs text-muted">{win.hours < goal.min ? `Below your ${goal.min}-${goal.max} h goal.` : win.hours <= goal.max + 0.01 ? `✓ Within your ${goal.min}-${goal.max} h goal.` : `Above your ${goal.min}-${goal.max} h goal. Fine now and then.`}</p>}
        {valid && targets && <p className="mt-1 text-xs text-muted">{onTime ? `✓ Bedtime on time (target ${targets.bed}, ${SLEEP_ON_TIME_GRACE_MIN} min grace): you also get the Slept on time bonus.` : `Bedtime target is ${targets.bed}. Change it in Settings.`}</p>}
      </div>
      {sameDay > 0 && !existing && (
        <label className="flex items-start gap-3 rounded-lg border border-accent p-3 text-sm">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={another} onChange={(e) => setAnother(e.target.checked)} />
          <span>You already logged sleep for this day. Tick only if this is a separate sleep (like a nap), otherwise edit the first entry from the recent logs.</span>
        </label>
      )}
      <button className={btnPrimary} disabled={busy || !valid || (sameDay > 0 && !existing && !another)} onClick={save}>{existing ? 'Save changes' : 'Log sleep'}</button>
      {existing?.id && (
        <button className={`${btnGhost} w-full text-red-300`} onClick={async () => {
          if (confirm('Delete this sleep entry?')) { await deleteLog(existing.id!); say('[SYSTEM] Sleep entry deleted.'); onDone(); }
        }}>Delete entry</button>
      )}
    </div>
  );
}
