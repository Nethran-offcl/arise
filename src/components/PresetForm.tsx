import { useState } from 'react';
import { db } from '../db/db';
import type { Preset, UnitKind } from '../engine/types';
import { useCategories } from '../hooks';
import { btnGhost, btnPrimary, Field, inputCls } from './ui';

const UNITS: { id: UnitKind; label: string }[] = [
  { id: 'none', label: 'Just done / not done' },
  { id: 'count', label: 'Count (reps, tasks, chores...)' },
  { id: 'minutes', label: 'Minutes' },
  { id: 'hours', label: 'Hours' },
  { id: 'km', label: 'Kilometres' },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';

/** Create or edit a preset (works for built-in and custom ones). */
export function PresetForm({ initial, defaultCategory, onDone }: { initial?: Preset; defaultCategory?: string; onDone: (saved?: Preset) => void }) {
  const cats = useCategories().filter((c) => c.kind === 'task');
  const [name, setName] = useState(initial?.name ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? defaultCategory ?? 'tasks');
  const [unit, setUnit] = useState<UnitKind>(initial?.unit ?? 'count');
  const [defaultQty, setDefaultQty] = useState(String(initial?.defaultQty ?? 1));
  const [baseXp, setBaseXp] = useState(String(initial?.baseXp ?? 0));
  const [xpPerUnit, setXpPerUnit] = useState(String(initial?.xpPerUnit ?? 15));
  const [goldPerUnit, setGoldPerUnit] = useState(String(initial?.goldPerUnit ?? 5));
  const [baseGold, setBaseGold] = useState(String(initial?.baseGold ?? 0));
  const [hpDelta, setHpDelta] = useState(String(initial?.hpDelta ?? 0));

  const n = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : 0);

  async function save() {
    if (!name.trim()) return;
    const preset: Preset = {
      ...(initial ?? { isPenalty: false, breaksStreak: false, builtin: false }),
      id: initial?.id ?? `custom-${slug(name)}-${Date.now().toString(36)}`,
      categoryId,
      name: name.trim(),
      unit,
      defaultQty: n(defaultQty),
      baseXp: Math.max(0, n(baseXp)),
      xpPerUnit: Math.max(0, n(xpPerUnit)),
      baseGold: Math.max(0, n(baseGold)),
      goldPerUnit: Math.max(0, n(goldPerUnit)),
      hpDelta: Math.round(n(hpDelta)),
    };
    await db.presets.put(preset);
    onDone(preset);
  }

  return (
    <div className="space-y-3">
      <Field label="Name"><input className={inputCls} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cycling" /></Field>
      <Field label="Category">
        <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      </Field>
      <Field label="Measured in">
        <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value as UnitKind)}>
          {UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Default amount"><input className={inputCls} type="number" inputMode="decimal" value={defaultQty} onChange={(e) => setDefaultQty(e.target.value)} /></Field>
        <Field label="HP change"><input className={inputCls} type="number" inputMode="numeric" value={hpDelta} onChange={(e) => setHpDelta(e.target.value)} /></Field>
        <Field label="Base XP"><input className={inputCls} type="number" inputMode="decimal" value={baseXp} onChange={(e) => setBaseXp(e.target.value)} /></Field>
        <Field label="XP per unit"><input className={inputCls} type="number" inputMode="decimal" value={xpPerUnit} onChange={(e) => setXpPerUnit(e.target.value)} /></Field>
        <Field label="Base gold"><input className={inputCls} type="number" inputMode="decimal" value={baseGold} onChange={(e) => setBaseGold(e.target.value)} /></Field>
        <Field label="Gold per unit"><input className={inputCls} type="number" inputMode="decimal" value={goldPerUnit} onChange={(e) => setGoldPerUnit(e.target.value)} /></Field>
      </div>
      <p className="text-xs text-muted">Reward = base + per-unit x amount (then intensity, difficulty and rank multipliers).</p>
      <button className={btnPrimary} onClick={save} disabled={!name.trim()}>Save</button>
      <button className={`${btnGhost} w-full`} onClick={() => onDone()}>Cancel</button>
    </div>
  );
}
