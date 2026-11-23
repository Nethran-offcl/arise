import { db, ensureProfile, getSetting, setSetting, type LogEntry } from '../db/db';
import {
  bossReward, hashString, MILESTONES, mulberry32, payout, planBoss, planDaily, planWeekly, questProgress, rewardForDraft,
  effectiveTarget, type DailyCtx, type Quest, type QuestDraft, type QuestLog,
} from '../engine/quests';
import { applyXpDelta, levelFromXp } from '../engine/levels';
import { rankInfoForLevel } from '../engine/ranks';
import { computeStreak, dayKey, dayStartTs, shiftDay, weekStartKey, weekdayOf } from '../engine/streak';
import type { PlayMode } from '../engine/types';
import { UNIT_SHORT } from '../engine/types';
import { getTodayFlags, getSchedule } from './schedule';
import { buildAdvice } from '../engine/system';
import { doubleXpBoost } from './shop';
import { loadSnapshot } from './system';

const DAY = 86_400_000;

export const toQuestLog = (l: LogEntry): QuestLog => ({
  ts: l.ts, presetId: l.presetId, categoryId: l.categoryId, qty: l.qty, effortXp: l.effortXp ?? l.xp, isPenalty: l.isPenalty,
});

/** Every table a quest operation may touch (for atomic transactions). */
export const questTables = () => [db.quests, db.questTemplates, db.profile, db.logs, db.settings, db.presets, db.categories, db.inventory, db.journal, db.shadows, db.exercises];

/** How many of the days in [start, end) were Rest/Sick/protected days. */
export function pausedCountInRange(paused: Set<string>, start: number, end: number): number {
  let n = 0;
  for (let k = dayKey(start); dayStartTs(k) < end; k = shiftDay(k, 1)) if (paused.has(k)) n++;
  return n;
}

export interface QuestCompletion {
  title: string;
  kind: Quest['kind'] | 'bonus';
  xp: number;
  gold: number;
  bossName?: string;
}

/** Looks at all open quests, completes (and pays) the ones whose target is reached. Call inside a transaction. */
export async function evaluateQuests(now = Date.now()): Promise<QuestCompletion[]> {
  const open = (await db.quests.where('status').anyOf('offered', 'active').toArray()).filter((q) => (q.periodStart ?? 0) <= now && (q.periodEnd === null || now < q.periodEnd));
  if (!open.length) return [];
  const logs = await db.logs.toArray();
  const paused = new Set(await getSetting<string[]>('pausedDays', []));
  const qlogs = logs.map(toQuestLog);
  const streak = computeStreak(logs, paused, now);
  const boost = await doubleXpBoost(now);
  let p = await ensureProfile();
  const done: QuestCompletion[] = [];

  const pay = (effort: number, gold: number) => {
    const level = levelFromXp(p.totalXp).level;
    const r = payout({ rewardEffort: effort, rewardGold: gold }, level, rankInfoForLevel(level).rewardMult, boost);
    p = { ...p, totalXp: applyXpDelta(p.totalXp, r.xp), gold: p.gold + r.gold };
    return r;
  };

  for (const q of open) {
    const target = effectiveTarget(q, q.periodStart !== null && q.periodEnd !== null ? pausedCountInRange(paused, q.periodStart, q.periodEnd) : 0);
    if (questProgress(q, qlogs, streak) < target) continue;
    const r = pay(q.rewardEffort, q.rewardGold);
    await db.quests.update(q.id!, { status: 'completed', completedAt: now, paidXp: r.xp, paidGold: r.gold });
    done.push({ title: q.title, kind: q.kind, xp: r.xp, gold: r.gold, bossName: q.bossName });
  }

  // Bonus for clearing the whole daily set (needs at least 3 dailies, all completed, paid once per day)
  const today = dayKey(now);
  const dailies = (await db.quests.where('kind').equals('daily').toArray()).filter((q) => q.periodStart === dayStartTs(today) && q.status !== 'skipped');
  if (dailies.length >= 3 && dailies.every((q) => q.status === 'completed') && (await getSetting<string | null>('dailyBonusDay', null)) !== today) {
    const effort = Math.round(dailies.reduce((s, q) => s + q.rewardEffort, 0) * 0.5);
    const gold = Math.round(dailies.reduce((s, q) => s + q.rewardGold, 0) * 0.5);
    const r = pay(effort, gold);
    await setSetting('dailyBonusDay', today);
    done.push({ title: 'Daily set cleared', kind: 'bonus', xp: r.xp, gold: r.gold });
  }

  if (done.length) {
    await db.profile.put(p);
    await setSetting('questsCompletedTotal', (await getSetting<number>('questsCompletedTotal', 0)) + done.filter((d) => d.kind !== 'bonus').length);
    const bosses = done.filter((d) => d.kind === 'boss').length;
    if (bosses) await setSetting('bossesDefeatedTotal', (await getSetting<number>('bossesDefeatedTotal', 0)) + bosses);
    if (done.some((d) => d.kind === 'bonus')) await setSetting('dailySetsCleared', (await getSetting<number>('dailySetsCleared', 0)) + 1);
  }
  return done;
}

/**
 * Completes (and pays) any open quest that is already satisfied by existing logs.
 * Needed because quests are created after the fact: e.g. a new week's "Run 2 times" when you already ran twice this week.
 */
export async function settleQuests(now = Date.now()): Promise<QuestCompletion[]> {
  return db.transaction('rw', questTables(), async () => evaluateQuests(now));
}

// ---------- generating quests ----------

interface Recent {
  effortByCategory: Record<string, number>;
  runsLast7: number;
  gymLast7: number;
  ranYesterday: boolean;
  lastWeekRuns: number;
  avgWeeklyEffort: number;
}

function recentContext(logs: LogEntry[], now: number): Recent {
  const today = dayKey(now);
  const real = logs.filter((l) => !l.isPenalty && l.ts <= now);
  const last7 = real.filter((l) => l.ts >= now - 7 * DAY);
  const effortByCategory: Record<string, number> = {};
  for (const l of last7) effortByCategory[l.categoryId] = (effortByCategory[l.categoryId] ?? 0) + (l.effortXp ?? l.xp);
  const wk = weekStartKey(today);
  const prevStart = dayStartTs(shiftDay(wk, -7));
  const prevEnd = dayStartTs(wk);
  const yesterday = shiftDay(today, -1);
  const last28 = real.filter((l) => l.ts >= now - 28 * DAY).reduce((s, l) => s + (l.effortXp ?? l.xp), 0);
  return {
    effortByCategory,
    runsLast7: last7.filter((l) => l.presetId === 'run').length,
    gymLast7: last7.filter((l) => l.presetId === 'gym').length,
    ranYesterday: real.some((l) => l.presetId === 'run' && dayKey(l.ts) === yesterday),
    lastWeekRuns: real.filter((l) => l.presetId === 'run' && l.ts >= prevStart && l.ts < prevEnd).length,
    avgWeeklyEffort: last28 / 4,
  };
}

type RewardKind = 'daily' | 'weekly' | 'emergency' | 'custom';

function buildQuest(d: QuestDraft, key: string, kind: Quest['kind'], rewardKind: RewardKind, presets: Parameters<typeof rewardForDraft>[1], period: [number | null, number | null], now: number, status: Quest['status'] = 'offered'): Omit<Quest, 'id'> {
  const r = rewardForDraft(d, presets, rewardKind);
  return {
    key, kind, title: d.title, desc: d.desc, presetIds: d.presetIds, categoryIds: d.categoryIds, metric: d.metric, minQty: d.minQty,
    target: d.target, unit: d.unit, periodStart: period[0], periodEnd: period[1], status, rewardEffort: r.effort, rewardGold: r.gold,
    createdAt: now, acceptedAt: status === 'active' ? now : undefined,
  };
}

async function addIfNew(q: Omit<Quest, 'id'>): Promise<boolean> {
  if (await db.quests.where('key').equals(q.key).first()) return false;
  await db.quests.add(q as Quest);
  return true;
}

/**
 * Makes sure everything that should exist right now does: milestones, this week's quests and boss,
 * today's daily quests, your recurring quests, and (sometimes) a surprise emergency quest.
 * Safe to call any number of times: unique keys stop duplicates.
 */
export async function ensureQuests(now = Date.now()): Promise<void> {
  await db.transaction('rw', questTables(), async () => {
    const [presets, logs, schedule, flags, profile] = await Promise.all([db.presets.toArray(), db.logs.toArray(), getSchedule(), getTodayFlags(now), ensureProfile()]);
    const mode = await getSetting<PlayMode>('mode', 'normal');
    const rank = rankInfoForLevel(levelFromXp(profile.totalXp).level);
    const today = dayKey(now);
    const dStart = dayStartTs(today);
    const dEnd = dayStartTs(shiftDay(today, 1));
    const wk = weekStartKey(today);
    const wStart = dayStartTs(wk);
    const wEnd = dayStartTs(shiftDay(wk, 7));
    const recent = recentContext(logs, now);
    const advice = buildAdvice(await loadSnapshot(now)); // recovery days, exam mode, safe running

    // Milestones (created once, they stay until completed)
    for (const m of MILESTONES) {
      await addIfNew({
        key: `ms:${m.id}`, kind: 'milestone', title: m.title, desc: m.desc, presetIds: m.presetIds, metric: m.metric, minQty: m.minQty,
        target: m.target, unit: m.unit, periodStart: null, periodEnd: null, status: 'active', rewardEffort: m.effort, rewardGold: m.gold, createdAt: now,
      });
    }

    // This week: three quests and the boss raid
    if (!(await db.quests.where('key').equals(`boss:${wk}`).first())) {
      const hasCollege = Object.values(schedule).some((d) => d.college);
      for (const d of planWeekly({ questMult: rank.questMult, lastWeekRuns: recent.lastWeekRuns, hasCollege, adapt: advice.adapt }, presets)) {
        await addIfNew(buildQuest(d, `weekly:${wk}:${d.slug}`, 'weekly', 'weekly', presets, [wStart, wEnd], now));
      }
      const boss = planBoss(recent.avgWeeklyEffort, hashString(wk));
      const r = bossReward(boss.hp);
      await addIfNew({
        key: `boss:${wk}`, kind: 'boss', title: `Weekly Boss Raid: ${boss.name}`, desc: 'Every task you complete this week damages the boss.', metric: 'effort', target: boss.hp, unit: 'HP',
        periodStart: wStart, periodEnd: wEnd, status: 'active', rewardEffort: r.effort, rewardGold: r.gold, createdAt: now, acceptedAt: now, bossName: boss.name,
      });
    }

    if (mode === 'normal') {
      // Today's daily quests
      if ((await db.quests.where('key').startsWith(`daily:${today}:`).count()) === 0) {
        const regen = await getSetting<number>('regenCount', 0);
        const ctx: DailyCtx = {
          flags, weekday: weekdayOf(today), questMult: rank.questMult, seed: hashString(`${today}|${flags.work}|${flags.college}|${regen}`),
          runsLast7: recent.runsLast7, ranYesterday: recent.ranYesterday, gymLast7: recent.gymLast7, effortByCategory: recent.effortByCategory, exclude: [], adapt: advice.adapt,
        };
        for (const d of planDaily(ctx, presets)) await addIfNew(buildQuest(d, `daily:${today}:${d.slug}`, 'daily', 'daily', presets, [dStart, dEnd], now));
      }

      // Surprise emergency quest (about 15% of days)
      if (!advice.adapt.gentle && hashString(`${today}|emg`) % 100 < 15 && !(await db.quests.where('key').equals(`emergency:${today}`).first())) {
        const rng = mulberry32(hashString(`${today}|emg2`));
        const options: [string, number][] = [['walk', 15], ['bodyweight', 20], ['chores', 1], ['journal', 1], ['pending', 1]];
        const ids = new Set(presets.map((p) => p.id));
        const usable = options.filter(([id]) => ids.has(id));
        if (usable.length) {
          const [id, qty] = usable[Math.floor(rng() * usable.length)];
          const p = presets.find((x) => x.id === id)!;
          const target = p.unit === 'none' ? 1 : qty;
          const draft: QuestDraft = {
            slug: id, title: `Emergency: ${p.name}${p.unit === 'none' ? '' : ` ${target} ${UNIT_SHORT[p.unit]}`}`, desc: 'A surprise bonus quest. It disappears tonight, no penalty if you skip it.',
            presetIds: [id], metric: p.unit === 'none' ? 'logs' : 'qty', target, unit: UNIT_SHORT[p.unit] || 'x', reward: { presetId: id, qty: target, repeats: 1 },
          };
          await addIfNew(buildQuest(draft, `emergency:${today}`, 'emergency', 'emergency', presets, [dStart, dEnd], now));
        }
      }
    }

    // Recurring quests you created
    for (const t of await db.questTemplates.toArray()) {
      if (!t.active) continue;
      const preset = presets.find((p) => p.id === t.presetId);
      if (!preset) continue;
      const isDaily = t.period === 'daily';
      const periodKey = isDaily ? today : wk;
      const draft: QuestDraft = {
        slug: String(t.id), title: t.title, presetIds: [t.presetId], metric: preset.unit === 'none' ? 'logs' : 'qty', target: t.target,
        unit: UNIT_SHORT[preset.unit] || 'x',
        reward: { presetId: t.presetId, qty: preset.unit === 'none' ? 1 : t.target, repeats: 1 },
      };
      const q = buildQuest(draft, `rec:${t.id}:${periodKey}`, 'custom', 'custom', presets, isDaily ? [dStart, dEnd] : [wStart, wEnd], now, 'active');
      await addIfNew({ ...q, recurringId: t.id });
    }
  });
}

/** Re-roll today's daily quests that you haven't accepted yet (e.g. after changing the day type). */
export async function regenerateDaily(now = Date.now()): Promise<void> {
  const today = dayKey(now);
  await db.transaction('rw', questTables(), async () => {
    const offered = (await db.quests.where('key').startsWith(`daily:${today}:`).toArray()).filter((q) => q.status === 'offered');
    for (const q of offered) await db.quests.delete(q.id!);
    await setSetting('regenCount', (await getSetting<number>('regenCount', 0)) + 1);
  });
  await ensureQuestsExcludingAccepted(now);
}

/** Like ensureQuests but only fills today's dailies, skipping tasks that already have an accepted quest. */
async function ensureQuestsExcludingAccepted(now: number): Promise<void> {
  const today = dayKey(now);
  await db.transaction('rw', questTables(), async () => {
    const existing = await db.quests.where('key').startsWith(`daily:${today}:`).toArray();
    const [presets, logs, flags, profile] = await Promise.all([db.presets.toArray(), db.logs.toArray(), getTodayFlags(now), ensureProfile()]);
    const mode = await getSetting<PlayMode>('mode', 'normal');
    if (mode !== 'normal') return;
    const rank = rankInfoForLevel(levelFromXp(profile.totalXp).level);
    const recent = recentContext(logs, now);
    const regen = await getSetting<number>('regenCount', 0);
    const dStart = dayStartTs(today);
    const advice = buildAdvice(await loadSnapshot(now));
    const ctx: DailyCtx = {
      flags, weekday: weekdayOf(today), questMult: rank.questMult, seed: hashString(`${today}|${flags.work}|${flags.college}|${regen}`),
      runsLast7: recent.runsLast7, ranYesterday: recent.ranYesterday, gymLast7: recent.gymLast7, effortByCategory: recent.effortByCategory,
      exclude: existing.flatMap((q) => q.presetIds ?? []), adapt: advice.adapt,
    };
    let total = existing.length;
    for (const d of planDaily(ctx, presets)) {
      if (total >= 5) break;
      total++;
      await addIfNew(buildQuest(d, `daily:${today}:${d.slug}`, 'daily', 'daily', presets, [dStart, dayStartTs(shiftDay(today, 1))], now));
    }
  });
}

// ---------- player actions on quests ----------

export async function acceptQuest(id: number, now = Date.now()): Promise<void> {
  const q = await db.quests.get(id);
  if (q?.status === 'offered') await db.quests.update(id, { status: 'active', acceptedAt: now });
}

export async function acceptAllDaily(now = Date.now()): Promise<void> {
  const today = dayStartTs(dayKey(now));
  const list = (await db.quests.where('status').equals('offered').toArray()).filter((q) => q.periodStart === today && (q.kind === 'daily' || q.kind === 'emergency'));
  for (const q of list) await db.quests.update(q.id!, { status: 'active', acceptedAt: now });
}

/** Kinds you choose to accept, so you can also take that back. */
const UNDOABLE: Quest['kind'][] = ['daily', 'weekly', 'emergency'];
export const canUndoQuest = (q: Pick<Quest, 'kind'>): boolean => UNDOABLE.includes(q.kind);

/** Changed your mind after accepting? Puts the quest back to "new". It never counts against you. */
export async function unacceptQuest(id: number): Promise<void> {
  const q = await db.quests.get(id);
  if (q && q.status === 'active' && canUndoQuest(q)) await db.quests.update(id, { status: 'offered', acceptedAt: undefined });
}

/** Skipped by mistake? Brings it back, as long as its day or week is not over. */
export async function restoreQuest(id: number, now = Date.now()): Promise<void> {
  const q = await db.quests.get(id);
  if (q && q.status === 'skipped' && canUndoQuest(q) && (q.periodEnd === null || now < q.periodEnd)) await db.quests.update(id, { status: 'offered', acceptedAt: undefined });
}

/** Skipping never costs anything. */
export async function skipQuest(id: number): Promise<void> {
  const q = await db.quests.get(id);
  if (q && (q.status === 'offered' || q.status === 'active') && q.kind !== 'boss' && q.kind !== 'milestone') await db.quests.update(id, { status: 'skipped' });
}

export interface CustomQuestInput {
  presetId: string;
  target: number;
  /** today / week = one-off, daily / weekly = repeats. */
  period: 'today' | 'week' | 'daily' | 'weekly';
  title?: string;
}

export async function addCustomQuest(input: CustomQuestInput, now = Date.now()): Promise<void> {
  const preset = await db.presets.get(input.presetId);
  if (!preset) throw new Error('Unknown task');
  const target = Math.max(preset.unit === 'none' ? 1 : 0.5, input.target);
  const title = input.title?.trim() || (preset.unit === 'none' ? preset.name : `${preset.name}: ${target}`);
  if (input.period === 'daily' || input.period === 'weekly') {
    await db.questTemplates.add({ title, presetId: input.presetId, target, period: input.period, active: true, createdAt: now });
    await ensureQuests(now);
    await settleQuests(now);
    return;
  }
  const today = dayKey(now);
  const wk = weekStartKey(today);
  const period: [number, number] = input.period === 'today' ? [dayStartTs(today), dayStartTs(shiftDay(today, 1))] : [dayStartTs(wk), dayStartTs(shiftDay(wk, 7))];
  const presets = await db.presets.toArray();
  const draft: QuestDraft = {
    slug: 'x', title, presetIds: [input.presetId], metric: preset.unit === 'none' ? 'logs' : 'qty', target,
    unit: UNIT_SHORT[preset.unit] || 'x',
    reward: { presetId: input.presetId, qty: preset.unit === 'none' ? 1 : target, repeats: 1 },
  };
  await db.quests.add(buildQuest(draft, `custom:${now}:${Math.floor(Math.random() * 1e6)}`, 'custom', 'custom', presets, period, now, 'active') as Quest);
  await settleQuests(now);
}

export async function stopRecurring(templateId: number): Promise<void> {
  await db.questTemplates.update(templateId, { active: false });
  // Remove today's/this week's copy if you haven't made progress on it
  for (const q of (await db.quests.toArray()).filter((x) => x.recurringId === templateId && (x.status === 'active' || x.status === 'offered'))) {
    await db.quests.update(q.id!, { status: 'skipped' });
  }
}
