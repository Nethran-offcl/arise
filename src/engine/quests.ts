import { computeReward, DEFAULT_FORMULA } from './formula';
import { levelScale } from './levels';
import { UNIT_SHORT, type Preset, type UnitKind } from './types';

/**
 * QUESTS: goals tied to your real logs. Progress is DERIVED from logs (never stored as a counter),
 * so editing or deleting a log can never leave a quest in a wrong state.
 */
export type QuestKind = 'daily' | 'weekly' | 'boss' | 'emergency' | 'milestone' | 'custom';
export type QuestStatus = 'offered' | 'active' | 'completed' | 'failed' | 'skipped';
/** qty = sum of amounts, logs = number of logs (each at least minQty), effort = sum of effort XP, maxQty = biggest single amount, streak = current streak. */
export type QuestMetric = 'qty' | 'logs' | 'effort' | 'maxQty' | 'streak';

export interface Quest {
  id?: number;
  /** Unique, so the same quest can never be created twice (e.g. "daily:2026-11-23:run"). */
  key: string;
  kind: QuestKind;
  title: string;
  desc?: string;
  presetIds?: string[];
  categoryIds?: string[];
  metric: QuestMetric;
  minQty?: number;
  target: number;
  /** Display unit: km, min, h, x, runs, HP... */
  unit: string;
  periodStart: number | null;
  periodEnd: number | null;
  status: QuestStatus;
  /** Reward in "effort XP". It is scaled by your level at the moment you complete the quest. */
  rewardEffort: number;
  rewardGold: number;
  createdAt: number;
  acceptedAt?: number;
  completedAt?: number;
  recurringId?: number;
  bossName?: string;
  paidXp?: number;
  paidGold?: number;
}

/** A quest that repeats: a new copy appears every day or week. */
export interface QuestTemplate {
  id?: number;
  title: string;
  presetId: string;
  target: number;
  period: 'daily' | 'weekly';
  active: boolean;
  createdAt: number;
}

export interface QuestLog {
  ts: number;
  presetId: string;
  categoryId: string;
  qty: number;
  effortXp: number;
  isPenalty: boolean;
}

const matches = (q: Quest, l: QuestLog): boolean => {
  const hasP = !!q.presetIds?.length;
  const hasC = !!q.categoryIds?.length;
  if (!hasP && !hasC) return true;
  return (hasP && q.presetIds!.includes(l.presetId)) || (hasC && q.categoryIds!.includes(l.categoryId));
};

export function questProgress(q: Quest, logs: QuestLog[], streak: number): number {
  if (q.metric === 'streak') return streak;
  let sum = 0;
  let max = 0;
  for (const l of logs) {
    if (l.isPenalty) continue;
    if (q.periodStart !== null && l.ts < q.periodStart) continue;
    if (q.periodEnd !== null && l.ts >= q.periodEnd) continue;
    if (!matches(q, l)) continue;
    if (q.metric === 'qty') sum += l.qty;
    else if (q.metric === 'logs') sum += l.qty >= (q.minQty ?? 0) ? 1 : 0;
    else if (q.metric === 'effort') sum += l.effortXp;
    else max = Math.max(max, l.qty);
  }
  return q.metric === 'maxQty' ? max : sum;
}

/** Rest/sick days shrink the boss's HP so being unwell can never make the raid unwinnable. */
export function effectiveTarget(q: Quest, pausedDaysInPeriod: number): number {
  if (q.kind !== 'boss') return q.target;
  const factor = Math.max(0.15, (7 - Math.min(7, pausedDaysInPeriod)) / 7);
  return Math.max(1, Math.round(q.target * factor));
}

/** Multiplier on a quest's base reward by kind. */
export const KIND_MULT: Record<'daily' | 'weekly' | 'emergency' | 'custom', number> = { daily: 1, weekly: 1.5, emergency: 2.5, custom: 1 };

/** What a quest pays right now: effort x your level x rank bonus (x potion). */
export function payout(q: Pick<Quest, 'rewardEffort' | 'rewardGold'>, level: number, rankMult: number, boost = 1): { xp: number; gold: number } {
  return { xp: Math.round(q.rewardEffort * levelScale(level) * rankMult * boost), gold: Math.round(q.rewardGold * rankMult) };
}

// ---------- planning helpers ----------

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic random generator: the same seed always gives the same quests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const unitLabel = (u: UnitKind): string => UNIT_SHORT[u];

/** Rounds a target to a sensible step for its unit. */
export function roundTarget(unit: UnitKind, v: number): number {
  if (unit === 'km' || unit === 'hours' || unit === 'liters') return Math.max(0.5, Math.round(v * 2) / 2);
  if (unit === 'minutes') return Math.max(5, Math.round(v / 5) * 5);
  return Math.max(1, Math.round(v));
}

const questTitle = (p: Preset, target: number): string => (p.unit === 'none' ? p.name : `${p.name}: ${target} ${unitLabel(p.unit)}`);

export interface QuestDraft {
  slug: string;
  title: string;
  desc?: string;
  presetIds?: string[];
  categoryIds?: string[];
  metric: QuestMetric;
  minQty?: number;
  target: number;
  unit: string;
  /** How the reward is worked out: the effort of doing `repeats` x (`qty` of `presetId`). */
  reward: { presetId: string; qty: number; repeats: number };
}

/** Effort XP and gold for doing something once at normal intensity (no level scaling). */
export function baseEffort(preset: Preset, qty: number): { effort: number; gold: number } {
  const r = computeReward(preset, qty, 'normal', { formula: DEFAULT_FORMULA, level: 1, rankRewardMult: 1, weights: {} });
  return { effort: r.effortXp, gold: r.gold };
}

/** Reward for a draft: half of what the task itself pays, times the quest kind multiplier. */
export function rewardForDraft(d: QuestDraft, presets: Preset[], kind: keyof typeof KIND_MULT): { effort: number; gold: number } {
  const p = presets.find((x) => x.id === d.reward.presetId);
  if (!p) return { effort: 0, gold: 0 };
  const b = baseEffort(p, d.reward.qty);
  const m = 0.5 * d.reward.repeats * KIND_MULT[kind];
  return { effort: Math.max(1, Math.round(b.effort * m)), gold: Math.round(b.gold * m) };
}

export interface DailyCtx {
  flags: { work: boolean; college: boolean };
  weekday: number;
  /** Rank quest multiplier (E 1.0 ... S 1.25). */
  questMult: number;
  seed: number;
  runsLast7: number;
  ranYesterday: boolean;
  gymLast7: number;
  /** Effort XP per category in the last 7 days (0/missing = neglected). */
  effortByCategory: Record<string, number>;
  /** Tasks that already have a quest today (never duplicate). */
  exclude: string[];
}

/**
 * Picks 3 to 5 daily quests from your tasks, tuned to the day type:
 *  - always one movement quest (a run if you are under 3 runs this week, otherwise a walk)
 *  - workday: office tasks, college day: study
 *  - the rest is filled from categories you have neglected this week, with some randomness
 * Only tasks that still exist are used, so custom/renamed/deleted presets never break it.
 */
export function planDaily(ctx: DailyCtx, presets: Preset[]): QuestDraft[] {
  const byId = new Map(presets.filter((p) => !p.isPenalty).map((p) => [p.id, p] as const));
  const rng = mulberry32(ctx.seed);
  const picks: QuestDraft[] = [];
  const taken = new Set(ctx.exclude);

  // Health basics (like 2 L of water) are fixed targets and never grow with your rank
  const add = (id: string, base: number, scale = true): boolean => {
    const p = byId.get(id);
    if (!p || taken.has(id)) return false;
    const target = p.unit === 'none' ? 1 : roundTarget(p.unit, scale ? base * ctx.questMult : base);
    picks.push({
      slug: id,
      title: questTitle(p, target),
      desc: id === 'water' ? 'Log it whenever suits you, even once at the end of the day.' : undefined,
      presetIds: [id],
      metric: p.unit === 'none' ? 'logs' : 'qty',
      target,
      unit: unitLabel(p.unit) || 'x',
      reward: { presetId: id, qty: p.unit === 'none' ? 1 : target, repeats: 1 },
    });
    taken.add(id);
    return true;
  };

  // Mandatory quests
  if (!(ctx.runsLast7 < 3 && !ctx.ranYesterday && add('run', 3))) add('walk', 30);
  add('water', 2, false); // every day: 2 litres, entered in one go if you like
  if (ctx.flags.work) add('office', 3);
  if (ctx.flags.college) add('study', 1);

  // Optional pool: [task id, weight]
  const free = !ctx.flags.work && !ctx.flags.college;
  const pool: { id: string; w: number }[] = [
    { id: 'gym', w: ctx.gymLast7 < 3 ? 2 : 0 },
    { id: 'pending', w: 2 },
    { id: 'chores', w: free ? 2.5 : 1.5 },
    { id: 'sleep-ontime', w: 1.5 },
    { id: 'journal', w: 1.5 },
    { id: 'meditation', w: 1 },
    { id: 'reading', w: 1.2 },
    { id: 'learn', w: 0.8 },
    { id: 'meal-prep', w: free ? 1.2 : 0.4 },
    { id: 'assignment', w: ctx.flags.college ? 2 : 0 },
  ].filter((c) => byId.has(c.id) && !taken.has(c.id));

  let anyNeglected = false;
  for (const c of pool) {
    const cat = byId.get(c.id)!.categoryId;
    if (!ctx.effortByCategory[cat]) {
      c.w += 2.5;
      anyNeglected = true;
    }
  }

  const desired = Math.min(5, Math.max(picks.length, 3 + (free ? 1 : 0) + (anyNeglected ? 1 : 0)));
  const bases: Record<string, number> = { gym: 45, pending: 2, chores: 1, 'sleep-ontime': 1, journal: 1, meditation: 10, reading: 20, learn: 1, 'meal-prep': 1, assignment: 1 };
  const usedCats = new Set(picks.map((p) => byId.get(p.presetIds![0])?.categoryId));
  while (picks.length < desired && pool.length) {
    const live = pool.filter((c) => c.w > 0);
    if (!live.length) break;
    const total = live.reduce((s, c) => s + c.w, 0);
    let r = rng() * total;
    let chosen = live[live.length - 1];
    for (const c of live) {
      r -= c.w;
      if (r <= 0) {
        chosen = c;
        break;
      }
    }
    pool.splice(pool.indexOf(chosen), 1);
    const cat = byId.get(chosen.id)!.categoryId;
    if (usedCats.has(cat) && pool.some((c) => c.w > 0 && !usedCats.has(byId.get(c.id)!.categoryId))) continue; // prefer variety
    if (add(chosen.id, bases[chosen.id] ?? 1)) usedCats.add(cat);
  }
  return picks;
}

export interface WeeklyCtx {
  questMult: number;
  lastWeekRuns: number;
  hasCollege: boolean;
}

/** Three weekly quests (a boss raid is planned separately). */
export function planWeekly(ctx: WeeklyCtx, presets: Preset[]): QuestDraft[] {
  const ids = new Set(presets.filter((p) => !p.isPenalty).map((p) => p.id));
  const out: QuestDraft[] = [];
  if (ids.has('run')) {
    // Beginner-friendly: 2 runs, then 3 once you managed 2 last week. Never more than 3 a week.
    const t = ctx.lastWeekRuns >= 2 ? 3 : 2;
    out.push({ slug: 'runs', title: `Run ${t} times this week (2 km or more)`, presetIds: ['run'], metric: 'logs', minQty: 2, target: t, unit: 'runs', reward: { presetId: 'run', qty: 3, repeats: t } });
  }
  if (ctx.hasCollege && ids.has('study')) {
    const t = roundTarget('hours', 4 * ctx.questMult);
    out.push({ slug: 'study', title: `Study ${t} hours this week`, presetIds: ['study'], metric: 'qty', target: t, unit: 'h', reward: { presetId: 'study', qty: t, repeats: 1 } });
  } else if (ids.has('gym')) {
    out.push({ slug: 'lift', title: 'Do 2 gym sessions this week', presetIds: ['gym'], metric: 'logs', target: 2, unit: 'sessions', reward: { presetId: 'gym', qty: 45, repeats: 2 } });
  }
  if (ids.has('pending')) {
    const t = Math.max(3, Math.round(8 * ctx.questMult));
    out.push({ slug: 'tasks', title: `Get ${t} tasks done (work, chores, pending)`, categoryIds: ['tasks', 'work'], metric: 'logs', target: t, unit: 'tasks', reward: { presetId: 'pending', qty: 1, repeats: t } });
  }
  return out;
}

export const BOSS_NAMES = ['The Procrastination Golem', 'The Midnight Scroll Wraith', 'The Clutter Hydra', 'The Deadline Drake', 'The Lethargy Behemoth', 'The Distraction Swarm'];

/** Boss HP is measured in effort XP: your own recent weekly average + 5%, never under 800. */
export function planBoss(avgWeeklyEffort: number, seed: number): { name: string; hp: number } {
  const hp = Math.max(800, Math.round((avgWeeklyEffort * 1.05) / 50) * 50);
  return { name: BOSS_NAMES[seed % BOSS_NAMES.length], hp };
}

export const bossReward = (hp: number): { effort: number; gold: number } => ({ effort: Math.round(hp * 0.4), gold: Math.round(hp * 0.1) });

export interface MilestoneDef {
  id: string;
  title: string;
  desc: string;
  presetIds?: string[];
  metric: QuestMetric;
  minQty?: number;
  target: number;
  unit: string;
  effort: number;
  gold: number;
}

export const MILESTONES: MilestoneDef[] = [
  { id: 'first5k', title: 'First 5 km run', desc: 'Run 5 km in one go.', presetIds: ['run'], metric: 'maxQty', target: 5, unit: 'km', effort: 300, gold: 100 },
  { id: 'run3x10', title: 'Run 3 km without stopping, 10 times', desc: 'Ten separate runs of 3 km or more.', presetIds: ['run'], metric: 'logs', minQty: 3, target: 10, unit: 'runs', effort: 600, gold: 200 },
  { id: 'first10k', title: 'First 10 km run', desc: 'Run 10 km in one go.', presetIds: ['run'], metric: 'maxQty', target: 10, unit: 'km', effort: 700, gold: 250 },
  { id: 'gym20', title: '20 gym sessions', desc: 'Show up to the gym twenty times.', presetIds: ['gym'], metric: 'logs', target: 20, unit: 'sessions', effort: 500, gold: 150 },
  { id: 'study50', title: '50 hours of study', desc: 'Fifty hours of focused study in total.', presetIds: ['study'], metric: 'qty', target: 50, unit: 'h', effort: 800, gold: 250 },
  { id: 'streak7', title: '7-day streak', desc: 'Log something every day for a week.', metric: 'streak', target: 7, unit: 'days', effort: 250, gold: 80 },
  { id: 'streak30', title: '30-day streak', desc: 'A whole month without breaking the chain.', metric: 'streak', target: 30, unit: 'days', effort: 1200, gold: 400 },
  { id: 'streak100', title: '100-day streak', desc: 'One hundred days in a row.', metric: 'streak', target: 100, unit: 'days', effort: 4000, gold: 1200 },
];
