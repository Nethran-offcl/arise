import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESETS } from './defaults';
import { planDaily, planWeekly, type DailyCtx } from './quests';
import { shiftDay } from './streak';
import {
  assessBurnout, buildAdvice, buildWeeklyReview, dayStats, examPressure, generateInsights, hardStreak, runPlan, windowStats,
  type Snapshot, type SysLog,
} from './system';

const TODAY = '2026-11-23'; // a Monday
const at = (offset: number, hour = 12) => {
  const [y, m, d] = shiftDay(TODAY, offset).split('-').map(Number);
  return new Date(y, m - 1, d, hour).getTime();
};

const log = (offset: number, over: Partial<SysLog> = {}): SysLog => ({
  ts: at(offset), presetId: 'study', categoryId: 'study', label: 'Study session', qty: 1, effortXp: 40, hp: 0, isPenalty: false, paused: false, intensity: 'normal', pr: false, bedMinutes: null, ...over,
});
const gym = (offset: number): SysLog => log(offset, { presetId: 'gym', categoryId: 'strength', label: 'Gym session', qty: 60, effortXp: 60, hp: -12 });
const run = (offset: number, km: number): SysLog => log(offset, { presetId: 'run', categoryId: 'cardio', label: 'Run', qty: km, effortXp: 10 + 30 * km, hp: -2 * km });
const sleep = (offset: number, hours: number, bed: number | null = 660): SysLog => log(offset, { presetId: 'sleep-hours', categoryId: 'recovery', label: 'Sleep', qty: hours, effortXp: 6 * hours, hp: 2.5 * hours, bedMinutes: bed });
const penalty = (offset: number, label = 'Procrastination / doomscrolling'): SysLog => log(offset, { isPenalty: true, categoryId: 'penalty', presetId: 'p-doomscroll', label, effortXp: 0, hp: -3 });

const snap = (logs: SysLog[], over: Partial<Snapshot> = {}): Snapshot => ({
  today: TODAY, logs, pausedDays: new Set(), mode: 'normal', energy: 80, streak: 0, exam: { active: false, name: '', date: null }, deadlines: [],
  sleepTargetHours: 8, forceGentle: false, categoryNames: { cardio: 'Cardio & Sports', strength: 'Strength', study: 'Study', recovery: 'Recovery', work: 'Work', tasks: 'Tasks & Chores' }, ...over,
});

describe('day and window stats', () => {
  it('works out effort, hard days, sleep and water per day', () => {
    const s = snap([gym(-1), log(-1, { presetId: 'water', categoryId: 'recovery', qty: 2.5, effortXp: 30 }), sleep(0, 7.5), penalty(-2)]);
    const days = dayStats(s, 3);
    expect(days.map((d) => d.day)).toEqual([shiftDay(TODAY, -2), shiftDay(TODAY, -1), TODAY]);
    expect(days[1].hard).toBe(true);
    expect(days[1].waterL).toBe(2.5);
    expect(days[2].sleepHours).toBe(7.5);
    expect(days[0].penalties).toBe(1);
    expect(days[0].active).toBe(false);
  });
  it('ignores paused (rest-mode) penalties', () => {
    const s = snap([{ ...penalty(0), paused: true }]);
    expect(dayStats(s, 1)[0].penalties).toBe(0);
  });
  it('summarises a window: sleep debt, bedtime spread, water goal', () => {
    const s = snap([sleep(0, 6, 660), sleep(-1, 7, 700), sleep(-2, 5, 780), log(-1, { presetId: 'water', categoryId: 'recovery', qty: 2.2 }), log(-2, { presetId: 'water', categoryId: 'recovery', qty: 1 })]);
    const w = windowStats(dayStats(s, 7), 8);
    expect(w.sleepDays).toBe(3);
    expect(w.avgSleep).toBeCloseTo(6, 5);
    expect(w.sleepDebt).toBeCloseTo(2 + 1 + 3, 5);
    expect(w.bedtimeSpread).toBeGreaterThan(40);
    expect(w.waterTracked).toBe(2);
    expect(w.waterGoalDays).toBe(1);
  });
});

describe('rest after hard days', () => {
  it('counts consecutive hard days, ignoring an empty today', () => {
    expect(hardStreak(dayStats(snap([gym(-1), gym(-2)]), 7))).toBe(2);
    expect(hardStreak(dayStats(snap([gym(0), gym(-1), gym(-2)]), 7))).toBe(3);
    expect(hardStreak(dayStats(snap([gym(-1), log(-2)]), 7))).toBe(1);
    expect(hardStreak(dayStats(snap([]), 7))).toBe(0);
  });
  it('two hard days in a row makes today a recovery day', () => {
    const a = buildAdvice(snap([gym(-1), gym(-2)]));
    expect(a.adapt.gentle).toBe(true);
    expect(a.adapt.noHard).toBe(true);
    expect(a.notes.join(' ')).toMatch(/recovery day/);
  });
  it('one hard day does not', () => {
    expect(buildAdvice(snap([gym(-1)])).adapt.gentle).toBe(false);
  });
  it('very low energy or a manual request also makes it gentle', () => {
    expect(buildAdvice(snap([], { energy: 20 })).adapt.gentle).toBe(true);
    expect(buildAdvice(snap([], { forceGentle: true })).adapt.gentle).toBe(true);
  });
});

describe('burnout detection', () => {
  it('is low when sleep, energy and workload are healthy', () => {
    const logs = [sleep(0, 7.5), sleep(-1, 8), sleep(-2, 7.5), sleep(-3, 7.5), log(-2), log(-4)];
    expect(assessBurnout(snap(logs)).level).toBe('low');
  });
  it('is high with little sleep, many course corrections and low energy', () => {
    const logs = [sleep(0, 5.5), sleep(-1, 5), sleep(-2, 6), sleep(-3, 5.5), penalty(0), penalty(-1), penalty(-2), penalty(-3), log(0), log(-1), log(-2), log(-3), log(-4), log(-5), log(-6)];
    const b = assessBurnout(snap(logs, { energy: 20 }));
    expect(b.level).toBe('high');
    expect(b.reasons.length).toBeGreaterThanOrEqual(3);
    expect(b.advice).toMatch(/recovery/i);
    expect(buildAdvice(snap(logs, { energy: 20 })).adapt.gentle).toBe(true);
  });
  it('does not guess about sleep from fewer than 3 entries', () => {
    expect(assessBurnout(snap([sleep(0, 3), sleep(-1, 3)])).level).toBe('low');
  });
  it('a workload far above your usual counts', () => {
    const base = Array.from({ length: 21 }, (_, i) => log(-(i + 7), { effortXp: 60 }));
    const spike = Array.from({ length: 7 }, (_, i) => log(-i, { effortXp: 200 }));
    const b = assessBurnout(snap([...base, ...spike], { energy: 45 }));
    expect(b.reasons.join(' ')).toMatch(/workload/);
  });
});

describe('exam mode and deadlines', () => {
  const exam = (days: number) => ({ active: true, name: 'Finals', date: shiftDay(TODAY, days) });
  it('ramps up as the exam gets closer', () => {
    expect(examPressure(TODAY, exam(30), []).mode).toBe('prep');
    expect(examPressure(TODAY, exam(10), []).mode).toBe('exam');
    expect(examPressure(TODAY, exam(2), []).mode).toBe('final');
    expect(examPressure(TODAY, exam(0), []).mode).toBe('final');
  });
  it('study goes up and workouts go down, never up', () => {
    const e = examPressure(TODAY, exam(10), []);
    expect(e.studyHours).toBeGreaterThan(1);
    expect(e.physicalScale).toBeLessThan(1);
    expect(examPressure(TODAY, exam(2), []).physicalScale).toBeLessThan(e.physicalScale);
  });
  it('is off when inactive, in the past, or far away', () => {
    expect(examPressure(TODAY, { ...exam(10), active: false }, []).mode).toBe('none');
    expect(examPressure(TODAY, exam(-1), []).mode).toBe('none');
    expect(examPressure(TODAY, exam(90), []).mode).toBe('none');
  });
  it('a deadline within 3 days triggers a study crunch, but a close exam stays in charge', () => {
    const dl = [{ id: 'a', title: 'Essay', date: shiftDay(TODAY, 2) }];
    expect(examPressure(TODAY, { active: false, name: '', date: null }, dl).mode).toBe('crunch');
    expect(examPressure(TODAY, exam(1), dl).mode).toBe('final');
    expect(examPressure(TODAY, { active: false, name: '', date: null }, [{ id: 'b', title: 'Far', date: shiftDay(TODAY, 10) }]).mode).toBe('none');
  });
});

describe('safe running plan (never more than +10% a week)', () => {
  it('week total stays within 10% of last week (floor 6 km for beginners)', () => {
    for (let last = 0; last <= 40; last += 2.5) {
      for (let so = 0; so <= 44; so += 1.5) {
        const lastRuns = last > 0 ? [run(-7, last)] : [];
        const thisRuns = so > 0 ? [run(0, so)] : [];
        const p = runPlan(snap([...lastRuns, ...thisRuns]));
        const budget = Math.max(last * 1.1, 6);
        expect(p.budgetKm).toBeCloseTo(budget, 5);
        if (p.targetKm !== null) {
          expect(so + p.targetKm).toBeLessThanOrEqual(budget + 1e-9);
          expect(p.targetKm).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });
  it('stops asking for runs once the weekly budget is used', () => {
    const p = runPlan(snap([run(-7, 10), run(0, 10.5)]));
    expect(p.targetKm).toBeNull();
    expect(p.note).toMatch(/budget/);
  });
  it('a single run grows about 5% over your recent average, not more', () => {
    const p = runPlan(snap([run(-3, 3), run(-5, 3), run(-6, 3)]));
    expect(p.targetKm).toBe(3);
    expect(runPlan(snap([run(-3, 6), run(-5, 6), run(-6, 6)])).targetKm).toBe(6);
  });
  it('starts a new runner at 3 km', () => {
    expect(runPlan(snap([])).targetKm).toBe(3);
  });
});

describe('quest planning follows the advice', () => {
  const ctx: DailyCtx = { flags: { work: true, college: true }, weekday: 3, questMult: 1, seed: 11, runsLast7: 0, ranYesterday: false, gymLast7: 0, effortByCategory: {}, exclude: [] };
  const ids = (c: Partial<DailyCtx>) => planDaily({ ...ctx, ...c }, DEFAULT_PRESETS).map((q) => q.presetIds![0]);

  it('a recovery day has no running, lifting, office or study, only gentle movement', () => {
    const a = buildAdvice(snap([gym(-1), gym(-2)])).adapt;
    for (let seed = 1; seed < 40; seed++) {
      const q = planDaily({ ...ctx, seed, adapt: a }, DEFAULT_PRESETS);
      const set = q.map((x) => x.presetIds![0]);
      expect(set).not.toContain('run');
      expect(set).not.toContain('gym');
      expect(set).not.toContain('office');
      expect(set).not.toContain('study');
      expect(set).toContain('walk');
      expect(set).toContain('water');
      expect(q.find((x) => x.presetIds![0] === 'walk')!.target).toBeLessThanOrEqual(20);
      expect(q.length).toBeGreaterThanOrEqual(3);
    }
  });
  it('the final days before an exam: heavy study, workouts down to a short walk', () => {
    const a = buildAdvice(snap([], { exam: { active: true, name: 'Finals', date: shiftDay(TODAY, 1) } })).adapt;
    const q = planDaily({ ...ctx, adapt: a }, DEFAULT_PRESETS);
    const set = q.map((x) => x.presetIds![0]);
    expect(set).not.toContain('run');
    expect(set).not.toContain('gym');
    expect(q.find((x) => x.presetIds![0] === 'study')!.target).toBe(3);
    expect(q.find((x) => x.presetIds![0] === 'walk')!.target).toBeLessThanOrEqual(15);
  });
  it('exam mode adds study even on a non-college day and shrinks workouts', () => {
    const a = buildAdvice(snap([], { exam: { active: true, name: 'Finals', date: shiftDay(TODAY, 10) } })).adapt;
    const free = { flags: { work: false, college: false } };
    expect(ids({ ...free, adapt: a })).toContain('study');
    const plainWalk = planDaily({ ...ctx, ...free, runsLast7: 3 }, DEFAULT_PRESETS).find((x) => x.presetIds![0] === 'walk')!.target;
    const examWalk = planDaily({ ...ctx, ...free, runsLast7: 3, adapt: a }, DEFAULT_PRESETS).find((x) => x.presetIds![0] === 'walk')!.target;
    expect(examWalk).toBeLessThan(plainWalk);
  });
  it('uses the safe run distance, or a walk when the weekly budget is used up', () => {
    const base = buildAdvice(snap([])).adapt;
    expect(planDaily({ ...ctx, adapt: { ...base, runTarget: 3.5 } }, DEFAULT_PRESETS)[0].title).toBe('Run: 3.5 km');
    expect(planDaily({ ...ctx, adapt: { ...base, runTarget: null } }, DEFAULT_PRESETS)[0].presetIds![0]).toBe('walk');
  });
  it('exam mode raises the weekly study target', () => {
    const a = buildAdvice(snap([], { exam: { active: true, name: 'Finals', date: shiftDay(TODAY, 10) } })).adapt;
    const w = planWeekly({ questMult: 1, lastWeekRuns: 0, hasCollege: false, adapt: a }, DEFAULT_PRESETS).find((q) => q.slug === 'study')!;
    expect(w.target).toBe(10);
  });
});

describe('insights', () => {
  it('flags short sleep, hydration slips and neglected areas, and celebrates records', () => {
    const logs = [
      sleep(0, 6), sleep(-1, 6.2), sleep(-2, 5.8), sleep(-3, 6),
      log(-1, { presetId: 'water', categoryId: 'recovery', qty: 1 }), log(-2, { presetId: 'water', categoryId: 'recovery', qty: 1.2 }),
      gym(-10), gym(-9), { ...run(-2, 3), pr: true },
    ];
    const ids = generateInsights(snap(logs), 7).map((i) => i.id);
    expect(ids).toContain('sleep-low');
    expect(ids).toContain('water-low');
    expect(ids).toContain('neglect-strength');
    expect(ids).toContain('pr');
  });
  it('puts warnings first', () => {
    const logs = [gym(-1), gym(-2), sleep(0, 5), sleep(-1, 5.5), sleep(-2, 5), run(-3, 3)];
    const out = generateInsights(snap(logs), 7);
    expect(out[0].tone).toBe('warn');
    expect(out.map((i) => i.tone).indexOf('good')).toBeGreaterThan(out.map((i) => i.tone).lastIndexOf('warn'));
  });
  it('works over 7, 14 and 30 days', () => {
    const logs = Array.from({ length: 30 }, (_, i) => log(-i));
    for (const w of [7, 14, 30] as const) expect(generateInsights(snap(logs), w).some((i) => i.id === 'consistency')).toBe(true);
  });
  it('never mentions calories, dieting or weight loss, and never shames', () => {
    const banned = /\b(calorie|calories|diet|dieting|fasting|weight loss|lose weight|starve|skip meals?)\b/i;
    const shame = /\b(lazy|pathetic|worthless|failure|disgusting|weak)\b/i;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let t = 0; t < 60; t++) {
      const logs: SysLog[] = [];
      for (let d = 0; d < 40; d++) {
        if (rnd() < 0.6) logs.push(log(-d));
        if (rnd() < 0.3) logs.push(gym(-d));
        if (rnd() < 0.3) logs.push(run(-d, 2 + rnd() * 6));
        if (rnd() < 0.4) logs.push(sleep(-d, 4 + rnd() * 5, 600 + Math.floor(rnd() * 240)));
        if (rnd() < 0.3) logs.push(penalty(-d, 'Junk food / binge'));
        if (rnd() < 0.3) logs.push(log(-d, { presetId: 'water', categoryId: 'recovery', qty: rnd() * 3 }));
      }
      const s = snap(logs, { energy: Math.floor(rnd() * 100), exam: rnd() < 0.3 ? { active: true, name: 'Finals', date: shiftDay(TODAY, 5) } : { active: false, name: '', date: null } });
      const texts = [
        ...([7, 14, 30] as const).flatMap((w) => generateInsights(s, w).flatMap((i) => [i.title, i.text])),
        ...buildAdvice(s).notes, buildAdvice(s).burnout.advice,
        ...(() => { const r = buildWeeklyReview(s, shiftDay(TODAY, -7), { completed: 3, failed: 4, bossDefeated: false }); return [r.headline, ...r.wins, ...r.weak, ...r.plan]; })(),
      ];
      for (const x of texts) {
        expect(x.length).toBeGreaterThan(0);
        expect(x).not.toMatch(banned);
        expect(x).not.toMatch(shame);
        expect(x).not.toMatch(/undefined|NaN/);
      }
    }
  });
});

describe('weekly review', () => {
  const LAST = shiftDay(TODAY, -7); // last Monday
  const week = [run(-7, 3), run(-5, 3), run(-3, 3.5), log(-6), log(-4), log(-2, { effortXp: 80 }), sleep(-6, 7.5), sleep(-5, 7.6), sleep(-4, 7.2), sleep(-3, 7.4), { ...run(-1, 3), pr: true }];

  it('celebrates wins, names weak points and plans next week in plain language', () => {
    const r = buildWeeklyReview(snap(week), LAST, { completed: 6, failed: 0, bossDefeated: true, bossName: 'The Clutter Hydra' });
    expect(r.wins.join(' ')).toMatch(/Ran 12\.5 km across 4 runs/);
    expect(r.wins.join(' ')).toMatch(/Defeated The Clutter Hydra/);
    expect(r.wins.join(' ')).toMatch(/personal record/);
    expect(r.plan.join(' ')).toMatch(/up to 13\.8 km/);
    expect(r.stats.runKm).toBeCloseTo(12.5, 5);
    expect(r.headline).toMatch(/Solid|Excellent|steady/);
  });
  it('the running budget is never more than 10% above this week (or the 6 km beginner floor)', () => {
    const r = buildWeeklyReview(snap([run(-5, 2), run(-3, 2)]), LAST, { completed: 0, failed: 0, bossDefeated: false });
    expect(r.plan.join(' ')).toMatch(/up to 6\.0 km/);
  });
  it('a quiet week is met with encouragement, not blame', () => {
    const r = buildWeeklyReview(snap([]), LAST, { completed: 0, failed: 0, bossDefeated: false });
    expect(r.wins[0]).toMatch(/counts/);
    expect(r.headline).toMatch(/fresh start/);
    expect(r.stats.activeDays).toBe(0);
  });
  it('flags short sleep and many hard days with rest advice', () => {
    const hard = [gym(-7), gym(-6), gym(-5), gym(-4), sleep(-6, 5.5), sleep(-5, 6), sleep(-4, 5.8)];
    const r = buildWeeklyReview(snap(hard), LAST, { completed: 0, failed: 5, bossDefeated: false });
    expect(r.weak.join(' ')).toMatch(/Sleep averaged/);
    expect(r.weak.join(' ')).toMatch(/expired/);
    expect(r.plan.join(' ')).toMatch(/easy or rest days/);
  });
});
