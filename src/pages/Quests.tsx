import { useState } from 'react';
import { QuestCard } from '../components/QuestCard';
import { SystemWindow } from '../components/SystemWindow';
import { btnGhost, btnPrimary, Field, inputCls, Sheet } from '../components/ui';
import { dayKey, dayStartTs } from '../engine/streak';
import { acceptAllDaily, addCustomQuest, regenerateDaily, stopRecurring, type CustomQuestInput } from '../game/quests';
import { DAY_TYPE_LABEL, dayType, setTodayFlags } from '../game/schedule';
import { useMode, usePresets, useProgress, useQuestBoard, useTemplates, useTodayFlags } from '../hooks';
import { useCelebrate } from '../store/celebrate';

export default function Quests() {
  const board = useQuestBoard();
  const p = useProgress();
  const mode = useMode();
  const flags = useTodayFlags();
  const templates = useTemplates();
  const presets = usePresets();
  const say = useCelebrate((s) => s.say);
  const [creating, setCreating] = useState(false);

  if (!p) return null;
  const rankMult = p.rank.rewardMult;
  const level = p.level;
  const todayStart = dayStartTs(dayKey(Date.now()));
  const now = Date.now();

  const dailies = board.filter((r) => r.q.kind === 'daily' && r.q.periodStart === todayStart);
  const emergency = board.filter((r) => r.q.kind === 'emergency' && r.q.periodStart === todayStart && r.q.status !== 'skipped');
  const boss = board.find((r) => r.q.kind === 'boss' && (r.q.periodEnd ?? 0) > now);
  const weekly = board.filter((r) => r.q.kind === 'weekly' && (r.q.periodEnd ?? 0) > now);
  const custom = board.filter((r) => r.q.kind === 'custom' && (r.q.status === 'active' || r.q.status === 'completed') && (r.q.periodEnd ?? now + 1) > now);
  const milestones = board.filter((r) => r.q.kind === 'milestone');
  const openMilestones = milestones.filter((r) => r.q.status === 'active');
  const doneMilestones = milestones.filter((r) => r.q.status === 'completed');
  const anyOffered = dailies.some((r) => r.q.status === 'offered') || emergency.some((r) => r.q.status === 'offered');
  const type = dayType(flags, mode);

  async function toggle(key: 'work' | 'college') {
    await setTodayFlags({ ...flags, [key]: !flags[key] });
    await regenerateDaily();
    say('[SYSTEM] Day type updated. Unaccepted quests were re-rolled.');
  }

  return (
    <div className="space-y-4">
      <SystemWindow title={DAY_TYPE_LABEL[type]}>
        <p className="mb-2 text-sm text-muted">[SYSTEM] Quests follow your day. Change today if your plans differ from your weekly schedule (edit that under Settings).</p>
        <div className="grid grid-cols-2 gap-2">
          {(['work', 'college'] as const).map((k) => (
            <button key={k} aria-pressed={flags[k]} onClick={() => void toggle(k)}
              className={`rounded-lg border px-3 ${flags[k] ? 'border-accent text-accent' : 'border-line text-muted'}`}>
              {k === 'work' ? '💼 Work today' : '🎓 College today'}
            </button>
          ))}
        </div>
      </SystemWindow>

      {emergency.length > 0 && (
        <SystemWindow title="Emergency quest">
          <ul className="space-y-2">{emergency.map((r) => <QuestCard key={r.q.id} row={r} level={level} rankMult={rankMult} />)}</ul>
        </SystemWindow>
      )}

      <SystemWindow title="Daily quests">
        {mode !== 'normal' && <p className="text-muted">[SYSTEM] {mode === 'rest' ? 'Rest Day' : 'Sick/Injury mode'}: no daily quests. Penalties are paused. Recover well.</p>}
        {mode === 'normal' && dailies.length === 0 && <p className="text-muted">[SYSTEM] Preparing today's quests...</p>}
        {dailies.length > 0 && (
          <>
            {anyOffered && <button className={`${btnPrimary} mb-3`} onClick={() => void acceptAllDaily()}>Accept all</button>}
            <ul className="space-y-2">{dailies.map((r) => <QuestCard key={r.q.id} row={r} level={level} rankMult={rankMult} />)}</ul>
            <p className="mt-3 text-xs text-muted">
              Skip anything you like, it never costs you. A small penalty only applies if you accept quests and finish none that day. Clear the whole set for a bonus.
            </p>
          </>
        )}
      </SystemWindow>

      {boss && (
        <SystemWindow title="Weekly boss raid">
          <ul className="space-y-2"><QuestCard row={boss} level={level} rankMult={rankMult} passive /></ul>
          <p className="mt-2 text-xs text-muted">Every task you log hurts the boss. Rest and sick days shrink its HP, so being unwell never makes it unbeatable. Resets Monday.</p>
        </SystemWindow>
      )}

      {weekly.length > 0 && (
        <SystemWindow title="Weekly quests">
          <ul className="space-y-2">{weekly.map((r) => <QuestCard key={r.q.id} row={r} level={level} rankMult={rankMult} />)}</ul>
        </SystemWindow>
      )}

      <SystemWindow title="My quests">
        {custom.length === 0 && templates.filter((t) => t.active).length === 0 && <p className="mb-2 text-sm text-muted">Create your own goals, one-off or repeating.</p>}
        <ul className="space-y-2">{custom.map((r) => <QuestCard key={r.q.id} row={r} level={level} rankMult={rankMult} />)}</ul>
        {templates.filter((t) => t.active).length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-xs uppercase tracking-wider text-muted">Repeating</p>
            <ul className="divide-y divide-line text-sm">
              {templates.filter((t) => t.active).map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2">
                  <span>{t.title} <span className="text-muted">· every {t.period === 'daily' ? 'day' : 'week'}</span></span>
                  <button className="px-2 text-red-300" onClick={() => void stopRecurring(t.id!)}>Stop</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button className={`${btnGhost} mt-3 w-full`} onClick={() => setCreating(true)}>＋ New quest</button>
      </SystemWindow>

      <SystemWindow title="Milestones">
        <ul className="space-y-2">{openMilestones.map((r) => <QuestCard key={r.q.id} row={r} level={level} rankMult={rankMult} passive />)}</ul>
        {doneMilestones.length > 0 && <p className="mt-3 text-sm text-accent">🏆 {doneMilestones.length} milestone(s) achieved: {doneMilestones.map((r) => r.q.title).join(', ')}</p>}
      </SystemWindow>

      {creating && (
        <Sheet title="New quest" onClose={() => setCreating(false)}>
          <NewQuestForm presets={presets.filter((x) => !x.isPenalty)} onDone={() => setCreating(false)} />
        </Sheet>
      )}
    </div>
  );
}

function NewQuestForm({ presets, onDone }: { presets: { id: string; name: string; unit: string }[]; onDone: () => void }) {
  const say = useCelebrate((s) => s.say);
  const [presetId, setPresetId] = useState(presets[0]?.id ?? '');
  const [target, setTarget] = useState('1');
  const [period, setPeriod] = useState<CustomQuestInput['period']>('today');
  const preset = presets.find((x) => x.id === presetId);
  const unitWord = ({ minutes: 'minutes', hours: 'hours', km: 'km', liters: 'litres', count: 'times / amount', none: '' } as Record<string, string>)[preset?.unit ?? 'none'];

  return (
    <div className="space-y-3">
      <Field label="Which task counts?">
        <select className={inputCls} value={presetId} onChange={(e) => setPresetId(e.target.value)}>
          {presets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      {preset && preset.unit !== 'none' && (
        <Field label={`How much? (${unitWord})`}>
          <input className={inputCls} type="number" inputMode="decimal" min={0} step="any" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
      )}
      <Field label="When?">
        <select className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value as CustomQuestInput['period'])}>
          <option value="today">Just today</option>
          <option value="week">This week</option>
          <option value="daily">Every day (repeating)</option>
          <option value="weekly">Every week (repeating)</option>
        </select>
      </Field>
      <p className="text-xs text-muted">The reward is worked out automatically from the task, like every other quest. It counts from what you log.</p>
      <button className={btnPrimary} disabled={!preset} onClick={async () => {
        await addCustomQuest({ presetId, target: Number(target) || 1, period });
        say('[SYSTEM] Quest created.');
        onDone();
      }}>Create quest</button>
    </div>
  );
}
