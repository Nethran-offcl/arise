import type { Category, Preset, UnitKind, Weights } from './types';

/** Starter categories. Everything here can be edited, and you can add your own. */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cardio', name: 'Cardio', icon: '🏃', weights: { AGI: 1 }, kind: 'task', order: 1 },
  { id: 'strength', name: 'Strength', icon: '🏋️', weights: { STR: 1 }, kind: 'task', order: 2 },
  { id: 'sports', name: 'Sports', icon: '🏸', weights: { AGI: 0.6, STR: 0.4 }, kind: 'task', order: 3 },
  { id: 'study', name: 'Study', icon: '📚', weights: { INT: 1 }, kind: 'task', order: 4 },
  { id: 'work', name: 'Work', icon: '💼', weights: { DIS: 0.8, INT: 0.2 }, kind: 'task', order: 5 },
  { id: 'tasks', name: 'Tasks & Chores', icon: '🧹', weights: { DIS: 1 }, kind: 'task', order: 6 },
  { id: 'recovery', name: 'Recovery', icon: '🌙', weights: { VIT: 1 }, kind: 'task', order: 7 },
  { id: 'mind', name: 'Mind', icon: '🧠', weights: { SEN: 1 }, kind: 'task', order: 8 },
  { id: 'penalty', name: 'Course Corrections', icon: '⚠️', weights: {}, kind: 'penalty', order: 99 },
];

interface P {
  id: string;
  c: string;
  n: string;
  u?: UnitKind;
  q?: number;
  b?: number; // base XP
  x?: number; // XP per unit
  g?: number; // base gold
  gu?: number; // gold per unit
  hp?: number;
  hpu?: number; // HP per unit
  w?: Weights;
}

const task = (p: P): Preset => ({
  id: p.id,
  categoryId: p.c,
  name: p.n,
  unit: p.u ?? 'none',
  defaultQty: p.q ?? 1,
  baseXp: p.b ?? 0,
  xpPerUnit: p.x ?? 0,
  baseGold: p.g ?? 0,
  goldPerUnit: p.gu ?? 0,
  hpDelta: p.hp ?? 0,
  hpPerUnit: p.hpu ?? 0,
  weights: p.w,
  isPenalty: false,
  breaksStreak: false,
  builtin: true,
});

const penalty = (
  id: string,
  name: string,
  xpLoss: number,
  hpLoss: number,
  breaksStreak: boolean,
  quest: Preset['penaltyQuest'],
): Preset => ({
  id,
  categoryId: 'penalty',
  name,
  unit: 'none',
  defaultQty: 1,
  baseXp: xpLoss,
  xpPerUnit: 0,
  baseGold: 0,
  goldPerUnit: 0,
  hpDelta: -hpLoss,
  hpPerUnit: 0,
  isPenalty: true,
  breaksStreak,
  penaltyQuest: quest,
  builtin: true,
});

export const DEFAULT_PRESETS: Preset[] = [
  // Cardio (AGI)
  task({ id: 'run', c: 'cardio', n: 'Run', u: 'km', q: 3, b: 10, x: 30, g: 3, gu: 8, hpu: -2 }),
  task({ id: 'walk', c: 'cardio', n: 'Walk', u: 'minutes', q: 30, x: 0.8, gu: 0.3, hpu: -0.03 }),
  // Strength (STR)
  task({ id: 'gym', c: 'strength', n: 'Gym session', u: 'minutes', q: 45, b: 10, x: 0.9, g: 5, gu: 0.3, hpu: -0.2 }),
  task({ id: 'bodyweight', c: 'strength', n: 'Bodyweight reps', u: 'count', q: 20, x: 0.5, gu: 0.2 }),
  // Sports (AGI + STR)
  task({ id: 'badminton', c: 'sports', n: 'Badminton', u: 'minutes', q: 60, b: 5, x: 0.9, gu: 0.3, hpu: -0.15 }),
  task({ id: 'basketball', c: 'sports', n: 'Basketball', u: 'minutes', q: 60, b: 5, x: 0.9, gu: 0.3, hpu: -0.15 }),
  task({ id: 'volleyball', c: 'sports', n: 'Volleyball', u: 'minutes', q: 60, b: 5, x: 0.9, gu: 0.3, hpu: -0.15 }),
  // Study (INT)
  task({ id: 'study', c: 'study', n: 'Study session', u: 'hours', q: 1, x: 40, gu: 10 }),
  task({ id: 'assignment', c: 'study', n: 'Finish assignment', u: 'count', q: 1, x: 60, gu: 25 }),
  task({ id: 'reading', c: 'study', n: 'Reading', u: 'minutes', q: 30, x: 0.6, gu: 0.2 }),
  // Work (DIS)
  task({ id: 'office', c: 'work', n: 'Office task done', u: 'count', q: 1, x: 20, gu: 6 }),
  // Tasks & chores (DIS)
  task({ id: 'pending', c: 'tasks', n: 'Clear a pending task', u: 'count', q: 1, x: 15, gu: 5 }),
  task({ id: 'chores', c: 'tasks', n: 'House chores', u: 'count', q: 1, x: 15, gu: 5 }),
  // Recovery (VIT)
  task({ id: 'sleep-hours', c: 'recovery', n: 'Slept', u: 'hours', q: 8, x: 6, gu: 1, hpu: 2.5 }),
  task({ id: 'sleep-ontime', c: 'recovery', n: 'Slept on time', b: 25, g: 5, hp: 10 }),
  task({ id: 'wake-ontime', c: 'recovery', n: 'Woke on time', b: 20, g: 4 }),
  task({ id: 'water', c: 'recovery', n: 'Drink water', u: 'count', q: 1, x: 3, gu: 1, hp: 1 }),
  task({ id: 'healthy-meal', c: 'recovery', n: 'Healthy meal', u: 'count', q: 1, x: 12, gu: 3, hp: 2 }),
  task({ id: 'meal-prep', c: 'recovery', n: 'Meal prep', b: 25, g: 8, w: { VIT: 0.6, DIS: 0.4 } }),
  // Mind (SEN)
  task({ id: 'journal', c: 'mind', n: 'Journaling', b: 15, g: 4 }),
  task({ id: 'planning', c: 'mind', n: 'Plan the day/week', b: 12, g: 3 }),
  task({ id: 'review', c: 'mind', n: 'Reflect & review', b: 20, g: 5 }),
  // Course corrections (gentle: small XP loss, never any food restriction as a "fix")
  penalty('p-junk', 'Junk food / binge', 5, 3, false, { text: 'Drink a glass of water and take a short walk.', presetId: 'walk', qty: 15 }),
  penalty('p-sugar', 'Sugary drink', 3, 2, false, { text: 'Have a glass of water.', presetId: 'water', qty: 1 }),
  penalty('p-skip-workout', 'Skipped planned workout', 8, 3, true, { text: 'Do 20 bodyweight reps (about 5 minutes).', presetId: 'bodyweight', qty: 20 }),
  penalty('p-late-sleep', 'Late-night sleep', 8, 6, true, { text: 'Aim for an early bedtime tonight.', presetId: 'sleep-ontime', qty: 1 }),
  penalty('p-doomscroll', 'Procrastination / doomscrolling', 8, 3, true, { text: 'Take a 15-minute walk to reset.', presetId: 'walk', qty: 15 }),
  penalty('p-deadline', 'Missed a deadline', 10, 4, true, { text: 'Clear one small pending task now.', presetId: 'pending', qty: 1 }),
  penalty('p-skip-meal', 'Skipped a meal', 4, 4, false, { text: 'Have a proper meal or snack when you can.', presetId: 'healthy-meal', qty: 1 }),
];
