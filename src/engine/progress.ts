/**
 * PROGRESS BONUSES — XP that grows because YOU got better, not because you logged more.
 *
 *  1. Performance bonus: run faster, lift heavier, play better than your starting level.
 *  2. Personal record bonus: beat your all-time best.
 *  3. Category mastery: the more effort you've put into a category, the more it pays.
 */

export type PerfKind = 'pace' | 'higher' | 'lower';

/** What a preset tracks to measure improvement. */
export interface PerfSpec {
  kind: PerfKind;
  /** Question shown in the log form, e.g. "Time taken (minutes)" or "Top weight (kg)". */
  label: string;
  /** Short unit shown with results, e.g. "min/km", "kg", "/10". */
  unit: string;
}

/** +1.5% XP for every 1% better than your starting level, capped at +75%. */
export const PERF_GAIN = 1.5;
export const PERF_CAP = 0.75;
/** Extra bonus for a new personal record. */
export const PR_BONUS = 0.15;
export const PERF_TOTAL_CAP = 0.9;
/** Your "starting level" = the average of your first 3 results (or a number you set). */
export const BASELINE_SAMPLES = 3;
/** A result more than 2x better than your baseline / best is treated as a typo and not rewarded. */
export const PERF_SANITY_RATIO = 2;

export const MASTERY_STEP = 150; // effort XP scale for mastery levels
export const MASTERY_PER_LEVEL = 0.02;
export const MASTERY_CAP = 0.3;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** True when `value` is better than `other` for this kind of measurement. */
export const isBetter = (kind: PerfKind, value: number, other: number): boolean =>
  kind === 'higher' ? value > other : value < other;

export interface PerfResult {
  /** Total XP bonus (0.2 = +20%), including any PR bonus. */
  bonus: number;
  pr: boolean;
  baseline?: number;
  /** True when the result looks like a typo (more than 2x better than before). Nothing is awarded. */
  suspicious?: boolean;
}

/**
 * @param previous your earlier results for this preset, oldest first (excluding this one)
 * @param manualStart optional starting value you set yourself
 * Slower or lighter days never reduce XP: the bonus only rewards improvement.
 */
export function performanceBonus(kind: PerfKind, value: number, previous: number[], manualStart?: number): PerfResult {
  if (!(value > 0)) return { bonus: 0, pr: false };
  const baseline = manualStart && manualStart > 0 ? manualStart : previous.length >= BASELINE_SAMPLES ? mean(previous.slice(0, BASELINE_SAMPLES)) : undefined;
  const ratioVs = (ref: number) => (kind === 'higher' ? value / ref : ref / value);
  const bestPrevious = previous.length ? (kind === 'higher' ? Math.max(...previous) : Math.min(...previous)) : undefined;
  if ((baseline && ratioVs(baseline) > PERF_SANITY_RATIO) || (bestPrevious && ratioVs(bestPrevious) > PERF_SANITY_RATIO)) {
    return { bonus: 0, pr: false, baseline, suspicious: true };
  }
  let bonus = 0;
  if (baseline) bonus = clamp((ratioVs(baseline) - 1) * PERF_GAIN, 0, PERF_CAP);
  const pr = previous.length >= 1 && previous.every((p) => isBetter(kind, value, p));
  return { bonus: Math.min(PERF_TOTAL_CAP, bonus + (pr ? PR_BONUS : 0)), pr, baseline };
}

export interface MasteryInfo {
  level: number;
  /** XP bonus, e.g. 0.06 = +6%. */
  bonus: number;
  /** Effort XP earned so far in this category. */
  effort: number;
  /** Effort XP at which the next mastery level starts. */
  nextAt: number;
}

export function masteryInfo(effortXp: number): MasteryInfo {
  const effort = Math.max(0, effortXp);
  const level = Math.floor(Math.sqrt(effort / MASTERY_STEP));
  return { level, bonus: Math.min(MASTERY_CAP, level * MASTERY_PER_LEVEL), effort, nextAt: MASTERY_STEP * (level + 1) ** 2 };
}
