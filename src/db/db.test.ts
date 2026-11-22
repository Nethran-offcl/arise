import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db, ensureProfile, getSetting, setSetting } from './db';

describe('data layer', () => {
  it('creates a default profile once', async () => {
    const a = await ensureProfile();
    const b = await ensureProfile();
    expect(a.totalXp).toBe(0);
    expect(b.createdAt).toBe(a.createdAt);
    expect(await db.profile.count()).toBe(1);
  });
  it('stores and reads settings with fallback', async () => {
    expect(await getSetting('nope', 42)).toBe(42);
    await setSetting('theme', 'monarch');
    expect(await getSetting('theme', 'system')).toBe('monarch');
  });
});
