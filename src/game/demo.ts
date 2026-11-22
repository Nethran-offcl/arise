import { db } from '../db/db';
import { deleteLog, logActivity } from './actions';

const DAY = 86_400_000;

/** [daysAgo, presetId, qty] */
const DEMO: [number, string, number][] = [
  [9, 'run', 3], [9, 'study', 1.5], [8, 'walk', 30], [8, 'office', 3], [7, 'gym', 50], [7, 'sleep-hours', 7.5],
  [6, 'badminton', 60], [6, 'assignment', 1], [5, 'run', 3.2], [5, 'chores', 2], [4, 'study', 2], [4, 'journal', 1],
  [3, 'walk', 40], [3, 'pending', 3], [2, 'run', 3.5], [2, 'p-doomscroll', 1], [2, 'water', 4], [1, 'gym', 45],
  [1, 'healthy-meal', 2], [1, 'sleep-ontime', 1], [0, 'study', 1], [0, 'office', 2],
];

/** Adds ~10 days of sample activity, tagged so it can be wiped without touching real logs. */
export async function seedDemo(now = Date.now()): Promise<number> {
  for (const [ago, presetId, qty] of DEMO) {
    await logActivity({ presetId, qty, intensity: 'normal', ts: now - ago * DAY - ago * 3_600_000, demo: true });
  }
  return DEMO.length;
}

/** Removes only demo logs and reverses their XP/gold/stat effects. */
export async function wipeDemo(): Promise<number> {
  const ids = (await db.logs.toArray()).filter((l) => l.demo).map((l) => l.id!);
  for (const id of ids) await deleteLog(id);
  return ids.length;
}
