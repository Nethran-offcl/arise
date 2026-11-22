import { daysBetween, shiftDay } from './streak';

/**
 * SHADOW ARMY: stick with a habit for 21 days and it is "extracted" as a Shadow that gives a small
 * permanent XP bonus in that habit's category. Consistency is measured fairly for different habits:
 * a daily habit may skip at most 1 day in a row, a weekly one (running, lifting) up to a week.
 * Rest and sick days never count against you.
 */
export const SHADOW_DAYS = 21;
export const SHADOW_BONUS = 0.05;
export const SHADOW_CAP = 0.25;

/** The longest gap (in days) allowed between two sessions before the chain restarts. */
export function cadenceFor(categoryId: string): number {
  if (categoryId === 'cardio' || categoryId === 'strength') return 7;
  if (categoryId === 'recovery') return 2;
  return 3;
}

export interface HabitProgress {
  /** Days completed in the current unbroken chain (0 if the chain has lapsed). */
  count: number;
  lastDay: string | null;
  alive: boolean;
  /** Days left before the chain lapses (null when not alive). */
  daysLeft: number | null;
}

const pausedIn = (paused: Set<string>, after: string, upTo: string): number => {
  let n = 0;
  for (let k = shiftDay(after, 1); k <= upTo; k = shiftDay(k, 1)) if (paused.has(k)) n++;
  return n;
};

export function habitProgress(doneDays: string[], cadence: number, paused: Set<string>, today: string): HabitProgress {
  const days = [...new Set(doneDays)].filter((d) => d <= today).sort();
  if (!days.length) return { count: 0, lastDay: null, alive: false, daysLeft: null };
  let count = 0;
  let prev: string | null = null;
  for (const d of days) {
    if (prev === null) count = 1;
    else count = daysBetween(prev, d) - pausedIn(paused, prev, d) <= cadence ? count + 1 : 1;
    prev = d;
  }
  const last = days[days.length - 1];
  const since = daysBetween(last, today) - pausedIn(paused, last, today);
  const alive = since <= cadence;
  return { count: alive ? count : 0, lastDay: last, alive, daysLeft: alive ? cadence - since : null };
}

export const shadowBonusFor = (shadowsInCategory: number): number => Math.min(SHADOW_CAP, SHADOW_BONUS * shadowsInCategory);
