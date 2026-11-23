import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getSetting, setSetting } from '../db/db';
import { xpAtLevelStart } from '../engine/levels';
import { dayKey } from '../engine/streak';
import { logActivity, resetAllData, setMode } from './actions';
import { buildBackup, restoreBackup } from './backup';
import { cancelFocus, claimFocus, focusProgress, getFocus, startFocus } from './focus';
import { deleteJournal, saveJournal } from './journal';
import { loadHabits } from './shadows';
import { dailyTick } from './startup';
import { loadSnapshot } from './system';
import { equipTitle, getUnlocked, loadTrophyRows } from './trophies';

const DAY = 86_400_000;
const base = { intensity: 'normal' as const };
const now0 = () => Date.now();

beforeEach(async () => {
  await resetAllData();
});

describe('Shadow Army', () => {
  it('21 consecutive days of a daily habit extracts a Shadow, exactly once', async () => {
    let extracted = 0;
    for (let i = 20; i >= 0; i--) {
      const r = await logActivity({ ...base, presetId: 'water', qty: 2, ts: now0() - i * DAY });
      extracted += r.shadowsExtracted.length;
      if (i > 0) expect(r.shadowsExtracted).toHaveLength(0);
    }
    expect(extracted).toBe(1);
    const shadow = (await db.shadows.get('water'))!;
    expect(shadow.name).toBe('Drink water Shadow');
    expect(shadow.categoryId).toBe('recovery');
    const again = await logActivity({ ...base, presetId: 'water', qty: 2, ts: now0() + 1000 });
    expect(again.shadowsExtracted).toHaveLength(0);
  });

  it('gives a permanent +5% XP in that category', async () => {
    const sleepBefore = (await logActivity({ ...base, presetId: 'sleep-hours', qty: 8, ts: now0() - 40 * DAY })).xp; // recovery, no shadow yet
    for (let i = 20; i >= 0; i--) await logActivity({ ...base, presetId: 'water', qty: 2, ts: now0() - i * DAY });
    const level1 = (await db.profile.get(1))!;
    await db.profile.update(1, { totalXp: xpAtLevelStart(1) }); // same level scale for a fair comparison
    const sleepAfter = (await logActivity({ ...base, presetId: 'sleep-hours', qty: 8, ts: now0() - 39 * DAY })).xp;
    expect(level1.totalXp).toBeGreaterThan(0);
    // 48 effort x 1.02 (the 21 water logs earned Recovery mastery level 1) x 1.05 (the new Shadow)
    expect(sleepBefore).toBe(48);
    expect(sleepAfter).toBe(Math.round(48 * 1.02 * 1.05));
    // other categories are untouched
    const study = (await logActivity({ ...base, presetId: 'study', qty: 1, ts: now0() })).xp;
    expect(study).toBe(40);
  });

  it('a weekly habit like running needs 21 sessions with no gap over a week', async () => {
    let got = 0;
    for (let i = 20; i >= 0; i--) got += (await logActivity({ ...base, presetId: 'run', qty: 3, ts: now0() - i * 5 * DAY })).shadowsExtracted.length;
    expect(got).toBe(1);
  });

  it('a long gap restarts the chain', async () => {
    let got = 0;
    for (let i = 20; i >= 0; i--) {
      const shift = i > 10 ? 20 : 0; // the older ten days happened 20 days earlier: a 20-day gap in the middle
      got += (await logActivity({ ...base, presetId: 'water', qty: 2, ts: now0() - i * DAY - shift * DAY })).shadowsExtracted.length;
    }
    expect(got).toBe(0);
  });

  it('shows habits in training with progress, and your army', async () => {
    for (let i = 4; i >= 0; i--) await logActivity({ ...base, presetId: 'journal', qty: 1, ts: now0() - i * DAY });
    const { training, army } = await loadHabits();
    const j = training.find((h) => h.preset.id === 'journal')!;
    expect(j.progress.count).toBe(5);
    expect(army).toHaveLength(0);
  });

  it('penalties never become Shadows', async () => {
    for (let i = 20; i >= 0; i--) await logActivity({ ...base, presetId: 'p-doomscroll', qty: 1, ts: now0() - i * DAY });
    expect(await db.shadows.count()).toBe(0);
  });
});

describe('trophies and titles', () => {
  it('unlocks once and tells you', async () => {
    const first = await logActivity({ ...base, presetId: 'walk', qty: 30, ts: now0() });
    expect(first.trophiesUnlocked.map((t) => t.id)).toContain('first-log');
    const second = await logActivity({ ...base, presetId: 'walk', qty: 30, ts: now0() + 1000 });
    expect(second.trophiesUnlocked.map((t) => t.id)).not.toContain('first-log');
    expect(Object.keys(await getUnlocked())).toContain('first-log');
  });

  it('remembers your best streak even after it breaks', async () => {
    for (const i of [8, 7, 6]) await logActivity({ ...base, presetId: 'walk', qty: 30, ts: now0() - i * DAY });
    await logActivity({ ...base, presetId: 'walk', qty: 30, ts: now0() });
    expect(await getSetting<number>('bestStreak', 0)).toBeGreaterThanOrEqual(1);
    for (const i of [3, 2, 1]) await logActivity({ ...base, presetId: 'walk', qty: 30, ts: now0() - i * DAY });
    expect(await getSetting<number>('bestStreak', 0)).toBe(4);
  });

  it('shows progress toward locked trophies and lets you wear an unlocked title', async () => {
    await logActivity({ ...base, presetId: 'walk', qty: 30, ts: now0() });
    const rows = await loadTrophyRows();
    const logs100 = rows.find((r) => r.trophy.id === 'logs-100')!;
    expect(logs100.done).toBe(false);
    expect(logs100.value).toBe(1);
    expect(rows.find((r) => r.trophy.id === 'first-log')!.unlockedAt).not.toBeNull();
    await equipTitle('Fresh Spark');
    expect((await db.profile.get(1))!.title).toBe('Fresh Spark');
  });

  it('defeating a boss and clearing the daily set count toward trophies', async () => {
    await dailyTick();
    const boss = (await db.quests.where('kind').equals('boss').first())!;
    await db.quests.update(boss.id!, { target: 10 });
    const r = await logActivity({ ...base, presetId: 'run', qty: 3, ts: now0() });
    expect(r.trophiesUnlocked.map((t) => t.id)).toContain('boss-1');
    expect(await getSetting<number>('bossesDefeatedTotal', 0)).toBe(1);
    for (const q of await db.quests.where('key').startsWith(`daily:${dayKey(now0())}:`).toArray()) {
      const input = q.metric === 'effort' ? { presetId: 'study', qty: q.target / 40 + 0.1 } : { presetId: q.presetIds![0], qty: q.metric === 'logs' ? 1 : q.target };
      await logActivity({ ...base, ...input, ts: now0() });
    }
    expect(await getSetting<number>('dailySetsCleared', 0)).toBe(1);
  });
});

describe('journal', () => {
  it('pays Journaling XP once a day, edits are free, ratings are clamped', async () => {
    const first = await saveJournal({ mood: 4, energy: 3, text: 'Good day' });
    expect(first.result!.xp).toBeGreaterThan(0);
    const edit = await saveJournal({ mood: 9, energy: 0, text: 'Edited' });
    expect(edit.result).toBeUndefined();
    const e = (await db.journal.get(dayKey(now0())))!;
    expect(e.mood).toBe(5);
    expect(e.energy).toBe(1);
    expect(e.text).toBe('Edited');
    expect(await db.logs.where('presetId').equals('journal').count()).toBe(1);
  });

  it('only the ratings reach the System, never the text', async () => {
    await saveJournal({ mood: 2, energy: 2, text: 'private thoughts' });
    const snap = await loadSnapshot();
    expect(snap.journal).toEqual([{ day: dayKey(now0()), mood: 2, energy: 2 }]);
    expect(JSON.stringify(snap)).not.toContain('private thoughts');
    await deleteJournal(dayKey(now0()));
    expect((await loadSnapshot()).journal).toEqual([]);
  });
});

describe('focus timer', () => {
  it('counts down using timestamps, so it survives closing the app', () => {
    const t = { startedAt: 1_000_000, minutes: 25, presetId: 'focus' };
    expect(focusProgress(t, 1_000_000).fraction).toBe(0);
    expect(focusProgress(t, 1_000_000 + 12.5 * 60_000).fraction).toBeCloseTo(0.5, 5);
    expect(focusProgress(t, 1_000_000 + 25 * 60_000).done).toBe(true);
    expect(focusProgress(t, 1_000_000 + 30 * 60_000).remainingMs).toBe(0);
  });

  it('pays only for a finished session, and only once', async () => {
    const t0 = now0() - 30 * 60_000;
    await startFocus(25, 'focus', t0);
    expect(await claimFocus(t0 + 10 * 60_000)).toBeNull(); // not finished yet
    expect(await getFocus()).not.toBeNull();
    const r = (await claimFocus(t0 + 26 * 60_000))!;
    expect(r.xp).toBeGreaterThan(0);
    expect((await db.logs.where('presetId').equals('focus').first())!.qty).toBe(25);
    expect(await claimFocus(t0 + 27 * 60_000)).toBeNull(); // no double pay
    expect(await getFocus()).toBeNull();
  });

  it('can count as study hours, and can be cancelled for free', async () => {
    const t0 = now0() - 61 * 60_000;
    await startFocus(60, 'study', t0);
    const r = (await claimFocus(now0()))!;
    expect(r.xp).toBe(40);
    expect((await db.logs.where('presetId').equals('study').first())!.qty).toBe(1);
    await startFocus(25, 'focus');
    await cancelFocus();
    expect(await getFocus()).toBeNull();
    expect(await db.logs.where('presetId').equals('focus').count()).toBe(0);
  });

  it('focus and the meal tasks exist for new and upgraded installs', async () => {
    for (const id of ['focus', 'meal-okay', 'healthy-meal', 'p-junk']) expect(await db.presets.get(id)).toBeTruthy();
    await db.presets.delete('focus');
    await setSetting('seedVersion', 7);
    await dailyTick();
    expect(await db.presets.get('focus')).toBeTruthy();
  });
});

describe('upgrade repairs', () => {
  it('an open "Drink water: 6 x" quest from before the litres change becomes 2 L', async () => {
    await dailyTick();
    const q = (await db.quests.where('key').startsWith(`daily:${dayKey(now0())}:`).toArray()).find((x) => x.presetIds?.[0] === 'water')!;
    await db.quests.update(q.id!, { target: 6, unit: 'x', title: 'Drink water: 6 x' });
    await setSetting('seedVersion', 8);
    await dailyTick();
    const fixed = (await db.quests.get(q.id!))!;
    expect(fixed.target).toBe(2);
    expect(fixed.unit).toBe('L');
    expect(fixed.title).toBe('Drink water: 2 L');
  });
});

describe('backup includes shadows and journal', () => {
  it('round-trips them', async () => {
    await dailyTick();
    await saveJournal({ mood: 3, energy: 4, text: 'hello' });
    await db.shadows.put({ id: 'water', name: 'Drink water Shadow', categoryId: 'recovery', extractedAt: 1 });
    const text = JSON.stringify(await buildBackup());
    await resetAllData();
    await restoreBackup(text);
    expect(await db.shadows.count()).toBe(1);
    expect((await db.journal.toArray())[0].text).toBe('hello');
  });
  it('rest mode is unaffected', async () => {
    await setMode('rest');
    expect((await loadSnapshot()).mode).toBe('rest');
  });
});
