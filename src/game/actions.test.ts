import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { levelFromXp, xpAtLevelStart } from '../engine/levels';
import { applyDailyRecovery, deleteLog, ensureSeed, logActivity, resetAllData, setHp, setMode, spendStatPoint, updateLog } from './actions';
import { setSetting } from '../db/db';
import { seedDemo, wipeDemo } from './demo';

const base = { qty: 3, intensity: 'normal' as const, ts: Date.now() };

beforeEach(async () => {
  await resetAllData();
});

describe('logging', () => {
  it('seeds defaults', async () => {
    await ensureSeed();
    expect(await db.presets.get('run')).toBeTruthy();
    expect((await db.categories.count())).toBeGreaterThan(5);
  });

  it('awards xp, gold and stats, and levels up', async () => {
    const r = await logActivity({ ...base, presetId: 'run' });
    expect(r.xp).toBe(100);
    expect(r.levelBefore).toBe(1);
    expect(r.levelAfter).toBe(1); // level 1 costs 600 XP
    const p = (await db.profile.get(1))!;
    expect(p.totalXp).toBe(100);
    expect(p.gold).toBe(27);
    expect(p.stats.AGI).toBe(2);
    expect(p.hp).toBe(94); // 3 km x -2
  });

  it('levels up when XP passes the level cost', async () => {
    const r = await logActivity({ ...base, presetId: 'run', qty: 20 }); // 10 + 30*20 = 610
    expect(r.levelAfter).toBe(2);
  });

  it('delete reverses a log exactly', async () => {
    const r = await logActivity({ ...base, presetId: 'run' });
    await deleteLog(r.logId);
    const p = (await db.profile.get(1))!;
    expect(p.totalXp).toBe(0);
    expect(p.gold).toBe(0);
    expect(p.stats.AGI).toBe(0);
    expect(await db.logs.count()).toBe(0);
  });

  it('edit recalculates rewards', async () => {
    const r = await logActivity({ ...base, presetId: 'run' });
    await updateLog(r.logId, { ...base, qty: 5, presetId: 'run' });
    const p = (await db.profile.get(1))!;
    expect(p.totalXp).toBe(160); // 10 + 30*5
    expect((await db.logs.count())).toBe(1);
  });
});

describe('HP is proportional', () => {
  it('a longer or harder session tires you more', async () => {
    const hpAfter = async (qty: number, intensity: 'light' | 'normal' | 'hard') => {
      await resetAllData();
      await logActivity({ presetId: 'gym', qty, intensity, ts: Date.now() });
      return (await db.profile.get(1))!.hp;
    };
    expect(await hpAfter(30, 'normal')).toBe(94); // -6
    expect(await hpAfter(60, 'normal')).toBe(88); // -12
    expect(await hpAfter(60, 'hard')).toBe(82); // -18
  });
});

describe('energy', () => {
  const DAY = 86_400_000;
  it('lets you set HP by hand, clamped to 0..max', async () => {
    await setHp(35);
    expect((await db.profile.get(1))!.hp).toBe(35);
    await setHp(500);
    expect((await db.profile.get(1))!.hp).toBe(100);
    await setHp(-9);
    expect((await db.profile.get(1))!.hp).toBe(0);
  });
  it('recovers HP overnight, adjustable and capped', async () => {
    const t0 = Date.now();
    await setHp(20);
    await applyDailyRecovery(t0); // first run just records the day
    expect((await db.profile.get(1))!.hp).toBe(20);
    await applyDailyRecovery(t0 + DAY); // +30
    expect((await db.profile.get(1))!.hp).toBe(50);
    await setSetting('dailyRecovery', 10);
    await applyDailyRecovery(t0 + 3 * DAY); // 2 days x 10
    expect((await db.profile.get(1))!.hp).toBe(70);
    await setSetting('dailyRecovery', 0);
    await applyDailyRecovery(t0 + 5 * DAY);
    expect((await db.profile.get(1))!.hp).toBe(70);
  });
});

describe('XP scales with level', () => {
  it('pays and deducts proportionally at higher levels', async () => {
    await db.profile.update(1, { totalXp: xpAtLevelStart(10) + 3000 });
    const r = await logActivity({ ...base, presetId: 'run' });
    expect(r.xp).toBe(1050); // 100 effort x level 10 x rank D 1.05
    const pen = await logActivity({ ...base, presetId: 'p-junk', qty: 1 });
    expect(pen.xp).toBe(-50); // 5 x level 10
  });
});

describe('progress bonuses', () => {
  const run = (perf?: number) => logActivity({ ...base, presetId: 'run', perf });

  it('mastery makes a category pay more as you put effort in', async () => {
    expect((await run()).xp).toBe(100);
    expect((await run()).xp).toBe(100);
    expect((await run()).xp).toBe(102); // 300 effort -> mastery 1 -> +2%
  });

  it('a faster run pays more and sets a personal record; a slower one never pays less', async () => {
    for (let i = 0; i < 3; i++) await run(7); // starting level: 7 min/km
    const fast = await run(6); // 7/6 -> +25%, PR +15% => 140 effort, mastery +2%
    expect(fast.pr).toBe(true);
    expect(fast.xp).toBe(143);
    const slow = await run(8);
    expect(slow.pr).toBe(false);
    expect(slow.xp).toBe(102);
  });

  it('editing a log recalculates its bonus without counting itself', async () => {
    for (let i = 0; i < 3; i++) await run(7);
    const fast = await run(6);
    await updateLog(fast.logId, { ...base, presetId: 'run', perf: 7 });
    const log = (await db.logs.get(fast.logId))!;
    expect(log.pr).toBe(false);
    expect(log.perfBonus).toBe(0);
  });
});

describe('penalties', () => {
  it('deduct small xp but never below the current level start', async () => {
    const r = await logActivity({ ...base, presetId: 'p-junk', qty: 1 });
    expect(r.isPenalty).toBe(true);
    expect((await db.profile.get(1))!.totalXp).toBe(0);
    expect(r.xp).toBe(0);
    expect(r.penaltyQuest).toBeTruthy();
  });

  it('cost HP and deduct xp at higher totals', async () => {
    await logActivity({ ...base, presetId: 'study', qty: 1 });
    await logActivity({ ...base, presetId: 'p-skip-workout', qty: 1 });
    const p = (await db.profile.get(1))!;
    expect(levelFromXp(p.totalXp).level).toBe(1);
    expect(p.totalXp).toBe(32);
    expect(p.hp).toBe(97);
  });

  it('are paused in rest mode and rest restores HP', async () => {
    await logActivity({ ...base, presetId: 'p-late-sleep', qty: 1 }); // hp 100 -> 94
    await setMode('rest');
    expect((await db.profile.get(1))!.hp).toBe(100);
    const r = await logActivity({ ...base, presetId: 'p-late-sleep', qty: 1 });
    expect(r.paused).toBe(true);
    expect(r.penaltyQuest).toBeUndefined();
    expect((await db.profile.get(1))!.hp).toBe(100);
  });
});

describe('stat points and demo data', () => {
  it('spends free points only when available', async () => {
    expect(await spendStatPoint('STR')).toBe(false);
    await logActivity({ ...base, presetId: 'run', qty: 20 }); // level 2 -> 3 points
    expect(await spendStatPoint('STR')).toBe(true);
    const p = (await db.profile.get(1))!;
    expect(p.stats.STR).toBe(1);
    expect(p.spentPoints).toBe(1);
  });

  it('wipes demo logs and leaves real ones', async () => {
    await logActivity({ ...base, presetId: 'gym', qty: 30 });
    const real = (await db.profile.get(1))!.totalXp;
    await seedDemo();
    expect((await db.profile.get(1))!.totalXp).not.toBe(real);
    await wipeDemo();
    expect((await db.profile.get(1))!.totalXp).toBe(real);
    expect(await db.logs.count()).toBe(1);
  });
});
