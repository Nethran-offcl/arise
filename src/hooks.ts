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
/** True when you have real data but no recent backup (nudges you on Home; no notifications). */
export const useBackupDue = (): boolean =>
  useLiveQuery(async () => {
    if ((await db.logs.count()) < 5) return false;
    const last = await getSetting<number | null>('lastBackup', null);
    return !last || Date.now() - last > 14 * 86_400_000;
  }, [], false);
export const useModeDay = () => useLiveQuery(() => getSetting<string | null>('modeDay', null), [], null);
export const useRecentLogs = (n = 40) => useLiveQuery(() => db.logs.orderBy('ts').reverse().limit(n).toArray(), [n], []);

export function useStreak(): number {
  return useLiveQuery(async () => {
    await getSetting<number>('dayStartHour', 4); // re-run when the day-start setting changes
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
