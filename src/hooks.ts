import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting } from './db/db';
import { getFormula } from './game/actions';
import { DEFAULT_FORMULA, type Formula } from './engine/formula';
import { levelFromXp } from './engine/levels';
import { rankInfoForLevel } from './engine/ranks';
import { computeStreak } from './engine/streak';
import { effectiveTarget, questProgress, type Quest } from './engine/quests';
import type { PlayMode } from './engine/types';
import { pausedCountInRange, toQuestLog } from './game/quests';
import { getTodayFlags, type DayFlags } from './game/schedule';
import { loadSnapshot } from './game/system';

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

export interface QuestRow {
  q: Quest;
  progress: number;
  /** Target after rest/sick adjustments (only the boss changes). */
  target: number;
}

/** Every quest with its live progress, worked out from your logs. */
export const useQuestBoard = (): QuestRow[] =>
  useLiveQuery(async () => {
    const [quests, logs, paused] = await Promise.all([db.quests.toArray(), db.logs.toArray(), getSetting<string[]>('pausedDays', [])]);
    const pausedSet = new Set(paused);
    const streak = computeStreak(logs, pausedSet, Date.now());
    const qlogs = logs.map(toQuestLog);
    return quests.map((q) => ({
      q,
      progress: questProgress(q, qlogs, streak),
      target: effectiveTarget(q, q.periodStart !== null && q.periodEnd !== null ? pausedCountInRange(pausedSet, q.periodStart, q.periodEnd) : 0),
    }));
  }, [], []);

export const useTodayFlags = (): DayFlags => useLiveQuery(() => getTodayFlags(), [], { work: false, college: false });
export const useTemplates = () => useLiveQuery(() => db.questTemplates.toArray(), [], []);
export const useShop = () => useLiveQuery(() => db.shop.orderBy('order').toArray(), [], []);
export const usePurchases = (n = 15) => useLiveQuery(() => db.purchases.orderBy('ts').reverse().limit(n).toArray(), [n], []);
export const useInventory = () => useLiveQuery(async () => Object.fromEntries((await db.inventory.toArray()).map((r) => [r.id, r.count])) as Record<string, number>, [], {} as Record<string, number>);
export const useDoubleXp = () => useLiveQuery(() => getSetting<{ from: number; until: number } | null>('doubleXp', null), [], null);

/** The System engine's view of you (a compact snapshot of recent logs and settings). Live. */
export const useSnapshot = () => useLiveQuery(() => loadSnapshot(), [], undefined);
