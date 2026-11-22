import { useState } from 'react';
import { db } from '../db/db';
import type { PerfKind, PerfSpec } from '../engine/progress';
import type { Preset, UnitKind } from '../engine/types';
import { useCategories } from '../hooks';
import { btnGhost, btnPrimary, Field, inputCls, Segmented } from './ui';

const UNITS: { id: UnitKind; label: string; word: string; typical: number }[] = [
  { id: 'none', label: 'Just done / not done', word: '', typical: 1 },
  { id: 'minutes', label: 'By minutes', word: 'minute', typical: 30 },
  { id: 'hours', label: 'By hours', word: 'hour', typical: 1 },
  { id: 'km', label: 'By kilometres', word: 'km', typical: 3 },
  { id: 'count', label: 'By count (reps, tasks...)', word: 'one', typical: 1 },
];

type Size = 'small' | 'medium' | 'big';
type Body = 'tiring' | 'neutral' | 'restful';
const SIZE_XP: Record<Size, number> = { small: 15, medium: 30, big: 60 };
const BODY_HP: Record<Body, Record<Size, number>> = {
  tiring: { small: -3, medium: -6, big: -12 },
  neutral: { small: 0, medium: 0, big: 0 },
  restful: { small: 3, medium: 6, big: 10 },
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';

/** Turns the simple choices (size + effect on your body) into the exact numbers. */
function fromSimple(unit: UnitKind, size: Size, body: Body) {
  const typical = UNITS.find((u) => u.id === unit)!.typical;
  const xp = SIZE_XP[size];
  const gold = Math.round(xp * 0.3);
  const hp = BODY_HP[body][size];
  if (unit === 'none') return { defaultQty: 1, baseXp: xp, xpPerUnit: 0, baseGold: gold, goldPerUnit: 0, hpDelta: hp, hpPerUnit: 0 };
  return { defaultQty: typical, baseXp: 0, xpPerUnit: r3(xp / typical), baseGold: 0, goldPerUnit: r3(gold / typical), hpDelta: 0, hpPerUnit: r3(hp / typical) };
}

/** Create or edit a preset. New tasks start in "simple" mode; exact numbers are optional. */
export function PresetForm({ initial, defaultCategory, onDone }: { initial?: Preset; defaultCategory?: string; onDone: (saved?: Preset) => void }) {
  const cats = useCategories().filter((c) => c.kind === 'task');
  const [advanced, setAdvanced] = useState(!!initial);
  const [name, setName] = useState(initial?.name ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? defaultCategory ?? 'tasks');
  const [unit, setUnit] = useState<UnitKind>(initial?.unit ?? 'minutes');
  const [size, setSize] = useState<Size>('medium');
  const [body, setBody] = useState<Body>('neutral');

  // Progress tracking (optional): what should earn bonus XP when you improve?
  const [perfKind, setPerfKind] = useState<PerfKind | 'none'>(initial?.perf?.kind ?? 'none');
  const [perfLabel, setPerfLabel] = useState(initial?.perf?.label ?? 'Heaviest weight (kg)');
  const [perfUnit, setPerfUnit] = useState(initial?.perf?.unit ?? 'kg');
  const [perfStart, setPerfStart] = useState(initial?.perfStart ? String(initial.perfStart) : '');
  const [defaultQty, setDefaultQty] = useState(String(initial?.defaultQty ?? 30));
  const [baseXp, setBaseXp] = useState(String(initial?.baseXp ?? 0));
  const [xpPerUnit, setXpPerUnit] = useState(String(initial?.xpPerUnit ?? 1));
  const [baseGold, setBaseGold] = useState(String(initial?.baseGold ?? 0));
  const [goldPerUnit, setGoldPerUnit] = useState(String(initial?.goldPerUnit ?? 0.3));
  const [hpDelta, setHpDelta] = useState(String(initial?.hpDelta ?? 0));
  const [hpPerUnit, setHpPerUnit] = useState(String(initial?.hpPerUnit ?? 0));

  const n = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : 0);
  const unitInfo = UNITS.find((u) => u.id === unit)!;

  const current = advanced
    ? { defaultQty: n(defaultQty), baseXp: Math.max(0, n(baseXp)), xpPerUnit: Math.max(0, n(xpPerUnit)), baseGold: Math.max(0, n(baseGold)), goldPerUnit: Math.max(0, n(goldPerUnit)), hpDelta: Math.round(n(hpDelta)), hpPerUnit: n(hpPerUnit) }
    : fromSimple(unit, size, body);

  const exampleQty = unit === 'none' ? 1 : current.defaultQty;
  const exXp = Math.round(current.baseXp + current.xpPerUnit * exampleQty);
  const exGold = Math.round(current.baseGold + current.goldPerUnit * exampleQty);
  const exHp = Math.round(current.hpDelta + current.hpPerUnit * exampleQty);
  const exampleLabel = unit === 'none' ? 'Each time you do it' : `Example: ${exampleQty} ${unitInfo.word}${exampleQty === 1 ? '' : 's'}`;

  function openAdvanced() {
    const v = fromSimple(unit, size, body);
    setDefaultQty(String(v.defaultQty)); setBaseXp(String(v.baseXp)); setXpPerUnit(String(v.xpPerUnit));
    setBaseGold(String(v.baseGold)); setGoldPerUnit(String(v.goldPerUnit)); setHpDelta(String(v.hpDelta)); setHpPerUnit(String(v.hpPerUnit));
    setAdvanced(true);
  }

  function buildPerf(): PerfSpec | undefined {
    if (perfKind === 'none') return undefined;
    if (perfKind === 'pace') return { kind: 'pace', label: 'Total time (minutes)', unit: 'min/km' };
    return { kind: perfKind, label: perfLabel.trim() || 'Result', unit: perfUnit.trim() };
  }

  async function save() {
    if (!name.trim()) return;
    const preset: Preset = {
      ...(initial ?? { isPenalty: false, breaksStreak: false, builtin: false }),
      id: initial?.id ?? `custom-${slug(name)}-${Date.now().toString(36)}`,
      categoryId,
      name: name.trim(),
      unit,
      ...current,
      perf: buildPerf(),
      perfStart: perfKind !== 'none' && Number(perfStart) > 0 ? Number(perfStart) : undefined,
    };
    await db.presets.put(preset);
    onDone(preset);
  }

  const per = unit === 'none' ? '' : ` for each ${unitInfo.word}`;

  return (
    <div className="space-y-3">
      <Field label="Name"><input className={inputCls} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cycling" /></Field>
      <Field label="Category (which stat it grows)">
        <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      </Field>
      <Field label="How do you measure it?">
        <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value as UnitKind)}>
          {UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </select>
      </Field>

      {!advanced && (
        <>
          <div>
            <span className="mb-1 block text-xs uppercase tracking-wider text-muted">How big is a normal session?</span>
            <Segmented<Size> label="Size" value={size} onChange={setSize} options={[{ id: 'small', label: 'Small' }, { id: 'medium', label: 'Medium' }, { id: 'big', label: 'Big' }]} />
          </div>
          <div>
            <span className="mb-1 block text-xs uppercase tracking-wider text-muted">How does it leave your body?</span>
            <Segmented<Body> label="Body effect" value={body} onChange={setBody} options={[{ id: 'tiring', label: 'Tiring' }, { id: 'neutral', label: 'Neutral' }, { id: 'restful', label: 'Restful' }]} />
          </div>
        </>
      )}

      {advanced && (
        <div className="space-y-2 rounded-lg border border-line p-3">
          {unit !== 'none' && (
            <Field label={`Usual amount (in ${unitInfo.word}s)`}><input className={inputCls} type="number" inputMode="decimal" value={defaultQty} onChange={(e) => setDefaultQty(e.target.value)} /></Field>
          )}
          <Field label="XP for doing it at all"><input className={inputCls} type="number" inputMode="decimal" value={baseXp} onChange={(e) => setBaseXp(e.target.value)} /></Field>
          {unit !== 'none' && <Field label={`Extra XP${per}`}><input className={inputCls} type="number" inputMode="decimal" value={xpPerUnit} onChange={(e) => setXpPerUnit(e.target.value)} /></Field>}
          <Field label="Gold for doing it at all"><input className={inputCls} type="number" inputMode="decimal" value={baseGold} onChange={(e) => setBaseGold(e.target.value)} /></Field>
          {unit !== 'none' && <Field label={`Extra gold${per}`}><input className={inputCls} type="number" inputMode="decimal" value={goldPerUnit} onChange={(e) => setGoldPerUnit(e.target.value)} /></Field>}
          <Field label="HP change each time (- tires you, + restores)"><input className={inputCls} type="number" inputMode="numeric" value={hpDelta} onChange={(e) => setHpDelta(e.target.value)} /></Field>
          {unit !== 'none' && <Field label={`Extra HP change${per}`}><input className={inputCls} type="number" inputMode="decimal" step={0.05} value={hpPerUnit} onChange={(e) => setHpPerUnit(e.target.value)} /></Field>}
        </div>
      )}

      <div className="space-y-2 rounded-lg border border-line p-3">
        <Field label="Reward getting better? (optional)">
          <select className={inputCls} value={perfKind} onChange={(e) => setPerfKind(e.target.value as PerfKind | 'none')}>
            <option value="none">No, just count the effort</option>
            {unit === 'km' && <option value="pace">Speed: I enter total time, the app works out pace</option>}
            <option value="higher">A number that should go UP (weight, rating, reps...)</option>
            <option value="lower">A number that should go DOWN (time, mistakes...)</option>
          </select>
        </Field>
        {(perfKind === 'higher' || perfKind === 'lower') && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Question to ask"><input className={inputCls} value={perfLabel} maxLength={50} onChange={(e) => setPerfLabel(e.target.value)} /></Field>
            <Field label="Unit"><input className={inputCls} value={perfUnit} maxLength={8} onChange={(e) => setPerfUnit(e.target.value)} /></Field>
          </div>
        )}
        {perfKind !== 'none' && (
          <Field label="Your starting level (optional)">
            <input className={inputCls} type="number" inputMode="decimal" step="any" value={perfStart} placeholder="Leave empty to use your first 3 results" onChange={(e) => setPerfStart(e.target.value)} />
          </Field>
        )}
        {perfKind !== 'none' && <p className="text-xs text-muted">Doing better than your starting level pays up to +75% XP, and a new personal record adds +15%. A slower or lighter day never costs XP.</p>}
      </div>

      <p className="rounded-lg border border-line bg-black/30 p-3 text-sm text-accent" aria-live="polite">
        {exampleLabel}: {exXp} XP · {exGold} gold · HP {exHp > 0 ? '+' : ''}{exHp}
      </p>

      {!advanced
        ? <button className={`${btnGhost} w-full text-sm`} onClick={openAdvanced}>Edit the exact numbers</button>
        : !initial && <button className={`${btnGhost} w-full text-sm`} onClick={() => setAdvanced(false)}>Back to simple</button>}
      <button className={btnPrimary} onClick={save} disabled={!name.trim()}>Save</button>
      <button className={`${btnGhost} w-full`} onClick={() => onDone()}>Cancel</button>
    </div>
  );
}
