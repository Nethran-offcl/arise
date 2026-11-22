/**
 * Your "day" starts at this hour (default 4 AM) so a late night doesn't split into two days
 * and break your streak. Set from Settings at startup.
 */
let dayStartHour = 0;
export function setDayStartHour(hour: number): void {
  dayStartHour = Math.min(11, Math.max(0, Math.floor(Number.isFinite(hour) ? hour : 0)));
}

/** Local-time day key, e.g. "2026-11-22" (shifted by the day-start hour). */
export function dayKey(ts: number): string {
  const d = new Date(ts - dayStartHour * 3_600_000);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + delta, 12).getTime());
}

/** The moment a day begins (local midnight + the day-start hour). Day D covers [dayStartTs(D), dayStartTs(D+1)). */
export function dayStartTs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, dayStartHour).getTime();
}

/** 0 = Sunday ... 6 = Saturday, for a day key. */
export function weekdayOf(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getDay();
}

/** The Monday that starts the week containing this day key. */
export function weekStartKey(key: string): string {
  const wd = weekdayOf(key);
  return shiftDay(key, -((wd + 6) % 7));
}

/** Whole days from key `a` to key `b`. */
export function daysBetween(a: string, b: string): number {
  const n = (k: string) => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86_400_000); };
  return n(b) - n(a);
}

export interface StreakLog {
  ts: number;
  isPenalty: boolean;
  breaksStreak: boolean;
}

/**
 * Current streak = consecutive days with at least one completed (non-penalty) log.
 * - Today doesn't count against you until it's over (we start from yesterday if today is empty).
 * - A day with a streak-breaking penalty doesn't count.
 * - Rest / Sick days are skipped: they neither add to nor break the streak.
 */
export function computeStreak(logs: StreakLog[], pausedDays: Set<string>, now: number): number {
  const active = new Set<string>();
  const broken = new Set<string>();
  for (const l of logs) {
    const k = dayKey(l.ts);
    if (l.isPenalty) {
      if (l.breaksStreak) broken.add(k);
    } else active.add(k);
  }
  const isActive = (k: string) => active.has(k) && !broken.has(k);
  let day = dayKey(now);
  if (!isActive(day) && !pausedDays.has(day)) day = shiftDay(day, -1);
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    if (pausedDays.has(day)) {
      day = shiftDay(day, -1);
      continue;
    }
    if (!isActive(day)) break;
    streak++;
    day = shiftDay(day, -1);
  }
  return streak;
}
