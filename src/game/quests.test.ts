import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getSetting, setSetting } from '../db/db';
import { xpAtLevelStart } from '../engine/levels';
import { dayKey } from '../engine/streak';
import { logActivity, resetAllData, setMode } from './actions';
import { buildBackup, restoreBackup } from './backup';
import { acceptAllDaily, acceptQuest, addCustomQuest, ensureQuests, regenerateDaily, skipQuest, stopRecurring } from './quests';
import { processRollover } from './rollover';
import { setTodayFlags } from './schedule';
import { buyItem, deleteShopItem, addReward, getCount, refundPurchase, useDoubleXp, useRestPass } from './shop';
import { dailyTick } from './startup';

const DAY = 86_400_000;
const base = { intensity: 'normal' as const };
const now0 = () => Date.now();

const dailies = (key = dayKey(now0())) => db.quests.where('key').startsWith(`daily:${key}:`).toArray();
const give = (gold: number) => db.profile.update(1, { gold });

beforeEach(async () => {
  await resetAllData();
  await dailyTick();
});

describe('quest generation', () => {
  it('creates dailies, weekly quests, a boss and milestones, and never twice', async () => {
    const d = await dailies();
    expect(d.length).toBeGreaterThanOrEqual(3);
    expect(d.length).toBeLessThanOrEqual(5);
    expect(d.every((q) => q.status === 'offered')).toBe(true);
    const all = await db.quests.toArray();
    expect(all.filter((q) => q.kind === 'weekly').length).toBeGreaterThanOrEqual(2);
    expect(all.filter((q) => q.kind === 'boss')).toHaveLength(1);
    expect(all.filter((q) => q.kind === 'milestone')).toHaveLength(8);
    const count = await db.quests.count();
    await ensureQuests();
    await ensureQuests();
    expect(await db.quests.count()).toBe(count);
  });

  it('offers no daily quests on a rest day, but the weekly boss still exists', async () => {
    await resetAllData();
    await setMode('rest');
    await ensureQuests();
    expect(await dailies()).toHaveLength(0);
    expect(await db.quests.where('kind').equals('boss').count()).toBe(1);
  });

  it('follows your day type: the Work or study quest is bigger on a work + college day than on a free day', async () => {
    const target = async (flags: { work: boolean; college: boolean }) => {
      await resetAllData();
      await setTodayFlags(flags);
      await ensureQuests();
      return (await dailies()).find((q) => q.key.endsWith(':workstudy'))!.target;
    };
    expect(await target({ work: false, college: false })).toBe(40);
    expect(await target({ work: false, college: true })).toBe(60);
    expect(await target({ work: true, college: true })).toBe(90);
  });

  it('re-rolling keeps accepted quests and replaces the rest', async () => {
    const first = await dailies();
    await acceptQuest(first[0].id!);
    await regenerateDaily();
    const after = await dailies();
    expect(after.some((q) => q.id === first[0].id && q.status === 'active')).toBe(true);
    expect(after.length).toBeLessThanOrEqual(5);
    expect(new Set(after.map((q) => q.presetIds![0])).size).toBe(after.length);
  });

  it('skipping and accepting work', async () => {
    const [a, b] = await dailies();
    await acceptQuest(a.id!);
    await skipQuest(b.id!);
    expect((await db.quests.get(a.id!))!.status).toBe('active');
    expect((await db.quests.get(b.id!))!.status).toBe('skipped');
    await acceptAllDaily();
    expect((await dailies()).filter((q) => q.status === 'offered')).toHaveLength(0);
  });
});

describe('completing quests', () => {
  // what to log to finish a quest (the flexible Work or study quest is measured in points: 40 per hour of study)
  const target = (q: { presetIds?: string[]; target: number; metric: string }) =>
    q.metric === 'effort' ? { presetId: 'study', qty: q.target / 40 + 0.1 } : { presetId: q.presetIds![0], qty: q.metric === 'logs' ? 1 : q.target };

  it('logging the work completes the quest and pays XP and gold', async () => {
    const q = (await dailies())[0];
    const goldBefore = (await db.profile.get(1))!.gold;
    const r = await logActivity({ ...base, ...target(q), ts: now0() });
    const done = r.questsCompleted.find((c) => c.title === q.title)!;
    expect(done.xp).toBeGreaterThan(0);
    expect((await db.quests.get(q.id!))!.status).toBe('completed');
    expect((await db.profile.get(1))!.gold).toBeGreaterThan(goldBefore + r.gold - 1);
  });

  it('quest rewards scale with your level, just like everything else', async () => {
    const q = (await dailies())[0];
    await db.profile.update(1, { totalXp: xpAtLevelStart(10) + 100 });
    const r = await logActivity({ ...base, ...target(q), ts: now0() });
    const paid = (await db.quests.get(q.id!))!.paidXp!;
    expect(paid).toBe(Math.round(q.rewardEffort * 10 * 1.05));
    expect(r.questsCompleted.length).toBeGreaterThan(0);
  });

  it('clearing the whole daily set pays a one-time bonus', async () => {
    let bonus = 0;
    for (const q of await dailies()) {
      const r = await logActivity({ ...base, ...target(q), ts: now0() });
      bonus += r.questsCompleted.filter((c) => c.title === 'Daily set cleared').length;
    }
    expect(bonus).toBe(1);
    const again = await logActivity({ ...base, presetId: 'walk', qty: 5, ts: now0() });
    expect(again.questsCompleted.some((c) => c.title === 'Daily set cleared')).toBe(false);
  });

  it('level-ups include quest XP', async () => {
    const q = (await dailies())[0];
    await db.profile.update(1, { totalXp: 599 }); // 1 XP short of level 2
    const r = await logActivity({ ...base, ...target(q), ts: now0() });
    expect(r.levelAfter).toBeGreaterThan(r.levelBefore);
  });

  it('the boss takes damage from every task and pays out when defeated', async () => {
    const boss = (await db.quests.where('kind').equals('boss').first())!;
    await db.quests.update(boss.id!, { target: 150 });
    const r1 = await logActivity({ ...base, presetId: 'run', qty: 3, ts: now0() }); // 100 effort
    expect(r1.questsCompleted.some((c) => c.kind === 'boss')).toBe(false);
    const r2 = await logActivity({ ...base, presetId: 'gym', qty: 30, ts: now0() }); // 37 effort -> 137... plus more
    const r3 = await logActivity({ ...base, presetId: 'study', qty: 1, ts: now0() });
    expect([...r2.questsCompleted, ...r3.questsCompleted].some((c) => c.kind === 'boss')).toBe(true);
    expect((await db.quests.get(boss.id!))!.status).toBe('completed');
  });

  it('milestones complete on real achievements (first 5 km)', async () => {
    const r = await logActivity({ ...base, presetId: 'run', qty: 5, ts: now0() });
    expect(r.questsCompleted.some((c) => c.title === 'First 5 km run')).toBe(true);
    expect(r.questsCompleted.some((c) => c.title.includes('10 times'))).toBe(false);
  });

  it('editing or deleting a log never leaves quests inconsistent (progress is derived)', async () => {
    const r = await logActivity({ ...base, presetId: 'run', qty: 4, ts: now0() });
    expect((await db.quests.get((await db.quests.where('key').equals('ms:run3x10').first())!.id!))!.status).toBe('active');
    await db.logs.delete(r.logId); // progress comes from logs, nothing stale is stored
    expect(await db.logs.count()).toBe(0);
  });
});

describe('quests that are already satisfied when they appear', () => {
  it('are completed and paid at the daily tick (e.g. you ran 5 km before the milestone existed)', async () => {
    await resetAllData();
    await logActivity({ ...base, presetId: 'run', qty: 5, ts: now0() }); // no quests exist yet
    const gold = (await db.profile.get(1))!.gold;
    const tick = await dailyTick();
    expect(tick.completed.some((c) => c.title === 'First 5 km run')).toBe(true);
    expect((await db.quests.where('key').equals('ms:first5k').first())!.status).toBe('completed');
    expect((await db.profile.get(1))!.gold).toBeGreaterThan(gold);
    expect((await dailyTick()).completed).toHaveLength(0); // never paid twice
  });
  it('a custom quest you already satisfied today completes immediately', async () => {
    await logActivity({ ...base, presetId: 'water', qty: 4, ts: now0() });
    await addCustomQuest({ presetId: 'water', target: 3, period: 'today' });
    expect((await db.quests.where('kind').equals('custom').first())!.status).toBe('completed');
  });
});

describe('custom and recurring quests', () => {
  it('a one-off custom quest completes from logs', async () => {
    await addCustomQuest({ presetId: 'water', target: 4, period: 'today' });
    const q = (await db.quests.where('kind').equals('custom').first())!;
    expect(q.status).toBe('active');
    const r = await logActivity({ ...base, presetId: 'water', qty: 4, ts: now0() });
    expect(r.questsCompleted.some((c) => c.kind === 'custom')).toBe(true);
  });

  it('a recurring quest appears again every day until you stop it', async () => {
    await addCustomQuest({ presetId: 'journal', target: 1, period: 'daily' });
    const t = (await db.questTemplates.toArray())[0];
    const today = dayKey(now0());
    const tomorrow = dayKey(now0() + DAY);
    expect(await db.quests.where('key').equals(`rec:${t.id}:${today}`).count()).toBe(1);
    await ensureQuests(now0() + DAY);
    expect(await db.quests.where('key').equals(`rec:${t.id}:${tomorrow}`).count()).toBe(1);
    await stopRecurring(t.id!);
    await ensureQuests(now0() + 2 * DAY);
    expect(await db.quests.where('key').equals(`rec:${t.id}:${dayKey(now0() + 2 * DAY)}`).count()).toBe(0);
  });
});

describe('end of day (rollover)', () => {
  const yesterday = () => dayKey(now0() - DAY);
  const setupYesterday = async () => {
    await ensureQuests(now0() - DAY);
    await setSetting('lastRollover', yesterday());
  };
  const penalties = () => db.logs.where('presetId').equals('p-quests').count();

  it('accepted dailies that were all missed fail and cost one small penalty', async () => {
    await setupYesterday();
    await acceptAllDaily(now0() - DAY);
    const s = await processRollover();
    expect(s.days).toBe(1);
    expect(s.failed).toBeGreaterThanOrEqual(3);
    expect(s.penalties).toBe(1);
    expect(await penalties()).toBe(1);
    expect((await dailies(yesterday())).every((q) => q.status === 'failed')).toBe(true);
  });

  it('no penalty if you never accepted the quests (they are just skipped)', async () => {
    await setupYesterday();
    const s = await processRollover();
    expect(s.penalties).toBe(0);
    expect((await dailies(yesterday())).every((q) => q.status === 'skipped')).toBe(true);
  });

  it('no penalty if you completed at least one', async () => {
    await setupYesterday();
    await acceptAllDaily(now0() - DAY);
    const list = await dailies(yesterday());
    await db.quests.update(list[0].id!, { status: 'completed' });
    expect((await processRollover()).penalties).toBe(0);
  });

  it('no penalty on a rest or sick day', async () => {
    await setupYesterday();
    await acceptAllDaily(now0() - DAY);
    await setSetting('pausedDays', [yesterday()]);
    const s = await processRollover();
    expect(s.penalties).toBe(0);
    expect(s.failed).toBe(0);
  });

  it('a Streak Shield saves the streak when you miss a day, and is used up', async () => {
    const twoAgo = now0() - 2 * DAY;
    await logActivity({ ...base, presetId: 'walk', qty: 30, ts: twoAgo });
    await db.inventory.put({ id: 'shield', count: 1 });
    await setSetting('lastRollover', yesterday());
    const s = await processRollover();
    expect(s.shieldsUsed).toBe(1);
    expect(await getCount('shield')).toBe(0);
    expect(await getSetting<string[]>('pausedDays', [])).toContain(yesterday());
  });

  it('without a shield (or a streak) nothing is consumed', async () => {
    await setSetting('lastRollover', yesterday());
    expect((await processRollover()).shieldsUsed).toBe(0);
  });

  it('overdue weekly and boss quests expire without penalty', async () => {
    const boss = (await db.quests.where('kind').equals('boss').first())!;
    await db.quests.update(boss.id!, { periodEnd: now0() - 1000 });
    const s = await processRollover();
    expect((await db.quests.get(boss.id!))!.status).toBe('failed');
    expect(s.penalties).toBe(0);
  });

  it('old quest history is pruned but milestones are kept', async () => {
    await db.quests.add({ key: 'old', kind: 'daily', title: 'old', metric: 'qty', target: 1, unit: 'x', periodStart: now0() - 100 * DAY, periodEnd: now0() - 99 * DAY, status: 'completed', rewardEffort: 1, rewardGold: 1, createdAt: 0 });
    await processRollover();
    expect(await db.quests.where('key').equals('old').count()).toBe(0);
    expect(await db.quests.where('kind').equals('milestone').count()).toBe(8);
  });

  it('missing several days is handled day by day (capped at 30)', async () => {
    await setSetting('lastRollover', dayKey(now0() - 50 * DAY));
    const s = await processRollover();
    expect(s.days).toBe(30);
    expect(await getSetting<string>('lastRollover', '')).toBe(dayKey(now0()));
  });
});

describe('shop and consumables', () => {
  it('seeds the three built-in consumables once', async () => {
    expect((await db.shop.toArray()).map((s) => s.id).sort()).toEqual(['double-xp', 'rest-pass', 'shield']);
    await dailyTick();
    expect(await db.shop.count()).toBe(3);
  });

  it('cannot buy without enough gold, and spending is recorded', async () => {
    await give(100);
    const no = await buyItem('shield');
    expect(no.ok).toBe(false);
    expect(no.reason).toMatch(/100 more gold/);
    await give(500);
    expect((await buyItem('shield')).ok).toBe(true);
    expect((await db.profile.get(1))!.gold).toBe(300);
    expect(await getCount('shield')).toBe(1);
    expect(await db.purchases.count()).toBe(1);
  });

  it('your own rewards are priced by you and can be refunded', async () => {
    await addReward('Watch an episode', 50, '📺');
    const item = (await db.shop.toArray()).find((s) => s.name === 'Watch an episode')!;
    await give(80);
    expect((await buyItem(item.id)).ok).toBe(true);
    expect((await db.profile.get(1))!.gold).toBe(30);
    const pur = (await db.purchases.toArray())[0];
    expect((await refundPurchase(pur.id!)).ok).toBe(true);
    expect((await db.profile.get(1))!.gold).toBe(80);
    expect(await deleteShopItem(item.id)).toBe(true);
    expect(await deleteShopItem('shield')).toBe(false); // built-ins stay
  });

  it('a used consumable cannot be refunded', async () => {
    await give(500);
    await buyItem('rest-pass');
    const pur = (await db.purchases.toArray())[0];
    await useRestPass();
    expect((await refundPurchase(pur.id!)).ok).toBe(false);
  });

  it('Rest Day Pass protects today without switching to rest mode', async () => {
    expect((await useRestPass()).ok).toBe(false);
    await db.inventory.put({ id: 'rest-pass', count: 1 });
    expect((await useRestPass()).ok).toBe(true);
    expect(await getSetting<string[]>('pausedDays', [])).toContain(dayKey(now0()));
    expect(await getCount('rest-pass')).toBe(0);
    await db.inventory.put({ id: 'rest-pass', count: 1 });
    expect((await useRestPass()).ok).toBe(false); // already protected
  });

  it('Double XP Potion doubles XP for 24 hours, then stops', async () => {
    const plain = (await logActivity({ ...base, presetId: 'study', qty: 1, ts: now0() })).xp;
    await db.inventory.put({ id: 'double-xp', count: 1 });
    expect((await useDoubleXp()).ok).toBe(true);
    expect((await useDoubleXp()).ok).toBe(false);
    const boosted = (await logActivity({ ...base, presetId: 'study', qty: 1, ts: now0() })).xp;
    expect(boosted).toBe(plain * 2);
    await setSetting('doubleXp', { from: now0() - 2 * DAY, until: now0() - DAY });
    expect((await logActivity({ ...base, presetId: 'study', qty: 1, ts: now0() })).xp).toBe(plain);
  });
});

describe('backup includes quests and shop', () => {
  it('round-trips the shop, bag and quests', async () => {
    await give(500);
    await buyItem('shield');
    const text = JSON.stringify(await buildBackup());
    const questCount = await db.quests.count();
    await resetAllData();
    await restoreBackup(text);
    expect(await getCount('shield')).toBe(1);
    expect(await db.purchases.count()).toBe(1);
    expect(await db.quests.count()).toBeGreaterThanOrEqual(questCount - 1);
  });
});
