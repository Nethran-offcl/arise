import Dexie, { type EntityTable } from 'dexie';
import type { Lift, MuscleId } from '../engine/lifts';
import type { Quest, QuestTemplate } from '../engine/quests';
import type { InventoryRow, Purchase, ShopItem } from '../engine/shop';
import { emptyStats, type Category, type Intensity, type Preset, type Stats } from '../engine/types';

/** Single-row player profile (id is always 1). Level and rank are derived from totalXp. */
export interface Profile {
  id: number;
  name: string;
  title: string;
  totalXp: number;
  gold: number;
  hp: number;
  maxHp: number;
  stats: Stats;
  /** Stat points already spent (free points = 3 per level - spent). */
  spentPoints: number;
  createdAt: number;
}

/** A logged real-life task or penalty. Stores the exact effects so edit/delete can reverse them. */
export interface LogEntry {
  id?: number;
  ts: number; // when it happened (supports backdating)
  presetId: string;
  categoryId: string;
  label: string;
  qty: number;
  unit: string;
  intensity: Intensity;
  /** Signed: positive for rewards, negative for penalties (what was actually applied). */
  xp: number;
  gold: number;
  hp: number;
  statGains: Partial<Stats>;
  isPenalty: boolean;
  breaksStreak: boolean;
  /** True when Rest/Sick mode switched this penalty off. */
  paused?: boolean;
  /** Result you entered for improvement tracking (pace in min/km, weight in kg, rating...). */
  /** Exercises done in a gym session, each with its weight and reps. */
  lifts?: Lift[];
  /** Bedtime and wake time (timestamps) for sleep entries. */
  sleep?: { bed: number; wake: number };
  perf?: number;
  /** Progress bonus applied (0.2 = +20%) and whether it set a personal record. */
  perfBonus?: number;
  pr?: boolean;
  /** XP for the effort itself, before level scaling (drives mastery and stats). */
  effortXp?: number;
  levelScale?: number;
  masteryBonus?: number;
  note?: string;
  demo?: boolean;
}

/** A saved exercise you can pick again (bench press, squat, ...). */
export interface Exercise {
  id: string;
  name: string;
  muscle: MuscleId;
  createdAt: number;
}

/** An extracted habit: gives a small permanent XP bonus in its category. */
export interface Shadow {
  id: string; // the preset it came from
  name: string;
  categoryId: string;
  extractedAt: number;
}

/** One journal entry per day (id is the day, e.g. "2026-11-23"). The text never leaves the phone. */
export interface JournalEntry {
  id: string;
  ts: number;
  mood: number;
  energy: number;
  text: string;
}

/** Key/value app settings (theme, formula, mode, AI toggle, Worker URL...). */
export interface Setting {
  key: string;
  value: unknown;
}

export class AriseDB extends Dexie {
  profile!: EntityTable<Profile, 'id'>;
  logs!: EntityTable<LogEntry, 'id'>;
  settings!: EntityTable<Setting, 'key'>;
  categories!: EntityTable<Category, 'id'>;
  presets!: EntityTable<Preset, 'id'>;
  quests!: EntityTable<Quest, 'id'>;
  questTemplates!: EntityTable<QuestTemplate, 'id'>;
  shop!: EntityTable<ShopItem, 'id'>;
  purchases!: EntityTable<Purchase, 'id'>;
  inventory!: EntityTable<InventoryRow, 'id'>;
  shadows!: EntityTable<Shadow, 'id'>;
  journal!: EntityTable<JournalEntry, 'id'>;
  exercises!: EntityTable<Exercise, 'id'>;

  constructor() {
    super('arise');
    // Each phase that needs new tables adds a new .version(n); old data is migrated, never lost.
    this.version(1).stores({
      profile: 'id',
      logs: '++id, ts, category, isPenalty',
      settings: 'key',
    });
    this.version(2)
      .stores({
        profile: 'id',
        logs: '++id, ts, categoryId, presetId, isPenalty',
        settings: 'key',
        categories: 'id, order',
        presets: 'id, categoryId',
      })
      .upgrade((tx) =>
        tx
          .table('profile')
          .toCollection()
          .modify((p: Record<string, unknown>) => {
            p.totalXp = 0;
            p.hp = 100;
            p.maxHp = 100;
            p.stats = emptyStats();
            p.spentPoints = 0;
            delete p.level;
            delete p.xp;
          }),
      );
    // v3: quests, repeating quest templates, the shop, purchase history and consumables.
    this.version(3).stores({
      profile: 'id',
      logs: '++id, ts, categoryId, presetId, isPenalty',
      settings: 'key',
      categories: 'id, order',
      presets: 'id, categoryId',
      quests: '++id, &key, kind, status, periodStart',
      questTemplates: '++id',
      shop: 'id, order',
      purchases: '++id, ts',
      inventory: 'id',
    });
    // v4: Shadow Army and the daily journal.
    this.version(4).stores({
      profile: 'id',
      logs: '++id, ts, categoryId, presetId, isPenalty',
      settings: 'key',
      categories: 'id, order',
      presets: 'id, categoryId',
      quests: '++id, &key, kind, status, periodStart',
      questTemplates: '++id',
      shop: 'id, order',
      purchases: '++id, ts',
      inventory: 'id',
      shadows: 'id, categoryId',
      journal: 'id, ts',
    });
    // v5: saved exercises for the strength tracker.
    this.version(5).stores({
      profile: 'id',
      logs: '++id, ts, categoryId, presetId, isPenalty',
      settings: 'key',
      categories: 'id, order',
      presets: 'id, categoryId',
      quests: '++id, &key, kind, status, periodStart',
      questTemplates: '++id',
      shop: 'id, order',
      purchases: '++id, ts',
      inventory: 'id',
      shadows: 'id, categoryId',
      journal: 'id, ts',
      exercises: 'id, muscle',
    });
  }
}

export const db = new AriseDB();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}
export const setSetting = (key: string, value: unknown) => db.settings.put({ key, value });

/**
 * Asks the browser to never auto-delete our data when storage runs low.
 * Returns whether storage is now persistent (installed PWAs usually get it).
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}

export const newProfile = (): Profile => ({
  id: 1,
  name: 'Player',
  title: 'The Awakened',
  totalXp: 0,
  gold: 0,
  hp: 100,
  maxHp: 100,
  stats: emptyStats(),
  spentPoints: 0,
  createdAt: Date.now(),
});

/** Creates the default Player on first launch and returns the profile. */
export async function ensureProfile(): Promise<Profile> {
  const existing = await db.profile.get(1);
  if (existing) return existing;
  const fresh = newProfile();
  await db.profile.put(fresh);
  return fresh;
}
