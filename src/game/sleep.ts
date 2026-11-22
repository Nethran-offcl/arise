import { getSetting, setSetting } from '../db/db';

export interface SleepTargets {
  /** Target bedtime "HH:MM". */
  bed: string;
  /** Target wake time "HH:MM". */
  wake: string;
}

export const DEFAULT_SLEEP_TARGETS: SleepTargets = { bed: '23:00', wake: '07:00' };
/** Going to bed this many minutes after your target still counts as "on time". */
export const SLEEP_ON_TIME_GRACE_MIN = 30;

export const getSleepTargets = async (): Promise<SleepTargets> => ({ ...DEFAULT_SLEEP_TARGETS, ...(await getSetting<Partial<SleepTargets>>('sleepTargets', {})) });
export const setSleepTargets = (t: SleepTargets) => setSetting('sleepTargets', t);

const toMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * Turns "woke on <date> at <time>, went to bed at <time>" into timestamps and hours.
 * Bedtime is the evening before when it is later than the wake time, otherwise the same day (a nap).
 */
export function sleepWindow(wakeDate: string, bedTime: string, wakeTime: string): { bedTs: number; wakeTs: number; hours: number } {
  const [y, m, d] = wakeDate.split('-').map(Number);
  const [wh, wm] = wakeTime.split(':').map(Number);
  const [bh, bm] = bedTime.split(':').map(Number);
  const wakeTs = new Date(y, m - 1, d, wh || 0, wm || 0).getTime();
  let bedTs = new Date(y, m - 1, d, bh || 0, bm || 0).getTime();
  if (bedTs >= wakeTs) bedTs = new Date(y, m - 1, d - 1, bh || 0, bm || 0).getTime();
  return { bedTs, wakeTs, hours: Math.max(0, (wakeTs - bedTs) / 3_600_000) };
}

/** True when you went to bed no later than your target plus the grace period. After-midnight bedtimes count as late. */
export function sleepOnTime(bedTs: number, targetBed: string): boolean {
  const d = new Date(bedTs);
  const norm = (min: number) => (min < 12 * 60 ? min + 24 * 60 : min); // 01:00 is later than 23:00
  return norm(d.getHours() * 60 + d.getMinutes()) <= norm(toMinutes(targetBed)) + SLEEP_ON_TIME_GRACE_MIN;
}
