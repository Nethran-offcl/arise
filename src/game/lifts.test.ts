import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, setSetting } from '../db/db';
import { STARTER_EXERCISES, type Lift } from '../engine/lifts';
import { logActivity, resetAllData, updateLog } from './actions';
import { buildBackup, restoreBackup } from './backup';
import { addExercise, deleteExercise, ensureExerciseSeed, loadExerciseStats, loadLastLift, loadLiftHistory } from './lifts';
import { dailyTick } from './startup';

const DAY = 86_400_000;
const bench = (weight: number, reps = 5): Lift => ({ exerciseId: 'ex-bench-press', name: 'Bench press', muscle: 'chest', weight, reps });
const squat = (weight: number, reps = 5): Lift => ({ exerciseId: 'ex-squat', name: 'Squat', muscle: 'legs', weight, reps });
const gym = (daysAgo: number, lifts: Lift[]) => logActivity({ presetId: 'gym', qty: 45, intensity: 'normal', ts: Date.now() - daysAgo * DAY - 60_000, lifts });

beforeEach(async () => {
  await resetAllData();
});

describe('saved exercises', () => {
  it('starts with a list of common exercises, once', async () => {
    expect(await db.exercises.count()).toBe(STARTER_EXERCISES.length);
    await db.exercises.delete('ex-squat');
    await ensureExerciseSeed();
    expect(await db.exercises.get('ex-squat')).toBeUndefined(); // one you deleted does not come back
  });

  it('an exercise you type once is saved and can be picked again; the same name is not duplicated', async () => {
    const a = await addExercise('  Cable   fly ', 'chest');
    const b = await addExercise('cable fly', 'chest');
    expect(b.id).toBe(a.id);
    expect(a.name).toBe('Cable fly');
    const other = await addExercise('Cable fly', 'back'); // same name, different muscle = different exercise
    expect(other.id).not.toBe(a.id);
    expect((await db.exercises.where('muscle').equals('chest').toArray()).map((e) => e.name)).toContain('Cable fly');
  });

  it('deleting an exercise keeps your old logs and records', async () => {
    await gym(3, [bench(60)]);
    await deleteExercise('ex-bench-press');
    expect(await db.exercises.get('ex-bench-press')).toBeUndefined();
    expect((await db.logs.toArray())[0].lifts![0].weight).toBe(60);
  });
});

describe('gym sessions with exercises', () => {
  it('store each exercise with its weight and reps, and clean up silly input', async () => {
    const r = await logActivity({ presetId: 'gym', qty: 45, intensity: 'normal', ts: Date.now(), lifts: [bench(80, 6), squat(0), { ...squat(9999, 500), exerciseId: 'ex-leg-press', name: 'Leg press' }] });
    const log = (await db.logs.get(r.logId))!;
    expect(log.lifts).toHaveLength(2); // the 0 kg entry is dropped
    expect(log.lifts![0]).toMatchObject({ name: 'Bench press', weight: 80, reps: 6 });
    expect(log.lifts![1]).toMatchObject({ weight: 500, reps: 100 }); // clamped
  });

  it('the first time an exercise is logged there is nothing to beat, so no bonus', async () => {
    const r = await gym(0, [bench(60)]);
    expect(r.pr).toBe(false);
    expect(r.perfBonus).toBe(0);
  });

  it('beating your earlier bench press earns a bonus and a record', async () => {
    for (const d of [10, 8, 6]) await gym(d, [bench(60, 5)]);
    const r = await gym(0, [bench(65, 5)]);
    expect(r.pr).toBe(true);
    expect(r.perfBonus).toBeGreaterThan(0.15);
  });

  it('doing more reps at the same weight counts as getting stronger', async () => {
    for (const d of [10, 8, 6]) await gym(d, [bench(60, 5)]);
    const same = await gym(2, [bench(60, 5)]);
    expect(same.pr).toBe(false);
    const moreReps = await gym(0, [bench(60, 9)]);
    expect(moreReps.pr).toBe(true);
    expect(moreReps.perfBonus).toBeGreaterThan(0);
  });

  it('each exercise has its own history: a heavy squat does not make bench press look weak or strong', async () => {
    for (const d of [10, 8, 6]) await gym(d, [bench(60, 5), squat(100, 5)]);
    const r = await gym(0, [bench(60, 5), squat(110, 5)]); // squat improves, bench does not
    expect(r.pr).toBe(true);
    const log = (await db.logs.get(r.logId))!;
    expect(log.pr).toBe(true);
    // a totally new exercise at a big weight is just a first entry, not compared with anything
    expect((await gym(0, [{ ...bench(150), exerciseId: 'ex-new', name: 'New lift' }])).pr).toBe(false);
  });

  it('a typo (double your usual) earns nothing', async () => {
    for (const d of [10, 8, 6]) await gym(d, [bench(60, 5)]);
    const r = await gym(0, [bench(200, 1)]);
    expect(r.pr).toBe(false);
    expect(r.perfBonus).toBe(0);
  });

  it('a session without exercises still works exactly like before', async () => {
    const r = await logActivity({ presetId: 'gym', qty: 45, intensity: 'normal', ts: Date.now() });
    expect(r.xp).toBe(51); // 10 + 0.9 x 45 = 50.5, rounded
    expect(r.perfBonus).toBe(0);
  });

  it('editing a session recalculates and never compares it with itself', async () => {
    for (const d of [10, 8, 6]) await gym(d, [bench(60, 5)]);
    const r = await gym(0, [bench(65, 5)]);
    expect(r.pr).toBe(true);
    await updateLog(r.logId, { presetId: 'gym', qty: 45, intensity: 'normal', ts: Date.now() - 60_000, lifts: [bench(50, 5)] });
    const log = (await db.logs.get(r.logId))!;
    expect(log.pr).toBe(false);
    expect(log.perfBonus).toBe(0);
    expect(log.lifts![0].weight).toBe(50);
  });

  it('backdating an old session cannot steal a record', async () => {
    for (const d of [10, 8, 6]) await gym(d, [bench(60, 5)]);
    const old = await gym(30, [bench(70, 5)]); // earlier than everything else
    expect(old.pr).toBe(false);
  });
});

describe('strength tracker data', () => {
  it('finds your best, heaviest and last for each exercise', async () => {
    await gym(9, [bench(60, 5)]);
    await gym(6, [bench(70, 3)]); // heavier, fewer reps
    await gym(1, [bench(65, 8)]); // best estimated 1RM
    const s = (await loadExerciseStats()).find((x) => x.exercise.id === 'ex-bench-press')!;
    expect(s.entries).toHaveLength(3);
    expect(s.heaviest!.weight).toBe(70);
    expect(s.best!.weight).toBe(65);
    expect(s.entries[0].weight).toBe(65); // newest first
    expect(s.change).toBeGreaterThan(0);
    const last = (await loadLastLift('ex-bench-press'))!;
    expect(last).toMatchObject({ weight: 65, reps: 8 });
    expect(await loadLastLift('ex-never-done')).toBeNull();
  });

  it('history is oldest first and ignores sessions after the cut-off', async () => {
    await gym(9, [bench(60, 5)]);
    await gym(3, [bench(70, 5)]);
    const all = await loadLiftHistory(['ex-bench-press']);
    expect(all['ex-bench-press']).toHaveLength(2);
    expect(all['ex-bench-press'][0]).toBeLessThan(all['ex-bench-press'][1]);
    const before = await loadLiftHistory(['ex-bench-press'], Date.now() - 5 * DAY);
    expect(before['ex-bench-press']).toHaveLength(1);
  });
});

describe('upgrade and backup', () => {
  it('turns on exercise tracking for an existing Gym session task and seeds the list', async () => {
    await db.presets.update('gym', { trackLifts: undefined, perf: { kind: 'higher', label: 'Heaviest weight lifted (kg)', unit: 'kg' } });
    await db.exercises.clear();
    await setSetting('exercisesSeeded', false);
    await setSetting('seedVersion', 14);
    await dailyTick();
    const gymPreset = (await db.presets.get('gym'))!;
    expect(gymPreset.trackLifts).toBe(true);
    expect(gymPreset.perf).toBeUndefined();
    expect(await db.exercises.count()).toBe(STARTER_EXERCISES.length);
  });

  it('exercises and lifts survive a backup and restore', async () => {
    await dailyTick();
    await addExercise('Cable fly', 'chest');
    await gym(1, [bench(70, 5)]);
    const text = JSON.stringify(await buildBackup());
    await resetAllData();
    await restoreBackup(text);
    expect((await db.exercises.toArray()).some((e) => e.name === 'Cable fly')).toBe(true);
    expect((await db.logs.toArray())[0].lifts![0].weight).toBe(70);
  });
});
