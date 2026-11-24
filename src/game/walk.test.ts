import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, setSetting } from '../db/db';
import { STEPS_PER_KM } from '../engine/formula';
import { dayKey } from '../engine/streak';
import { ensureSeed, logActivity, resetAllData } from './actions';
import { dailyTick } from './startup';

const base = { intensity: 'normal' as const };
const today = () => dayKey(Date.now());

beforeEach(async () => {
  await resetAllData();
});

describe('walking by distance', () => {
  it('is measured in km, like running', async () => {
    expect((await db.presets.get('walk'))!.unit).toBe('km');
  });

  it('10,000 steps pays more than 5,000 steps, and further always pays more', async () => {
    const pay = async (steps: number, ts: number) => (await logActivity({ ...base, presetId: 'walk', qty: steps / STEPS_PER_KM, ts })).xp;
    const five = await pay(5000, Date.now() - 2000);
    const ten = await pay(10000, Date.now() - 1000);
    expect(ten).toBeGreaterThan(five * 1.8);
    expect(five).toBeGreaterThan(0);
  });

  it('a walk quest is a distance goal that steps, trekking and incline walking all count toward', async () => {
    await dailyTick();
    const q = (await db.quests.where('key').startsWith(`daily:${today()}:`).toArray()).find((x) => x.key.endsWith(':walk') || x.key.endsWith(':run'))!;
    expect(q.unit).toBe('km');
  });
});

describe('upgrading an old install (walk was in minutes)', () => {
  it('converts the task, old logs and open quests, and keeps the XP you already earned', async () => {
    await dailyTick();
    const d = (await db.presets.get('walk'))!;
    await db.presets.update('walk', { unit: 'minutes', defaultQty: 30, xpPerUnit: 0.8, goldPerUnit: 0.3, hpPerUnit: -0.03 });
    const id = await db.logs.add({ ts: Date.now(), presetId: 'walk', categoryId: 'cardio', label: 'Walk', qty: 60, unit: 'minutes', intensity: 'normal', xp: 50, gold: 5, hp: 0, statGains: {}, isPenalty: false, breaksStreak: false } as never);
    const base0 = (await db.quests.where('key').startsWith(`daily:${today()}:`).toArray())[0];
    const qid = await db.quests.add({ ...base0, id: undefined, key: `daily:${today()}:walk-old`, title: 'Walk: 30 min', presetIds: ['walk'], metric: 'qty', target: 30, unit: 'min', status: 'offered' } as never);
    await setSetting('seedVersion', 15);
    await ensureSeed();
    const p = (await db.presets.get('walk'))!;
    expect(p.unit).toBe('km');
    expect(p.xpPerUnit).toBe(d.xpPerUnit);
    const log = (await db.logs.get(id))!;
    expect(log.qty).toBe(5); // 60 minutes = 5 km
    expect(log.unit).toBe('km');
    expect(log.xp).toBe(50);
    const q = (await db.quests.get(qid))!;
    expect(q.target).toBe(2.5);
    expect(q.unit).toBe('km');
    expect(q.title).toBe('Walk: 2.5 km');
  });

  it('leaves a walk task you changed to your own unit alone', async () => {
    await dailyTick();
    await db.presets.update('walk', { unit: 'count', defaultQty: 100 });
    await setSetting('seedVersion', 15);
    await ensureSeed();
    expect((await db.presets.get('walk'))!.unit).toBe('count');
  });
});
