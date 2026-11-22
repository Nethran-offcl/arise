import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, setSetting } from '../db/db';
import { logActivity, resetAllData } from './actions';
import { dailyTick } from './startup';

const base = { intensity: 'normal' as const };
const share = (g: Record<string, number | undefined>, k: string): number => {
  const total = Object.values(g).reduce<number>((sum, v) => sum + (v ?? 0), 0);
  return (g[k] ?? 0) / total;
};

beforeEach(async () => {
  await resetAllData();
});

describe('cardio builds Vitality as well as Agility', () => {
  it('every cardio task is 70% Agility and 30% Vitality', async () => {
    for (const [id, qty] of [['run', 3], ['walk', 30], ['incline-walk', 30], ['cycling', 45], ['jump-rope', 10], ['swimming', 30]] as const) {
      const r = await logActivity({ ...base, presetId: id, qty, ts: Date.now() });
      expect(r.statGains.VIT, id).toBeGreaterThan(0);
      expect(r.statGains.STR, id).toBeUndefined();
      expect(share(r.statGains, 'AGI'), id).toBeCloseTo(0.7, 1);
      expect(share(r.statGains, 'VIT'), id).toBeCloseTo(0.3, 1);
    }
  });

  it('sports are 50% Agility, 30% Strength, 20% Vitality', async () => {
    for (const id of ['badminton', 'basketball', 'volleyball']) {
      const r = await logActivity({ ...base, presetId: id, qty: 60, ts: Date.now() });
      expect(share(r.statGains, 'AGI'), id).toBeCloseTo(0.5, 1);
      expect(share(r.statGains, 'STR'), id).toBeCloseTo(0.3, 1);
      expect(share(r.statGains, 'VIT'), id).toBeCloseTo(0.2, 1);
    }
  });

  it('trekking keeps its 50 / 30 / 20 and plyometrics stay Strength + Agility', async () => {
    const t = await logActivity({ ...base, presetId: 'trekking', qty: 2, ts: Date.now() - 1000 });
    expect(share(t.statGains, 'VIT')).toBeCloseTo(0.2, 1);
    const p = await logActivity({ ...base, presetId: 'plyo', qty: 15, ts: Date.now() });
    expect(p.statGains.VIT).toBeUndefined();
  });

  it('a custom task you add to Cardio & Sports gets the same split', async () => {
    await db.presets.put({ ...(await db.presets.get('walk'))!, id: 'custom-rowing', name: 'Rowing', builtin: false });
    const r = await logActivity({ ...base, presetId: 'custom-rowing', qty: 30, ts: Date.now() });
    expect(share(r.statGains, 'VIT')).toBeCloseTo(0.3, 1);
  });

  it('the total stat gain per task is unchanged: it is just shared between two stats', async () => {
    const r = await logActivity({ ...base, presetId: 'run', qty: 3, ts: Date.now() }); // 100 effort x 0.04 = 4
    expect((r.statGains.AGI ?? 0) + (r.statGains.VIT ?? 0)).toBeCloseTo(4, 0);
  });
});

describe('upgrade', () => {
  it('updates an older install, and leaves a split you edited yourself alone', async () => {
    await db.categories.update('cardio', { weights: { AGI: 1 } });
    for (const id of ['badminton', 'basketball']) await db.presets.update(id, { weights: { AGI: 0.6, STR: 0.4 } });
    await db.presets.update('volleyball', { weights: { AGI: 0.2, STR: 0.8 } }); // you changed this one
    await setSetting('seedVersion', 13);
    await dailyTick();
    expect((await db.categories.get('cardio'))!.weights).toEqual({ AGI: 0.7, VIT: 0.3 });
    expect((await db.presets.get('badminton'))!.weights).toEqual({ AGI: 0.5, STR: 0.3, VIT: 0.2 });
    expect((await db.presets.get('volleyball'))!.weights).toEqual({ AGI: 0.2, STR: 0.8 });
    // A cardio split you changed to something else is never touched
    await db.categories.update('cardio', { weights: { AGI: 0.4, STR: 0.6 } });
    await setSetting('seedVersion', 13);
    await dailyTick();
    expect((await db.categories.get('cardio'))!.weights).toEqual({ AGI: 0.4, STR: 0.6 });
  });
});
