import { db, getSetting, setSetting, type Exercise } from '../db/db';
import { e1rm, STARTER_EXERCISES, type MuscleId } from '../engine/lifts';

/** First launch / upgrade: gives you a starting list of common exercises. Never re-adds ones you deleted. */
export async function ensureExerciseSeed(): Promise<void> {
  if (await getSetting<boolean>('exercisesSeeded', false)) return;
  for (const e of STARTER_EXERCISES) if (!(await db.exercises.get(e.id))) await db.exercises.put({ ...e, createdAt: Date.now() });
  await setSetting('exercisesSeeded', true);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'exercise';

/** Saves a new exercise so you can pick it again next time. Typing the same name twice just returns the one you have. */
export async function addExercise(name: string, muscle: MuscleId): Promise<Exercise> {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 40);
  const same = (await db.exercises.where('muscle').equals(muscle).toArray()).find((e) => e.name.toLowerCase() === clean.toLowerCase());
  if (same) return same;
  const ex: Exercise = { id: `ex-${slug(clean)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: clean, muscle, createdAt: Date.now() };
  await db.exercises.put(ex);
  return ex;
}

/** Removes an exercise from your list. Logs you already made keep their records. */
export const deleteExercise = (id: string) => db.exercises.delete(id);

/** Logs that contain lifts (gym sessions). */
async function liftLogs() {
  return (await db.logs.where('presetId').equals('gym').toArray()).filter((l) => !!l.lifts?.length && !l.isPenalty);
}

/**
 * Your earlier estimated 1RMs per exercise, oldest first, from sessions BEFORE `beforeTs`.
 * (So backdating an old session can never steal a record.) `excludeLogId` is used when editing a session.
 */
export async function loadLiftHistory(exerciseIds: string[], beforeTs?: number, excludeLogId?: number): Promise<Record<string, number[]>> {
  const want = new Set(exerciseIds);
  const out: Record<string, number[]> = {};
  const logs = (await liftLogs()).filter((l) => l.id !== excludeLogId && (beforeTs === undefined || l.ts < beforeTs)).sort((a, b) => a.ts - b.ts);
  for (const log of logs) {
    const best = new Map<string, number>(); // best set per exercise within one session
    for (const l of log.lifts!) if (want.has(l.exerciseId)) best.set(l.exerciseId, Math.max(best.get(l.exerciseId) ?? 0, e1rm(l.weight, l.reps)));
    for (const [id, v] of best) (out[id] ??= []).push(v);
  }
  return out;
}

export interface ExerciseEntry {
  logId: number;
  ts: number;
  weight: number;
  reps: number;
  e1rm: number;
}

export interface ExerciseStats {
  exercise: Exercise;
  entries: ExerciseEntry[]; // newest first
  best: ExerciseEntry | null; // highest estimated 1RM
  heaviest: ExerciseEntry | null;
  /** Estimated 1RM now versus your first session (0.15 = +15%). Null with fewer than 2 sessions. */
  change: number | null;
}

/** Strength tracker data: every saved exercise with its history and records. */
export async function loadExerciseStats(): Promise<ExerciseStats[]> {
  const [exercises, logs] = await Promise.all([db.exercises.toArray(), liftLogs()]);
  const byEx = new Map<string, ExerciseEntry[]>();
  for (const log of logs) {
    const top = new Map<string, ExerciseEntry>();
    for (const l of log.lifts!) {
      const cur = top.get(l.exerciseId);
      const est = e1rm(l.weight, l.reps);
      if (!cur || est > cur.e1rm) top.set(l.exerciseId, { logId: log.id!, ts: log.ts, weight: l.weight, reps: l.reps, e1rm: est });
    }
    for (const [id, entry] of top) (byEx.get(id) ?? byEx.set(id, []).get(id)!).push(entry);
  }
  return exercises
    .map((exercise) => {
      const entries = (byEx.get(exercise.id) ?? []).sort((a, b) => b.ts - a.ts);
      const pick = (f: (a: ExerciseEntry, b: ExerciseEntry) => boolean) => entries.reduce<ExerciseEntry | null>((m, e) => (!m || f(e, m) ? e : m), null);
      const first = entries[entries.length - 1];
      return {
        exercise,
        entries,
        best: pick((a, b) => a.e1rm > b.e1rm),
        heaviest: pick((a, b) => a.weight > b.weight || (a.weight === b.weight && a.reps > b.reps)),
        change: entries.length >= 2 && first.e1rm > 0 ? entries[0].e1rm / first.e1rm - 1 : null,
      };
    })
    .sort((a, b) => a.exercise.muscle.localeCompare(b.exercise.muscle) || a.exercise.name.localeCompare(b.exercise.name));
}

/** What you did last time on one exercise, to give you a target. */
export async function loadLastLift(exerciseId: string): Promise<{ weight: number; reps: number; ts: number; bestE1rm: number } | null> {
  const logs = (await liftLogs()).sort((a, b) => b.ts - a.ts);
  let best = 0;
  let last: { weight: number; reps: number; ts: number } | null = null;
  for (const log of logs) {
    for (const l of log.lifts!) {
      if (l.exerciseId !== exerciseId) continue;
      best = Math.max(best, e1rm(l.weight, l.reps));
      if (!last) last = { weight: l.weight, reps: l.reps, ts: log.ts };
    }
  }
  return last ? { ...last, bestE1rm: best } : null;
}
