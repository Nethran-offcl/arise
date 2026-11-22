import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { DEFAULT_PRESETS } from '../engine/defaults';
import { planDaily, type DailyCtx } from '../engine/quests';
import { dayKey } from '../engine/streak';
import { logActivity, resetAllData, updateLog, waterAndSleep } from './actions';
import { sleepOnTime, sleepWindow } from './sleep';
import { dailyTick } from './startup';

const base = { intensity: 'normal' as const };
const now0 = () => Date.now();

beforeEach(async () => {
  await resetAllData();
  await dailyTick();
});

describe('water is measured in litres with a 2 L daily goal', () => {
  it('uses litres, and 2 L is the default amount', () => {
    const w = DEFAULT_PRESETS.find((p) => p.id === 'water')!;
    expect(w.unit).toBe('liters');
    expect(w.defaultQty).toBe(2);
  });

  it('every day has a "Drink water: 2 L" quest that never grows with rank', () => {
    const ctx: DailyCtx = { flags: { work: false, college: false }, weekday: 3, questMult: 1.25, seed: 7, runsLast7: 0, ranYesterday: false, gymLast7: 0, effortByCategory: {}, exclude: [] };
    for (const seed of [1, 2, 3, 4, 5]) {
      const water = planDaily({ ...ctx, seed }, DEFAULT_PRESETS).find((q) => q.presetIds![0] === 'water')!;
      expect(water.target).toBe(2);
      expect(water.unit).toBe('L');
      expect(water.title).toBe('Drink water: 2 L');
    }
  });

  it('you can log it once at the end of the day or in pieces: the quest adds them up', async () => {
    const q = (await db.quests.where('key').startsWith(`daily:${dayKey(now0())}:`).toArray()).find((x) => x.presetIds?.[0] === 'water')!;
    expect(q.target).toBe(2);
    const first = await logActivity({ ...base, presetId: 'water', qty: 0.5, ts: now0() });
    expect(first.questsCompleted.some((c) => c.title === q.title)).toBe(false);
    const second = await logActivity({ ...base, presetId: 'water', qty: 1.5, ts: now0() });
    expect(second.questsCompleted.some((c) => c.title === q.title)).toBe(true);
    expect((await db.quests.get(q.id!))!.status).toBe('completed');
  });

  it('a single 2 L entry at night also completes it', async () => {
    const q = (await db.quests.where('key').startsWith(`daily:${dayKey(now0())}:`).toArray()).find((x) => x.presetIds?.[0] === 'water')!;
    const r = await logActivity({ ...base, presetId: 'water', qty: 2.5, ts: now0() });
    expect(r.questsCompleted.some((c) => c.title === q.title)).toBe(true);
  });

  it('rewards stop growing past 4 L (no incentive to over-drink) but the amount is still recorded', async () => {
    const four = await logActivity({ ...base, presetId: 'water', qty: 4, ts: now0() - 5000 });
    const six = await logActivity({ ...base, presetId: 'water', qty: 6, ts: now0() });
    expect(six.xp).toBe(four.xp);
    expect((await db.logs.get(six.logId))!.qty).toBe(6);
    expect(four.xp).toBe(48); // 12 per litre x 4
  });

  it('migrates old logs: 1 glass = 0.25 L', async () => {
    await db.presets.update('water', { unit: 'count', defaultQty: 1, xpPerUnit: 3, hpPerUnit: 0, hpDelta: 1, rewardCap: undefined });
    const id = (await db.logs.add({ ts: now0() - 86_400_000, presetId: 'water', categoryId: 'recovery', label: 'Drink water', qty: 8, unit: 'count', intensity: 'normal', xp: 24, gold: 8, hp: 8, statGains: {}, isPenalty: false, breaksStreak: false })) as number;
    await waterAndSleep();
    const log = (await db.logs.get(id))!;
    expect(log.qty).toBe(2);
    expect(log.unit).toBe('liters');
    expect((await db.presets.get('water'))!.unit).toBe('liters');
  });
});

describe('sleep entry', () => {
  it('works out hours across midnight, and naps on the same day', () => {
    const night = sleepWindow('2026-11-24', '23:30', '07:00');
    expect(night.hours).toBeCloseTo(7.5, 5);
    expect(new Date(night.bedTs).getDate()).toBe(23); // the evening before
    const afterMidnight = sleepWindow('2026-11-24', '00:30', '07:30');
    expect(afterMidnight.hours).toBeCloseTo(7, 5);
    expect(new Date(afterMidnight.bedTs).getDate()).toBe(24);
    expect(sleepWindow('2026-11-24', '14:00', '15:30').hours).toBeCloseTo(1.5, 5);
  });

  it('bedtime is on time within 30 minutes of the target; after midnight counts as late', () => {
    const at = (h: number, m: number) => new Date(2026, 10, 23, h, m).getTime();
    expect(sleepOnTime(at(22, 40), '23:00')).toBe(true);
    expect(sleepOnTime(at(23, 25), '23:00')).toBe(true);
    expect(sleepOnTime(at(23, 45), '23:00')).toBe(false);
    expect(sleepOnTime(new Date(2026, 10, 24, 0, 30).getTime(), '23:00')).toBe(false);
    expect(sleepOnTime(new Date(2026, 10, 24, 0, 45).getTime(), '00:30')).toBe(true);
  });

  it('pays for hours slept, remembers bedtime and wake time, and caps rewards at 9 h', async () => {
    const wake = now0() - 10 * 60_000;
    const r8 = await logActivity({ ...base, presetId: 'sleep-hours', qty: 8, ts: wake, sleep: { bed: wake - 8 * 3_600_000, wake } });
    expect(r8.xp).toBe(48); // 6 per hour
    const log = (await db.logs.get(r8.logId))!;
    expect(log.sleep).toEqual({ bed: wake - 8 * 3_600_000, wake });
    const r9 = await logActivity({ ...base, presetId: 'sleep-hours', qty: 9, ts: wake - 1000 });
    const r11 = await logActivity({ ...base, presetId: 'sleep-hours', qty: 11, ts: wake - 2000 });
    expect(r11.xp).toBe(r9.xp);
    expect((await db.logs.get(r11.logId))!.qty).toBe(11);
  });

  it('editing a sleep entry recalculates and keeps the bedtime data', async () => {
    const wake = now0() - 10 * 60_000;
    const r = await logActivity({ ...base, presetId: 'sleep-hours', qty: 6, ts: wake, sleep: { bed: wake - 6 * 3_600_000, wake } });
    await updateLog(r.logId, { ...base, presetId: 'sleep-hours', qty: 8, ts: wake, sleep: { bed: wake - 8 * 3_600_000, wake } });
    const log = (await db.logs.get(r.logId))!;
    expect(log.xp).toBe(48);
    expect(log.sleep!.bed).toBe(wake - 8 * 3_600_000);
  });

  it('"Slept on time" still works as its own quick entry', async () => {
    const r = await logActivity({ ...base, presetId: 'sleep-ontime', qty: 1, ts: now0() });
    expect(r.xp).toBeGreaterThan(0);
  });
});
