import Dexie, { type EntityTable } from 'dexie';

/** Single-row player profile (id is always 1). Extended in Phase 2. */
export interface Profile {
  id: number;
  name: string;
  title: string;
  level: number;
  xp: number;
  gold: number;
  createdAt: number;
}

/** A logged real-life task or penalty. Fully used from Phase 2. */
export interface LogEntry {
  id?: number;
  ts: number; // when it happened (supports backdating)
  category: string;
  label: string;
  quantity?: number;
  unit?: string;
  xp: number;
  gold: number;
  isPenalty: boolean;
  note?: string;
}

/** Key/value app settings (theme, AI toggle, Worker URL, formulas...). */
export interface Setting {
  key: string;
  value: unknown;
}

export class AriseDB extends Dexie {
  profile!: EntityTable<Profile, 'id'>;
  logs!: EntityTable<LogEntry, 'id'>;
  settings!: EntityTable<Setting, 'key'>;

  constructor() {
    super('arise');
    // Each phase that needs new tables adds a new .version(n) here; old data is migrated, never lost.
    this.version(1).stores({
      profile: 'id',
      logs: '++id, ts, category, isPenalty',
      settings: 'key',
    });
  }
}

export const db = new AriseDB();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}
export const setSetting = (key: string, value: unknown) => db.settings.put({ key, value });

/** Creates the default Player on first launch and returns the profile. */
export async function ensureProfile(): Promise<Profile> {
  const existing = await db.profile.get(1);
  if (existing) return existing;
  const fresh: Profile = { id: 1, name: 'Player', title: 'The Awakened', level: 1, xp: 0, gold: 0, createdAt: Date.now() };
  await db.profile.put(fresh);
  return fresh;
}
