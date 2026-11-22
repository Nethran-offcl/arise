import { db, ensureProfile, getSetting, setSetting, type LogEntry, type Profile } from '../db/db';
import { DEFAULT_CATEGORIES, DEFAULT_PRESETS } from '../engine/defaults';
import { computePenalty, computeReward, DEFAULT_FORMULA, maxQtyFor, presetWeights, sanitizeFormula, type Formula } from '../engine/formula';
import { applyXpDelta, freeStatPoints, levelFromXp, levelScale } from '../engine/levels';
import { masteryInfo, performanceBonus } from '../engine/progress';
import { loadProgressInputs } from './progress';
import { shadowBonusFor } from '../engine/shadows';
import { evaluateQuests, type QuestCompletion } from './quests';
import { checkShadow, type ExtractedShadow } from './shadows';
import { checkTrophies, type UnlockedTrophy } from './trophies';
import { doubleXpBoost } from './shop';
import { rankInfoForLevel } from '../engine/ranks';
import { dayKey, setDayStartHour } from '../engine/streak';
import type { Intensity, PenaltyQuestHint, PlayMode, StatKey } from '../engine/types';
import { STAT_KEYS } from '../engine/types';

/** The tables a game action may touch (used for atomic transactions). */
const tables = () => [db.profile, db.logs, db.settings, db.presets, db.categories, db.quests, db.questTemplates, db.shop, db.purchases, db.inventory, db.shadows, db.journal];

export const getFormula = async (): Promise<Formula> => {
  const stored = await getSetting<Partial<Formula>>('formula', {});
  // Older versions saved low per-log caps (500/1000 XP, 300 gold) that could block big efforts. Ignore those.
  if (stored.maxXpPerLog === 500 || stored.maxXpPerLog === 1000) delete stored.maxXpPerLog;
  if (stored.maxGoldPerLog === 300) delete stored.maxGoldPerLog;
  return sanitizeFormula({ ...DEFAULT_FORMULA, ...stored });
};
export const getMode = () => getSetting<PlayMode>('mode', 'normal');

/** Inserts the starter categories/presets the first time the app runs. */
export async function ensureSeed(): Promise<void> {
  setDayStartHour(await getSetting<number>('dayStartHour', DEFAULT_DAY_START_HOUR));
  await ensureProfile();
  if ((await db.categories.count()) === 0) await db.categories.bulkPut(DEFAULT_CATEGORIES);
  if ((await db.presets.count()) === 0) await db.presets.bulkPut(DEFAULT_PRESETS);
  await migrateSeed();
  await expireRestMode();
  await touchPausedDay();
  await applyDailyRecovery();
}

export const DEFAULT_DAILY_RECOVERY = 30;
export const DEFAULT_DAY_START_HOUR = 4;
const dayNum = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/**
 * Overnight recovery: each new calendar day you regain `dailyRecovery` HP (editable, 0 turns it off).
 * Missed days stack up to a week. Sleep logs and rest days add to this; the energy check-in overrides it.
 */
export async function applyDailyRecovery(now = Date.now()): Promise<void> {
  const today = dayKey(now);
  const last = await getSetting<string | null>('lastRecoveryDay', null);
  await setSetting('lastRecoveryDay', today);
  if (!last || last === today) return;
  const days = Math.min(7, Math.max(0, dayNum(today) - dayNum(last)));
  const perDay = await getSetting<number>('dailyRecovery', DEFAULT_DAILY_RECOVERY);
  const p = await ensureProfile();
  const hp = Math.min(p.maxHp, p.hp + days * Math.max(0, perDay));
  if (hp !== p.hp) await db.profile.update(1, { hp });
}

/** Energy check-in: you know your body better than any formula, so you can set HP directly. */
export async function setHp(hp: number): Promise<void> {
  const p = await ensureProfile();
  await db.profile.update(1, { hp: Math.round(Math.min(p.maxHp, Math.max(0, hp))) });
}

/**
 * One-time data migrations, tracked by the `seedVersion` setting so they never run twice.
 *  v3: built-in presets get HP scaling and progress tracking.
 *  v4: Sports merged into Cardio & Sports (presets, logs and mastery all move together).
 *  v5: "Mind" becomes "Core" (free-form, no mastery) and gains Meditation and Learning tasks.
 *  v6: adds the hidden "Daily quests missed" penalty used by the quest system.
 *  v7: water is measured in litres (2 L a day) and sleep gets a reward cap.
 *  v8: adds the Focus session task and the Okay meal task.
 */
export const SEED_VERSION = 8;
async function migrateSeed(): Promise<void> {
  const v = await getSetting<number>('seedVersion', 1);
  if (v >= SEED_VERSION) return;
  if (v < 3) {
    for (const d of DEFAULT_PRESETS) {
      const existing = await db.presets.get(d.id);
      if (existing?.builtin) await db.presets.update(d.id, { hpDelta: d.hpDelta, hpPerUnit: d.hpPerUnit ?? 0, perf: d.perf });
    }
  }
  if (v < 4) await mergeSportsIntoCardio();
  if (v < 5) await mindToCore();
  if (v < 7) await waterAndSleep();
  if (v < 8) {
    for (const id of ['focus', 'meal-okay']) if (!(await db.presets.get(id))) await db.presets.put(DEFAULT_PRESETS.find((x) => x.id === id)!);
  }
  if (v < 6 && !(await db.presets.get('p-quests'))) await db.presets.put(DEFAULT_PRESETS.find((x) => x.id === 'p-quests')!);
  await setSetting('seedVersion', SEED_VERSION);
}

export async function mergeSportsIntoCardio(): Promise<void> {
  await db.transaction('rw', [db.presets, db.logs, db.categories], async () => {
    const sports = await db.categories.get('sports');
    if (!sports) return;
    // Sports tasks keep their AGI/STR split even though they now share the Cardio category.
    for (const p of await db.presets.where('categoryId').equals('sports').toArray()) {
      await db.presets.update(p.id, { categoryId: 'cardio', weights: p.weights ?? sports.weights });
    }
    for (const l of await db.logs.where('categoryId').equals('sports').toArray()) {
      await db.logs.update(l.id!, { categoryId: 'cardio' });
    }
    await db.categories.delete('sports');
    const cardio = await db.categories.get('cardio');
    if (cardio && cardio.name === 'Cardio') await db.categories.update('cardio', { name: 'Cardio & Sports' });
  });
}

/** v7: water becomes litres (1 old glass = 0.25 L) and sleep gets a 9 h reward cap. */
export async function waterAndSleep(): Promise<void> {
  await db.transaction('rw', [db.presets, db.logs, db.questTemplates], async () => {
    const water = await db.presets.get('water');
    if (water?.builtin && water.unit !== 'liters') {
      const d = DEFAULT_PRESETS.find((x) => x.id === 'water')!;
      await db.presets.update('water', { unit: 'liters', defaultQty: d.defaultQty, baseXp: 0, xpPerUnit: d.xpPerUnit, baseGold: 0, goldPerUnit: d.goldPerUnit, hpDelta: 0, hpPerUnit: d.hpPerUnit, rewardCap: d.rewardCap });
      for (const l of await db.logs.where('presetId').equals('water').toArray()) {
        if (l.unit !== 'liters') await db.logs.update(l.id!, { qty: Math.round(l.qty * 0.25 * 100) / 100, unit: 'liters' });
      }
      for (const t of await db.questTemplates.toArray()) {
        if (t.presetId === 'water') await db.questTemplates.update(t.id!, { target: Math.max(0.5, Math.round(t.target * 0.25 * 2) / 2) });
      }
    }
    const sleep = await db.presets.get('sleep-hours');
    if (sleep?.builtin) await db.presets.update('sleep-hours', { rewardCap: 9, name: 'Sleep' });
  });
}

/** Mind -> Core. Moves tasks and logs, adds the new built-in tasks, never touches what you created. */
export async function mindToCore(): Promise<void> {
  await db.transaction('rw', [db.presets, db.logs, db.categories], async () => {
    const core = DEFAULT_CATEGORIES.find((c) => c.id === 'core')!;
    if (!(await db.categories.get('core'))) await db.categories.put(core);
    const mind = await db.categories.get('mind');
    if (mind) {
      for (const p of await db.presets.where('categoryId').equals('mind').toArray()) await db.presets.update(p.id, { categoryId: 'core' });
      for (const l of await db.logs.where('categoryId').equals('mind').toArray()) await db.logs.update(l.id!, { categoryId: 'core' });
      await db.categories.delete('mind');
    }
    // Reading moves from Study to Core (it keeps mostly feeding INT).
    const reading = await db.presets.get('reading');
    if (reading?.builtin && reading.categoryId !== 'core') {
      const d = DEFAULT_PRESETS.find((x) => x.id === 'reading')!;
      await db.presets.update('reading', { categoryId: 'core', name: d.name, weights: d.weights });
      for (const l of await db.logs.where('presetId').equals('reading').toArray()) await db.logs.update(l.id!, { categoryId: 'core' });
    }
    for (const id of ['meditation', 'learn']) {
      if (!(await db.presets.get(id))) await db.presets.put(DEFAULT_PRESETS.find((x) => x.id === id)!);
    }
  });
}

/** While Rest/Sick mode is on, today is recorded as a paused day (it never breaks streaks). */
export async function touchPausedDay(now = Date.now()): Promise<void> {
  if ((await getMode()) === 'normal') return;
  const days = new Set(await getSetting<string[]>('pausedDays', []));
  days.add(dayKey(now));
  await setSetting('pausedDays', [...days]);
}

/** A Rest Day lasts one day: it switches itself off when a new day starts, so it can't be left on by accident. */
export async function expireRestMode(now = Date.now()): Promise<void> {
  if ((await getMode()) !== 'rest') return;
  if ((await getSetting<string | null>('modeDay', null)) !== dayKey(now)) await setSetting('mode', 'normal');
}

export async function setMode(mode: PlayMode, now = Date.now()): Promise<void> {
  const prev = await getMode();
  if (prev !== mode) await setSetting('modeDay', dayKey(now)); // when this mode started
  await setSetting('mode', mode);
  await touchPausedDay(now);
  // A rest day genuinely restores some HP (once, when it starts).
  if (mode === 'rest' && prev !== 'rest') {
    const p = await ensureProfile();
    await db.profile.update(1, { hp: Math.min(p.maxHp, p.hp + 25) });
  }
}

export interface LogInput {
  presetId: string;
  qty: number;
  intensity: Intensity;
  ts: number;
  note?: string;
  demo?: boolean;
  /** Result for improvement tracking (e.g. pace = minutes / km, or kg lifted). */
  perf?: number;
  /** Bedtime / wake time for sleep entries. */
  sleep?: { bed: number; wake: number };
  /** Penalty quests refund at most the XP the penalty took (never a net gain). */
  refundCap?: number;
}

export interface LogResult {
  logId: number;
  xp: number;
  gold: number;
  hp: number;
  statGains: LogEntry['statGains'];
  levelBefore: number;
  levelAfter: number;
  rankBefore: string;
  rankAfter: string;
  isPenalty: boolean;
  paused: boolean;
  penaltyQuest?: PenaltyQuestHint;
  pr: boolean;
  perfBonus: number;
  /** Quests (and the daily-set bonus) that this log completed, already paid. */
  questsCompleted: QuestCompletion[];
  /** Habits that just reached 21 days and became Shadows. */
  shadowsExtracted: ExtractedShadow[];
  trophiesUnlocked: UnlockedTrophy[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Builds the log + profile change for an input, without writing anything.
 * `opts.level` pins the level used for scaling (editing an old log keeps its original level,
 * so an old entry can't be re-valued at today's much bigger level scale).
 */
async function computeEffects(
  input: LogInput,
  profile: Profile,
  formula: Formula,
  mode: PlayMode,
  opts: { excludeLogId?: number; level?: number } = {},
) {
  const preset = await db.presets.get(input.presetId);
  if (!preset) throw new Error('Unknown preset');
  const cat = await db.categories.get(preset.categoryId);
  const level = opts.level ?? levelFromXp(profile.totalXp).level;
  // Sanity limits: a typo can't pay out, and you can't log the far future.
  const qty = Math.min(maxQtyFor(preset.unit), Math.max(0, Number.isFinite(input.qty) ? input.qty : 0));
  const ts = Math.min(Number.isFinite(input.ts) ? input.ts : Date.now(), Date.now() + 5 * 60_000);

  const base = {
    ts,
    presetId: preset.id,
    categoryId: preset.categoryId,
    label: preset.name,
    qty,
    unit: preset.unit,
    intensity: input.intensity,
    isPenalty: preset.isPenalty,
    breaksStreak: false,
    note: input.note,
    demo: input.demo,
    levelScale: levelScale(level),
  };

  if (preset.isPenalty) {
    const eff = computePenalty(preset, formula, mode, levelScale(level));
    const newTotal = applyXpDelta(profile.totalXp, -eff.xpLoss);
    const entry: Omit<LogEntry, 'id'> = {
      ...base,
      xp: newTotal - profile.totalXp, // actual applied (never below your level's start)
      gold: 0,
      hp: -eff.hpLoss,
      statGains: {},
      breaksStreak: eff.breaksStreak,
      paused: eff.paused,
    };
    return { preset, entry };
  }

  const prog = await loadProgressInputs(preset.id, preset.categoryId, opts.excludeLogId, ts);
  const perf = preset.perf && input.perf && input.perf > 0
    ? performanceBonus(preset.perf.kind, input.perf, prog.perfValues, preset.perfStart)
    : { bonus: 0, pr: false };
  const reward = computeReward(preset, qty, input.intensity, {
    formula,
    level,
    rankRewardMult: rankInfoForLevel(level).rewardMult,
    perfBonus: perf.bonus,
    xpBoost: await doubleXpBoost(ts),
    shadowBonus: shadowBonusFor(await db.shadows.where('categoryId').equals(preset.categoryId).count()),
    masteryBonus: cat?.mastery === false ? 0 : masteryInfo(prog.categoryEffort).bonus,
    weights: presetWeights(preset, cat?.weights ?? {}),
  });
  const refund = input.refundCap !== undefined;
  const entry: Omit<LogEntry, 'id'> = {
    ...base,
    xp: refund ? Math.min(reward.xp, Math.max(0, input.refundCap!)) : reward.xp,
    gold: refund ? 0 : reward.gold,
    hp: reward.hp,
    statGains: reward.statGains,
    perf: preset.perf ? input.perf : undefined,
    perfBonus: perf.bonus,
    pr: perf.pr,
    effortXp: reward.effortXp,
    sleep: input.sleep,
    masteryBonus: reward.masteryBonus,
  };
  return { preset, entry };
}

/** Applies a log's effects to the profile (sign = 1) or removes them (sign = -1). */
function applyToProfile(p: Profile, e: Pick<LogEntry, 'xp' | 'gold' | 'hp' | 'statGains'>, sign: 1 | -1): Profile {
  const stats = { ...p.stats };
  for (const k of STAT_KEYS) stats[k] = Math.max(0, round1(stats[k] + sign * (e.statGains[k] ?? 0)));
  return {
    ...p,
    totalXp: sign === 1 ? applyXpDelta(p.totalXp, e.xp) : Math.max(0, p.totalXp - e.xp),
    gold: Math.max(0, p.gold + sign * e.gold),
    // Reversing never touches HP: fatigue is a live meter, not an accounting entry.
    hp: sign === 1 ? Math.min(p.maxHp, Math.max(0, p.hp + e.hp)) : p.hp,
    stats,
  };
}

export async function logActivity(input: LogInput): Promise<LogResult> {
  return db.transaction('rw', tables(), async () => {
    const profile = await ensureProfile();
    const [formula, mode] = await Promise.all([getFormula(), getMode()]);
    const { preset, entry } = await computeEffects(input, profile, formula, mode);
    const logId = (await db.logs.add(entry as LogEntry)) as number;
    await db.profile.put(applyToProfile(profile, entry, 1));
    // Completing a quest pays its reward straight away (so level-ups include quest XP).
    const shadowsExtracted = entry.isPenalty ? [] : await checkShadow(preset.id, Date.now());
    const questsCompleted = await evaluateQuests(Date.now());
    const trophiesUnlocked = await checkTrophies(Date.now());
    const final = (await db.profile.get(1))!;
    const lb = levelFromXp(profile.totalXp).level;
    const la = levelFromXp(final.totalXp).level;
    return {
      logId,
      xp: entry.xp,
      gold: entry.gold,
      hp: entry.hp,
      statGains: entry.statGains,
      levelBefore: lb,
      levelAfter: la,
      rankBefore: rankInfoForLevel(lb).rank,
      rankAfter: rankInfoForLevel(la).rank,
      isPenalty: entry.isPenalty,
      paused: !!entry.paused,
      penaltyQuest: preset.isPenalty && !entry.paused ? preset.penaltyQuest : undefined,
      pr: !!entry.pr,
      perfBonus: entry.perfBonus ?? 0,
      questsCompleted,
      shadowsExtracted,
      trophiesUnlocked,
    };
  });
}

/** Edits a log by reversing the old effects and applying the new ones. */
export async function updateLog(id: number, input: LogInput): Promise<QuestCompletion[]> {
  return db.transaction('rw', tables(), async () => {
    const old = await db.logs.get(id);
    if (!old) return [];
    const reverted = applyToProfile(await ensureProfile(), old, -1);
    const [formula, mode] = await Promise.all([getFormula(), getMode()]);
    const { entry } = await computeEffects(input, reverted, formula, mode, { excludeLogId: id, level: old.levelScale ?? 1 });
    await db.logs.put({ ...(entry as LogEntry), id, demo: old.demo });
    await db.profile.put(applyToProfile(reverted, entry, 1));
    return evaluateQuests(Date.now());
  });
}

export async function deleteLog(id: number): Promise<void> {
  await db.transaction('rw', tables(), async () => {
    const old = await db.logs.get(id);
    if (!old) return;
    await db.profile.put(applyToProfile(await ensureProfile(), old, -1));
    await db.logs.delete(id);
  });
}

/** Spend one free stat point on a stat. */
export async function spendStatPoint(key: StatKey): Promise<boolean> {
  return db.transaction('rw', db.profile, async () => {
    const p = await ensureProfile();
    if (freeStatPoints(levelFromXp(p.totalXp).level, p.spentPoints) < 1) return false;
    await db.profile.put({ ...p, spentPoints: p.spentPoints + 1, stats: { ...p.stats, [key]: round1(p.stats[key] + 1) } });
    return true;
  });
}

export async function renamePlayer(name: string, title: string): Promise<void> {
  await db.profile.update(1, { name: name.trim() || 'Player', title: title.trim() || 'The Awakened' });
}

/** Permanently resets everything (profile, logs, presets, settings). */
export async function resetAllData(): Promise<void> {
  await db.transaction('rw', tables(), async () => {
    await Promise.all(tables().map((t) => t.clear()));
  });
  await ensureSeed();
}
