import { describe, expect, it } from 'vitest';
import { e1rm, liftsBonus, MUSCLES, sanitizeLifts, STARTER_EXERCISES, type Lift } from './lifts';

const lift = (over: Partial<Lift> = {}): Lift => ({ exerciseId: 'ex-bench-press', name: 'Bench press', muscle: 'chest', weight: 60, reps: 5, ...over });

describe('estimated one-rep max', () => {
  it('a single is just the weight; more reps raise the estimate', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 5)).toBeCloseTo(116.67, 1);
    expect(e1rm(60, 10)).toBe(80);
    expect(e1rm(60, 8)).toBeGreaterThan(e1rm(60, 5));
  });
});

describe('per-exercise progress', () => {
  const hist = { 'ex-bench-press': [70, 70, 70], 'ex-squat': [100, 100, 100] };

  it('lifting heavier than your starting level earns a bonus and a record', () => {
    const r = liftsBonus([lift({ weight: 65, reps: 5 })], hist); // e1rm 75.8 vs 70
    expect(r.pr).toBe(true);
    expect(r.bonus).toBeGreaterThan(0.15);
  });

  it('more reps at the same weight counts as progress', () => {
    const same = liftsBonus([lift({ weight: 60, reps: 5 })], hist).bonus; // 70 e1rm: no better
    const moreReps = liftsBonus([lift({ weight: 60, reps: 8 })], hist); // 76 e1rm
    expect(same).toBe(0);
    expect(moreReps.bonus).toBeGreaterThan(0);
    expect(moreReps.pr).toBe(true);
  });

  it('each exercise has its own history: a squat is not compared with a bench press', () => {
    const r = liftsBonus([lift({ exerciseId: 'ex-squat', name: 'Squat', muscle: 'legs', weight: 90, reps: 5 })], hist); // 105 vs 100 squat
    expect(r.rows[0].pr).toBe(true);
    // the same numbers on a brand-new exercise have nothing to compare with
    expect(liftsBonus([lift({ exerciseId: 'ex-new', weight: 90, reps: 5 })], hist).bonus).toBe(0);
  });

  it('a lighter day never costs anything', () => {
    expect(liftsBonus([lift({ weight: 40, reps: 5 })], hist)).toMatchObject({ bonus: 0, pr: false });
  });

  it('a session takes the best exercise bonus', () => {
    const r = liftsBonus([lift({ weight: 40 }), lift({ exerciseId: 'ex-squat', name: 'Squat', muscle: 'legs', weight: 95, reps: 5 })], hist);
    expect(r.bonus).toBe(r.rows[1].bonus);
    expect(r.bonus).toBeGreaterThan(r.rows[0].bonus);
  });

  it('flags an impossible jump as a typo (no bonus)', () => {
    const r = liftsBonus([lift({ weight: 200, reps: 1 })], hist); // 200 vs 70
    expect(r.suspicious).toBe(true);
    expect(r.bonus).toBe(0);
    expect(r.pr).toBe(false);
  });

  it('needs history before it can reward anything (first time = just recorded)', () => {
    expect(liftsBonus([lift()], {}).bonus).toBe(0);
    expect(liftsBonus([], hist)).toMatchObject({ bonus: 0, pr: false, rows: [] });
  });
});

describe('typed values', () => {
  it('are cleaned up: empty and absurd entries are dropped or clamped', () => {
    const clean = sanitizeLifts([lift({ weight: 0 }), lift({ weight: -5 }), lift({ weight: 9999, reps: 500 }), lift({ weight: 62.555, reps: 0 }), lift({ exerciseId: '' })]);
    expect(clean).toHaveLength(2);
    expect(clean[0]).toMatchObject({ weight: 500, reps: 100 });
    expect(clean[1]).toMatchObject({ weight: 62.56, reps: 1 });
  });
});

describe('exercise list', () => {
  it('has unique starter exercises, each in a real muscle group', () => {
    expect(new Set(STARTER_EXERCISES.map((e) => e.id)).size).toBe(STARTER_EXERCISES.length);
    const muscles = new Set(MUSCLES.map((m) => m.id));
    for (const e of STARTER_EXERCISES) expect(muscles.has(e.muscle), e.name).toBe(true);
    expect(new Set(MUSCLES.map((m) => m.id)).size).toBe(MUSCLES.length);
  });
});
