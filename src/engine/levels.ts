export const MAX_LEVEL = 100;
export const STAT_POINTS_PER_LEVEL = 3;

/** XP needed to go from `level` to `level + 1`:  100 * level^1.4 */
export const xpToNext = (level: number): number => Math.round(100 * Math.pow(level, 1.4));

/** Total XP at which `level` begins. */
export function xpAtLevelStart(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP required to finish the current level. */
  needed: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  let rem = Math.max(0, totalXp);
  while (level < MAX_LEVEL && rem >= xpToNext(level)) {
    rem -= xpToNext(level);
    level++;
  }
  return { level, into: rem, needed: xpToNext(level) };
}

/**
 * Adds XP. A deduction can never drop you below the start of your current level
 * (so penalties never de-level you, and you can never go below level 1).
 */
export function applyXpDelta(totalXp: number, delta: number): number {
  if (delta >= 0) return totalXp + delta;
  const floor = xpAtLevelStart(levelFromXp(totalXp).level);
  return Math.max(floor, totalXp + delta);
}

/** Stat points you can still spend: 3 per level gained, minus what you've spent. */
export const freeStatPoints = (level: number, spent: number): number =>
  Math.max(0, STAT_POINTS_PER_LEVEL * (level - 1) - spent);
