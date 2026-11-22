import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESETS } from './defaults';
import { computePenalty, computeReward, DEFAULT_FORMULA, sanitizeFormula } from './formula';
import { applyXpDelta, freeStatPoints, levelFromXp, xpAtLevelStart, xpToNext } from './levels';
import { rankInfoForLevel } from './ranks';
import { computeStreak, dayKey } from './streak';

const preset = (id: string) => DEFAULT_PRESETS.find((p) => p.id === id)!;
const ctx = { formula: DEFAULT_FORMULA, rankRewardMult: 1, weights: { AGI: 1 } };

describe('levels', () => {
  it('follows 100 * level^1.4', () => {
    expect(xpToNext(1)).toBe(100);
    expect(xpToNext(10)).toBe(Math.round(100 * Math.pow(10, 1.4)));
  });
  it('derives level from total xp', () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(xpAtLevelStart(7)).level).toBe(7);
    expect(levelFromXp(xpAtLevelStart(7) - 1).level).toBe(6);
  });
  it('never de-levels or goes below level 1 on deductions', () => {
    expect(applyXpDelta(30, -500)).toBe(0);
    const start5 = xpAtLevelStart(5);
    expect(applyXpDelta(start5 + 10, -500)).toBe(start5);
    expect(levelFromXp(applyXpDelta(start5 + 10, -500)).level).toBe(5);
  });
  it('gives 3 stat points per level gained', () => {
    expect(freeStatPoints(1, 0)).toBe(0);
    expect(freeStatPoints(5, 4)).toBe(8);
    expect(freeStatPoints(2, 99)).toBe(0);
  });
});

describe('ranks', () => {
  it('maps level thresholds to ranks', () => {
    expect(rankInfoForLevel(1).rank).toBe('E');
    expect(rankInfoForLevel(9).rank).toBe('E');
    expect(rankInfoForLevel(10).rank).toBe('D');
    expect(rankInfoForLevel(35).rank).toBe('B');
    expect(rankInfoForLevel(99).rank).toBe('S');
  });
  it('pays slightly more at higher ranks', () => {
    expect(rankInfoForLevel(70).rewardMult).toBeGreaterThan(rankInfoForLevel(1).rewardMult);
  });
});

describe('rewards', () => {
  it('scales with quantity (3 km run)', () => {
    const r = computeReward(preset('run'), 3, 'normal', ctx);
    expect(r.xp).toBe(100); // 10 + 30*3
    expect(r.gold).toBe(27); // 3 + 8*3
    expect(r.statGains.AGI).toBe(2); // 100 * 0.02
  });
  it('applies intensity, difficulty and rank', () => {
    const base = computeReward(preset('run'), 3, 'normal', ctx).xp;
    expect(computeReward(preset('run'), 3, 'hard', ctx).xp).toBeGreaterThan(base);
    expect(computeReward(preset('run'), 3, 'light', ctx).xp).toBeLessThan(base);
    const hardDiff = { ...ctx, formula: { ...DEFAULT_FORMULA, difficulty: 'hard' as const } };
    expect(computeReward(preset('run'), 3, 'normal', hardDiff).xp).toBe(115);
    expect(computeReward(preset('run'), 3, 'normal', { ...ctx, rankRewardMult: 1.25 }).xp).toBe(125);
  });
  it('caps absurd input', () => {
    expect(computeReward(preset('run'), 9999, 'hard', ctx).xp).toBe(DEFAULT_FORMULA.maxXpPerLog);
  });
  it('always gives at least 1 xp for a real task', () => {
    expect(computeReward(preset('walk'), 1, 'light', ctx).xp).toBe(1);
  });
  it('sanitizes silly formula edits', () => {
    const f = sanitizeFormula({ ...DEFAULT_FORMULA, xpMult: 999, statRate: -3 });
    expect(f.xpMult).toBe(5);
    expect(f.statRate).toBe(0);
  });
});

describe('penalties', () => {
  it('are small and scale with difficulty', () => {
    const p = preset('p-junk');
    const normal = computePenalty(p, DEFAULT_FORMULA, 'normal');
    expect(normal.xpLoss).toBe(5);
    expect(normal.hpLoss).toBe(3);
    const easy = computePenalty(p, { ...DEFAULT_FORMULA, difficulty: 'easy' }, 'normal');
    expect(easy.xpLoss).toBeLessThan(normal.xpLoss);
  });
  it('are paused by Rest and Sick modes', () => {
    for (const mode of ['rest', 'sick'] as const) {
      const e = computePenalty(preset('p-skip-workout'), DEFAULT_FORMULA, mode);
      expect(e).toEqual({ xpLoss: 0, hpLoss: 0, breaksStreak: false, paused: true });
    }
  });
  it('food penalties never break streaks and no preset suggests fasting or restriction', () => {
    for (const id of ['p-junk', 'p-sugar', 'p-skip-meal']) expect(preset(id).breaksStreak).toBe(false);
    const text = DEFAULT_PRESETS.map((p) => p.penaltyQuest?.text ?? '').join(' ').toLowerCase();
    expect(text).not.toMatch(/\b(fast|fasting|calorie|calories|diet|weight loss|lose weight|skip dinner)\b/);
  });
});

describe('streak', () => {
  const day = (n: number) => new Date(2026, 10, 20 - n, 12).getTime(); // n days before Nov 20
  const now = day(0);
  const done = (n: number) => ({ ts: day(n), isPenalty: false, breaksStreak: false });

  it('counts consecutive days', () => {
    expect(computeStreak([done(0), done(1), done(2)], new Set(), now)).toBe(3);
  });
  it('does not punish an empty today', () => {
    expect(computeStreak([done(1), done(2)], new Set(), now)).toBe(2);
  });
  it('breaks on a gap', () => {
    expect(computeStreak([done(0), done(2)], new Set(), now)).toBe(1);
  });
  it('skips paused (rest/sick) days', () => {
    expect(computeStreak([done(0), done(2), done(3)], new Set([dayKey(day(1))]), now)).toBe(3);
  });
  it('a streak-breaking penalty voids that day', () => {
    const pen = { ts: day(0), isPenalty: true, breaksStreak: true };
    expect(computeStreak([done(0), pen, done(1)], new Set(), now)).toBe(1);
  });
});
