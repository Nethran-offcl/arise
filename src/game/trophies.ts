import { db, getSetting, setSetting } from '../db/db';
import { levelFromXp } from '../engine/levels';
import { RANKS, rankInfoForLevel } from '../engine/ranks';
import { computeStreak, dayKey } from '../engine/streak';
import { evaluateTrophies, type TrophyCtx, type TrophyStatus } from '../engine/trophies';

export interface UnlockedTrophy {
  id: string;
  name: string;
  icon: string;
  title?: string;
}

/** Gathers everything the trophy list needs (a handful of cheap queries). */
export async function loadTrophyCtx(now = Date.now()): Promise<TrophyCtx> {
  const [profile, recent, paused, logsTotal, shadows, purchases, journalDays, lastBackup, questsDone, bosses, sets, milestones] = await Promise.all([
    db.profile.get(1),
    db.logs.where('ts').above(now - 366 * 86_400_000).toArray(),
    getSetting<string[]>('pausedDays', []),
    db.logs.count(),
    db.shadows.count(),
    db.purchases.count(),
    db.journal.count(),
    getSetting<number | null>('lastBackup', null),
    getSetting<number>('questsCompletedTotal', 0),
    getSetting<number>('bossesDefeatedTotal', 0),
    getSetting<number>('dailySetsCleared', 0),
    db.quests.where('kind').equals('milestone').filter((q) => q.status === 'completed').count(),
  ]);
  const streak = computeStreak(recent, new Set(paused), now);
  const best = Math.max(streak, await getSetting<number>('bestStreak', 0));
  const byPreset = async (id: string) => db.logs.where('presetId').equals(id).filter((l) => !l.isPenalty).toArray();
  const [runs, study, sleep, water, focus, prs] = await Promise.all([
    byPreset('run'), byPreset('study'), byPreset('sleep-hours'), byPreset('water'), byPreset('focus'),
    db.logs.filter((l) => !!l.pr).count(),
  ]);
  const waterByDay = new Map<string, number>();
  for (const l of water) waterByDay.set(dayKey(l.ts), (waterByDay.get(dayKey(l.ts)) ?? 0) + l.qty);
  const level = levelFromXp(profile?.totalXp ?? 0).level;
  return {
    level,
    rankIndex: RANKS.findIndex((r) => r.rank === rankInfoForLevel(level).rank),
    streak,
    bestStreak: best,
    logsTotal,
    questsDone,
    bossesDefeated: bosses,
    milestonesDone: milestones,
    dailySets: sets,
    shadows,
    purchases,
    prs,
    studyHours: study.reduce((s, l) => s + l.qty, 0),
    runKm: runs.reduce((s, l) => s + l.qty, 0),
    longestRun: runs.reduce((m, l) => Math.max(m, l.qty), 0),
    goodSleepNights: new Set(sleep.filter((l) => l.qty >= 7).map((l) => dayKey(l.ts))).size,
    waterGoalDays: [...waterByDay.values()].filter((v) => v >= 2).length,
    focusSessions: focus.length,
    journalDays,
    hasBackup: !!lastBackup,
  };
}

export const getUnlocked = () => getSetting<Record<string, number>>('trophies', {});

/** Unlocks any newly earned trophies (each only once) and remembers your best streak. Call inside a transaction. */
export async function checkTrophies(now = Date.now()): Promise<UnlockedTrophy[]> {
  const ctx = await loadTrophyCtx(now);
  if (ctx.streak > (await getSetting<number>('bestStreak', 0))) await setSetting('bestStreak', ctx.streak);
  const have = await getUnlocked();
  const fresh = evaluateTrophies(ctx).filter((s) => s.done && !have[s.trophy.id]);
  if (!fresh.length) return [];
  const next = { ...have };
  for (const s of fresh) next[s.trophy.id] = now;
  await setSetting('trophies', next);
  return fresh.map((s) => ({ id: s.trophy.id, name: s.trophy.name, icon: s.trophy.icon, title: s.trophy.title }));
}

export interface TrophyRow extends TrophyStatus {
  unlockedAt: number | null;
}

/** All trophies with progress, for the Trophies page. */
export async function loadTrophyRows(now = Date.now()): Promise<TrophyRow[]> {
  const [ctx, have] = await Promise.all([loadTrophyCtx(now), getUnlocked()]);
  return evaluateTrophies(ctx).map((s) => ({ ...s, done: s.done || !!have[s.trophy.id], unlockedAt: have[s.trophy.id] ?? null }));
}

/** Wear an unlocked title on your profile. */
export const equipTitle = (title: string) => db.profile.update(1, { title });
