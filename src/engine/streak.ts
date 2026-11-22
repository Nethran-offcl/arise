/** Local-time day key, e.g. "2026-11-22". */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + delta, 12).getTime());
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
