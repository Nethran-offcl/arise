import { db, getSetting, type Shadow } from '../db/db';
import { cadenceFor, habitProgress, SHADOW_DAYS, type HabitProgress } from '../engine/shadows';
import { dayKey } from '../engine/streak';
import type { Preset } from '../engine/types';

export interface ExtractedShadow {
  id: string;
  name: string;
  categoryId: string;
}

/** Extracts the Shadow for one habit if its 21-day chain is complete. Call inside a transaction after logging. */
export async function checkShadow(presetId: string, now = Date.now()): Promise<ExtractedShadow[]> {
  if (await db.shadows.get(presetId)) return [];
  const preset = await db.presets.get(presetId);
  if (!preset || preset.isPenalty) return [];
  const logs = await db.logs.where('presetId').equals(presetId).filter((l) => !l.isPenalty).toArray();
  const paused = new Set(await getSetting<string[]>('pausedDays', []));
  const p = habitProgress(logs.map((l) => dayKey(l.ts)), cadenceFor(preset.categoryId), paused, dayKey(now));
  if (p.count < SHADOW_DAYS) return [];
  const shadow: Shadow = { id: presetId, name: `${preset.name} Shadow`, categoryId: preset.categoryId, extractedAt: now };
  await db.shadows.put(shadow);
  return [{ id: shadow.id, name: shadow.name, categoryId: shadow.categoryId }];
}

export interface HabitRow {
  preset: Preset;
  progress: HabitProgress;
  cadence: number;
}

/** Habits in training (any task you have logged in the last 45 days that has no Shadow yet) and your extracted army. */
export async function loadHabits(now = Date.now()): Promise<{ training: HabitRow[]; army: Shadow[] }> {
  const [presets, army, paused] = await Promise.all([db.presets.toArray(), db.shadows.toArray(), getSetting<string[]>('pausedDays', [])]);
  const pausedSet = new Set(paused);
  const extracted = new Set(army.map((s) => s.id));
  const today = dayKey(now);
  const recentIds = new Set((await db.logs.where('ts').above(now - 45 * 86_400_000).toArray()).filter((l) => !l.isPenalty).map((l) => l.presetId));
  const training: HabitRow[] = [];
  for (const preset of presets) {
    if (preset.isPenalty || extracted.has(preset.id) || !recentIds.has(preset.id)) continue;
    const logs = await db.logs.where('presetId').equals(preset.id).filter((l) => !l.isPenalty).toArray();
    const cadence = cadenceFor(preset.categoryId);
    const progress = habitProgress(logs.map((l) => dayKey(l.ts)), cadence, pausedSet, today);
    if (progress.alive) training.push({ preset, progress, cadence });
  }
  training.sort((a, b) => b.progress.count - a.progress.count);
  return { training, army: army.sort((a, b) => a.extractedAt - b.extractedAt) };
}
