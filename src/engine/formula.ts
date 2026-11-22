import type { Intensity, PlayMode, Preset, StatKey, Stats, UnitKind, Weights } from './types';
import { levelScale } from './levels';
import { STAT_KEYS } from './types';

export type Difficulty = 'easy' | 'normal' | 'hard';

/** Every number that shapes rewards. All of it is editable in Settings. */
export interface Formula {
  xpMult: number;
  goldMult: number;
  /** Stat points gained per XP earned (before the category split). */
  statRate: number;
  intensity: Record<Intensity, number>;
  /** Multiplies HP *loss* from tiring tasks (a hard session tires you more). */
  fatigue: Record<Intensity, number>;
  difficulty: Difficulty;
  difficultyReward: Record<Difficulty, number>;
  difficultyPenalty: Record<Difficulty, number>;
  /** Hard cap for XP from a single log (stops typos like 9999 km). */
  maxXpPerLog: number;
  maxGoldPerLog: number;
}

export const DEFAULT_FORMULA: Formula = {
  xpMult: 1,
  goldMult: 1,
  statRate: 0.02,
  intensity: { light: 0.8, normal: 1, hard: 1.3 },
  fatigue: { light: 0.6, normal: 1, hard: 1.5 },
  difficulty: 'normal',
  difficultyReward: { easy: 0.9, normal: 1, hard: 1.15 },
  difficultyPenalty: { easy: 0.5, normal: 1, hard: 1.25 },
  maxXpPerLog: 1000,
  maxGoldPerLog: 300,
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Cleans possibly-edited values so a bad input can never break the game. */
export function sanitizeFormula(f: Formula): Formula {
  return {
    ...f,
    xpMult: clamp(f.xpMult, 0.1, 5),
    goldMult: clamp(f.goldMult, 0, 5),
    statRate: clamp(f.statRate, 0, 0.2),
    intensity: {
      light: clamp(f.intensity.light, 0.1, 3),
      normal: clamp(f.intensity.normal, 0.1, 3),
      hard: clamp(f.intensity.hard, 0.1, 3),
    },
    fatigue: {
      light: clamp(f.fatigue.light, 0, 5),
      normal: clamp(f.fatigue.normal, 0, 5),
      hard: clamp(f.fatigue.hard, 0, 5),
    },
    maxXpPerLog: clamp(f.maxXpPerLog, 10, 5000),
    maxGoldPerLog: clamp(f.maxGoldPerLog, 0, 5000),
  };
}

/** Largest believable amount for one log (stops typos like 5000 km from paying out). */
export const maxQtyFor = (unit: UnitKind): number => ({ none: 1, count: 1000, minutes: 720, hours: 24, km: 250 })[unit];

export function presetWeights(preset: Preset, categoryWeights: Weights): Weights {
  return preset.weights ?? categoryWeights;
}

export interface Reward {
  /** Final XP awarded (effort x level scale x rank x mastery). */
  xp: number;
  /** XP for what you did, before level scaling. Stats and mastery are based on this. */
  effortXp: number;
  gold: number;
  hp: number;
  statGains: Partial<Stats>;
  levelScale: number;
  perfBonus: number;
  masteryBonus: number;
}

export interface RewardContext {
  formula: Formula;
  /** Your level: rewards scale with it so levelling keeps the same pace. */
  level?: number;
  rankRewardMult: number;
  /** Bonus for beating your starting level / a personal record (0.2 = +20%). */
  perfBonus?: number;
  /** Bonus from category mastery. */
  masteryBonus?: number;
  /** Permanent bonus from Shadows for this category, e.g. 0.05 = +5% (Phase 6). */
  shadowBonus?: number;
  weights: Weights;
}

/**
 * Reward for a normal (non-penalty) log.
 *   effort = (base + per-unit x qty) x intensity x difficulty x XP multiplier x (1 + progress bonus)
 *   xp     = effort x level scale x rank bonus x (1 + mastery) x (1 + shadow)
 * Gold is not level-scaled (so shop prices stay meaningful). Stats grow from effort, not level scale.
 */
export function computeReward(preset: Preset, qty: number, intensity: Intensity, ctx: RewardContext): Reward {
  const f = ctx.formula;
  const q = Math.max(0, qty);
  const scale = levelScale(ctx.level ?? 1);
  const perf = ctx.perfBonus ?? 0;
  const mastery = ctx.masteryBonus ?? 0;
  const shadow = ctx.shadowBonus ?? 0;
  const base = f.intensity[intensity] * f.difficultyReward[f.difficulty];
  const rawXp = preset.baseXp + preset.xpPerUnit * q;
  const rawGold = preset.baseGold + preset.goldPerUnit * q;

  let effortXp = Math.min(f.maxXpPerLog, Math.round(rawXp * base * f.xpMult * (1 + perf)));
  if (rawXp > 0 && effortXp < 1) effortXp = 1;
  const xp = Math.round(effortXp * scale * ctx.rankRewardMult * (1 + mastery) * (1 + shadow));
  const gold = Math.min(f.maxGoldPerLog, Math.round(rawGold * base * ctx.rankRewardMult * (1 + shadow) * f.goldMult));

  const statGains: Partial<Stats> = {};
  for (const k of STAT_KEYS) {
    const w = ctx.weights[k];
    if (w) statGains[k] = round1(effortXp * f.statRate * w);
  }
  // HP grows with amount (minutes/km...) and tiring tasks cost more when done hard.
  const rawHp = preset.hpDelta + (preset.hpPerUnit ?? 0) * q;
  const hp = Math.round(rawHp < 0 ? rawHp * f.fatigue[intensity] : rawHp);
  return { xp, effortXp, gold, hp, statGains, levelScale: scale, perfBonus: perf, masteryBonus: mastery };
}

export interface PenaltyEffect {
  /** Positive number = XP deducted. */
  xpLoss: number;
  /** Positive number = HP lost. */
  hpLoss: number;
  breaksStreak: boolean;
  /** True when Rest/Sick mode switched the penalty off. */
  paused: boolean;
}

/** Penalties are small. Rest Day and Sick/Injury mode switch them off entirely. */
export function computePenalty(preset: Preset, formula: Formula, mode: PlayMode, scale = 1): PenaltyEffect {
  if (mode !== 'normal') return { xpLoss: 0, hpLoss: 0, breaksStreak: false, paused: true };
  const m = formula.difficultyPenalty[formula.difficulty];
  return {
    // XP loss scales with level too, so a penalty stays the same small fraction of a level.
    xpLoss: Math.round(preset.baseXp * m * scale),
    hpLoss: Math.round(Math.abs(preset.hpDelta) * m),
    breaksStreak: preset.breaksStreak,
    paused: false,
  };
}

/** Human-readable formula shown in Settings so nothing is a black box. */
export function describeFormula(f: Formula): string[] {
  return [
    'Effort = (base + per-unit x quantity) x intensity x difficulty x XP multiplier x (1 + progress bonus)',
    'XP = effort x your level x rank bonus x (1 + category mastery). Level cost also grows with level, so your pace never slows.',
    `Intensity: light x${f.intensity.light}, normal x${f.intensity.normal}, hard x${f.intensity.hard}`,
    `HP change = (flat + per-unit x quantity); tiring tasks x${f.fatigue.light} light, x${f.fatigue.normal} normal, x${f.fatigue.hard} hard`,
    `Difficulty (${f.difficulty}): rewards x${f.difficultyReward[f.difficulty]}, penalties x${f.difficultyPenalty[f.difficulty]}`,
    `Stat gain = XP x ${f.statRate} x the category's stat split`,
    `Caps per log: ${f.maxXpPerLog} XP, ${f.maxGoldPerLog} gold`,
  ];
}

export function statValueLabel(k: StatKey, v: number): string {
  return `${k} ${round1(v)}`;
}
