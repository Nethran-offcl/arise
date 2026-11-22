import { getSetting, setSetting } from '../db/db';
import { logActivity, type LogResult } from './actions';

/** A running focus (Pomodoro) session. Stored as timestamps, so it keeps counting while the app is closed. */
export interface FocusTimer {
  startedAt: number;
  minutes: number;
  presetId: string;
}

export const FOCUS_CHOICES = [15, 25, 45, 60];

export const getFocus = () => getSetting<FocusTimer | null>('focusTimer', null);
export const startFocus = (minutes: number, presetId: string, now = Date.now()) => setSetting('focusTimer', { startedAt: now, minutes, presetId });
export const cancelFocus = () => setSetting('focusTimer', null);

export function focusProgress(t: FocusTimer, now = Date.now()): { remainingMs: number; done: boolean; fraction: number } {
  const total = t.minutes * 60_000;
  const remainingMs = Math.max(0, t.startedAt + total - now);
  return { remainingMs, done: remainingMs <= 0, fraction: Math.min(1, (total - remainingMs) / total) };
}

/** Pays for a finished session (only once, and only if the full time has passed). */
export async function claimFocus(now = Date.now()): Promise<LogResult | null> {
  const t = await getFocus();
  if (!t || !focusProgress(t, now).done) return null;
  await cancelFocus(); // clear first so a double tap can never pay twice
  const endedAt = Math.min(now, t.startedAt + t.minutes * 60_000);
  // "Study" is measured in hours, the Focus task in minutes
  const qty = t.presetId === 'study' ? t.minutes / 60 : t.minutes;
  return logActivity({ presetId: t.presetId, qty, intensity: 'normal', ts: endedAt });
}
