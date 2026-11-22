import { getSetting, setSetting } from '../db/db';
import { dayKey, weekdayOf } from '../engine/streak';
import type { PlayMode } from '../engine/types';

/** What kind of day it is: drives which quests you are offered. */
export interface DayFlags {
  work: boolean;
  college: boolean;
}
export type Schedule = Record<number, DayFlags>; // 0 = Sunday ... 6 = Saturday

/** Default week: Mon-Fri workdays, no college, weekend free. Fully editable in Settings. */
export const DEFAULT_SCHEDULE: Schedule = {
  0: { work: false, college: false },
  1: { work: true, college: false },
  2: { work: true, college: false },
  3: { work: true, college: false },
  4: { work: true, college: false },
  5: { work: true, college: false },
  6: { work: false, college: false },
};

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function getSchedule(): Promise<Schedule> {
  return { ...DEFAULT_SCHEDULE, ...(await getSetting<Partial<Schedule>>('schedule', {})) } as Schedule;
}
export const setSchedule = (s: Schedule) => setSetting('schedule', s);

interface Override {
  day: string;
  work: boolean;
  college: boolean;
}

/** Today's flags: a one-off change for today wins over the weekly schedule. */
export async function getTodayFlags(now = Date.now()): Promise<DayFlags> {
  const today = dayKey(now);
  const o = await getSetting<Override | null>('dayOverride', null);
  if (o && o.day === today) return { work: o.work, college: o.college };
  const sched = await getSchedule();
  return sched[weekdayOf(today)] ?? { work: false, college: false };
}

export const setTodayFlags = (flags: DayFlags, now = Date.now()) => setSetting('dayOverride', { day: dayKey(now), ...flags });

export type DayType = 'rest' | 'sick' | 'work' | 'college' | 'both' | 'free';

export function dayType(flags: DayFlags, mode: PlayMode): DayType {
  if (mode === 'sick') return 'sick';
  if (mode === 'rest') return 'rest';
  if (flags.work && flags.college) return 'both';
  if (flags.work) return 'work';
  if (flags.college) return 'college';
  return 'free';
}

export const DAY_TYPE_LABEL: Record<DayType, string> = {
  rest: 'Rest day',
  sick: 'Sick / injured',
  work: 'Workday',
  college: 'College day',
  both: 'Work + college day',
  free: 'Free day',
};
