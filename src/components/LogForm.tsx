import { useMemo, useState } from 'react';
import type { LogEntry } from '../db/db';
import { computePenalty, computeReward, presetWeights } from '../engine/formula';
import { rankInfoForLevel } from '../engine/ranks';
import type { Intensity, Preset } from '../engine/types';
import { deleteLog, logActivity, updateLog } from '../game/actions';
import { useCategories, useFormula, useMode, useProgress } from '../hooks';
import { useCelebrate } from '../store/celebrate';
import { btnGhost, btnPrimary, Field, inputCls, Segmented } from './ui';

const UNIT_LABEL = { none: '', count: 'x', minutes: 'min', hours: 'h', km: 'km' } as const;

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

  const [qty, setQty] = useState(String(existing?.qty ?? preset.defaultQty));
  const [intensity, setIntensity] = useState<Intensity>(existing?.intensity ?? 'normal');
  const [when, setWhen] = useState(toLocalInput(existing?.ts ?? Date.now()));
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);

  const q = Math.max(0, Number(qty) || 0);
  const hasQty = preset.unit !== 'none';

  // Live preview using exactly the same functions the real log uses.
  const preview = useMemo(() => {
    const level = progress?.level ?? 1;
    if (preset.isPenalty) {
      const e = computePenalty(preset, formula, mode);
      return e.paused ? 'Rest/Sick mode: this penalty is paused (no effect).' : `-${e.xpLoss} XP · -${e.hpLoss} HP${e.breaksStreak ? ' · breaks streak today' : ''}`;
    }
    const cat = cats.find((c) => c.id === preset.categoryId);
    const r = computeReward(preset, q, intensity, {
      formula,
      rankRewardMult: rankInfoForLevel(level).rewardMult,
      weights: presetWeights(preset, cat?.weights ?? {}),
    });
    const stats = Object.entries(r.statGains).map(([k, v]) => `${k} +${v}`).join(' ');
    return `+${r.xp} XP · +${r.gold} gold${stats ? ' · ' + stats : ''}${r.hp ? ` · HP ${r.hp > 0 ? '+' : ''}${r.hp}` : ''}`;
  }, [preset, q, intensity, formula, mode, cats, progress?.level]);

  async function save() {
    setBusy(true);
    const input = { presetId: preset.id, qty: q, intensity, ts: new Date(when).getTime() || Date.now(), note: note.trim() || undefined };
    try {
      if (existing?.id) {
        await updateLog(existing.id, input);
        say('[SYSTEM] Log updated.');
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
        <Field label={`Amount (${UNIT_LABEL[preset.unit]})`}>
          <input className={inputCls} type="number" inputMode="decimal" min={0} step={preset.unit === 'km' || preset.unit === 'hours' ? 0.1 : 1}
            value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
      )}
      {!preset.isPenalty && (
        <Segmented label="Intensity" value={intensity} onChange={setIntensity}
          options={[{ id: 'light', label: 'Light' }, { id: 'normal', label: 'Normal' }, { id: 'hard', label: 'Hard' }]} />
      )}
      <Field label="When (backdate if needed)">
        <input className={inputCls} type="datetime-local" value={when} max={toLocalInput(Date.now() + 60_000)} onChange={(e) => setWhen(e.target.value)} />
      </Field>
      <Field label="Note (optional)">
        <input className={inputCls} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <p className="rounded-lg border border-line bg-black/30 p-3 text-sm text-accent" aria-live="polite">{preview}</p>
      <button className={btnPrimary} disabled={busy} onClick={save}>{existing ? 'Save changes' : preset.isPenalty ? 'Log it' : 'Complete'}</button>
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
