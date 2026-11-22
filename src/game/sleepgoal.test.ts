import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { logActivity, resetAllData } from './actions';
import { DEFAULT_SLEEP_GOAL, getSleepGoal, sanitizeSleepGoal, setSleepGoal } from './sleep';
import { dailyTick } from './startup';
import { generateInsights, sleepGoalLabel, sleepReport } from '../engine/system';
import { loadSnapshot } from './system';

const DAY = 86_400_000;
const sleep = (hoursAgoDays: number, hours: number) => {
  const wake = Date.now() - hoursAgoDays * DAY - 60_000;
  return logActivity({ presetId: 'sleep-hours', qty: hours, intensity: 'normal', ts: wake, sleep: { bed: wake - hours * 3_600_000, wake } });
};

beforeEach(async () => {
  await resetAllData();
  await dailyTick();
});

describe('sleep goal is 7 to 8 hours', () => {
  it('defaults to a 7-8 h range and the System reads it', async () => {
    expect(DEFAULT_SLEEP_GOAL).toEqual({ min: 7, max: 8 });
    expect(await getSleepGoal()).toEqual({ min: 7, max: 8 });
    const s = await loadSnapshot();
    expect(s.sleepTargetHours).toBe(7);
    expect(s.sleepTargetMaxHours).toBe(8);
    expect(sleepGoalLabel(s)).toBe('7-8 h');
  });

  it('a 7 or 7.5 hour night is a good night with no sleep debt (it used to count as short of 8)', async () => {
    await sleep(0, 7);
    await sleep(1, 7.5);
    await sleep(2, 8.5);
    const r = sleepReport(await loadSnapshot(), 14);
    expect(r.debt).toBe(0);
    expect(r.goodNights).toBe(3);
    expect(r.target).toBe(7);
    expect(r.targetMax).toBe(8);
  });

  it('only the hours below 7 count as debt', async () => {
    await sleep(0, 6.5);
    await sleep(1, 5);
    await sleep(2, 7.5);
    expect(sleepReport(await loadSnapshot(), 14).debt).toBeCloseTo(0.5 + 2, 5);
  });

  it('warns about short sleep only when the average is under 7, and names the 7-8 h goal', async () => {
    for (let d = 0; d < 4; d++) await sleep(d, 7.4);
    expect(generateInsights(await loadSnapshot(), 7).some((i) => i.id === 'sleep-low')).toBe(false);
    await resetAllData();
    await dailyTick();
    for (let d = 0; d < 4; d++) await sleep(d, 6.2);
    const low = generateInsights(await loadSnapshot(), 7).find((i) => i.id === 'sleep-low')!;
    expect(low.text).toContain('7-8 h goal');
    expect(low.text).not.toMatch(/8 h target/);
  });
});

describe('editing the goal', () => {
  it('can be changed and is remembered', async () => {
    await setSleepGoal({ min: 6.5, max: 7.5 });
    expect(await getSleepGoal()).toEqual({ min: 6.5, max: 7.5 });
    const s = await loadSnapshot();
    expect(s.sleepTargetHours).toBe(6.5);
    expect(sleepGoalLabel(s)).toBe('6.5-7.5 h');
  });

  it('stays sensible: 4-12 h and the top is never below the bottom', () => {
    expect(sanitizeSleepGoal({ min: 9, max: 6 })).toEqual({ min: 9, max: 9 });
    expect(sanitizeSleepGoal({ min: 1, max: 40 })).toEqual({ min: 4, max: 12 });
    expect(sanitizeSleepGoal({ min: NaN, max: NaN })).toEqual({ min: 4, max: 4 });
    expect(sanitizeSleepGoal({})).toEqual({ min: 7, max: 8 });
  });

  it('a single-number goal still reads naturally', () => {
    expect(sleepGoalLabel({ sleepTargetHours: 8 })).toBe('8 h');
    expect(sleepGoalLabel({ sleepTargetHours: 8, sleepTargetMaxHours: 8 })).toBe('8 h');
  });
});
