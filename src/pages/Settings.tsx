import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SystemWindow } from '../components/SystemWindow';
import { btnGhost, Field, inputCls, Segmented } from '../components/ui';
import { getSetting, requestPersistence, setSetting } from '../db/db';
import { setDayStartHour } from '../engine/streak';
import { DEFAULT_FORMULA, describeFormula, sanitizeFormula, type Difficulty, type Formula } from '../engine/formula';
import { DEFAULT_DAILY_RECOVERY, DEFAULT_DAY_START_HOUR, resetAllData } from '../game/actions';
import { seedDemo, wipeDemo } from '../game/demo';
import { downloadBackup, restoreBackup, shareBackup } from '../game/backup';
import { DAY_NAMES, getSchedule, setSchedule, type DayFlags } from '../game/schedule';
import { dailyTick } from '../game/startup';
import { useFormula } from '../hooks';
import { useCelebrate } from '../store/celebrate';

export default function Settings() {
  const formula = useFormula();
  const say = useCelebrate((s) => s.say);
  const [busy, setBusy] = useState(false);
  const dayStart = useLiveQuery(() => getSetting<number>('dayStartHour', DEFAULT_DAY_START_HOUR), [], DEFAULT_DAY_START_HOUR);
  const lastBackup = useLiveQuery(() => getSetting<number | null>('lastBackup', null), [], null);
  const schedule = useLiveQuery(getSchedule, [], undefined);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usedMb, setUsedMb] = useState<string>('');
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(false));
    navigator.storage?.estimate?.().then((e) => setUsedMb(((e.usage ?? 0) / 1_048_576).toFixed(1))).catch(() => undefined);
  }, []);
  const recovery = useLiveQuery(() => getSetting<number>('dailyRecovery', DEFAULT_DAILY_RECOVERY), [], DEFAULT_DAILY_RECOVERY);

  const save = (f: Formula) => setSetting('formula', sanitizeFormula(f));
  const num = (v: string) => (v === '' ? 0 : Number(v));

  const numField = (label: string, value: number, apply: (n: number) => Formula, step = 0.05) => (
    <Field label={label} key={label}>
      <input className={inputCls} type="number" inputMode="decimal" step={step} value={value} onChange={(e) => save(apply(num(e.target.value)))} />
    </Field>
  );

  return (
    <div className="space-y-4">
      <Link to="/profile" className="inline-block text-accent">← Back</Link>

      <SystemWindow title="Difficulty">
        <Segmented<Difficulty> label="Difficulty" value={formula.difficulty} onChange={(d) => save({ ...formula, difficulty: d })}
          options={[{ id: 'easy', label: 'Easy' }, { id: 'normal', label: 'Normal' }, { id: 'hard', label: 'Hard' }]} />
        <p className="mt-2 text-xs text-muted">Easy: gentler penalties, slightly lower rewards. Hard: bigger rewards, firmer penalties.</p>
      </SystemWindow>

      <SystemWindow title="Weekly schedule">
        <p className="mb-2 text-sm text-muted">Tell the System which days you work or have college, so quests fit your week. You can still change any single day on the Quests tab.</p>
        {schedule && (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1">Day</th><th>💼 Work</th><th>🎓 College</th></tr></thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <tr key={d} className="border-t border-line">
                  <td className="py-1">{DAY_NAMES[d]}</td>
                  {(['work', 'college'] as (keyof DayFlags)[]).map((k) => (
                    <td key={k}>
                      <input type="checkbox" className="h-6 w-6" aria-label={`${DAY_NAMES[d]} ${k}`} checked={schedule[d][k]}
                        onChange={(e) => void setSchedule({ ...schedule, [d]: { ...schedule[d], [k]: e.target.checked } })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SystemWindow>

      <SystemWindow title="Overnight recovery">
        <p className="mb-2 text-sm text-muted">HP you regain automatically each new day (on top of sleep logs and rest days). Raise it if you recover fast, lower it if you stay drained, 0 to turn it off. You can always set HP by hand on Home.</p>
        <Field label="HP per day">
          <input className={inputCls} type="number" inputMode="numeric" min={0} max={100} step={5} value={recovery}
            onChange={(e) => void setSetting('dailyRecovery', Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
        </Field>
      </SystemWindow>

      <SystemWindow title="Day starts at">
        <p className="mb-2 text-sm text-muted">Your "day" (streaks, daily recovery) rolls over at this hour, so staying up past midnight doesn't break your streak. 4 means 4 AM.</p>
        <Field label="Hour (0-11)">
          <input className={inputCls} type="number" inputMode="numeric" min={0} max={11} value={dayStart}
            onChange={(e) => { const h = Math.min(11, Math.max(0, Math.floor(Number(e.target.value) || 0))); setDayStartHour(h); void setSetting('dayStartHour', h); }} />
        </Field>
      </SystemWindow>

      <SystemWindow title="Data safety">
        <p className="text-sm text-muted">All your data lives only on this phone. Storage protected from auto-cleanup:{' '}
          <b className={persisted ? 'text-accent' : 'text-red-300'}>{persisted === null ? '…' : persisted ? 'yes' : 'not yet'}</b>
          {usedMb && ` · using ${usedMb} MB`}</p>
        {persisted === false && (
          <button className={`${btnGhost} mt-2 w-full`} onClick={async () => { const ok = await requestPersistence(); setPersisted(ok); say(ok ? '[SYSTEM] Data is now protected.' : '[SYSTEM] Chrome declined. Installing the app to your home screen usually fixes this.'); }}>Protect my data</button>
        )}
        <p className="mt-2 text-xs text-muted">This protects against automatic cleanup only. Clearing Chrome's site data or uninstalling the app still erases it, so keep a backup file.</p>
      </SystemWindow>

      <SystemWindow title="Backup & restore">
        <p className="mb-2 text-sm text-muted">
          Your data is a plain file you own. Save it to Files, Google Drive or email it to yourself, and restore it on any phone.
          Last backup: <b className="text-ink">{lastBackup ? new Date(lastBackup).toLocaleString() : 'never'}</b>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button className={btnGhost} onClick={async () => { const n = await downloadBackup(); say(`[SYSTEM] Saved ${n} to your Downloads.`); }}>Save backup file</button>
          <button className={btnGhost} onClick={async () => {
            try { say((await shareBackup()) ? '[SYSTEM] Backup shared.' : '[SYSTEM] Sharing is not available here. Use Save backup file.'); }
            catch { /* share sheet closed */ }
          }}>Share backup</button>
        </div>
        <label className={`${btnGhost} mt-2 flex w-full cursor-pointer items-center justify-center`}>
          Restore from backup file
          <input type="file" accept="application/json,.json" className="sr-only" onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if (!confirm('Restore this backup? Everything currently on this phone will be REPLACED by the file contents.')) return;
            try { const r = await restoreBackup(await file.text()); say(`[SYSTEM] Restored ${r.logs} logs.`); }
            catch (err) { say(`[SYSTEM] ${(err as Error).message}`); }
          }} />
        </label>
      </SystemWindow>

      <SystemWindow title="XP formula">
        <ul className="mb-3 list-disc space-y-1 pl-5 text-xs text-muted">
          {describeFormula(formula).map((l) => <li key={l}>{l}</li>)}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          {numField('XP multiplier', formula.xpMult, (n) => ({ ...formula, xpMult: n }))}
          {numField('Gold multiplier', formula.goldMult, (n) => ({ ...formula, goldMult: n }))}
          {numField('Stat rate', formula.statRate, (n) => ({ ...formula, statRate: n }), 0.005)}
          {numField('Safety cap: XP / log', formula.maxXpPerLog, (n) => ({ ...formula, maxXpPerLog: n }), 1000)}
          {numField('Light intensity', formula.intensity.light, (n) => ({ ...formula, intensity: { ...formula.intensity, light: n } }))}
          {numField('Normal intensity', formula.intensity.normal, (n) => ({ ...formula, intensity: { ...formula.intensity, normal: n } }))}
          {numField('Hard intensity', formula.intensity.hard, (n) => ({ ...formula, intensity: { ...formula.intensity, hard: n } }))}
          {numField('Tiredness: light', formula.fatigue.light, (n) => ({ ...formula, fatigue: { ...formula.fatigue, light: n } }))}
          {numField('Tiredness: normal', formula.fatigue.normal, (n) => ({ ...formula, fatigue: { ...formula.fatigue, normal: n } }))}
          {numField('Tiredness: hard', formula.fatigue.hard, (n) => ({ ...formula, fatigue: { ...formula.fatigue, hard: n } }))}
        </div>
        <button className={`${btnGhost} mt-3 w-full`} onClick={() => { void save(DEFAULT_FORMULA); say('[SYSTEM] Formula reset to defaults.'); }}>Reset formula</button>
        <p className="mt-2 text-xs text-muted">Per-task XP and gold values are edited under Manage tasks &amp; presets.</p>
      </SystemWindow>

      <SystemWindow title="Demo data">
        <p className="mb-3 text-sm text-muted">Adds about 10 days of sample activity so you can see charts and streaks. Wipe removes only the demo logs.</p>
        <div className="grid grid-cols-2 gap-2">
          <button className={btnGhost} disabled={busy} onClick={async () => { setBusy(true); const n = await seedDemo(); say(`[SYSTEM] Added ${n} demo logs.`); setBusy(false); }}>Add demo data</button>
          <button className={btnGhost} disabled={busy} onClick={async () => { setBusy(true); const n = await wipeDemo(); say(`[SYSTEM] Wiped ${n} demo logs.`); setBusy(false); }}>Wipe demo data</button>
        </div>
      </SystemWindow>

      <SystemWindow title="Danger zone">
        <button className={`${btnGhost} w-full text-red-300`} onClick={async () => {
          if (confirm('Erase ALL data (profile, logs, presets, settings)? This cannot be undone.')) {
            await resetAllData();
            await dailyTick();
            say('[SYSTEM] All data reset.');
          }
        }}>Reset all data</button>
      </SystemWindow>
    </div>
  );
}
