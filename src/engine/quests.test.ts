import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESETS } from './defaults';
import {
  BOSS_NAMES, effectiveTarget, MILESTONES, payout, planBoss, planDaily, planWeekly, questProgress, rewardForDraft, roundTarget,
  type DailyCtx, type Quest, type QuestLog,
} from './quests';
import { dayStartTs, setDayStartHour, weekdayOf, weekStartKey } from './streak';

const presets = DEFAULT_PRESETS;
const baseCtx: DailyCtx = {
  flags: { work: false, college: false }, weekday: 3, questMult: 1, seed: 1234, runsLast7: 0, ranYesterday: false, gymLast7: 0, effortByCategory: {}, exclude: [],
};
const quest = (over: Partial<Quest>): Quest => ({
  key: 'k', kind: 'daily', title: 't', metric: 'qty', target: 1, unit: 'x', periodStart: null, periodEnd: null, status: 'active', rewardEffort: 10, rewardGold: 5, createdAt: 0, ...over,
});
const log = (over: Partial<QuestLog>): QuestLog => ({ ts: 1000, presetId: 'run', categoryId: 'cardio', qty: 3, effortXp: 100, isPenalty: false, ...over });

describe('week and day helpers', () => {
  it('weeks start on Monday', () => {
    expect(weekdayOf('2026-11-23')).toBe(1); // a Monday
    expect(weekStartKey('2026-11-23')).toBe('2026-11-23');
    expect(weekStartKey('2026-11-26')).toBe('2026-11-23');
    expect(weekStartKey('2026-11-29')).toBe('2026-11-23'); // Sunday belongs to the week before Monday
    expect(weekStartKey('2026-11-30')).toBe('2026-11-30');
  });
  it('a day begins at the day-start hour', () => {
    setDayStartHour(4);
    const start = new Date(dayStartTs('2026-11-23'));
    expect(start.getHours()).toBe(4);
    setDayStartHour(0);
  });
});

describe('questProgress', () => {
  const logs = [log({ ts: 10, qty: 2 }), log({ ts: 20, qty: 5 }), log({ ts: 30, presetId: 'walk', categoryId: 'cardio', qty: 40, effortXp: 30 }), log({ ts: 40, isPenalty: true, qty: 99 })];
  it('sums amounts for matching tasks only, ignoring penalties', () => {
    expect(questProgress(quest({ metric: 'qty', presetIds: ['run'] }), logs, 0)).toBe(7);
  });
  it('counts logs that meet a minimum amount', () => {
    expect(questProgress(quest({ metric: 'logs', presetIds: ['run'], minQty: 3 }), logs, 0)).toBe(1);
    expect(questProgress(quest({ metric: 'logs', presetIds: ['run'] }), logs, 0)).toBe(2);
  });
  it('finds the biggest single amount (for "first 5 km")', () => {
    expect(questProgress(quest({ metric: 'maxQty', presetIds: ['run'] }), logs, 0)).toBe(5);
  });
  it('sums effort across a whole category or everything (boss)', () => {
    expect(questProgress(quest({ metric: 'effort', categoryIds: ['cardio'] }), logs, 0)).toBe(230);
    expect(questProgress(quest({ metric: 'effort' }), logs, 0)).toBe(230);
  });
  it('respects the period', () => {
    expect(questProgress(quest({ metric: 'qty', presetIds: ['run'], periodStart: 15, periodEnd: 100 }), logs, 0)).toBe(5);
  });
  it('uses the current streak for streak quests', () => {
    expect(questProgress(quest({ metric: 'streak' }), logs, 6)).toBe(6);
  });
});

describe('boss HP', () => {
  it('shrinks for rest/sick days but never below 15%', () => {
    const boss = quest({ kind: 'boss', target: 1000 });
    expect(effectiveTarget(boss, 0)).toBe(1000);
    expect(effectiveTarget(boss, 2)).toBe(714);
    expect(effectiveTarget(boss, 7)).toBe(150);
  });
  it('is based on your own recent effort but never under 800', () => {
    expect(planBoss(0, 3).hp).toBe(800);
    expect(planBoss(2000, 3).hp).toBe(2100);
    expect(BOSS_NAMES).toContain(planBoss(0, 3).name);
  });
  it('does not shrink other quests', () => {
    expect(effectiveTarget(quest({ kind: 'weekly', target: 3 }), 3)).toBe(3);
  });
});

describe('planDaily', () => {
  it('gives 3 to 5 quests with no duplicate tasks', () => {
    for (let seed = 1; seed < 60; seed++) {
      const q = planDaily({ ...baseCtx, seed }, presets);
      expect(q.length).toBeGreaterThanOrEqual(3);
      expect(q.length).toBeLessThanOrEqual(5);
      expect(new Set(q.map((x) => x.presetIds![0])).size).toBe(q.length);
    }
  });
  it('is stable: same day and settings always give the same quests', () => {
    expect(planDaily(baseCtx, presets)).toEqual(planDaily(baseCtx, presets));
  });
  it('always includes a movement quest: a run when you are under 3 runs, otherwise a walk', () => {
    expect(planDaily({ ...baseCtx, runsLast7: 1 }, presets)[0].presetIds![0]).toBe('run');
    expect(planDaily({ ...baseCtx, runsLast7: 3 }, presets)[0].presetIds![0]).toBe('walk');
  });
  it('never asks for a run two days in a row (suggests a walk)', () => {
    expect(planDaily({ ...baseCtx, runsLast7: 1, ranYesterday: true }, presets)[0].presetIds![0]).toBe('walk');
  });
  it('workdays get office tasks and college days get study', () => {
    const ids = (c: Partial<DailyCtx>) => planDaily({ ...baseCtx, ...c }, presets).map((q) => q.presetIds![0]);
    expect(ids({ flags: { work: true, college: false } })).toContain('office');
    expect(ids({ flags: { work: false, college: true } })).toContain('study');
    expect(ids({ flags: { work: true, college: true } })).toEqual(expect.arrayContaining(['office', 'study']));
    expect(ids({ flags: { work: false, college: false } })).not.toContain('office');
  });
  it('free days get at least 4 quests', () => {
    for (let seed = 1; seed < 20; seed++) expect(planDaily({ ...baseCtx, seed }, presets).length).toBeGreaterThanOrEqual(4);
  });
  it('higher ranks get slightly bigger targets', () => {
    const walk = (m: number) => planDaily({ ...baseCtx, runsLast7: 3, questMult: m }, presets).find((q) => q.presetIds![0] === 'walk')!.target;
    expect(walk(1.25)).toBeGreaterThan(walk(1));
  });
  it('never breaks when tasks were deleted', () => {
    expect(planDaily(baseCtx, [])).toEqual([]);
    const only = presets.filter((p) => p.id === 'walk');
    expect(planDaily(baseCtx, only).map((q) => q.presetIds![0])).toEqual(['walk']);
  });
  it('does not duplicate tasks that already have a quest', () => {
    const q = planDaily({ ...baseCtx, exclude: ['run', 'walk'] }, presets);
    expect(q.some((x) => ['run', 'walk'].includes(x.presetIds![0]))).toBe(false);
  });
});

describe('planWeekly and rewards', () => {
  it('asks for 2 runs, then 3 after you managed 2 (never more than 3)', () => {
    expect(planWeekly({ questMult: 1, lastWeekRuns: 0, hasCollege: false }, presets)[0].target).toBe(2);
    expect(planWeekly({ questMult: 1, lastWeekRuns: 2, hasCollege: false }, presets)[0].target).toBe(3);
    expect(planWeekly({ questMult: 1.25, lastWeekRuns: 9, hasCollege: false }, presets)[0].target).toBe(3);
  });
  it('studying replaces lifting when you have college days', () => {
    const slugs = (c: boolean) => planWeekly({ questMult: 1, lastWeekRuns: 0, hasCollege: c }, presets).map((q) => q.slug);
    expect(slugs(true)).toContain('study');
    expect(slugs(false)).toContain('lift');
  });
  it('rewards are half of what the task pays, times the quest kind', () => {
    const [d] = planDaily({ ...baseCtx, runsLast7: 0 }, presets); // run 3 km = 100 effort
    expect(rewardForDraft(d, presets, 'daily').effort).toBe(50);
    expect(rewardForDraft(d, presets, 'weekly').effort).toBe(75);
    expect(rewardForDraft(d, presets, 'emergency').effort).toBe(125);
  });
  it('payout scales with level and rank, so quests keep pace with the curve', () => {
    const q = { rewardEffort: 50, rewardGold: 20 };
    expect(payout(q, 1, 1).xp).toBe(50);
    expect(payout(q, 10, 1).xp).toBe(500);
    expect(payout(q, 10, 1.05).xp).toBe(525);
    expect(payout(q, 10, 1, 2).xp).toBe(1000); // Double XP Potion
    expect(payout(q, 50, 1).gold).toBe(20); // gold is not level-scaled
  });
  it('rounds targets sensibly', () => {
    expect(roundTarget('km', 3.3)).toBe(3.5);
    expect(roundTarget('minutes', 37.5)).toBe(40);
    expect(roundTarget('hours', 0.2)).toBe(0.5);
    expect(roundTarget('count', 2.4)).toBe(2);
  });
  it('has unique milestones', () => {
    expect(new Set(MILESTONES.map((m) => m.id)).size).toBe(MILESTONES.length);
    expect(MILESTONES.find((m) => m.id === 'first5k')!.target).toBe(5);
    expect(MILESTONES.find((m) => m.id === 'run3x10')!.target).toBe(10);
  });
});
