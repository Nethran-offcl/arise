import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import { e1rm, MUSCLES, muscleLabel, type Lift, type LiftResult, type MuscleId } from '../engine/lifts';
import { addExercise, loadLastLift } from '../game/lifts';
import { btnGhost, btnPrimary, Field, inputCls, Sheet } from './ui';

const kg = (n: number) => `${Math.round(n * 10) / 10}`;

/** The exercises done in a gym session: pick a muscle, pick or add an exercise, enter weight and (optionally) reps. */
export function LiftsEditor({ value, onChange, rows }: { value: Lift[]; onChange: (l: Lift[]) => void; rows?: LiftResult[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wider text-muted">Exercises (optional)</p>
      {value.length === 0 && <p className="text-xs text-muted">Add the exercises you did with their weight. Each exercise is compared with its own history, so lifting more or doing more reps pays a progress bonus.</p>}
      <ul className="space-y-2">
        {value.map((l, i) => {
          const r = rows?.find((x) => x.lift.exerciseId === l.exerciseId && x.lift.weight === l.weight && x.lift.reps === l.reps);
          return (
            <li key={`${l.exerciseId}-${i}`} className="flex items-start justify-between gap-2 rounded-lg border border-line p-2 text-sm">
              <span>
                <b>{l.name}</b> <span className="text-muted">· {muscleLabel(l.muscle)}</span>
                <span className="block">{kg(l.weight)} kg × {l.reps} <span className="text-xs text-muted">(est. max {kg(e1rm(l.weight, l.reps))} kg)</span></span>
                {r && r.pr && <span className="block text-xs text-accent">🏆 New record for this exercise · +{Math.round(r.bonus * 100)}% XP</span>}
                {r && !r.pr && r.bonus > 0 && <span className="block text-xs text-accent">Progress +{Math.round(r.bonus * 100)}% XP</span>}
                {r?.suspicious && <span className="block text-xs text-red-300">⚠ Much more than your usual: check for a typo (no bonus).</span>}
              </span>
              <button type="button" aria-label={`Remove ${l.name}`} className="min-h-9 px-2 text-red-300" onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
            </li>
          );
        })}
      </ul>
      <button type="button" className={`${btnGhost} w-full`} onClick={() => setAdding(true)}>＋ Add exercise</button>
      {adding && (
        <Sheet title="Add exercise" onClose={() => setAdding(false)}>
          <AddLift onAdd={(l) => onChange([...value, l])} onClose={() => setAdding(false)} />
        </Sheet>
      )}
    </div>
  );
}

function AddLift({ onAdd, onClose }: { onAdd: (l: Lift) => void; onClose: () => void }) {
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], []);
  const [muscle, setMuscle] = useState<MuscleId>('chest');
  const [selId, setSelId] = useState('');
  const [newName, setNewName] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const list = exercises.filter((e) => e.muscle === muscle).sort((a, b) => a.name.localeCompare(b.name));
  const sel = exercises.find((e) => e.id === selId);
  const last = useLiveQuery(() => (selId ? loadLastLift(selId) : null), [selId], null);

  async function create(name: string) {
    if (!name.trim()) return;
    const ex = await addExercise(name, muscle);
    setSelId(ex.id);
    setNewName('');
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-xs uppercase tracking-wider text-muted">1. Muscle</p>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Muscle group">
          {MUSCLES.map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={muscle === m.id}
              onClick={() => { setMuscle(m.id); if (sel && sel.muscle !== m.id) setSelId(''); }}
              className={`shrink-0 rounded-full border px-3 text-sm ${muscle === m.id ? 'border-accent text-accent' : 'border-line text-muted'}`}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs uppercase tracking-wider text-muted">2. Exercise</p>
        <div className="grid grid-cols-2 gap-2">
          {list.map((e) => (
            <button key={e.id} type="button" aria-pressed={selId === e.id} onClick={() => setSelId(e.id)}
              className={`min-h-12 rounded-lg border px-2 text-left text-sm ${selId === e.id ? 'border-accent text-accent' : 'border-line'}`}>{e.name}</button>
          ))}
        </div>
        {list.length === 0 && <p className="text-sm text-muted">No saved {muscleLabel(muscle).toLowerCase()} exercises yet. Add one below.</p>}
        <div className="mt-2 flex gap-2">
          <input className={inputCls} value={newName} maxLength={40} placeholder={`New ${muscleLabel(muscle).toLowerCase()} exercise name`} onChange={(e) => setNewName(e.target.value)} aria-label="New exercise name" />
          <button type="button" className={`${btnGhost} shrink-0`} disabled={!newName.trim()} onClick={() => void create(newName)}>Save</button>
        </div>
        <button type="button" className="mt-2 text-sm text-accent" onClick={() => void create(`${muscleLabel(muscle)} (general)`)}>
          Just track {muscleLabel(muscle).toLowerCase()} without naming an exercise
        </button>
        <p className="mt-1 text-xs text-muted">Exercises you save here show up next time, so you only type each name once.</p>
      </div>

      {sel && (
        <div className="space-y-3 rounded-lg border border-line p-3">
          <p className="font-semibold">{sel.name}</p>
          {last && <p className="text-sm text-muted">Last time: {kg(last.weight)} kg × {last.reps} ({new Date(last.ts).toLocaleDateString()}) · best est. max {kg(last.bestE1rm)} kg</p>}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Max weight (kg)"><input className={inputCls} type="number" inputMode="decimal" min={0} step={0.5} value={weight} placeholder={last ? kg(last.weight) : ''} onChange={(e) => setWeight(e.target.value)} /></Field>
            <Field label="Reps (optional)"><input className={inputCls} type="number" inputMode="numeric" min={1} step={1} value={reps} placeholder={last ? String(last.reps) : '1'} onChange={(e) => setReps(e.target.value)} /></Field>
          </div>
          <p className="text-xs text-muted">Add reps when you got more of them at the same weight. The System estimates your max from weight and reps, so extra reps count as progress.</p>
          <button type="button" className={btnPrimary} disabled={!(Number(weight) > 0)} onClick={() => {
            onAdd({ exerciseId: sel.id, name: sel.name, muscle: sel.muscle, weight: Number(weight), reps: Math.max(1, Math.round(Number(reps) || 1)) });
            onClose();
          }}>Add to this session</button>
        </div>
      )}
    </div>
  );
}
