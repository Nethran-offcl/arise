import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting } from './db/db';
import { getFormula } from './game/actions';
import { DEFAULT_FORMULA, type Formula } from './engine/formula';
import { levelFromXp } from './engine/levels';
import { rankInfoForLevel } from './engine/ranks';
import { computeStreak } from './engine/streak';
import type { PlayMode } from './engine/types';

/** Live-updating reads: components re-render automatically when the database changes. */
export const useProfile = () => useLiveQuery(() => db.profile.get(1), []);
export const useCategories = () => useLiveQuery(() => db.categories.orderBy('order').toArray(), [], []);
export const usePresets = () => useLiveQuery(() => db.presets.toArray(), [], []);
export const useFormula = (): Formula => useLiveQuery(getFormula, [], DEFAULT_FORMULA);
export const useMode = (): PlayMode => useLiveQuery(() => getSetting<PlayMode>('mode', 'normal'), [], 'normal');
export const useRecentLogs = (n = 40) => useLiveQuery(() => db.logs.orderBy('ts').reverse().limit(n).toArray(), [n], []);

export function useStreak(): number {
  return useLiveQuery(async () => {
    const [logs, paused] = await Promise.all([db.logs.toArray(), getSetting<string[]>('pausedDays', [])]);
    return computeStreak(logs, new Set(paused), Date.now());
  }, [], 0);
}

/** Level, XP progress and rank for a profile. */
export function useProgress() {
  const profile = useProfile();
  if (!profile) return null;
  const lv = levelFromXp(profile.totalXp);
  return { profile, ...lv, rank: rankInfoForLevel(lv.level) };
}
