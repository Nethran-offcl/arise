import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, setSetting } from '../db/db';
import { dayKey, weekStartKey } from '../engine/streak';
import { resetAllData } from './actions';
import { acceptQuest } from './quests';
import { dailyTick } from './startup';
import { setExam } from './system';

const today = () => dayKey(Date.now());
const slug = (k: string) => k.split(':').pop()!;
const dailies = () => db.quests.where('key').startsWith(`daily:${today()}:`).toArray();
const weekly = () => db.quests.where('key').startsWith(`weekly:${weekStartKey(today())}:`).toArray();

/** Rebuilds the old situation: separate study + office dailies and a weekly "Study 4 hours", with the old design flag. */
async function oldDesign() {
  await dailyTick();
  for (const q of await dailies()) if (slug(q.key) === 'workstudy') await db.quests.delete(q.id!);
  const base = (await dailies())[0];
  const mk = (key: string, presetId: string, title: string, over: object = {}) =>
    db.quests.add({ ...base, id: undefined, key, title, presetIds: [presetId], metric: 'qty', target: 1, unit: 'h', status: 'offered', acceptedAt: undefined, ...over } as never);
  await mk(`daily:${today()}:study`, 'study', 'Study session: 1 h');
  await mk(`daily:${today()}:office`, 'office', 'Office task done: 3 x');
  for (const q of await weekly()) if (slug(q.key) === 'workstudy') await db.quests.delete(q.id!);
  const w = (await weekly())[0];
  await db.quests.add({ ...w, id: undefined, key: `weekly:${weekStartKey(today())}:study`, title: 'Study 4 hours this week', presetIds: ['study'], categoryIds: undefined, metric: 'qty', target: 4, unit: 'h', status: 'offered' } as never);
  await setSetting('questDesign', 1);
}

beforeEach(async () => {
  await resetAllData();
});

describe('one-time refresh to the Work or study design', () => {
  it('swaps un-accepted study and office quests for the flexible one, for today and this week', async () => {
    await oldDesign();
    await dailyTick();
    const d = (await dailies()).filter((q) => q.status !== 'skipped').map((q) => slug(q.key));
    expect(d).toContain('workstudy');
    expect(d).not.toContain('study');
    expect(d).not.toContain('office');
    const w = (await weekly()).map((q) => slug(q.key));
    expect(w).toContain('workstudy');
    expect(w).not.toContain('study');
    expect(w).toContain('lift');
  });

  it('leaves a quest you already accepted alone', async () => {
    await oldDesign();
    const study = (await dailies()).find((q) => slug(q.key) === 'study')!;
    await acceptQuest(study.id!);
    await dailyTick();
    expect((await db.quests.get(study.id!))!.status).toBe('active');
  });

  it('runs only once, so a quest you skip or re-roll is not undone every time the app opens', async () => {
    await oldDesign();
    await dailyTick();
    const before = (await dailies()).map((q) => q.key).sort();
    await dailyTick();
    await dailyTick();
    expect((await dailies()).map((q) => q.key).sort()).toEqual(before);
  });

  it('keeps the specific study quest during exam mode', async () => {
    await oldDesign();
    await setExam({ active: true, name: 'Finals', date: dayKey(Date.now() + 10 * 86_400_000) }); // exam mode turned on afterwards
    await dailyTick();
    expect((await weekly()).map((q) => slug(q.key))).toContain('study');
  });

  it('a brand-new install never needs it', async () => {
    await dailyTick();
    expect((await dailies()).map((q) => slug(q.key))).toContain('workstudy');
  });
});
