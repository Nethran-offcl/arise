import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, setSetting } from '../db/db';
import { DEFAULT_PRESETS } from '../engine/defaults';
import { planDaily, type DailyCtx } from '../engine/quests';
import { logActivity, resetAllData, setHp } from './actions';
import { dailyTick } from './startup';

const base = { intensity: 'normal' as const };
const NEW = ['pushups', 'pullups', 'plank', 'plyo', 'incline-walk', 'cycling', 'jump-rope', 'swimming', 'stretch', 'yoga'];

beforeEach(async () => {
  await resetAllData();
});

describe('more exercises', () => {
  it('are available, in the right categories', async () => {
    const cat = (id: string) => db.presets.get(id).then((p) => p!.categoryId);
    for (const id of NEW) expect(await db.presets.get(id), id).toBeTruthy();
    for (const id of ['pushups', 'pullups', 'plank', 'plyo']) expect(await cat(id)).toBe('strength');
    for (const id of ['incline-walk', 'cycling', 'jump-rope', 'swimming']) expect(await cat(id)).toBe('cardio');
    for (const id of ['stretch', 'yoga']) expect(await cat(id)).toBe('recovery');
  });

  it('push-ups and pull-ups are counted in reps, and pull-ups pay more per rep', async () => {
    const push = await logActivity({ ...base, presetId: 'pushups', qty: 20, ts: Date.now() - 2000 });
    const pull = await logActivity({ ...base, presetId: 'pullups', qty: 20, ts: Date.now() - 1000 });
    expect(push.xp).toBe(12); // 0.6 per rep
    expect(pull.xp).toBe(30); // 1.5 per rep
    expect(push.statGains.STR).toBeGreaterThan(0);
  });

  it('getting stronger pays more: your best set earns a progress bonus and a record', async () => {
    for (let i = 0; i < 3; i++) await logActivity({ ...base, presetId: 'pushups', qty: 20, perf: 20, ts: Date.now() - 100_000 + i * 1000 });
    const better = await logActivity({ ...base, presetId: 'pushups', qty: 22, perf: 25, ts: Date.now() });
    expect(better.pr).toBe(true);
    expect(better.perfBonus).toBeGreaterThan(0.15);
  });

  it('plyometrics build strength and agility together', async () => {
    const r = await logActivity({ ...base, presetId: 'plyo', qty: 15, ts: Date.now() });
    expect(r.statGains.STR).toBe(r.statGains.AGI);
    expect(r.statGains.STR).toBeGreaterThan(0);
  });

  it('incline walking pays more than flat walking and works the legs and lungs (Agility)', async () => {
    const flat = await logActivity({ ...base, presetId: 'walk', qty: 2.5, ts: Date.now() - 1000 }); // 30 minutes of walking is about 2.5 km
    const incline = await logActivity({ ...base, presetId: 'incline-walk', qty: 30, ts: Date.now() });
    expect(incline.xp).toBeGreaterThan(flat.xp);
    expect(incline.statGains.AGI).toBeGreaterThan(0);
  });

  it('stretching and yoga restore energy instead of costing it', async () => {
    await setHp(50);
    await logActivity({ ...base, presetId: 'stretch', qty: 15, ts: Date.now() });
    expect((await db.profile.get(1))!.hp).toBeGreaterThan(50);
    await setHp(50);
    const yoga = await logActivity({ ...base, presetId: 'yoga', qty: 30, ts: Date.now() });
    expect(yoga.hp).toBeGreaterThan(0);
    expect(yoga.statGains.VIT).toBeGreaterThan(0);
    expect(yoga.statGains.SEN).toBeGreaterThan(0);
  });

  it('stretching is a restful daily-quest option, even on a recovery day', () => {
    const ctx: DailyCtx = { flags: { work: false, college: false }, weekday: 3, questMult: 1, seed: 1, runsLast7: 0, ranYesterday: false, gymLast7: 0, effortByCategory: {}, exclude: [] };
    const seen = new Set<string>();
    const gentle = { gentle: true, noHard: true, runTarget: null, physicalScale: 0.6, study: null, examWeeklyStudy: null };
    for (let seed = 1; seed < 120; seed++) for (const q of planDaily({ ...ctx, seed, adapt: gentle }, DEFAULT_PRESETS)) seen.add(q.presetIds![0]);
    expect(seen.has('stretch')).toBe(true);
    for (const heavy of ['run', 'gym', 'plyo', 'pullups', 'jump-rope']) expect(seen.has(heavy)).toBe(false);
  });

  it('are added for upgrading installs without touching anything you changed', async () => {
    for (const id of NEW) await db.presets.delete(id);
    await db.presets.put({ ...(await db.presets.get('walk'))!, id: 'pushups', name: 'My own push-ups', builtin: false });
    await setSetting('seedVersion', 11);
    await dailyTick();
    for (const id of NEW) expect(await db.presets.get(id), id).toBeTruthy();
    expect((await db.presets.get('pushups'))!.name).toBe('My own push-ups'); // yours is kept
  });
});
