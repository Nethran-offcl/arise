import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SystemWindow } from '../components/SystemWindow';
import { btnGhost, Field, inputCls, Segmented } from '../components/ui';
import { setSetting } from '../db/db';
import { DEFAULT_FORMULA, describeFormula, sanitizeFormula, type Difficulty, type Formula } from '../engine/formula';
import { resetAllData } from '../game/actions';
import { seedDemo, wipeDemo } from '../game/demo';
import { useFormula } from '../hooks';
import { useCelebrate } from '../store/celebrate';

export default function Settings() {
  const formula = useFormula();
  const say = useCelebrate((s) => s.say);
  const [busy, setBusy] = useState(false);

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

      <SystemWindow title="XP formula">
        <ul className="mb-3 list-disc space-y-1 pl-5 text-xs text-muted">
          {describeFormula(formula).map((l) => <li key={l}>{l}</li>)}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          {numField('XP multiplier', formula.xpMult, (n) => ({ ...formula, xpMult: n }))}
          {numField('Gold multiplier', formula.goldMult, (n) => ({ ...formula, goldMult: n }))}
          {numField('Stat rate', formula.statRate, (n) => ({ ...formula, statRate: n }), 0.005)}
          {numField('Max XP / log', formula.maxXpPerLog, (n) => ({ ...formula, maxXpPerLog: n }), 10)}
          {numField('Light intensity', formula.intensity.light, (n) => ({ ...formula, intensity: { ...formula.intensity, light: n } }))}
          {numField('Normal intensity', formula.intensity.normal, (n) => ({ ...formula, intensity: { ...formula.intensity, normal: n } }))}
          {numField('Hard intensity', formula.intensity.hard, (n) => ({ ...formula, intensity: { ...formula.intensity, hard: n } }))}
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
            say('[SYSTEM] All data reset.');
          }
        }}>Reset all data</button>
        <p className="mt-2 text-xs text-muted">Backup export/import arrives in Phase 7.</p>
      </SystemWindow>
    </div>
  );
}
