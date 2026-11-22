import { performanceBonus } from './progress';

/**
 * LIFTING: every exercise has its own history, because a bench press and a leg press are different worlds.
 * Progress is measured with an estimated one-rep max (1RM), so doing MORE REPS at the same weight counts as getting
 * stronger, just like lifting heavier does.
 */
export type MuscleId = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'glutes' | 'core' | 'full';

export const MUSCLES: { id: MuscleId; label: string; icon: string }[] = [
  { id: 'chest', label: 'Chest', icon: '🫁' },
  { id: 'back', label: 'Back', icon: '🔙' },
  { id: 'shoulders', label: 'Shoulders', icon: '🤷' },
  { id: 'biceps', label: 'Biceps', icon: '💪' },
  { id: 'triceps', label: 'Triceps', icon: '🦾' },
  { id: 'legs', label: 'Legs', icon: '🦵' },
  { id: 'glutes', label: 'Glutes', icon: '🍑' },
  { id: 'core', label: 'Core', icon: '🎯' },
  { id: 'full', label: 'Full body', icon: '🏋️' },
];

export const muscleLabel = (id: string): string => MUSCLES.find((m) => m.id === id)?.label ?? id;

export interface ExerciseDef {
  id: string;
  name: string;
  muscle: MuscleId;
}

/** A starting list so you do not have to type the common ones. You can add your own and delete any. */
export const STARTER_EXERCISES: ExerciseDef[] = [
  { id: 'ex-bench-press', name: 'Bench press', muscle: 'chest' },
  { id: 'ex-incline-press', name: 'Incline press', muscle: 'chest' },
  { id: 'ex-chest-fly', name: 'Chest fly', muscle: 'chest' },
  { id: 'ex-lat-pulldown', name: 'Lat pulldown', muscle: 'back' },
  { id: 'ex-barbell-row', name: 'Barbell row', muscle: 'back' },
  { id: 'ex-deadlift', name: 'Deadlift', muscle: 'back' },
  { id: 'ex-overhead-press', name: 'Overhead press', muscle: 'shoulders' },
  { id: 'ex-lateral-raise', name: 'Lateral raise', muscle: 'shoulders' },
  { id: 'ex-bicep-curl', name: 'Bicep curl', muscle: 'biceps' },
  { id: 'ex-tricep-pushdown', name: 'Tricep pushdown', muscle: 'triceps' },
  { id: 'ex-squat', name: 'Squat', muscle: 'legs' },
  { id: 'ex-leg-press', name: 'Leg press', muscle: 'legs' },
  { id: 'ex-lunges', name: 'Lunges', muscle: 'legs' },
  { id: 'ex-hip-thrust', name: 'Hip thrust', muscle: 'glutes' },
  { id: 'ex-cable-crunch', name: 'Cable crunch', muscle: 'core' },
];

/** One exercise done in a session: the heaviest set, and the reps you got on it. */
export interface Lift {
  exerciseId: string;
  name: string;
  muscle: MuscleId;
  /** Weight in kg. */
  weight: number;
  /** Reps on that set. 1 if you only care about your heaviest single. */
  reps: number;
}

export const MAX_LIFT_KG = 500;
export const MAX_LIFT_REPS = 100;

/** Estimated one-rep max (Epley). One rep is just the weight itself. */
export const e1rm = (weight: number, reps: number): number => (reps <= 1 ? weight : weight * (1 + reps / 30));

/** Keeps typed values believable and drops empty entries. */
export function sanitizeLifts(lifts: Lift[]): Lift[] {
  const clean: Lift[] = [];
  for (const l of lifts) {
    const weight = Math.min(MAX_LIFT_KG, Math.max(0, Number.isFinite(l.weight) ? l.weight : 0));
    if (!(weight > 0) || !l.exerciseId) continue;
    const reps = Math.min(MAX_LIFT_REPS, Math.max(1, Math.round(Number.isFinite(l.reps) ? l.reps : 1)));
    clean.push({ ...l, weight: Math.round(weight * 100) / 100, reps });
  }
  return clean;
}

export interface LiftResult {
  lift: Lift;
  e1rm: number;
  /** XP bonus for this exercise (0.2 = +20%), including a record bonus. */
  bonus: number;
  pr: boolean;
  /** Looks like a typo (more than double your usual): no bonus. */
  suspicious: boolean;
}

/**
 * Progress bonus for a session: each exercise is compared with ITS OWN earlier results.
 * `history[exerciseId]` = your earlier estimated 1RMs for that exercise, oldest first.
 * The session earns the best single exercise bonus. A lighter or easier day never costs XP.
 */
export function liftsBonus(lifts: Lift[], history: Record<string, number[]>): { bonus: number; pr: boolean; suspicious: boolean; rows: LiftResult[] } {
  const rows: LiftResult[] = sanitizeLifts(lifts).map((lift) => {
    const est = e1rm(lift.weight, lift.reps);
    const r = performanceBonus('higher', est, history[lift.exerciseId] ?? []);
    return { lift, e1rm: est, bonus: r.bonus, pr: r.pr, suspicious: !!r.suspicious };
  });
  return { bonus: rows.reduce((m, r) => Math.max(m, r.bonus), 0), pr: rows.some((r) => r.pr), suspicious: rows.some((r) => r.suspicious), rows };
}
