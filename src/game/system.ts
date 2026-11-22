import { db, getSetting, setSetting, type LogEntry } from '../db/db';
import { computeStreak, dayKey, dayStartTs, shiftDay, weekStartKey } from '../engine/streak';
import { buildWeeklyReview, type Deadline, type ExamState, type QuestStats, type Snapshot, type SysLog, type WeeklyReview } from '../engine/system';
import type { PlayMode } from '../engine/types';
import { getSleepGoal } from './sleep';

const DAY = 86_400_000;

export const DEFAULT_EXAM: ExamState = { active: false, name: '', date: null };

export const getExam = async (): Promise<ExamState> => ({ ...DEFAULT_EXAM, ...(await getSetting<Partial<ExamState>>('exam', {})) });
export const setExam = (e: ExamState) => setSetting('exam', e);
export const getDeadlines = () => getSetting<Deadline[]>('deadlines', []);

export async function addDeadline(title: string, date: string): Promise<void> {
  const list = await getDeadlines();
  await setSetting('deadlines', [...list, { id: `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, title: title.trim(), date }].sort((a, b) => a.date.localeCompare(b.date)));
}

export async function removeDeadline(id: string): Promise<void> {
  await setSetting('deadlines', (await getDeadlines()).filter((d) => d.id !== id));
}

/** "Take a gentle day": today's quests become a recovery plan (no running, lifting or heavy work). */
export const setGentleDay = (on: boolean, now = Date.now()) => setSetting('gentleDay', on ? dayKey(now) : null);

const bedMinutes = (bed: number): number => {
  const d = new Date(bed);
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= 12 * 60 ? m - 12 * 60 : m + 12 * 60; // minutes after noon: 23:00 = 660, 01:00 = 780
};

const toSysLog = (l: LogEntry): SysLog => ({
  ts: l.ts, presetId: l.presetId, categoryId: l.categoryId, label: l.label, qty: l.qty, effortXp: l.effortXp ?? l.xp, hp: l.hp,
  isPenalty: l.isPenalty, paused: !!l.paused, intensity: l.intensity, pr: !!l.pr, bedMinutes: l.sleep ? bedMinutes(l.sleep.bed) : null,
});

/** Reads what the System engine needs from the database (a compact picture of the last 60 days plus settings). */
export async function loadSnapshot(now = Date.now()): Promise<Snapshot> {
  const [logs, profile, mode, paused, exam, deadlines, gentleDay, sleepGoal, cats, journal] = await Promise.all([
    db.logs.where('ts').above(now - 366 * DAY).toArray(),
    db.profile.get(1),
    getSetting<PlayMode>('mode', 'normal'),
    getSetting<string[]>('pausedDays', []),
    getExam(),
    getDeadlines(),
    getSetting<string | null>('gentleDay', null),
    getSleepGoal(),
    db.categories.toArray(),
    db.journal.where('ts').above(now - 21 * DAY).toArray(),
  ]);
  const pausedSet = new Set(paused);
  const today = dayKey(now);
  return {
    today,
    logs: logs.filter((l) => l.ts >= now - 60 * DAY).map(toSysLog),
    pausedDays: pausedSet,
    mode,
    energy: profile?.hp ?? 100,
    streak: computeStreak(logs, pausedSet, now),
    exam,
    deadlines,
    sleepTargetHours: sleepGoal.min,
    sleepTargetMaxHours: sleepGoal.max,
    forceGentle: gentleDay === today,
    categoryNames: Object.fromEntries(cats.map((c) => [c.id, c.name])),
    journal: journal.map((j) => ({ day: j.id, mood: j.mood, energy: j.energy })),
  };
}

/** How many quests you finished or missed in the week starting at `weekKey`. */
export async function loadQuestStats(weekKey: string): Promise<QuestStats> {
  const start = dayStartTs(weekKey);
  const end = dayStartTs(shiftDay(weekKey, 7));
  const qs = (await db.quests.toArray()).filter((q) => q.periodStart !== null && q.periodStart >= start && q.periodStart < end && q.kind !== 'milestone');
  const boss = qs.find((q) => q.kind === 'boss');
  return {
    completed: qs.filter((q) => q.status === 'completed' && q.kind !== 'boss').length,
    failed: qs.filter((q) => q.status === 'failed' && q.kind !== 'boss').length,
    bossDefeated: boss?.status === 'completed',
    bossName: boss?.bossName,
  };
}

/** Rule-based weekly review. `which` is the week that just ended, or the week so far. */
export async function loadWeeklyReview(which: 'last' | 'current', now = Date.now()): Promise<WeeklyReview> {
  const thisWeek = weekStartKey(dayKey(now));
  const weekKey = which === 'current' ? thisWeek : shiftDay(thisWeek, -7);
  const [snap, qs] = await Promise.all([loadSnapshot(now), loadQuestStats(weekKey)]);
  return buildWeeklyReview(snap, weekKey, qs);
}
