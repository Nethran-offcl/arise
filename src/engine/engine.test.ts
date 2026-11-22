import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESETS } from './defaults';
import { computePenalty, computeReward, DEFAULT_FORMULA, sanitizeFormula } from './formula';
import { applyXpDelta, freeStatPoints, levelFromXp, levelScale, xpAtLevelStart, xpToNext } from './levels';
import { masteryInfo, performanceBonus } from './progress';
import { rankInfoForLevel } from './ranks';
import { computeStreak, dayKey, setDayStartHour } from './streak';

const preset = (id: string) => DEFAULT_PRESETS.find((p) => p.id === id)!;
const ctx = { formula: DEFAULT_FORMULA, rankRewardMult: 1, weights: { AGI: 1 } };

describe('levels', () => {
  it('grows linearly: 600 x level', () => {
    expect(xpToNext(1)).toBe(600);
    expect(xpToNext(10)).toBe(6000);
  });
  it('derives level from total xp', () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(599).level).toBe(1);
    expect(levelFromXp(600).level).toBe(2);
    expect(xpAtLevelStart(3)).toBe(1800);
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
    expect(rankInfoForLevel(24).rank).toBe('D');
    expect(rankInfoForLevel(25).rank).toBe('C');
    expect(rankInfoForLevel(45).rank).toBe('B');
    expect(rankInfoForLevel(70).rank).toBe('A');
    expect(rankInfoForLevel(100).rank).toBe('S');
  });
  it('pays slightly more at higher ranks', () => {
    expect(rankInfoForLevel(100).rewardMult).toBeGreaterThan(rankInfoForLevel(1).rewardMult);
  });
});

describe('rewards', () => {
  it('scales with quantity (3 km run)', () => {
    const r = computeReward(preset('run'), 3, 'normal', ctx);
    expect(r.xp).toBe(100); // 10 + 30*3
    expect(r.gold).toBe(27); // 3 + 8*3
    expect(r.statGains.AGI).toBe(4); // 100 effort x 0.04
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

describe('constant pace (levelling never slows down)', () => {
  it('the same effort pays proportionally more as the level cost grows', () => {
    const sessionsPerLevel = (level: number) => {
      const xp = computeReward(preset('run'), 3, 'normal', { ...ctx, level }).xp;
      return xpToNext(level) / xp;
    };
    for (const L of [1, 5, 10, 50, 100, 199]) expect(sessionsPerLevel(L)).toBeCloseTo(6, 5);
  });
  it('level scale equals the level', () => {
    expect(levelScale(1)).toBe(1);
    expect(levelScale(40)).toBe(40);
  });
  it('stat gains come from effort, not level scale (stats do not explode)', () => {
    const low = computeReward(preset('run'), 3, 'normal', { ...ctx, level: 1 });
    const high = computeReward(preset('run'), 3, 'normal', { ...ctx, level: 80 });
    expect(high.statGains.AGI).toBe(low.statGains.AGI);
    expect(high.gold).toBe(low.gold);
    expect(high.xp).toBe(low.xp * 80);
  });
  it('penalties scale with level too', () => {
    const p = preset('p-junk');
    expect(computePenalty(p, DEFAULT_FORMULA, 'normal', 1).xpLoss).toBe(5);
    expect(computePenalty(p, DEFAULT_FORMULA, 'normal', 10).xpLoss).toBe(50);
  });
});

describe('progress bonuses', () => {
  it('rewards getting faster (pace: lower is better) but needs 3 earlier results', () => {
    expect(performanceBonus('pace', 6, [7, 7]).bonus).toBeCloseTo(0.15, 5); // only the PR part
    const r = performanceBonus('pace', 6, [7, 7, 7]);
    expect(r.pr).toBe(true);
    expect(r.bonus).toBeCloseTo((7 / 6 - 1) * 1.5 + 0.15, 5);
  });
  it('rewards lifting heavier (higher is better)', () => {
    const r = performanceBonus('higher', 60, [50, 50, 50]);
    expect(r.bonus).toBeCloseTo(0.3 + 0.15, 5);
  });
  it('never reduces XP for a slower or lighter day', () => {
    expect(performanceBonus('pace', 8, [7, 7, 7])).toMatchObject({ bonus: 0, pr: false });
    expect(performanceBonus('higher', 40, [50, 50, 50])).toMatchObject({ bonus: 0, pr: false });
  });
  it('uses a starting value you set, and caps the bonus', () => {
    expect(performanceBonus('higher', 60, [], 50).bonus).toBeCloseTo(0.3, 5);
    expect(performanceBonus('higher', 500, [50, 50, 50]).bonus).toBeLessThanOrEqual(0.9);
  });
  it('ignores empty input', () => {
    expect(performanceBonus('pace', 0, [7, 7, 7]).bonus).toBe(0);
  });
  it('category mastery grows with effort and is capped', () => {
    expect(masteryInfo(0)).toMatchObject({ level: 0, bonus: 0 });
    expect(masteryInfo(150).level).toBe(1);
    expect(masteryInfo(600).bonus).toBeCloseTo(0.04, 5);
    expect(masteryInfo(10_000_000).bonus).toBe(0.3);
  });
});

describe('long-term sustainability', () => {
  it('has no practical level cap and level lookup stays exact', () => {
    for (const L of [1, 2, 3, 50, 500, 5000]) {
      expect(levelFromXp(xpAtLevelStart(L)).level).toBe(L);
      expect(levelFromXp(xpAtLevelStart(L) + xpToNext(L) - 1).level).toBe(L);
    }
    expect(levelFromXp(xpAtLevelStart(1000) - 1).level).toBe(999);
  });
  it('treats an impossible improvement as a typo: no bonus, no record', () => {
    const r = performanceBonus('pace', 2, [7, 7, 7]); // 3.5x faster
    expect(r).toMatchObject({ bonus: 0, pr: false, suspicious: true });
    expect(performanceBonus('higher', 200, [50, 50, 50]).suspicious).toBe(true);
    expect(performanceBonus('pace', 4, [7, 7, 7]).suspicious).toBeFalsy(); // 75% faster is believable
  });
  it('a late night does not split into two days (day starts at 4 AM)', () => {
    setDayStartHour(4);
    const at = (d: number, h: number) => new Date(2026, 10, d, h, 0).getTime();
    expect(dayKey(at(20, 1))).toBe('2026-11-19');
    expect(dayKey(at(20, 5))).toBe('2026-11-20');
    const log = (ts: number) => ({ ts, isPenalty: false, breaksStreak: false });
    // activity at 23:00 on the 18th and 01:00 on the 20th = still the 19th's day -> streak of 2
    expect(computeStreak([log(at(18, 23)), log(at(20, 1))], new Set(), at(20, 3))).toBe(2);
    setDayStartHour(0);
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
