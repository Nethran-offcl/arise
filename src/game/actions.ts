import { db, ensureProfile, getSetting, setSetting, type LogEntry, type Profile } from '../db/db';
import { DEFAULT_CATEGORIES, DEFAULT_PRESETS } from '../engine/defaults';
import { computePenalty, computeReward, DEFAULT_FORMULA, presetWeights, sanitizeFormula, type Formula } from '../engine/formula';
import { applyXpDelta, freeStatPoints, levelFromXp, levelScale } from '../engine/levels';
import { masteryInfo, performanceBonus } from '../engine/progress';
import { loadProgressInputs } from './progress';
import { rankInfoForLevel } from '../engine/ranks';
import { dayKey } from '../engine/streak';
import type { Intensity, PenaltyQuestHint, PlayMode, StatKey } from '../engine/types';
import { STAT_KEYS } from '../engine/types';

/** The tables a game action may touch (used for atomic transactions). */
const tables = () => [db.profile, db.logs, db.settings, db.presets, db.categories];

export const getFormula = async (): Promise<Formula> =>
  sanitizeFormula({ ...DEFAULT_FORMULA, ...(await getSetting<Partial<Formula>>('formula', {})) });
export const getMode = () => getSetting<PlayMode>('mode', 'normal');

/** Inserts the starter categories/presets the first time the app runs. */
export async function ensureSeed(): Promise<void> {
  await ensureProfile();
  if ((await db.categories.count()) === 0) await db.categories.bulkPut(DEFAULT_CATEGORIES);
  if ((await db.presets.count()) === 0) await db.presets.bulkPut(DEFAULT_PRESETS);
  await migrateBuiltinHp();
  await touchPausedDay();
  await applyDailyRecovery();
}

export const DEFAULT_DAILY_RECOVERY = 30;
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

/** Seed v3: built-in presets get HP scaling and progress tracking. Only touches those fields of built-ins. */
async function migrateBuiltinHp(): Promise<void> {
  if ((await getSetting<number>('seedVersion', 1)) >= 3) return;
  for (const d of DEFAULT_PRESETS) {
    const existing = await db.presets.get(d.id);
    if (existing?.builtin) await db.presets.update(d.id, { hpDelta: d.hpDelta, hpPerUnit: d.hpPerUnit ?? 0, perf: d.perf });
  }
  await setSetting('seedVersion', 3);
}

/** While Rest/Sick mode is on, today is recorded as a paused day (it never breaks streaks). */
export async function touchPausedDay(now = Date.now()): Promise<void> {
  if ((await getMode()) === 'normal') return;
  const days = new Set(await getSetting<string[]>('pausedDays', []));
  days.add(dayKey(now));
  await setSetting('pausedDays', [...days]);
}

export async function setMode(mode: PlayMode, now = Date.now()): Promise<void> {
  const prev = await getMode();
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
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Builds the log + profile change for an input, without writing anything. */
async function computeEffects(input: LogInput, profile: Profile, formula: Formula, mode: PlayMode, excludeLogId?: number) {
  const preset = await db.presets.get(input.presetId);
  if (!preset) throw new Error('Unknown preset');
  const cat = await db.categories.get(preset.categoryId);
  const level = levelFromXp(profile.totalXp).level;

  const base = {
    ts: input.ts,
    presetId: preset.id,
    categoryId: preset.categoryId,
    label: preset.name,
    qty: input.qty,
    unit: preset.unit,
    intensity: input.intensity,
    isPenalty: preset.isPenalty,
    breaksStreak: false,
    note: input.note,
    demo: input.demo,
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

  const prog = await loadProgressInputs(preset.id, preset.categoryId, excludeLogId);
  const perf = preset.perf && input.perf && input.perf > 0
    ? performanceBonus(preset.perf.kind, input.perf, prog.perfValues, preset.perfStart)
    : { bonus: 0, pr: false };
  const reward = computeReward(preset, input.qty, input.intensity, {
    formula,
    level,
    rankRewardMult: rankInfoForLevel(level).rewardMult,
    perfBonus: perf.bonus,
    masteryBonus: masteryInfo(prog.categoryEffort).bonus,
    weights: presetWeights(preset, cat?.weights ?? {}),
  });
  const entry: Omit<LogEntry, 'id'> = {
    ...base,
    xp: reward.xp,
    gold: reward.gold,
    hp: reward.hp,
    statGains: reward.statGains,
    perf: preset.perf ? input.perf : undefined,
    perfBonus: perf.bonus,
    pr: perf.pr,
    effortXp: reward.effortXp,
    levelScale: reward.levelScale,
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
    const next = applyToProfile(profile, entry, 1);
    await db.profile.put(next);
    const lb = levelFromXp(profile.totalXp).level;
    const la = levelFromXp(next.totalXp).level;
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
    };
  });
}

/** Edits a log by reversing the old effects and applying the new ones. */
export async function updateLog(id: number, input: LogInput): Promise<void> {
  await db.transaction('rw', tables(), async () => {
    const old = await db.logs.get(id);
    if (!old) return;
    const reverted = applyToProfile(await ensureProfile(), old, -1);
    const [formula, mode] = await Promise.all([getFormula(), getMode()]);
    const { entry } = await computeEffects(input, reverted, formula, mode, id);
    await db.logs.put({ ...(entry as LogEntry), id, demo: old.demo });
    await db.profile.put(applyToProfile(reverted, entry, 1));
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
