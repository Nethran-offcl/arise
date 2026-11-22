/** Shared game types. The engine folder is pure (no DB, no React) so it is easy to test. */

export type StatKey = 'STR' | 'AGI' | 'VIT' | 'INT' | 'DIS' | 'SEN';
export const STAT_KEYS: StatKey[] = ['STR', 'AGI', 'VIT', 'INT', 'DIS', 'SEN'];
export const STAT_LABEL: Record<StatKey, string> = {
  STR: 'Strength',
  AGI: 'Agility',
  VIT: 'Vitality',
  INT: 'Intelligence',
  DIS: 'Discipline',
  SEN: 'Sense',
};
export type Stats = Record<StatKey, number>;
export const emptyStats = (): Stats => ({ STR: 0, AGI: 0, VIT: 0, INT: 0, DIS: 0, SEN: 0 });

export type Weights = Partial<Record<StatKey, number>>;
export type UnitKind = 'none' | 'count' | 'minutes' | 'hours' | 'km';
export type Intensity = 'light' | 'normal' | 'hard';
export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type PlayMode = 'normal' | 'rest' | 'sick';

import type { PerfSpec } from './progress';

export interface Category {
  id: string;
  name: string;
  icon: string;
  /** How rewards from this category are split between stats (weights should sum to ~1). */
  weights: Weights;
  kind: 'task' | 'penalty';
  /** When false the category has no mastery bonus (used for the free-form Core category). Default true. */
  mastery?: boolean;
  order: number;
}

export interface PenaltyQuestHint {
  text: string;
  presetId?: string;
  qty?: number;
}

/**
 * A reusable activity. For normal presets:  reward = baseXp + xpPerUnit * quantity.
 * For penalty presets: baseXp is the (small) XP deduction and hpDelta is negative.
 */
export interface Preset {
  id: string;
  categoryId: string;
  name: string;
  unit: UnitKind;
  defaultQty: number;
  baseXp: number;
  xpPerUnit: number;
  baseGold: number;
  goldPerUnit: number;
  /** HP change applied once per log (positive = recovery, negative = fatigue/penalty). */
  hpDelta: number;
  /** Extra HP change per unit (e.g. -0.2 per minute of gym). Optional for older custom presets. */
  hpPerUnit?: number;
  /** What to track to reward improvement (pace, weight lifted, rating...). */
  perf?: PerfSpec;
  /** Optional starting value for perf (otherwise your first 3 results are used). */
  perfStart?: number;
  /** Overrides the category's stat split when set. */
  weights?: Weights;
  isPenalty: boolean;
  breaksStreak: boolean;
  penaltyQuest?: PenaltyQuestHint;
  builtin: boolean;
  /** Hidden from the Log screen (used for system penalties like "Daily quests missed"). */
  hidden?: boolean;
}
