import { dayKey, shiftDay, weekStartKey } from './streak';

export interface HeatCell {
  day: string;
  effort: number;
  /** 0 = nothing, 1 to 4 = how big the day was compared with your own best days. */
  level: 0 | 1 | 2 | 3 | 4;
  /** Part of your current streak. */
  flame: boolean;
  logs: number;
  future: boolean;
  paused: boolean;
}

export interface HeatLog {
  ts: number;
  effortXp: number;
  isPenalty: boolean;
}

/**
 * A calendar of the last `weeks` weeks: one column per week (Monday to Sunday). Colour levels are relative to YOUR
 * 90th-percentile day, so they stay meaningful as you level up. Effort XP is used (not level-scaled XP) for the same reason.
 */
export function buildHeatmap(logs: HeatLog[], paused: Set<string>, today: string, weeks: number, streak: number): HeatCell[][] {
  const effort = new Map<string, number>();
  const count = new Map<string, number>();
  for (const l of logs) {
    if (l.isPenalty) continue;
    const k = dayKey(l.ts);
    effort.set(k, (effort.get(k) ?? 0) + l.effortXp);
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const vals = [...effort.values()].sort((a, b) => a - b);
  const p90 = vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.9))] : 1;

  // Days in the current streak (flames on the active ones)
  const inStreak = new Set<string>();
  if (streak > 0) {
    let day = effort.has(today) || paused.has(today) ? today : shiftDay(today, -1);
    let left = streak;
    while (left > 0) {
      inStreak.add(day);
      if (!paused.has(day)) left--;
      day = shiftDay(day, -1);
    }
  }

  const firstMonday = shiftDay(weekStartKey(today), -7 * (weeks - 1));
  const grid: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const day = shiftDay(firstMonday, w * 7 + d);
      const e = effort.get(day) ?? 0;
      const level = e <= 0 ? 0 : (Math.min(4, Math.max(1, Math.ceil((4 * e) / p90))) as 1 | 2 | 3 | 4);
      col.push({ day, effort: Math.round(e), level, flame: inStreak.has(day) && e > 0, logs: count.get(day) ?? 0, future: day > today, paused: paused.has(day) });
    }
    grid.push(col);
  }
  return grid;
}
