import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, setSetting } from '../db/db';
import { dayStats } from '../engine/system';
import { logActivity, resetAllData } from './actions';
import { dailyTick } from './startup';
import { loadSnapshot } from './system';

const base = { intensity: 'normal' as const };

beforeEach(async () => {
  await resetAllData();
});

describe('Trekking / hiking', () => {
  it('lives in Cardio & Sports and is measured in hours', async () => {
    const p = (await db.presets.get('trekking'))!;
    expect(p.categoryId).toBe('cardio');
    expect(p.unit).toBe('hours');
    expect(p.name).toBe('Trekking / hiking');
    expect(p.defaultQty).toBe(2);
  });

  it('builds Strength and Vitality as well as Agility (50 / 30 / 20)', async () => {
    const r = await logActivity({ ...base, presetId: 'trekking', qty: 2, ts: Date.now() });
    expect(r.statGains.AGI).toBeGreaterThan(0);
    expect(r.statGains.STR).toBeGreaterThan(0);
    expect(r.statGains.VIT).toBeGreaterThan(0);
    const total = (r.statGains.AGI ?? 0) + (r.statGains.STR ?? 0) + (r.statGains.VIT ?? 0);
    expect((r.statGains.AGI ?? 0) / total).toBeCloseTo(0.5, 1);
    expect((r.statGains.STR ?? 0) / total).toBeCloseTo(0.3, 1);
    expect((r.statGains.VIT ?? 0) / total).toBeCloseTo(0.2, 1);
  });

  it('is a taxing effort: a 2 hour trek costs about 12 HP and pays more than a long walk', async () => {
    const walk = await logActivity({ ...base, presetId: 'walk', qty: 8, ts: Date.now() - 1000 });
    const trek = await logActivity({ ...base, presetId: 'trekking', qty: 2, ts: Date.now() });
    expect(trek.hp).toBe(-12);
    expect(trek.xp).toBe(140); // 10 + 65 x 2
    expect(trek.xp).toBeGreaterThan(walk.xp);
  });

  it('counts as a hard day for the System, so it will suggest rest after two in a row', async () => {
    await logActivity({ ...base, presetId: 'trekking', qty: 2, ts: Date.now() });
    const snap = await loadSnapshot();
    expect(dayStats(snap, 1)[0].hard).toBe(true);
  });

  it('a harder trek costs more energy, and a short one less', async () => {
    const easy = await logActivity({ ...base, presetId: 'trekking', qty: 1, ts: Date.now() - 2000 });
    const hard = await logActivity({ ...base, presetId: 'trekking', qty: 4, intensity: 'hard', ts: Date.now() });
    expect(easy.hp).toBe(-6);
    expect(hard.hp).toBe(-36); // 4 h x 6 x 1.5 (hard)
  });

  it('is added for upgrading installs and never replaces one you made yourself', async () => {
    await db.presets.delete('trekking');
    await setSetting('seedVersion', 12);
    await dailyTick();
    expect(await db.presets.get('trekking')).toBeTruthy();
    await db.presets.update('trekking', { name: 'My own trek' });
    await setSetting('seedVersion', 12);
    await dailyTick();
    expect((await db.presets.get('trekking'))!.name).toBe('My own trek');
  });
});
