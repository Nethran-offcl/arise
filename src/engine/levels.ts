/**
 * LEVEL CURVE — designed so levelling NEVER slows down.
 *
 *  - XP needed for a level grows linearly:  xpToNext(L) = 600 x L
 *  - Everything you earn is multiplied by the same factor:  levelScale(L) = L
 *
 * So the same effort pays L times more at level L, and the level costs L times more.
 * The two cancel out: a normal day of effort always moves you the same distance
 * through a level, from level 1 onwards (there is no practical level cap). Progress bonuses (faster pace, heavier
 * lifts, category mastery, rank) then speed you up on top of that, never slow you down.
 */
/** Effectively unlimited: the curve is linear, so levelling can go on for years. */
export const MAX_LEVEL = 9999;
export const XP_BASE_PER_LEVEL = 600;
export const STAT_POINTS_PER_LEVEL = 3;

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number): number => XP_BASE_PER_LEVEL * level;

/** Multiplier applied to XP rewards (and XP penalties) at this level. */
export const levelScale = (level: number): number => Math.min(level, MAX_LEVEL);

/** Total XP at which `level` begins (closed form of 600 + 1200 + ...). */
export const xpAtLevelStart = (level: number): number => (XP_BASE_PER_LEVEL / 2) * level * (level - 1);

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP required to finish the current level. */
  needed: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
  const total = Math.max(0, totalXp);
  // Closed form of 300 x L x (L - 1) <= total, then nudge for rounding.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + total / 75)) / 2));
  while (level > 1 && xpAtLevelStart(level) > total) level--;
  while (level < MAX_LEVEL && xpAtLevelStart(level + 1) <= total) level++;
  level = Math.min(level, MAX_LEVEL);
  return { level, into: total - xpAtLevelStart(level), needed: xpToNext(level) };
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
