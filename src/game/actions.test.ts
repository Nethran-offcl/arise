import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { levelFromXp } from '../engine/levels';
import { deleteLog, ensureSeed, logActivity, resetAllData, setMode, spendStatPoint, updateLog } from './actions';
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
    expect(r.levelAfter).toBe(2);
    const p = (await db.profile.get(1))!;
    expect(p.totalXp).toBe(100);
    expect(p.gold).toBe(27);
    expect(p.stats.AGI).toBe(2);
    expect(p.hp).toBe(96);
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
    await logActivity({ ...base, presetId: 'run' }); // level 2 -> 3 points
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
