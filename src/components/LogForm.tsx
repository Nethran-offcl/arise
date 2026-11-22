import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import type { LogEntry } from '../db/db';
import { computePenalty, computeReward, maxQtyFor, presetWeights } from '../engine/formula';
import { levelScale } from '../engine/levels';
import { masteryInfo, performanceBonus } from '../engine/progress';
import { rankInfoForLevel } from '../engine/ranks';
import { UNIT_SHORT, type Intensity, type Preset } from '../engine/types';
import { deleteLog, logActivity, updateLog } from '../game/actions';
import { loadProgressInputs } from '../game/progress';
import { useCategories, useFormula, useMode, useProgress } from '../hooks';
import { useCelebrate } from '../store/celebrate';
import { btnGhost, btnPrimary, Field, inputCls, Segmented } from './ui';

/** "datetime-local" wants local time in YYYY-MM-DDTHH:mm. */
const toLocalInput = (ts: number) => {
  const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

interface Props {
  preset: Preset;
  /** When set, we are editing this existing log. */
  existing?: LogEntry;
  onDone: () => void;
}

export function LogForm({ preset, existing, onDone }: Props) {
  const formula = useFormula();
  const mode = useMode();
  const cats = useCategories();
  const progress = useProgress();
  const announce = useCelebrate((s) => s.announce);
  const say = useCelebrate((s) => s.say);
  const announceQuests = useCelebrate((s) => s.announceQuests);

  const [qty, setQty] = useState(String(existing?.qty ?? preset.defaultQty));
  const [ml, setMl] = useState(false); // litres presets (water) can be typed in ml
  const [intensity, setIntensity] = useState<Intensity>(existing?.intensity ?? 'normal');
  const [when, setWhen] = useState(toLocalInput(existing?.ts ?? Date.now()));
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [confirmBig, setConfirmBig] = useState(false);
  // Progress tracking: pace presets ask for total minutes; others ask for a number directly.
  const initialPerf = existing?.perf ? String(preset.perf?.kind === 'pace' ? Math.round(existing.perf * existing.qty * 10) / 10 : existing.perf) : '';
  const [perfInput, setPerfInput] = useState(initialPerf);
  const whenTs = new Date(when).getTime() || Date.now();
  const prog = useLiveQuery(() => loadProgressInputs(preset.id, preset.categoryId, existing?.id, whenTs), [preset.id, preset.categoryId, existing?.id, whenTs]);

  const maxQ = maxQtyFor(preset.unit);
  const isLiters = preset.unit === 'liters';
  const typedAmount = Number(qty) || 0;
  const inUnits = isLiters && ml ? typedAmount / 1000 : typedAmount;
  const q = Math.min(maxQ, Math.max(0, inUnits));
  // Not a limit, just a typo check: far bigger than anything you've logged before needs a tick.
  const bigJump = !!prog?.maxQty && q > 3 * prog.maxQty && !(existing && q <= existing.qty);
  const hasQty = preset.unit !== 'none';
  const perfNum = Number(perfInput) || 0;
  // Pace = minutes per km; everything else is used as typed.
  const perfValue = !preset.perf || perfNum <= 0 ? undefined : preset.perf.kind === 'pace' ? (q > 0 ? perfNum / q : undefined) : perfNum;

  // Live preview using exactly the same functions the real log uses.
  const preview = useMemo(() => {
    const level = progress?.level ?? 1;
    if (preset.isPenalty) {
      const e = computePenalty(preset, formula, mode, levelScale(level));
      return { main: e.paused ? 'Rest/Sick mode: this penalty is paused (no effect).' : `-${e.xpLoss.toLocaleString()} XP · -${e.hpLoss} HP${e.breaksStreak ? ' · breaks streak today' : ''}`, detail: '' };
    }
    const cat = cats.find((c) => c.id === preset.categoryId);
    const perf = preset.perf && perfValue
      ? performanceBonus(preset.perf.kind, perfValue, prog?.perfValues ?? [], preset.perfStart)
      : { bonus: 0, pr: false, suspicious: false };
    const mastery = cat?.mastery === false ? masteryInfo(0) : masteryInfo(prog?.categoryEffort ?? 0);
    const r = computeReward(preset, q, intensity, {
      formula,
      level,
      rankRewardMult: rankInfoForLevel(level).rewardMult,
      perfBonus: perf.bonus,
      masteryBonus: mastery.bonus,
      weights: presetWeights(preset, cat?.weights ?? {}),
    });
    const stats = Object.entries(r.statGains).map(([k, v]) => `${k} +${v}`).join(' ');
    const parts = [`level x${r.levelScale}`];
    if (perf.bonus > 0) parts.push(`progress +${Math.round(perf.bonus * 100)}%`);
    if (mastery.bonus > 0) parts.push(`mastery +${Math.round(mastery.bonus * 100)}%`);
    return {
      main: `${perf.pr ? '🏆 NEW RECORD · ' : ''}+${r.xp.toLocaleString()} XP · +${r.gold} gold${stats ? ' · ' + stats : ''}${r.hp ? ` · HP ${r.hp > 0 ? '+' : ''}${r.hp}` : ''}`,
      detail: `${r.effortXp} for your effort · ${parts.join(' · ')}${perf.suspicious ? ' · ⚠ That result looks too good to be true, so no progress bonus. Check for a typo.' : ''}`,
    };
  }, [preset, q, intensity, formula, mode, cats, progress?.level, perfValue, prog]);

  async function save() {
    setBusy(true);
    const input = { presetId: preset.id, qty: q, intensity, ts: new Date(when).getTime() || Date.now(), note: note.trim() || undefined, perf: perfValue };
    try {
      if (existing?.id) {
        const done = await updateLog(existing.id, input);
        say('[SYSTEM] Log updated.');
        announceQuests(done);
      } else {
        announce(await logActivity(input));
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-lg font-semibold">{preset.name}</p>
      {hasQty && (
        <Field label={`Amount (${isLiters ? (ml ? 'ml' : 'L') : UNIT_SHORT[preset.unit]})`}>
          <input className={inputCls} type="number" inputMode="decimal" min={0} step={isLiters ? (ml ? 50 : 0.25) : preset.unit === 'km' || preset.unit === 'hours' ? 0.1 : 1}
            value={qty} onChange={(e) => setQty(e.target.value)} />
          {isLiters && (
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <button type="button" className="rounded-full border border-line px-3 text-muted" onClick={() => { const next = ml ? typedAmount / 1000 : typedAmount * 1000; setQty(String(Math.round(next * 1000) / 1000)); setMl(!ml); }}>
                Switch to {ml ? 'litres' : 'ml'}
              </button>
              {[250, 500, 1000].map((v) => (
                <button key={v} type="button" className="rounded-full border border-accent px-3 text-accent" onClick={() => setQty(String(Math.round((ml ? typedAmount + v : typedAmount + v / 1000) * 100) / 100))}>
                  +{v >= 1000 ? `${v / 1000} L` : `${v} ml`}
                </button>
              ))}
            </div>
          )}
          {inUnits > maxQ && <span className="mt-1 block text-xs text-red-300">Max {maxQ} per log. Counted as {maxQ}.</span>}
        </Field>
      )}
      {hasQty && bigJump && (
        <label className="flex items-start gap-3 rounded-lg border border-accent p-3 text-sm">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={confirmBig} onChange={(e) => setConfirmBig(e.target.checked)} />
          <span>That is more than 3x your biggest {preset.name.toLowerCase()} so far ({prog?.maxQty}). Tick to confirm it is correct. Nothing is capped, this only catches typos.</span>
        </label>
      )}
      {!preset.isPenalty && preset.categoryId !== 'recovery' && (
        <Segmented label="Intensity" value={intensity} onChange={setIntensity}
          options={[{ id: 'light', label: 'Light' }, { id: 'normal', label: 'Normal' }, { id: 'hard', label: 'Hard' }]} />
      )}
      {preset.perf && (
        <Field label={`${preset.perf.label} (optional, rewards improvement)`}>
          <input className={inputCls} type="number" inputMode="decimal" min={0} step="any" value={perfInput} onChange={(e) => setPerfInput(e.target.value)} />
          {preset.perf.kind === 'pace' && perfValue && <span className="mt-1 block text-xs text-muted">Pace: {perfValue.toFixed(2)} min per km</span>}
        </Field>
      )}
      <Field label="When (backdate if needed)">
        <input className={inputCls} type="datetime-local" value={when} max={toLocalInput(Date.now() + 60_000)} onChange={(e) => setWhen(e.target.value)} />
      </Field>
      <Field label="Note (optional)">
        <input className={inputCls} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="rounded-lg border border-line bg-black/30 p-3 text-sm" aria-live="polite">
        <p className="text-accent">{preview.main}</p>
        {preview.detail && <p className="mt-1 text-xs text-muted">{preview.detail}</p>}
      </div>
      <button className={btnPrimary} disabled={busy || (hasQty && bigJump && !confirmBig)} onClick={save}>{existing ? 'Save changes' : preset.isPenalty ? 'Log it' : 'Complete'}</button>
      {existing?.id && (
        <button className={`${btnGhost} w-full text-red-300`} onClick={async () => {
          if (confirm('Delete this log? Its XP, gold and stat gains will be removed.')) {
            await deleteLog(existing.id!);
            say('[SYSTEM] Log deleted.');
            onDone();
          }
        }}>Delete log</button>
      )}
    </div>
  );
}
