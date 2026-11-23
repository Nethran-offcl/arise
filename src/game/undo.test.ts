import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getSetting, setSetting } from '../db/db';
import { lastRaidRecap, questProgress } from '../engine/quests';
import { computeStreak, dayKey } from '../engine/streak';
import { logActivity, resetAllData } from './actions';
import { acceptAllDaily, acceptQuest, canUndoQuest, restoreQuest, skipQuest, toQuestLog, unacceptQuest } from './quests';
import { processRollover } from './rollover';
import { dailyTick } from './startup';

const DAY = 86_400_000;
const today = () => dayKey(Date.now());
const dailies = () => db.quests.where('key').startsWith(`daily:${today()}:`).toArray();

beforeEach(async () => {
  await resetAllData();
  await dailyTick();
});

describe('undo accept', () => {
  it('puts an accepted quest back to new', async () => {
    const [q] = await dailies();
    await acceptQuest(q.id!);
    expect((await db.quests.get(q.id!))!.status).toBe('active');
    await unacceptQuest(q.id!);
    const after = (await db.quests.get(q.id!))!;
    expect(after.status).toBe('offered');
    expect(after.acceptedAt).toBeUndefined();
  });

  it('works for weekly and emergency quests too, and never touches a completed one', async () => {
    const weekly = (await db.quests.where('kind').equals('weekly').first())!;
    await acceptQuest(weekly.id!);
    await unacceptQuest(weekly.id!);
    expect((await db.quests.get(weekly.id!))!.status).toBe('offered');
    const [q] = await dailies();
    await db.quests.update(q.id!, { status: 'completed' });
    await unacceptQuest(q.id!);
    expect((await db.quests.get(q.id!))!.status).toBe('completed');
  });

  it('is not offered for the boss, milestones or your own quests', async () => {
    const boss = (await db.quests.where('kind').equals('boss').first())!;
    const ms = (await db.quests.where('kind').equals('milestone').first())!;
    expect(canUndoQuest(boss)).toBe(false);
    expect(canUndoQuest(ms)).toBe(false);
    expect(canUndoQuest({ kind: 'custom' })).toBe(false);
    await unacceptQuest(boss.id!);
    expect((await db.quests.get(boss.id!))!.status).toBe('active');
  });

  it('un-accepting everything means no penalty at the end of the day (you accepted nothing)', async () => {
    const yesterday = Date.now() - DAY;
    const { ensureQuests } = await import('./quests');
    await ensureQuests(yesterday);
    await acceptAllDaily(yesterday);
    // un-accept everything that was accepted for yesterday (dailies and, on some days, a surprise emergency quest)
    for (const q of (await db.quests.toArray()).filter((x) => x.key.includes(dayKey(yesterday)) && x.status === 'active')) await unacceptQuest(q.id!);
    await setSetting('lastRollover', dayKey(yesterday));
    const s = await processRollover();
    expect(s.penalties).toBe(0);
    expect(s.failed).toBe(0);
  });

  it('progress is unaffected: the quest still completes from your logs', async () => {
    const q = (await dailies())[0];
    await acceptQuest(q.id!);
    await unacceptQuest(q.id!);
    const r = await logActivity({ presetId: q.presetIds![0], qty: q.metric === 'logs' ? 1 : q.target, intensity: 'normal', ts: Date.now() });
    expect(r.questsCompleted.some((c) => c.title === q.title)).toBe(true);
  });
});

describe('undo skip', () => {
  it('brings a skipped quest back while its day is not over', async () => {
    const [q] = await dailies();
    await skipQuest(q.id!);
    expect((await db.quests.get(q.id!))!.status).toBe('skipped');
    await restoreQuest(q.id!);
    expect((await db.quests.get(q.id!))!.status).toBe('offered');
  });

  it('does not bring back a quest whose day or week has ended', async () => {
    const [q] = await dailies();
    await skipQuest(q.id!);
    await db.quests.update(q.id!, { periodEnd: Date.now() - 1000 });
    await restoreQuest(q.id!);
    expect((await db.quests.get(q.id!))!.status).toBe('skipped');
  });

  it('only restores quests that were skipped', async () => {
    const [q] = await dailies();
    await restoreQuest(q.id!); // still "new": nothing happens
    expect((await db.quests.get(q.id!))!.status).toBe('offered');
  });
});

describe("last week's raid recap", () => {
  const board = async () => {
    const [quests, logs, paused] = await Promise.all([db.quests.toArray(), db.logs.toArray(), getSetting<string[]>('pausedDays', [])]);
    const streak = computeStreak(logs, new Set(paused), Date.now());
    const ql = logs.map(toQuestLog);
    return quests.map((q) => ({ q, progress: questProgress(q, ql, streak), target: q.target }));
  };

  it('is empty before any week has ended', async () => {
    expect(lastRaidRecap(await board(), Date.now())).toBeNull();
  });

  it('shows how the week ended: boss damage, what escaped, weekly quests', async () => {
    const boss = (await db.quests.where('kind').equals('boss').first())!;
    const start = Date.now() - 10 * DAY;
    const end = Date.now() - 3 * DAY;
    await db.quests.update(boss.id!, { periodStart: start, periodEnd: end, status: 'failed', target: 800 });
    await db.quests.where('kind').equals('weekly').modify({ periodStart: start, periodEnd: end, status: 'failed' });
    await logActivity({ presetId: 'run', qty: 3, intensity: 'normal', ts: start + 2 * DAY }); // 100 effort inside that week
    await logActivity({ presetId: 'gym', qty: 45, intensity: 'normal', ts: start + 3 * DAY }); // ~50 effort
    const r = lastRaidRecap(await board(), Date.now())!;
    expect(r.bossName).toBe(boss.bossName);
    expect(r.status).toBe('failed');
    expect(r.dealt).toBeGreaterThan(100);
    expect(r.percent).toBe(Math.round((r.dealt / 800) * 100));
    expect(r.remaining).toBeCloseTo(800 - r.dealt, 5);
    expect(r.weekly.length).toBeGreaterThanOrEqual(2);
    expect(r.endedAt).toBe(end);
  });

  it('shows a victory with what you earned', async () => {
    const boss = (await db.quests.where('kind').equals('boss').first())!;
    await db.quests.update(boss.id!, { periodStart: Date.now() - 9 * DAY, periodEnd: Date.now() - 2 * DAY, status: 'completed', paidXp: 640, paidGold: 80, target: 100 });
    await logActivity({ presetId: 'run', qty: 3, intensity: 'normal', ts: Date.now() - 8 * DAY });
    const r = lastRaidRecap(await board(), Date.now())!;
    expect(r.status).toBe('completed');
    expect(r.paidXp).toBe(640);
    expect(r.percent).toBe(100);
  });

  it('stays for a week and then goes away, and shows the most recent finished week', async () => {
    const boss = (await db.quests.where('kind').equals('boss').first())!;
    await db.quests.update(boss.id!, { periodStart: Date.now() - 20 * DAY, periodEnd: Date.now() - 8 * DAY });
    expect(lastRaidRecap(await board(), Date.now())).toBeNull(); // too old
    await db.quests.update(boss.id!, { periodStart: Date.now() - 12 * DAY, periodEnd: Date.now() - 6 * DAY });
    expect(lastRaidRecap(await board(), Date.now())).not.toBeNull();
  });
});
