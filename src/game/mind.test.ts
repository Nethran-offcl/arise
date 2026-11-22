import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, setSetting } from '../db/db';
import { DEFAULT_PRESETS } from '../engine/defaults';
import { planDaily, type DailyCtx } from '../engine/quests';
import { getFormula, logActivity, resetAllData } from './actions';
import { loadProgressInputs } from './progress';
import { dailyTick } from './startup';

const base = { intensity: 'normal' as const };
const ts = (i: number) => Date.now() - 100_000 + i * 1000;

beforeEach(async () => {
  await resetAllData();
});

describe('Intelligence and Sense keep growing', () => {
  it('Study also feeds Sense (70% Intelligence, 30% Sense)', async () => {
    const r = await logActivity({ ...base, presetId: 'study', qty: 1, ts: Date.now() }); // 40 effort
    expect(r.statGains.INT).toBe(1.1); // 40 x 0.04 x 0.7 = 1.12
    expect(r.statGains.SEN).toBe(0.5); // 40 x 0.04 x 0.3 = 0.48
  });

  it('office work feeds Intelligence as well as Discipline', async () => {
    const r = await logActivity({ ...base, presetId: 'office', qty: 2, ts: Date.now() }); // 40 effort
    expect(r.statGains.INT).toBe(0.8); // 40 x 0.04 x 0.5
    expect(r.statGains.DIS).toBe(0.8);
    const learn = await logActivity({ ...base, presetId: 'work-learning', qty: 1, ts: Date.now() });
    expect(learn.statGains.INT).toBeGreaterThan(0);
  });

  it('Study and Core share one mastery pool', async () => {
    // 6 x "Learned something new" (Core) = 150 effort = mind mastery level 1 (+2%)
    for (let i = 0; i < 6; i++) await logActivity({ ...base, presetId: 'learn', qty: 1, ts: ts(i) });
    const study = await logActivity({ ...base, presetId: 'study', qty: 1, ts: Date.now() });
    expect(study.xp).toBe(Math.round(40 * 1.02)); // Core effort boosts Study
    const inputs = await loadProgressInputs('study', 'study');
    expect(inputs.categoryEffort).toBeGreaterThanOrEqual(150); // the shared pool, not just Study's own logs
  });

  it('other categories keep their own mastery', async () => {
    for (let i = 0; i < 6; i++) await logActivity({ ...base, presetId: 'learn', qty: 1, ts: ts(i) });
    expect((await loadProgressInputs('run', 'cardio')).categoryEffort).toBe(0);
  });

  it('has the new skills and learning tasks', async () => {
    for (const id of ['course', 'skill-practice', 'create', 'work-learning', 'learn', 'reading']) expect(await db.presets.get(id)).toBeTruthy();
    const r = await logActivity({ ...base, presetId: 'skill-practice', qty: 30, ts: Date.now() });
    expect(r.statGains.INT).toBeGreaterThan(0);
    expect(r.statGains.SEN).toBeGreaterThan(0);
  });
});

describe('Core raises Intelligence and Sense evenly', () => {
  it('every Core task gives equal Intelligence and Sense', async () => {
    for (const [id, qty] of [['meditation', 30], ['journal', 1], ['reading', 30], ['learn', 1], ['course', 30], ['skill-practice', 30], ['create', 45], ['planning', 1], ['review', 1]] as const) {
      const r = await logActivity({ ...base, presetId: id, qty, ts: Date.now() });
      expect(r.statGains.INT, id).toBeGreaterThan(0);
      expect(r.statGains.SEN, id).toBe(r.statGains.INT);
    }
  });
  it('a custom task you add to Core does too', async () => {
    await db.presets.put({ ...(await db.presets.get('journal'))!, id: 'custom-podcast', name: 'Educational podcast', builtin: false });
    const r = await logActivity({ ...base, presetId: 'custom-podcast', qty: 1, ts: Date.now() });
    expect(r.statGains.SEN).toBe(r.statGains.INT);
    expect(r.statGains.SEN).toBeGreaterThan(0);
  });
  it('stat gains are twice as big as before (rate 0.04)', async () => {
    const r = await logActivity({ ...base, presetId: 'meditation', qty: 30, ts: Date.now() }); // 36 effort -> 1.44 split in two
    expect((r.statGains.INT ?? 0) + (r.statGains.SEN ?? 0)).toBeCloseTo(1.44, 0);
  });
  it('upgrades an older install, and leaves a split you edited alone', async () => {
    await db.categories.update('core', { weights: { SEN: 0.6, INT: 0.4 } });
    await db.presets.update('reading', { weights: { INT: 0.7, SEN: 0.3 } });
    await db.presets.update('course', { weights: { INT: 0.7, SEN: 0.3 } });
    await setSetting('seedVersion', 10);
    await dailyTick();
    expect((await db.categories.get('core'))!.weights).toEqual({ SEN: 0.5, INT: 0.5 });
    expect((await db.presets.get('reading'))!.weights).toBeUndefined();
    expect((await db.presets.get('course'))!.weights).toBeUndefined();
    await db.categories.update('core', { weights: { SEN: 1 } }); // you chose Sense only
    await setSetting('seedVersion', 10);
    await dailyTick();
    expect((await db.categories.get('core'))!.weights).toEqual({ SEN: 1 });
  });
  it('an old saved stat rate of 0.02 follows the new default, but other edits are kept', async () => {
    await setSetting('formula', { statRate: 0.02, xpMult: 1.5 });
    const f = await getFormula();
    expect(f.statRate).toBe(0.04);
    expect(f.xpMult).toBe(1.5);
    await setSetting('formula', { statRate: 0.03 });
    expect((await getFormula()).statRate).toBe(0.03); // a rate you chose yourself stays
  });
});

describe('daily mind quest', () => {
  const ctx: DailyCtx = { flags: { work: false, college: false }, weekday: 3, questMult: 1, seed: 1, runsLast7: 0, ranYesterday: false, gymLast7: 0, effortByCategory: {}, exclude: [] };
  const MIND = ['reading', 'skill-practice', 'course', 'learn', 'create'];

  it('every day includes a reading or learning quest, even on a day with no college', () => {
    for (let seed = 1; seed < 60; seed++) {
      const q = planDaily({ ...ctx, seed }, DEFAULT_PRESETS).map((x) => x.presetIds![0]);
      expect(q.filter((id) => MIND.includes(id)).length).toBeGreaterThanOrEqual(1);
    }
  });
  it('rotates between different kinds of learning', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed < 80; seed++) for (const x of planDaily({ ...ctx, seed }, DEFAULT_PRESETS)) if (MIND.includes(x.presetIds![0])) kinds.add(x.presetIds![0]);
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });
  it('on a recovery day it is gentle reading only', () => {
    const adapt = { gentle: true, noHard: true, runTarget: null, physicalScale: 0.6, study: null, examWeeklyStudy: null };
    for (let seed = 1; seed < 30; seed++) {
      const ids = planDaily({ ...ctx, seed, adapt }, DEFAULT_PRESETS).map((x) => x.presetIds![0]);
      expect(ids.filter((id) => MIND.includes(id))).toEqual(['reading']);
    }
  });
  it('keeps the set at 3 to 5 quests with no duplicates, even on a work + college day', () => {
    for (let seed = 1; seed < 60; seed++) {
      const q = planDaily({ ...ctx, flags: { work: true, college: true }, seed }, DEFAULT_PRESETS);
      expect(q.length).toBeLessThanOrEqual(5);
      expect(q.length).toBeGreaterThanOrEqual(3);
      expect(new Set(q.map((x) => x.presetIds![0])).size).toBe(q.length);
    }
  });
  it('works if you deleted the learning tasks', () => {
    const only = DEFAULT_PRESETS.filter((p) => !MIND.includes(p.id));
    expect(() => planDaily(ctx, only)).not.toThrow();
  });
  it('shows up in the real quest list', async () => {
    await dailyTick();
    const ids = (await db.quests.where('kind').equals('daily').toArray()).map((q) => q.presetIds![0]);
    expect(ids.some((id) => MIND.includes(id))).toBe(true);
  });
});

describe('upgrade from an older install', () => {
  it('moves Study and Core into one pool and updates stat splits you never edited', async () => {
    await db.categories.update('study', { weights: { INT: 1 }, masteryGroup: undefined });
    await db.categories.update('core', { masteryGroup: undefined, mastery: false });
    await db.categories.update('work', { weights: { DIS: 0.8, INT: 0.2 } });
    for (const id of ['course', 'skill-practice', 'create', 'work-learning']) await db.presets.delete(id);
    await setSetting('seedVersion', 9);
    await dailyTick();
    expect((await db.categories.get('study'))!.weights).toEqual({ INT: 0.7, SEN: 0.3 });
    expect((await db.categories.get('study'))!.masteryGroup).toBe('mind');
    expect((await db.categories.get('core'))!.masteryGroup).toBe('mind');
    expect((await db.categories.get('core'))!.mastery).toBe(true);
    expect((await db.categories.get('work'))!.weights).toEqual({ INT: 0.5, DIS: 0.5 });
    expect(await db.presets.get('course')).toBeTruthy();
  });
  it('leaves stat splits you changed yourself alone', async () => {
    await db.categories.update('study', { weights: { INT: 0.5, DIS: 0.5 } });
    await db.categories.update('work', { weights: { DIS: 1 } });
    await setSetting('seedVersion', 9);
    await dailyTick();
    expect((await db.categories.get('study'))!.weights).toEqual({ INT: 0.5, DIS: 0.5 });
    expect((await db.categories.get('work'))!.weights).toEqual({ DIS: 1 });
  });
});
