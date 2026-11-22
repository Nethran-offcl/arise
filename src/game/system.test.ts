import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { dayKey, shiftDay, weekStartKey } from '../engine/streak';
import { logActivity, resetAllData, setHp } from './actions';
import { regenerateDaily } from './quests';
import { dailyTick } from './startup';
import { addDeadline, getDeadlines, loadSnapshot, loadWeeklyReview, removeDeadline, setExam, setGentleDay } from './system';

const DAY = 86_400_000;
const base = { intensity: 'hard' as const };
const now0 = () => Date.now();
const todayQuests = async () => (await db.quests.where('key').startsWith(`daily:${dayKey(now0())}:`).toArray()).map((q) => q.presetIds![0]);

beforeEach(async () => {
  await resetAllData();
});

describe('the engine reads your real data', () => {
  it('builds a snapshot with energy, streak, mode and category names', async () => {
    await dailyTick();
    await setHp(42);
    await logActivity({ presetId: 'walk', qty: 30, intensity: 'normal', ts: now0() });
    const s = await loadSnapshot();
    expect(s.today).toBe(dayKey(now0()));
    expect(s.energy).toBeLessThanOrEqual(42);
    expect(s.streak).toBe(1);
    expect(s.mode).toBe('normal');
    expect(s.categoryNames.cardio).toBe('Cardio & Sports');
    expect(s.sleepTargetHours).toBe(8);
    expect(s.logs.some((l) => l.presetId === 'walk')).toBe(true);
  });

  it('remembers bedtime from sleep entries', async () => {
    await dailyTick();
    const wake = now0() - 3_600_000;
    const bed = new Date(wake - 7 * 3_600_000);
    await logActivity({ presetId: 'sleep-hours', qty: 7, intensity: 'normal', ts: wake, sleep: { bed: bed.getTime(), wake } });
    const l = (await loadSnapshot()).logs.find((x) => x.presetId === 'sleep-hours')!;
    const m = bed.getHours() * 60 + bed.getMinutes();
    expect(l.bedMinutes).toBe(m >= 720 ? m - 720 : m + 720);
  });
});

describe('quests follow the System advice', () => {
  it('two hard days in a row make today a recovery day: no run, lifting or office tasks', async () => {
    await logActivity({ presetId: 'gym', qty: 60, ...base, ts: now0() - DAY });
    await logActivity({ presetId: 'gym', qty: 60, ...base, ts: now0() - 2 * DAY });
    await dailyTick();
    const set = await todayQuests();
    expect(set).toContain('walk');
    expect(set).toContain('water');
    for (const banned of ['run', 'gym', 'office']) expect(set).not.toContain(banned);
  });

  it('a healthy week still gets a run and normal quests', async () => {
    await dailyTick();
    const set = await todayQuests();
    expect(set.length).toBeGreaterThanOrEqual(3);
    expect(set).toContain('water');
    expect(set.includes('run') || set.includes('walk')).toBe(true);
  });

  it('"take a gentle day" turns the offered quests into a recovery plan', async () => {
    await dailyTick();
    await setGentleDay(true);
    await regenerateDaily();
    const set = await todayQuests();
    for (const banned of ['run', 'gym', 'office', 'study']) expect(set).not.toContain(banned);
    expect(set).toContain('walk');
    await setGentleDay(false);
  });

  it('exam mode adds study (even on a free day) and a bigger weekly study goal', async () => {
    await setExam({ active: true, name: 'Finals', date: dayKey(now0() + 10 * DAY) });
    await dailyTick();
    const study = (await db.quests.where('key').startsWith(`daily:${dayKey(now0())}:`).toArray()).find((q) => q.presetIds?.[0] === 'study');
    expect(study).toBeTruthy();
    expect(study!.target).toBe(2.5);
    const weekly = await db.quests.where('key').equals(`weekly:${weekStartKey(dayKey(now0()))}:study`).first();
    expect(weekly?.target).toBe(10);
  });

  it('never asks you to run past the weekly budget (max +10% a week)', async () => {
    const wk = weekStartKey(dayKey(now0()));
    const lastWeekTs = new Date(shiftDay(wk, -3) + 'T12:00:00').getTime();
    await logActivity({ presetId: 'run', qty: 6, intensity: 'normal', ts: lastWeekTs }); // last week: 6 km -> budget 6.6 km
    await logActivity({ presetId: 'run', qty: 6.4, intensity: 'normal', ts: now0() - 60_000 }); // this week: 6.4 km already
    await dailyTick();
    expect(await todayQuests()).not.toContain('run');
  });
});

describe('exam settings and review', () => {
  it('stores and removes deadlines in date order', async () => {
    await addDeadline('Essay', dayKey(now0() + 5 * DAY));
    await addDeadline('Lab report', dayKey(now0() + 2 * DAY));
    expect((await getDeadlines()).map((d) => d.title)).toEqual(['Lab report', 'Essay']);
    await removeDeadline((await getDeadlines())[0].id);
    expect((await getDeadlines()).map((d) => d.title)).toEqual(['Essay']);
  });

  it('a close deadline switches the engine into deadline focus', async () => {
    await addDeadline('Essay', dayKey(now0() + 2 * DAY));
    await dailyTick();
    expect(await todayQuests()).toContain('study');
  });

  it('builds a weekly review from real logs and quests', async () => {
    await dailyTick();
    const wk = weekStartKey(dayKey(now0()));
    const lastWeekTs = new Date(shiftDay(wk, -4) + 'T12:00:00').getTime();
    await logActivity({ presetId: 'run', qty: 3, intensity: 'normal', ts: lastWeekTs });
    const last = await loadWeeklyReview('last');
    expect(last.weekKey).toBe(shiftDay(wk, -7));
    expect(last.stats.runKm).toBe(3);
    expect(last.wins.length).toBeGreaterThan(0);
    expect(last.plan.join(' ')).toMatch(/Running/);
    const current = await loadWeeklyReview('current');
    expect(current.weekKey).toBe(wk);
  });
});
