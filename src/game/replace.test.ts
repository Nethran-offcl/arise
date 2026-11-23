import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getSetting } from '../db/db';
import { dayKey } from '../engine/streak';
import { logActivity, resetAllData, setMode } from './actions';
import { acceptQuest, ensureQuests, restoreQuest, skipQuest } from './quests';
import { dailyTick } from './startup';

const today = () => dayKey(Date.now());
const todays = () => db.quests.where('key').startsWith(`daily:${today()}:`).toArray();
const slug = (key: string) => key.split(':').pop()!;

beforeEach(async () => {
  await resetAllData();
  await dailyTick();
});

describe('free replacement when you skip a daily quest', () => {
  it('your first skip each day brings a new, different quest', async () => {
    const before = await todays();
    const target = before[0];
    const { replacement } = await skipQuest(target.id!);
    expect(replacement).not.toBeNull();
    expect((await db.quests.get(target.id!))!.status).toBe('skipped');
    expect(replacement!.status).toBe('offered');
    expect(replacement!.kind).toBe('daily');
    // never a task you already have today (skipped ones included)
    expect(before.map((q) => slug(q.key))).not.toContain(slug(replacement!.key));
    expect(replacement!.replacementOf).toBe(target.id);
    expect((await db.quests.get(target.id!))!.replacedBy).toBe(replacement!.id);
  });

  it('is free: it costs no gold and no XP, and the replacement is a normal quest you can earn from', async () => {
    const gold = (await db.profile.get(1))!.gold;
    const { replacement } = await skipQuest((await todays())[0].id!);
    expect((await db.profile.get(1))!.gold).toBe(gold);
    expect(replacement!.rewardEffort).toBeGreaterThan(0);
  });

  it('is once a day: the second skip is still free of penalty but has no replacement', async () => {
    const list = await todays();
    const first = await skipQuest(list[0].id!);
    const second = await skipQuest(list[1].id!);
    expect(first.replacement).not.toBeNull();
    expect(second.replacement).toBeNull();
    expect((await db.quests.get(list[1].id!))!.status).toBe('skipped');
    expect(await getSetting<number>(`replaced:${today()}`, 0)).toBe(1);
  });

  it('works on an accepted quest too', async () => {
    const q = (await todays())[0];
    await acceptQuest(q.id!);
    const { replacement } = await skipQuest(q.id!);
    expect(replacement).not.toBeNull();
    expect(replacement!.status).toBe('offered'); // you choose whether to accept the new one
  });

  it('only for daily quests: weekly, emergency and the boss are just skipped (or not skippable)', async () => {
    const weekly = (await db.quests.where('kind').equals('weekly').first())!;
    expect((await skipQuest(weekly.id!)).replacement).toBeNull();
    expect((await db.quests.get(weekly.id!))!.status).toBe('skipped');
    const boss = (await db.quests.where('kind').equals('boss').first())!;
    expect((await skipQuest(boss.id!)).replacement).toBeNull();
    expect((await db.quests.get(boss.id!))!.status).toBe('active'); // the boss cannot be skipped
  });

  it('never creates a duplicate and never adds another must-have quest like water or work or study', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      await resetAllData();
      await dailyTick();
      const list = await todays();
      const { replacement } = await skipQuest(list[i % list.length].id!);
      if (replacement) {
        seen.add(slug(replacement.key));
        const all = await todays();
        expect(new Set(all.map((q) => q.key)).size).toBe(all.length);
      }
    }
    for (const must of ['water', 'workstudy', 'run', 'walk', 'study', 'office']) expect(seen.has(must), must).toBe(false);
  });

  it('is not given on a rest day', async () => {
    const q = (await todays())[0];
    await setMode('rest');
    expect((await skipQuest(q.id!)).replacement).toBeNull();
  });

  it('a skipped quest with a replacement never causes the end-of-day penalty by itself', async () => {
    const list = await todays();
    await skipQuest(list[0].id!);
    expect((await todays()).filter((q) => q.acceptedAt).length).toBe(0);
  });

  it('completing the replacement works like any other quest', async () => {
    const { replacement } = await skipQuest((await todays())[0].id!);
    const p = replacement!.presetIds![0];
    const r = await logActivity({ presetId: p, qty: replacement!.metric === 'logs' ? 1 : replacement!.target, intensity: 'normal', ts: Date.now() });
    expect(r.questsCompleted.some((c) => c.title === replacement!.title)).toBe(true);
  });
});

describe('undoing a skip', () => {
  it('removes the untouched replacement and gives the free replacement back', async () => {
    const q = (await todays())[0];
    const { replacement } = await skipQuest(q.id!);
    await restoreQuest(q.id!);
    expect((await db.quests.get(q.id!))!.status).toBe('offered');
    expect(await db.quests.get(replacement!.id!)).toBeUndefined();
    expect(await getSetting<number>(`replaced:${today()}`, 0)).toBe(0);
    // and you can skip again and still get the free replacement
    expect((await skipQuest(q.id!)).replacement).not.toBeNull();
  });

  it('keeps both if you already accepted the replacement', async () => {
    const q = (await todays())[0];
    const { replacement } = await skipQuest(q.id!);
    await acceptQuest(replacement!.id!);
    await restoreQuest(q.id!);
    expect((await db.quests.get(q.id!))!.status).toBe('offered');
    expect((await db.quests.get(replacement!.id!))!.status).toBe('active');
  });

  it('re-creating the day does not touch skipped quests or duplicate them', async () => {
    const q = (await todays())[0];
    await skipQuest(q.id!);
    const count = (await todays()).length;
    await ensureQuests();
    expect((await todays()).length).toBe(count);
  });
});
