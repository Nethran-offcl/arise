import { db } from '../db/db';

export interface ProgressInputs {
  /** Earlier results for this preset (pace, weight...), oldest first. */
  perfValues: number[];
  /** Effort XP already earned in this category (drives mastery). */
  categoryEffort: number;
}

/** Reads what the progress bonuses need. `excludeLogId` is used when editing a log. */
export async function loadProgressInputs(presetId: string, categoryId: string, excludeLogId?: number, beforeTs?: number): Promise<ProgressInputs> {
  const presetLogs = await db.logs.where('presetId').equals(presetId).toArray();
  const perfValues = presetLogs
    // Only results from BEFORE this log count, so backdating an old run can't steal a record.
    .filter((l) => l.id !== excludeLogId && l.perf != null && l.perf > 0 && (beforeTs === undefined || l.ts < beforeTs))
    .sort((a, b) => a.ts - b.ts)
    .map((l) => l.perf!);
  const catLogs = await db.logs.where('categoryId').equals(categoryId).toArray();
  const categoryEffort = catLogs
    .filter((l) => !l.isPenalty && l.id !== excludeLogId)
    .reduce((sum, l) => sum + (l.effortXp ?? l.xp), 0);
  return { perfValues, categoryEffort };
}
