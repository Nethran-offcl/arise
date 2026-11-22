import { db, getSetting, setSetting } from '../db/db';
import { computeStreak, dayKey, dayStartTs, daysBetween, shiftDay } from '../engine/streak';
import { logActivity } from './actions';
import { consumeOne } from './shop';

export interface RolloverSummary {
  days: number;
  failed: number;
  penalties: number;
  shieldsUsed: number;
}

const DAY = 86_400_000;

/**
 * Runs when the app opens (and when a new day starts while it is open). For every day that ended since last time:
 *  1. Streak Shield: if you missed the day and have a shield, it is used and the day is protected.
 *  2. Open daily quests expire. Accepted-but-unfinished ones are marked failed, others skipped.
 *  3. If you ACCEPTED daily quests and finished none, one small penalty applies (never on protected days).
 * Then overdue weekly/boss/custom quests expire (no penalty) and old quest history is pruned.
 */
export async function processRollover(now = Date.now()): Promise<RolloverSummary> {
  const summary: RolloverSummary = { days: 0, failed: 0, penalties: 0, shieldsUsed: 0 };
  const today = dayKey(now);
  const last = await getSetting<string | null>('lastRollover', null);
  if (!last) {
    await setSetting('lastRollover', today);
    return summary;
  }

  const n = Math.min(30, Math.max(0, daysBetween(last, today)));
  for (let i = 0; i < n; i++) {
    const D = shiftDay(last, i);
    const dStart = dayStartTs(D);
    const dEnd = dayStartTs(shiftDay(D, 1));
    const paused = new Set(await getSetting<string[]>('pausedDays', []));
    const logs = await db.logs.toArray();

    // 1. Streak Shield
    const dayActive = logs.some((l) => !l.isPenalty && l.ts >= dStart && l.ts < dEnd);
    if (!paused.has(D) && !dayActive && computeStreak(logs, paused, dStart - 3_600_000) > 0 && (await consumeOne('shield'))) {
      paused.add(D);
      await setSetting('pausedDays', [...paused]);
      summary.shieldsUsed++;
    }

    // 2. Expire that day's quests
    const dayQuests = (await db.quests.toArray()).filter((q) => q.periodStart === dStart && q.periodEnd === dEnd && q.kind !== 'weekly' && q.kind !== 'boss');
    for (const q of dayQuests) {
      if (q.status !== 'offered' && q.status !== 'active') continue;
      const failed = !paused.has(D) && q.status === 'active';
      await db.quests.update(q.id!, { status: failed ? 'failed' : 'skipped' });
      if (failed) summary.failed++;
    }

    // 3. Penalty only if you accepted the daily set and finished none of it
    const dailies = dayQuests.filter((q) => q.kind === 'daily');
    if (!paused.has(D) && dailies.some((q) => q.acceptedAt) && !dailies.some((q) => q.status === 'completed')) {
      try {
        await logActivity({ presetId: 'p-quests', qty: 1, intensity: 'normal', ts: dEnd - 60_000 });
        summary.penalties++;
      } catch {
        /* the system penalty preset is missing: skip quietly */
      }
    }
    summary.days++;
    await setSetting('lastRollover', shiftDay(D, 1)); // saved per day so a crash can never double-penalise
  }
  if (last < today) await setSetting('lastRollover', today);

  // Overdue weekly / boss / custom quests expire without penalty
  for (const q of await db.quests.where('status').anyOf('offered', 'active').toArray()) {
    if (q.periodEnd !== null && q.periodEnd <= now) await db.quests.update(q.id!, { status: q.status === 'active' ? 'failed' : 'skipped' });
  }

  // Keep the database lean: drop finished quests older than 60 days (milestones are kept)
  await db.quests.where('periodStart').below(now - 60 * DAY).filter((q) => q.kind !== 'milestone' && q.status !== 'offered' && q.status !== 'active').delete();
  return summary;
}
