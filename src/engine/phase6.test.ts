import { describe, expect, it } from 'vitest';
import { buildHeatmap } from './heatmap';
import { buildRuns, fmtDuration, fmtPace, runRecords, weeklyKm } from './runs';
import { cadenceFor, habitProgress, shadowBonusFor, SHADOW_CAP, SHADOW_DAYS } from './shadows';
import { shiftDay } from './streak';
import { assessBurnout, generateInsights, sleepReport, type Snapshot, type SysLog } from './system';
import { evaluateTrophies, TROPHIES, type TrophyCtx } from './trophies';

const TODAY = '2026-11-23';
const days = (offsets: number[]) => offsets.map((o) => shiftDay(TODAY, o));
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('Shadow Army: habit chains', () => {
  it('counts consecutive days of a daily habit', () => {
    const p = habitProgress(days(range(-9, 0)), 2, new Set(), TODAY);
    expect(p.count).toBe(10);
    expect(p.alive).toBe(true);
  });
  it('a daily habit can skip one day in a row, but not two', () => {
    expect(habitProgress(days([-6, -4, -2, 0]), 2, new Set(), TODAY).count).toBe(4); // one-day gaps are fine
    expect(habitProgress(days([-6, -5, -2, -1, 0]), 2, new Set(), TODAY).count).toBe(3); // a 3-day gap restarts the chain
  });
  it('a weekly habit (running) can wait up to a week between sessions', () => {
    expect(cadenceFor('cardio')).toBe(7);
    expect(habitProgress(days([-21, -14, -7, 0]), 7, new Set(), TODAY).count).toBe(4);
    expect(habitProgress(days([-30, -20, -10, 0]), 7, new Set(), TODAY).count).toBe(1);
  });
  it('rest and sick days never break a chain', () => {
    const paused = new Set(days([-3, -2, -1]));
    expect(habitProgress(days([-5, -4, 0]), 2, paused, TODAY).count).toBe(3);
    expect(habitProgress(days([-5, -4, 0]), 2, new Set(), TODAY).count).toBe(1);
  });
  it('lapses if you stop, and tells you how long you have left', () => {
    const lapsed = habitProgress(days([-9, -8, -7]), 2, new Set(), TODAY);
    expect(lapsed.alive).toBe(false);
    expect(lapsed.count).toBe(0);
    expect(habitProgress(days([-1]), 2, new Set(), TODAY).daysLeft).toBe(1);
    expect(habitProgress(days([0]), 2, new Set(), TODAY).daysLeft).toBe(2);
  });
  it('ignores duplicate days, future days and nothing at all', () => {
    expect(habitProgress(days([0, 0, 0]), 2, new Set(), TODAY).count).toBe(1);
    expect(habitProgress([], 2, new Set(), TODAY)).toMatchObject({ count: 0, alive: false });
    expect(habitProgress([shiftDay(TODAY, 3)], 2, new Set(), TODAY).count).toBe(0);
  });
  it('21 days extracts a shadow, and the bonus is small and capped', () => {
    expect(SHADOW_DAYS).toBe(21);
    expect(habitProgress(days(range(-20, 0)), 2, new Set(), TODAY).count).toBe(21);
    expect(shadowBonusFor(1)).toBeCloseTo(0.05, 5);
    expect(shadowBonusFor(3)).toBeCloseTo(0.15, 5);
    expect(shadowBonusFor(50)).toBe(SHADOW_CAP);
  });
});

describe('trophies', () => {
  const none: TrophyCtx = { level: 1, rankIndex: 0, streak: 0, bestStreak: 0, logsTotal: 0, questsDone: 0, bossesDefeated: 0, milestonesDone: 0, dailySets: 0, shadows: 0, purchases: 0, prs: 0, studyHours: 0, runKm: 0, longestRun: 0, goodSleepNights: 0, waterGoalDays: 0, focusSessions: 0, journalDays: 0, hasBackup: false };
  it('has unique ids and nothing unlocked at the start', () => {
    expect(new Set(TROPHIES.map((t) => t.id)).size).toBe(TROPHIES.length);
    expect(evaluateTrophies(none).filter((s) => s.done)).toHaveLength(0);
  });
  it('unlocks from real progress', () => {
    const done = (c: Partial<TrophyCtx>) => evaluateTrophies({ ...none, ...c }).filter((s) => s.done).map((s) => s.trophy.id);
    expect(done({ logsTotal: 1 })).toEqual(['first-log']);
    expect(done({ bestStreak: 30 })).toEqual(expect.arrayContaining(['streak-7', 'streak-30']));
    expect(done({ rankIndex: 2 })).toEqual(expect.arrayContaining(['rank-d', 'rank-c']));
    expect(done({ longestRun: 5.2 })).toContain('run-5k');
    expect(done({ longestRun: 5.2 })).not.toContain('run-10k');
    expect(done({ hasBackup: true })).toContain('backup');
  });
  it('titles are unique', () => {
    const titles = TROPHIES.map((t) => t.title).filter(Boolean);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('run tracker', () => {
  const log = (daysAgo: number, km: number, pace?: number) => ({ ts: new Date(2026, 10, 23 - daysAgo, 18).getTime(), qty: km, perf: pace, presetId: 'run', isPenalty: false });
  const rows = buildRuns([log(1, 3, 7), log(4, 5.2, 6.5), log(8, 3.1, 6.2), log(12, 2, 8), log(15, 4, undefined), { ...log(2, 9, 5), presetId: 'walk' }, { ...log(3, 1, 5), isPenalty: true }]);
  it('only counts runs, newest first, with pace and time when entered', () => {
    expect(rows).toHaveLength(5);
    expect(rows[0].km).toBe(3);
    expect(rows[0].minutes).toBe(21);
    expect(rows.find((r) => r.km === 4)!.pace).toBeNull();
  });
  it('finds personal records', () => {
    const r = runRecords(rows);
    expect(r.count).toBe(5);
    expect(r.totalKm).toBeCloseTo(17.3, 5);
    expect(r.longest!.km).toBe(5.2);
    expect(r.fastestPace!.pace).toBe(6.2);
    expect(r.best3k!.minutes).toBeCloseTo(6.2 * 3, 5); // the 3.1 km run at 6:12 /km
    expect(r.best5k!.minutes).toBeCloseTo(6.5 * 5, 5); // only the 5.2 km run qualifies
  });
  it('has no records until you enter a time', () => {
    const r = runRecords(buildRuns([log(1, 3)]));
    expect(r.best3k).toBeNull();
    expect(r.fastestPace).toBeNull();
    expect(r.longest!.km).toBe(3);
  });
  it('sums weekly distance (weeks start Monday)', () => {
    const w = weeklyKm(rows, 3, TODAY);
    expect(w).toHaveLength(3);
    expect(w[2].week).toBe('2026-11-23');
    expect(w.reduce((s, x) => s + x.km, 0)).toBeGreaterThan(0);
  });
  it('formats pace and time', () => {
    expect(fmtPace(5.5)).toBe('5:30 /km');
    expect(fmtPace(5.999)).toBe('6:00 /km');
    expect(fmtDuration(16.5)).toBe('16:30');
    expect(fmtDuration(65)).toBe('1:05:00');
  });
});

describe('heatmap', () => {
  const l = (offset: number, effort: number) => ({ ts: new Date(2026, 10, 23 + offset, 12).getTime(), effortXp: effort, isPenalty: false });
  const logs = [l(0, 100), l(-1, 400), l(-2, 250), l(-3, 50), { ...l(-4, 999), isPenalty: true }];
  const grid = buildHeatmap(logs, new Set(), TODAY, 4, 4);
  const flat = grid.flat();
  const cell = (offset: number) => flat.find((c) => c.day === shiftDay(TODAY, offset))!;
  it('makes one column per week of 7 days, ending with this week', () => {
    expect(grid).toHaveLength(4);
    expect(grid.every((c) => c.length === 7)).toBe(true);
    expect(grid[3][0].day).toBe('2026-11-23');
  });
  it('colours days relative to your own best days, and ignores penalties', () => {
    expect(cell(-1).level).toBe(4);
    expect(cell(-3).level).toBeLessThan(cell(-1).level);
    expect(cell(-4).level).toBe(0);
    expect(cell(-5).level).toBe(0);
  });
  it('puts flames on the days of your current streak only', () => {
    expect(cell(0).flame).toBe(true);
    expect(cell(-3).flame).toBe(true);
    expect(cell(-4).flame).toBe(false);
  });
  it('marks future days', () => {
    expect(cell(1).future).toBe(true);
    expect(cell(0).future).toBe(false);
  });
});

describe('sleep tracker and journal signals', () => {
  const bed = (offset: number, hours: number, bedMin: number): SysLog => ({
    ts: new Date(2026, 10, 23 + offset, 7).getTime(), presetId: 'sleep-hours', categoryId: 'recovery', label: 'Sleep', qty: hours, effortXp: 40, hp: 15,
    isPenalty: false, paused: false, intensity: 'normal', pr: false, bedMinutes: bedMin,
  });
  const snap = (logs: SysLog[], over: Partial<Snapshot> = {}): Snapshot => ({
    today: TODAY, logs, pausedDays: new Set(), mode: 'normal', energy: 80, streak: 0, exam: { active: false, name: '', date: null }, deadlines: [], sleepTargetHours: 8, forceGentle: false, categoryNames: {}, ...over,
  });

  it('works out average, debt, good nights and consistency', () => {
    const r = sleepReport(snap([bed(0, 7, 660), bed(-1, 6, 660), bed(-2, 8, 660), bed(-3, 5, 660)]), 14);
    expect(r.nights).toHaveLength(4);
    expect(r.avg).toBeCloseTo(6.5, 5);
    expect(r.debt).toBeCloseTo(1 + 2 + 0 + 3, 5);
    expect(r.goodNights).toBe(2);
    expect(r.consistency).toBe(100); // identical bedtimes
  });
  it('irregular bedtimes lower the consistency score', () => {
    const steady = sleepReport(snap([bed(0, 7, 660), bed(-1, 7, 670), bed(-2, 7, 650)]), 14).consistency!;
    const messy = sleepReport(snap([bed(0, 7, 600), bed(-1, 7, 780), bed(-2, 7, 700)]), 14).consistency!;
    expect(messy).toBeLessThan(steady);
    expect(sleepReport(snap([bed(0, 7, 660)]), 14).consistency).toBeNull();
  });
  it('low self-rated energy counts toward burnout risk', () => {
    const j = [{ day: shiftDay(TODAY, 0), mood: 3, energy: 1 }, { day: shiftDay(TODAY, -1), mood: 3, energy: 2 }];
    const without = assessBurnout(snap([])).score;
    expect(assessBurnout(snap([], { journal: j })).score).toBeGreaterThan(without);
    expect(assessBurnout(snap([], { journal: j })).reasons.join(' ')).toMatch(/energy ratings/);
  });
  it('a low mood gets a kind message (never a diagnosis), a good mood gets celebrated', () => {
    const low = [0, -1, -2, -3].map((o) => ({ day: shiftDay(TODAY, o), mood: 2, energy: 3 }));
    const text = generateInsights(snap([], { journal: low }), 14).find((i) => i.id === 'mood-low')!.text;
    expect(text).toMatch(/kind to yourself/);
    expect(text).not.toMatch(/depress|disorder|diagnos/i);
    const good = [0, -1, -2].map((o) => ({ day: shiftDay(TODAY, o), mood: 5, energy: 4 }));
    expect(generateInsights(snap([], { journal: good }), 14).some((i) => i.id === 'mood-good')).toBe(true);
  });
});
