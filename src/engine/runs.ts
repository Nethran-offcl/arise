import { shiftDay, weekStartKey, dayKey } from './streak';

/** A logged run. `pace` (min per km) and `minutes` exist only when you entered the time. */
export interface RunRow {
  ts: number;
  km: number;
  minutes: number | null;
  pace: number | null;
}

export interface RunLogLike {
  ts: number;
  qty: number;
  perf?: number;
  presetId: string;
  isPenalty: boolean;
}

export function buildRuns(logs: RunLogLike[]): RunRow[] {
  return logs
    .filter((l) => l.presetId === 'run' && !l.isPenalty && l.qty > 0)
    .map((l) => ({ ts: l.ts, km: l.qty, pace: l.perf && l.perf > 0 ? l.perf : null, minutes: l.perf && l.perf > 0 ? l.perf * l.qty : null }))
    .sort((a, b) => b.ts - a.ts);
}

export interface RunRecords {
  count: number;
  totalKm: number;
  longest: RunRow | null;
  fastestPace: RunRow | null;
  /** Fastest estimated time for 3 km / 5 km, from your best run of at least that distance (even-pace estimate). */
  best3k: { minutes: number; row: RunRow } | null;
  best5k: { minutes: number; row: RunRow } | null;
}

const bestFor = (rows: RunRow[], km: number) => {
  const timed = rows.filter((r) => r.pace !== null && r.km >= km);
  if (!timed.length) return null;
  const row = timed.reduce((a, b) => (a.pace! <= b.pace! ? a : b));
  return { minutes: row.pace! * km, row };
};

export function runRecords(rows: RunRow[]): RunRecords {
  const timed = rows.filter((r) => r.pace !== null && r.km >= 1);
  return {
    count: rows.length,
    totalKm: rows.reduce((s, r) => s + r.km, 0),
    longest: rows.length ? rows.reduce((a, b) => (a.km >= b.km ? a : b)) : null,
    fastestPace: timed.length ? timed.reduce((a, b) => (a.pace! <= b.pace! ? a : b)) : null,
    best3k: bestFor(rows, 3),
    best5k: bestFor(rows, 5),
  };
}

/** Weekly running distance for the last `weeks` weeks (Monday starts), oldest first. */
export function weeklyKm(rows: RunRow[], weeks: number, today: string): { week: string; km: number }[] {
  const thisWeek = weekStartKey(today);
  const out: { week: string; km: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = shiftDay(thisWeek, -7 * i);
    const end = shiftDay(start, 7);
    out.push({ week: start, km: rows.filter((r) => { const k = dayKey(r.ts); return k >= start && k < end; }).reduce((s, r) => s + r.km, 0) });
  }
  return out;
}

/** 5.5 -> "5:30 /km" */
export function fmtPace(pace: number): string {
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  return s === 60 ? `${m + 1}:00 /km` : `${m}:${String(s).padStart(2, '0')} /km`;
}

/** 16.5 minutes -> "16:30" ; over an hour -> "1:05:00" */
export function fmtDuration(minutes: number): string {
  const total = Math.round(minutes * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
