import { db, type JournalEntry } from '../db/db';
import { dayKey } from '../engine/streak';
import { logActivity, type LogResult } from './actions';

export const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
export const ENERGIES = ['🪫', '😴', '😌', '⚡', '🔥'];

const clamp15 = (n: number) => Math.min(5, Math.max(1, Math.round(n)));

/**
 * Saves today's journal entry. Your first entry of the day earns the Journaling XP; editing it later never pays twice.
 * The text stays on this phone. Only the two ratings are ever used by the System's analysis.
 */
export async function saveJournal(input: { mood: number; energy: number; text: string }, now = Date.now()): Promise<{ result?: LogResult }> {
  const day = dayKey(now);
  const existing = await db.journal.get(day);
  const entry: JournalEntry = { id: day, ts: existing?.ts ?? now, mood: clamp15(input.mood), energy: clamp15(input.energy), text: input.text.trim().slice(0, 2000) };
  await db.journal.put(entry);
  if (existing || !(await db.presets.get('journal'))) return {};
  return { result: await logActivity({ presetId: 'journal', qty: 1, intensity: 'normal', ts: now }) };
}

export const deleteJournal = (day: string) => db.journal.delete(day);
