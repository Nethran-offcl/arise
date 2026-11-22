import type { Intensity, PlayMode, Preset, StatKey, Stats, Weights } from './types';
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
  maxXpPerLog: 500,
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

export function presetWeights(preset: Preset, categoryWeights: Weights): Weights {
  return preset.weights ?? categoryWeights;
}

export interface Reward {
  xp: number;
  gold: number;
  hp: number;
  statGains: Partial<Stats>;
}

export interface RewardContext {
  formula: Formula;
  rankRewardMult: number;
  /** Permanent bonus from Shadows for this category, e.g. 0.05 = +5% (Phase 6). */
  shadowBonus?: number;
  weights: Weights;
}

/**
 * Reward for a normal (non-penalty) log.
 *   xp = (baseXp + xpPerUnit * qty) x intensity x difficulty x rank x xpMult x (1 + shadow)
 */
export function computeReward(preset: Preset, qty: number, intensity: Intensity, ctx: RewardContext): Reward {
  const f = ctx.formula;
  const q = Math.max(0, qty);
  const common = f.intensity[intensity] * f.difficultyReward[f.difficulty] * ctx.rankRewardMult * (1 + (ctx.shadowBonus ?? 0));
  const rawXp = preset.baseXp + preset.xpPerUnit * q;
  const rawGold = preset.baseGold + preset.goldPerUnit * q;
  let xp = Math.min(f.maxXpPerLog, Math.round(rawXp * common * f.xpMult));
  if (rawXp > 0 && xp < 1) xp = 1;
  const gold = Math.min(f.maxGoldPerLog, Math.round(rawGold * common * f.goldMult));
  const statGains: Partial<Stats> = {};
  for (const k of STAT_KEYS) {
    const w = ctx.weights[k];
    if (w) statGains[k] = round1(xp * f.statRate * w);
  }
  // HP grows with amount (minutes/km...) and tiring tasks cost more when done hard.
  const rawHp = preset.hpDelta + (preset.hpPerUnit ?? 0) * q;
  const hp = Math.round(rawHp < 0 ? rawHp * f.fatigue[intensity] : rawHp);
  return { xp, gold, hp, statGains };
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
export function computePenalty(preset: Preset, formula: Formula, mode: PlayMode): PenaltyEffect {
  if (mode !== 'normal') return { xpLoss: 0, hpLoss: 0, breaksStreak: false, paused: true };
  const m = formula.difficultyPenalty[formula.difficulty];
  return {
    xpLoss: Math.round(preset.baseXp * m),
    hpLoss: Math.round(Math.abs(preset.hpDelta) * m),
    breaksStreak: preset.breaksStreak,
    paused: false,
  };
}

/** Human-readable formula shown in Settings so nothing is a black box. */
export function describeFormula(f: Formula): string[] {
  return [
    'XP = (base + per-unit x quantity) x intensity x difficulty x rank bonus x XP multiplier',
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
