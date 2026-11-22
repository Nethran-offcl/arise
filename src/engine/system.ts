import type { Adapt } from './quests';
import { daysBetween, shiftDay, weekStartKey, dayKey } from './streak';
import type { PlayMode } from './types';

/**
 * THE SYSTEM ENGINE (pure, offline, tested).
 * Looks at your recent logs and works out: insights, burnout risk, exam pressure, a safe running plan,
 * how hard today's quests should be, and a weekly review. The AI coach in Phase 5 only rewrites this
 * output in a nicer voice; it never replaces these rules.
 *
 * WELLBEING RULES baked in: no calorie, weight, fasting or diet talk anywhere; slow days are never
 * punished; whenever you look tired or overloaded the advice is to rest.
 */

export const HARD_DAY_HP = 10; // a day that cost you at least this much HP in tiring tasks counts as a "hard day"
export const WATER_GOAL_L = 2;
export const PHYSICAL_CATEGORIES = ['cardio', 'strength'];
export const MIN_WEEKLY_RUN_BUDGET_KM = 6; // lets a beginner do 2 to 3 short runs in a first week
export const MAX_WEEKLY_RUN_INCREASE = 0.1; // never more than +10% weekly running distance

// ---------- input types ----------

export interface SysLog {
  ts: number;
  presetId: string;
  categoryId: string;
  label: string;
  qty: number;
  effortXp: number;
  hp: number;
  isPenalty: boolean;
  paused: boolean;
  intensity: string;
  pr: boolean;
  /** Bedtime in minutes after 12:00 the day before (so 23:00 = 660, 01:00 = 780). Null when unknown. */
  bedMinutes: number | null;
}

export interface ExamState {
  active: boolean;
  name: string;
  /** "YYYY-MM-DD" */
  date: string | null;
}

export interface Deadline {
  id: string;
  title: string;
  date: string;
}

/** One day's journal ratings (1 = low, 5 = high). Only the numbers reach the engine, never the text. */
export interface JournalDay {
  day: string;
  mood: number;
  energy: number;
}

export interface Snapshot {
  today: string;
  logs: SysLog[];
  pausedDays: Set<string>;
  mode: PlayMode;
  /** Current HP / energy, 0 to 100. */
  energy: number;
  streak: number;
  exam: ExamState;
  deadlines: Deadline[];
  /** The LOW end of your sleep goal in hours (7 by default). Sleep debt counts only the hours below it. */
  sleepTargetHours: number;
  /** The high end of the goal (8 by default). Shown as part of the goal, e.g. "7-8 h". */
  sleepTargetMaxHours?: number;
  /** User set "take a gentle day" for today. */
  forceGentle: boolean;
  categoryNames: Record<string, string>;
  /** Recent journal ratings (optional). */
  journal?: JournalDay[];
}

// ---------- day and window statistics ----------

export interface DayStat {
  day: string;
  active: boolean;
  paused: boolean;
  effort: number;
  byCategory: Record<string, number>;
  penalties: number;
  sleepHours: number;
  bedMinutes: number | null;
  hpLoss: number;
  hard: boolean;
  waterL: number;
  runKm: number;
  studyHours: number;
  workEffort: number;
}

/** Stats for the last `n` days, oldest first, ending today. */
export function dayStats(snap: Snapshot, n: number): DayStat[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) days.push(shiftDay(snap.today, -i));
  const map = new Map<string, DayStat>(
    days.map((day) => [day, { day, active: false, paused: snap.pausedDays.has(day), effort: 0, byCategory: {}, penalties: 0, sleepHours: 0, bedMinutes: null, hpLoss: 0, hard: false, waterL: 0, runKm: 0, studyHours: 0, workEffort: 0 }]),
  );
  for (const l of snap.logs) {
    const d = map.get(dayKey(l.ts));
    if (!d) continue;
    if (l.isPenalty) {
      if (!l.paused) d.penalties++;
      continue;
    }
    d.active = true;
    d.effort += l.effortXp;
    d.byCategory[l.categoryId] = (d.byCategory[l.categoryId] ?? 0) + l.effortXp;
    if (l.hp < 0) d.hpLoss += -l.hp;
    if (l.presetId === 'run') d.runKm += l.qty;
    if (l.presetId === 'study') d.studyHours += l.qty;
    if (l.presetId === 'water') d.waterL += l.qty;
    if (l.presetId === 'sleep-hours') {
      d.sleepHours += l.qty;
      if (l.bedMinutes !== null) d.bedMinutes = l.bedMinutes;
    }
    if (l.categoryId === 'work' || l.categoryId === 'tasks') d.workEffort += l.effortXp;
  }
  for (const d of map.values()) d.hard = d.hpLoss >= HARD_DAY_HP;
  return days.map((k) => map.get(k)!);
}

export interface WindowStats {
  n: number;
  activeDays: number;
  restDays: number;
  effort: number;
  byCategory: Record<string, number>;
  penalties: number;
  sleepDays: number;
  avgSleep: number | null;
  sleepDebt: number;
  bedtimeSpread: number | null;
  waterTracked: number;
  waterGoalDays: number;
  runKm: number;
  runs: number;
  studyHours: number;
  hardDays: number;
  workEffort: number;
}

export function windowStats(days: DayStat[], sleepTarget: number): WindowStats {
  const byCategory: Record<string, number> = {};
  let sleepDays = 0, sleepSum = 0, debt = 0, waterTracked = 0, waterGoal = 0, runs = 0;
  const beds: number[] = [];
  const s: WindowStats = { n: days.length, activeDays: 0, restDays: 0, effort: 0, byCategory, penalties: 0, sleepDays: 0, avgSleep: null, sleepDebt: 0, bedtimeSpread: null, waterTracked: 0, waterGoalDays: 0, runKm: 0, runs: 0, studyHours: 0, hardDays: 0, workEffort: 0 };
  for (const d of days) {
    if (d.active) s.activeDays++;
    if (d.paused) s.restDays++;
    s.effort += d.effort;
    s.penalties += d.penalties;
    s.runKm += d.runKm;
    s.studyHours += d.studyHours;
    s.workEffort += d.workEffort;
    if (d.hard) s.hardDays++;
    for (const [c, v] of Object.entries(d.byCategory)) byCategory[c] = (byCategory[c] ?? 0) + v;
    if (d.sleepHours > 0) {
      sleepDays++;
      sleepSum += d.sleepHours;
      debt += Math.max(0, sleepTarget - d.sleepHours);
      if (d.bedMinutes !== null) beds.push(d.bedMinutes);
    }
    if (d.waterL > 0) waterTracked++;
    if (d.waterL >= WATER_GOAL_L) waterGoal++;
    if (d.runKm > 0) runs++;
  }
  s.sleepDays = sleepDays;
  s.avgSleep = sleepDays ? sleepSum / sleepDays : null;
  s.sleepDebt = debt;
  s.waterTracked = waterTracked;
  s.waterGoalDays = waterGoal;
  s.runs = runs;
  if (beds.length >= 3) {
    const mean = beds.reduce((a, b) => a + b, 0) / beds.length;
    s.bedtimeSpread = Math.sqrt(beds.reduce((a, b) => a + (b - mean) ** 2, 0) / beds.length);
  }
  return s;
}

/** Consecutive hard days ending today (or yesterday if today has nothing logged yet). */
export function hardStreak(days: DayStat[]): number {
  let i = days.length - 1;
  if (i >= 0 && !days[i].hard && days[i].effort === 0) i--;
  let n = 0;
  while (i >= 0 && days[i].hard) {
    n++;
    i--;
  }
  return n;
}

// ---------- burnout ----------

export interface BurnoutResult {
  level: 'low' | 'medium' | 'high';
  score: number;
  reasons: string[];
  advice: string;
}

/**
 * Burnout risk from the last 7 days: little sleep, many course corrections, a workload far above your
 * usual, low energy, hard days back to back, and no rest. It only ever recommends MORE rest.
 */
export function assessBurnout(snap: Snapshot): BurnoutResult {
  const last = dayStats(snap, 7);
  const before = dayStats(snap, 28).slice(0, 21);
  const w = windowStats(last, snap.sleepTargetHours);
  const reasons: string[] = [];
  let score = 0;

  if (w.sleepDays >= 3 && w.avgSleep !== null) {
    if (w.avgSleep < 6) { score += 2; reasons.push(`You averaged only ${w.avgSleep.toFixed(1)} h of sleep this week.`); }
    else if (w.avgSleep < 7) { score += 1; reasons.push(`Your sleep averaged ${w.avgSleep.toFixed(1)} h this week.`); }
  }
  if (w.penalties >= 4) { score += 2; reasons.push(`${w.penalties} course corrections in 7 days.`); }
  else if (w.penalties >= 2) { score += 1; reasons.push(`${w.penalties} course corrections this week.`); }

  const baselineDaily = before.reduce((a, d) => a + d.effort, 0) / 21;
  const recentDaily = w.effort / 7;
  if (baselineDaily > 50 && recentDaily > baselineDaily * 1.5) { score += 2; reasons.push('Your workload is much higher than your usual.'); }

  const hs = hardStreak(last);
  if (hs >= 3) { score += 1; reasons.push(`${hs} hard days in a row.`); }
  if (snap.energy < 30) { score += 2; reasons.push('Your energy is very low.'); }
  else if (snap.energy < 50) { score += 1; reasons.push('Your energy is low.'); }
  // How you say you feel counts too
  const recentJ = (snap.journal ?? []).filter((j) => j.day >= shiftDay(snap.today, -6)).sort((a, b) => a.day.localeCompare(b.day)).slice(-3);
  if (recentJ.length >= 2) {
    const avgEnergy = recentJ.reduce((a, j) => a + j.energy, 0) / recentJ.length;
    if (avgEnergy <= 2) { score += 2; reasons.push('Your own energy ratings have been low.'); }
    else if (avgEnergy <= 2.7) { score += 1; reasons.push('Your energy ratings are on the low side.'); }
  }
  const recentRest = dayStats(snap, 14).some((d) => d.paused || !d.active);
  if (!recentRest) { score += 1; reasons.push('No rest day in the last two weeks.'); }

  const level = score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low';
  const advice =
    level === 'high' ? 'Take a recovery day: gentle quests only, early bedtime, plenty of water. Resting is part of leveling up.'
    : level === 'medium' ? 'Ease off a little: shorter sessions, protect your sleep, and consider a rest day soon.'
    : 'You are in a healthy rhythm. Keep it steady.';
  return { level, score, reasons, advice };
}

// ---------- exams and deadlines ----------

export type ExamMode = 'none' | 'prep' | 'exam' | 'final' | 'crunch';

export interface ExamPressure {
  mode: ExamMode;
  daysLeft: number | null;
  label: string;
  /** Hours for the daily study quest (null = leave as normal). */
  studyHours: number | null;
  /** Multiplier on physical quest targets (walks, gym). Never raises them. */
  physicalScale: number;
  /** Hours for the weekly study quest. */
  weeklyStudy: number | null;
}

const NONE: ExamPressure = { mode: 'none', daysLeft: null, label: '', studyHours: null, physicalScale: 1, weeklyStudy: null };

/** How much the exam or nearby deadlines should shift your quests toward study. */
export function examPressure(today: string, exam: ExamState, deadlines: Deadline[]): ExamPressure {
  let best: ExamPressure = NONE;
  if (exam.active && exam.date) {
    const d = daysBetween(today, exam.date);
    const name = exam.name || 'your exam';
    if (d >= 0 && d <= 3) best = { mode: 'final', daysLeft: d, label: `${name} is ${d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`}: final stretch`, studyHours: 3, physicalScale: 0.4, weeklyStudy: 10 };
    else if (d > 3 && d <= 14) best = { mode: 'exam', daysLeft: d, label: `${name} in ${d} days: exam mode`, studyHours: 2.5, physicalScale: 0.6, weeklyStudy: 10 };
    else if (d > 14 && d <= 45) best = { mode: 'prep', daysLeft: d, label: `${name} in ${d} days: preparing`, studyHours: 1.5, physicalScale: 0.85, weeklyStudy: 6 };
  }
  const soon = deadlines.map((x) => ({ x, d: daysBetween(today, x.date) })).filter((z) => z.d >= 0 && z.d <= 3).sort((a, b) => a.d - b.d)[0];
  if (soon && (best.mode === 'none' || best.mode === 'prep')) {
    best = { mode: 'crunch', daysLeft: soon.d, label: `"${soon.x.title}" due ${soon.d === 0 ? 'today' : `in ${soon.d} day${soon.d === 1 ? '' : 's'}`}: deadline focus`, studyHours: 2, physicalScale: 0.7, weeklyStudy: 6 };
  }
  return best;
}

// ---------- adaptive running ----------

export interface RunPlan {
  targetKm: number | null;
  weekKm: number;
  lastWeekKm: number;
  budgetKm: number;
  note: string;
}

const half = (n: number) => Math.round(n * 2) / 2;

/**
 * Your safe running plan. The week's total distance may grow at most 10% over last week (with a small
 * floor for beginners), and single runs grow at most about 5% over your recent average.
 */
export function runPlan(snap: Snapshot): RunPlan {
  const wk = weekStartKey(snap.today);
  const prevWk = shiftDay(wk, -7);
  const runs = snap.logs.filter((l) => !l.isPenalty && l.presetId === 'run').sort((a, b) => a.ts - b.ts);
  const kmIn = (from: string, to: string) => runs.filter((r) => { const k = dayKey(r.ts); return k >= from && k < to; }).reduce((s, r) => s + r.qty, 0);
  const weekKm = kmIn(wk, shiftDay(wk, 7));
  const lastWeekKm = kmIn(prevWk, wk);
  const budgetKm = Math.max(lastWeekKm * (1 + MAX_WEEKLY_RUN_INCREASE), MIN_WEEKLY_RUN_BUDGET_KM);
  const recent = runs.slice(-3);
  const typical = recent.length ? recent.reduce((s, r) => s + r.qty, 0) / recent.length : 3;
  // Round to the nearest half km, but never above +5% of your recent average (round down if it overshoots)
  let planned = half(typical * 1.05);
  if (planned > typical * 1.05) planned -= 0.5;
  planned = Math.max(2, planned);
  const remaining = budgetKm - weekKm;
  const targetKm = remaining >= 2 ? Math.min(planned, Math.floor(remaining * 2) / 2) : null;
  const note = targetKm === null
    ? `You have reached this week's running budget (${budgetKm.toFixed(1)} km, at most 10% more than last week). Walk or rest now.`
    : `Run ${targetKm} km: keeps your week within ${budgetKm.toFixed(1)} km (at most 10% more than last week).`;
  return { targetKm, weekKm, lastWeekKm, budgetKm, note };
}

// ---------- how hard should today be? ----------

export interface Advice {
  burnout: BurnoutResult;
  exam: ExamPressure;
  run: RunPlan;
  hardStreak: number;
  adapt: Adapt;
  /** Short plain-language reasons for today's quest mix. */
  notes: string[];
}

export function buildAdvice(snap: Snapshot): Advice {
  const burnout = assessBurnout(snap);
  const exam = examPressure(snap.today, snap.exam, snap.deadlines);
  const run = runPlan(snap);
  const hs = hardStreak(dayStats(snap, 7));
  const restNeeded = hs >= 2 || snap.energy < 25;
  const gentle = burnout.level === 'high' || restNeeded || snap.forceGentle;
  const noHard = gentle || exam.mode === 'final';
  const notes: string[] = [];
  if (gentle) {
    if (hs >= 2) notes.push(`${hs} hard days in a row: today is a recovery day.`);
    else if (snap.forceGentle) notes.push('You asked for a gentle day.');
    else if (snap.energy < 25) notes.push('Your energy is very low: today is gentle.');
    else notes.push('Burnout risk is high: today is gentle.');
  } else if (burnout.level === 'medium') notes.push('You look a bit worn down: protect your sleep today.');
  if (exam.mode !== 'none') notes.push(exam.label + '.');
  if (!gentle && run.targetKm !== null) notes.push(run.note);
  if (!gentle && run.targetKm === null) notes.push(run.note);

  let study: Adapt['study'] = null;
  if (exam.studyHours !== null) study = { base: gentle ? Math.max(1, Math.round(exam.studyHours * 0.6 * 2) / 2) : exam.studyHours };
  return {
    burnout, exam, run, hardStreak: hs, notes,
    adapt: {
      gentle,
      noHard,
      runTarget: run.targetKm,
      physicalScale: gentle ? Math.min(0.6, exam.physicalScale) : exam.physicalScale,
      study,
      examWeeklyStudy: exam.weeklyStudy,
    },
  };
}

// ---------- insights ----------

export interface Insight {
  id: string;
  tone: 'good' | 'info' | 'warn';
  title: string;
  text: string;
  priority: number;
}

const hrs = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
/** "7-8 h" (or "7 h" when there is no upper end). */
export const sleepGoalLabel = (s: Pick<Snapshot, 'sleepTargetHours' | 'sleepTargetMaxHours'>): string =>
  s.sleepTargetMaxHours && s.sleepTargetMaxHours > s.sleepTargetHours ? `${hrs(s.sleepTargetHours)}-${hrs(s.sleepTargetMaxHours)} h` : `${hrs(s.sleepTargetHours)} h`;

const TONE_ORDER = { warn: 0, info: 1, good: 2 } as const;

const dayName = (key: string) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)), 12).getDay()];

/** Rule-based insights for the last 7, 14 or 30 days, compared with the period before it. */
export function generateInsights(snap: Snapshot, windowDays: 7 | 14 | 30 = 7): Insight[] {
  const all = dayStats(snap, windowDays * 2);
  const cur = windowStats(all.slice(windowDays), snap.sleepTargetHours);
  const prev = windowStats(all.slice(0, windowDays), snap.sleepTargetHours);
  const advice = buildAdvice(snap);
  const out: Insight[] = [];
  const add = (i: Insight) => out.push(i);
  const label = windowDays === 7 ? 'this week' : `in the last ${windowDays} days`;
  const cat = (id: string) => snap.categoryNames[id] ?? id;

  if (advice.burnout.level !== 'low') {
    add({ id: 'burnout', tone: 'warn', title: advice.burnout.level === 'high' ? 'Recovery day recommended' : 'You may be running low', text: `${advice.burnout.reasons.join(' ')} ${advice.burnout.advice}`, priority: 100 });
  }
  if (advice.hardStreak >= 2 && advice.burnout.level === 'low') {
    add({ id: 'rest-after-hard', tone: 'warn', title: 'Two hard days in a row', text: 'Your body gets stronger while it rests. Make today light or take a rest day.', priority: 95 });
  }
  if (advice.exam.mode !== 'none') {
    add({ id: 'exam', tone: 'info', title: 'Study focus is on', text: `${advice.exam.label}. Quests lean toward study and workout targets are lower. Keep sleeping well.`, priority: 80 });
  }

  const possible = Math.max(1, windowDays - cur.restDays);
  const ratio = cur.activeDays / possible;
  if (cur.activeDays >= 3) {
    if (ratio >= 0.8) add({ id: 'consistency', tone: 'good', title: 'Strong consistency', text: `You were active on ${cur.activeDays} of ${possible} days ${label}.`, priority: 50 });
    else if (ratio < 0.4) add({ id: 'consistency-low', tone: 'info', title: 'Small steps count', text: `Active ${cur.activeDays} of ${possible} days ${label}. Even one tiny task keeps the chain alive.`, priority: 55 });
  } else if (snap.logs.length > 0) {
    add({ id: 'consistency-low', tone: 'info', title: 'Quiet stretch', text: `Only ${cur.activeDays} active day(s) ${label}. Start with one small quest today.`, priority: 55 });
  }

  if (prev.effort > 200) {
    const change = (cur.effort - prev.effort) / prev.effort;
    if (change >= 0.15) add({ id: 'effort-up', tone: 'good', title: 'Effort is climbing', text: `Up ${Math.round(change * 100)}% on the previous ${windowDays} days. Make sure rest keeps up with it.`, priority: 40 });
    else if (change <= -0.3) add({ id: 'effort-down', tone: 'info', title: 'Activity dipped', text: `Down ${Math.round(-change * 100)}% on the previous ${windowDays} days. Busy or tired? A lighter plan still moves you forward.`, priority: 45 });
  }

  for (const id of Object.keys(prev.byCategory)) {
    if (id === 'penalty' || id === 'core') continue;
    if ((prev.byCategory[id] ?? 0) > 60 && !cur.byCategory[id]) {
      add({ id: `neglect-${id}`, tone: 'info', title: `${cat(id)} has gone quiet`, text: `Nothing logged in ${cat(id)} ${label}. One short session brings it back.`, priority: 60 });
    }
  }

  if (cur.sleepDays >= 3 && cur.avgSleep !== null) {
    if (cur.avgSleep < snap.sleepTargetHours) add({ id: 'sleep-low', tone: 'warn', title: 'Sleep is running short', text: `You averaged ${cur.avgSleep.toFixed(1)} h ${label}, ${cur.sleepDebt.toFixed(1)} h below your ${sleepGoalLabel(snap)} goal in total. Aim for an earlier bedtime tonight.`, priority: 85 });
    else add({ id: 'sleep-good', tone: 'good', title: 'Solid sleep', text: `Averaging ${cur.avgSleep.toFixed(1)} h ${label}. Sleep is where your progress is built.`, priority: 35 });
  }
  if (cur.bedtimeSpread !== null && cur.bedtimeSpread > 90) {
    add({ id: 'sleep-irregular', tone: 'info', title: 'Bedtimes are all over the place', text: `Your bedtime varies by about ${(cur.bedtimeSpread / 60).toFixed(1)} h. A steadier schedule makes mornings easier.`, priority: 58 });
  }

  if (cur.waterTracked >= 2) {
    const ok = cur.waterGoalDays;
    if (ok / cur.waterTracked < 0.5) add({ id: 'water-low', tone: 'info', title: 'Water goal is slipping', text: `You reached ${WATER_GOAL_L} L on ${ok} of ${cur.waterTracked} logged days. Keep a bottle nearby.`, priority: 52 });
    else add({ id: 'water-good', tone: 'good', title: 'Hydration on track', text: `${WATER_GOAL_L} L reached on ${ok} of ${cur.waterTracked} logged days.`, priority: 30 });
  }

  if (cur.runKm > 0) {
    const run = advice.run;
    add({ id: 'running', tone: 'good', title: 'Running progress', text: `${cur.runKm.toFixed(1)} km over ${cur.runs} run${cur.runs === 1 ? '' : 's'} ${label}. This week's safe running budget is ${run.budgetKm.toFixed(1)} km (never more than 10% above last week); you are at ${run.weekKm.toFixed(1)} km.`, priority: 38 });
  }

  if (cur.penalties >= 3) {
    const pens = snap.logs.filter((l) => l.isPenalty && !l.paused && dayKey(l.ts) >= all[windowDays].day);
    const common = Object.entries(pens.reduce<Record<string, number>>((m, l) => ({ ...m, [l.label]: (m[l.label] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0];
    const dayCount: Record<string, number> = {};
    for (const l of pens) dayCount[dayName(dayKey(l.ts))] = (dayCount[dayName(dayKey(l.ts))] ?? 0) + 1;
    const worstDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];
    add({ id: 'penalties', tone: 'info', title: 'A few slips', text: `${cur.penalties} course corrections ${label}${common ? `, mostly "${common[0]}"` : ''}${worstDay && worstDay[1] >= 2 ? `, often on ${worstDay[0]}s` : ''}. Slips are normal. Plan one small thing ahead for that day.`, priority: 56 });
  }

  const total = Object.values(cur.byCategory).reduce((a, b) => a + b, 0);
  if (total > 300) {
    const top = Object.entries(cur.byCategory).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] / total > 0.65) add({ id: 'imbalance', tone: 'info', title: 'Very one-sided', text: `${Math.round((top[1] / total) * 100)}% of your effort ${label} was ${cat(top[0])}. A little variety builds more stats.`, priority: 42 });
  }

  const prs = snap.logs.filter((l) => l.pr && dayKey(l.ts) >= all[windowDays].day);
  if (prs.length) add({ id: 'pr', tone: 'good', title: 'New personal record', text: `You set ${prs.length === 1 ? 'a record' : `${prs.length} records`} ${label}: ${[...new Set(prs.map((p) => p.label))].join(', ')}.`, priority: 70 });

  const mood = (snap.journal ?? []).filter((j) => j.day >= shiftDay(snap.today, -13)).sort((a, b) => a.day.localeCompare(b.day)).slice(-5);
  if (mood.length >= 3) {
    const avg = mood.reduce((a, j) => a + j.mood, 0) / mood.length;
    if (avg <= 2.2) add({ id: 'mood-low', tone: 'info', title: 'Mood has been low', text: 'Be kind to yourself: rest, fresh air and talking to someone you trust can help. If it stays heavy for a while, consider speaking with a doctor or counsellor.', priority: 90 });
    else if (avg >= 4) add({ id: 'mood-good', tone: 'good', title: 'Good mood lately', text: `Your journal mood averages ${avg.toFixed(1)} out of 5. Notice what is working and keep it.`, priority: 33 });
  }

  if (snap.streak >= 7) add({ id: 'streak', tone: 'good', title: `${snap.streak}-day streak`, text: 'The chain is strong. A Rest Day or Shield protects it if life gets busy.', priority: 36 });

  return out.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.priority - a.priority);
}

// ---------- weekly review ----------

export interface QuestStats {
  completed: number;
  failed: number;
  bossDefeated: boolean;
  bossName?: string;
}

export interface WeeklyReview {
  weekKey: string;
  headline: string;
  stats: { activeDays: number; effort: number; effortChange: number | null; runKm: number; runs: number; avgSleep: number | null; penalties: number; questsCompleted: number; studyHours: number };
  wins: string[];
  weak: string[];
  plan: string[];
}

/** Review of the Monday-to-Sunday week starting at `weekKey`, in plain System voice. */
export function buildWeeklyReview(snap: Snapshot, weekKey: string, questStats: QuestStats): WeeklyReview {
  const days = (start: string) => Array.from({ length: 7 }, (_, i) => shiftDay(start, i));
  const stats = (start: string) => {
    const ds = dayStats({ ...snap, today: shiftDay(start, 6) }, 7);
    return { ds, w: windowStats(ds, snap.sleepTargetHours) };
  };
  const { w } = stats(weekKey);
  const { w: p } = stats(shiftDay(weekKey, -7));
  const cat = (id: string) => snap.categoryNames[id] ?? id;
  const wins: string[] = [];
  const weak: string[] = [];
  const plan: string[] = [];
  const possible = Math.max(1, 7 - w.restDays);

  if (w.activeDays >= 5) wins.push(`Active on ${w.activeDays} of ${possible} days.`);
  if (w.runKm > 0) wins.push(`Ran ${w.runKm.toFixed(1)} km across ${w.runs} run${w.runs === 1 ? '' : 's'}.`);
  const prs = snap.logs.filter((l) => l.pr && days(weekKey).includes(dayKey(l.ts)));
  if (prs.length) wins.push(`New personal record: ${[...new Set(prs.map((x) => x.label))].join(', ')}.`);
  if (w.avgSleep !== null && w.avgSleep >= snap.sleepTargetHours) wins.push(`Slept ${w.avgSleep.toFixed(1)} h on average.`);
  if (w.waterTracked >= 2 && w.waterGoalDays >= 4) wins.push(`Hit ${WATER_GOAL_L} L of water on ${w.waterGoalDays} days.`);
  if (questStats.bossDefeated) wins.push(`Defeated ${questStats.bossName ?? 'the weekly boss'}.`);
  if (questStats.completed >= 5) wins.push(`Completed ${questStats.completed} quests.`);
  if (w.penalties === 0 && w.activeDays >= 3) wins.push('No course corrections this week.');
  if (!wins.length) wins.push('You showed up and kept the System alive. That counts.');

  if (w.activeDays <= 3 && w.restDays < 3) weak.push(`Only ${w.activeDays} active day(s). Smaller daily targets could help.`);
  if (w.avgSleep !== null && w.avgSleep < snap.sleepTargetHours) weak.push(`Sleep averaged ${w.avgSleep.toFixed(1)} h, under your ${sleepGoalLabel(snap)} goal.`);
  if (w.waterTracked >= 2 && w.waterGoalDays < w.waterTracked / 2) weak.push(`Water goal met on ${w.waterGoalDays} of ${w.waterTracked} logged days.`);
  if (w.penalties >= 3) weak.push(`${w.penalties} course corrections: look at when they happen and plan around it.`);
  for (const id of Object.keys(p.byCategory)) {
    if (id !== 'penalty' && id !== 'core' && (p.byCategory[id] ?? 0) > 60 && !w.byCategory[id]) weak.push(`${cat(id)} was untouched after last week.`);
  }
  if (questStats.failed >= 3) weak.push(`${questStats.failed} accepted quests expired. Accept fewer, finish them.`);
  if (!weak.length) weak.push('Nothing stands out. Keep the same rhythm.');

  const budget = Math.max(w.runKm * (1 + MAX_WEEKLY_RUN_INCREASE), MIN_WEEKLY_RUN_BUDGET_KM);
  if (w.runKm > 0 || w.runs > 0) plan.push(`Running: up to ${budget.toFixed(1)} km next week, at most 10% above this week's ${w.runKm.toFixed(1)} km.`);
  if (w.hardDays >= 4) plan.push('You had many hard days. Schedule two easy or rest days.');
  if (w.avgSleep !== null && w.avgSleep < snap.sleepTargetHours) plan.push('Protect an earlier bedtime on weeknights.');
  const neglected = Object.keys(p.byCategory).find((id) => id !== 'penalty' && id !== 'core' && !w.byCategory[id]);
  if (neglected) plan.push(`Bring ${cat(neglected)} back with one short session.`);
  const exam = examPressure(shiftDay(weekKey, 7), snap.exam, snap.deadlines);
  if (exam.mode !== 'none') plan.push(`${exam.label}. Study comes first, workouts stay light.`);
  if (!plan.length) plan.push('Repeat what worked. Add one small challenge: a slightly longer session or a new task.');
  if (w.activeDays >= 5 && w.hardDays <= 3) plan.push('Keep at least one full rest day.');

  const effortChange = p.effort > 100 ? (w.effort - p.effort) / p.effort : null;
  const score = w.activeDays - w.penalties * 0.5 + (questStats.bossDefeated ? 1 : 0);
  const headline = score >= 6 ? 'Excellent week, Player.' : score >= 4 ? 'Solid week, Player.' : score >= 2 ? 'A steady week. Build on it.' : 'A quiet week. A fresh start is one quest away.';

  return {
    weekKey, headline, wins: wins.slice(0, 5), weak: weak.slice(0, 4), plan: plan.slice(0, 5),
    stats: { activeDays: w.activeDays, effort: Math.round(w.effort), effortChange, runKm: w.runKm, runs: w.runs, avgSleep: w.avgSleep, penalties: w.penalties, questsCompleted: questStats.completed, studyHours: w.studyHours },
  };
}

// ---------- sleep report ----------

export interface SleepReport {
  nights: { day: string; hours: number; bedMinutes: number | null }[];
  avg: number | null;
  /** Hours below the low end of your goal, added up over the window. */
  debt: number;
  /** 0 to 100: how steady your bedtime is (100 = same time every night). Null until 3 nights have a bedtime. */
  consistency: number | null;
  /** Nights with 7 hours or more (or your goal's low end if that is lower). */
  goodNights: number;
  /** Low end of your sleep goal. */
  target: number;
  /** High end of your sleep goal (if set). */
  targetMax?: number;
}

/** Sleep tracker numbers for the last `n` days: average, sleep debt and how regular your bedtime is. */
export function sleepReport(snap: Snapshot, n = 14): SleepReport {
  const days = dayStats(snap, n);
  const w = windowStats(days, snap.sleepTargetHours);
  const nights = days.filter((d) => d.sleepHours > 0).map((d) => ({ day: d.day, hours: d.sleepHours, bedMinutes: d.bedMinutes }));
  return {
    nights,
    avg: w.avgSleep,
    debt: w.sleepDebt,
    consistency: w.bedtimeSpread === null ? null : Math.max(0, Math.round(100 - w.bedtimeSpread / 1.2)),
    goodNights: nights.filter((x) => x.hours >= Math.min(7, snap.sleepTargetHours)).length,
    target: snap.sleepTargetHours,
    targetMax: snap.sleepTargetMaxHours,
  };
}
