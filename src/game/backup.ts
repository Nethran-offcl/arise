import { z } from 'zod';
import { db, setSetting } from '../db/db';
import { dailyTick } from './startup';

/**
 * BACKUP FILE FORMAT (plain JSON, so your data never depends on this app or on Chrome):
 *   { app: "arise", version: 1, exportedAt: <ms>, tables: { profile, logs, settings, categories, presets } }
 * Keep the file anywhere (Files, Google Drive, email yourself). Restore it on any phone or URL.
 */
export const BACKUP_VERSION = 1;

const num = z.number();
const BackupSchema = z.object({
  app: z.literal('arise'),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: num,
  tables: z.object({
    profile: z.array(z.looseObject({ id: num, totalXp: num, gold: num, hp: num, stats: z.record(z.string(), num) })).max(1),
    logs: z.array(z.looseObject({ ts: num, presetId: z.string(), categoryId: z.string(), xp: num, gold: num, hp: num })),
    settings: z.array(z.looseObject({ key: z.string() })),
    categories: z.array(z.looseObject({ id: z.string(), name: z.string() })),
    presets: z.array(z.looseObject({ id: z.string(), categoryId: z.string(), name: z.string() })),
    // added in Phase 3: older backups don't have these
    quests: z.array(z.looseObject({ key: z.string(), kind: z.string() })).default([]),
    questTemplates: z.array(z.looseObject({ presetId: z.string() })).default([]),
    shop: z.array(z.looseObject({ id: z.string(), name: z.string() })).default([]),
    purchases: z.array(z.looseObject({ ts: num })).default([]),
    inventory: z.array(z.looseObject({ id: z.string(), count: num })).default([]),
    shadows: z.array(z.looseObject({ id: z.string(), categoryId: z.string() })).default([]),
    journal: z.array(z.looseObject({ id: z.string(), mood: num, energy: num })).default([]),
    exercises: z.array(z.looseObject({ id: z.string(), name: z.string(), muscle: z.string() })).default([]),
  }),
});
export type Backup = z.infer<typeof BackupSchema>;

export async function buildBackup(now = Date.now()): Promise<Backup> {
  const [profile, logs, settings, categories, presets, quests, questTemplates, shop, purchases, inventory, shadows, journal, exercises] = await Promise.all([
    db.profile.toArray(), db.logs.toArray(), db.settings.toArray(), db.categories.toArray(), db.presets.toArray(),
    db.quests.toArray(), db.questTemplates.toArray(), db.shop.toArray(), db.purchases.toArray(), db.inventory.toArray(), db.shadows.toArray(), db.journal.toArray(), db.exercises.toArray(),
  ]);
  return { app: 'arise', version: BACKUP_VERSION, exportedAt: now, tables: { profile, logs, settings, categories, presets, quests, questTemplates, shop, purchases, inventory, shadows, journal, exercises } } as unknown as Backup;
}

export const backupFileName = (now = Date.now()) => `arise-backup-${new Date(now).toISOString().slice(0, 10)}.json`;

/** Checks a backup file's contents. Throws a readable message when it isn't a valid ARISE backup. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not a valid backup (it is not JSON).');
  }
  const res = BackupSchema.safeParse(raw);
  if (!res.success) throw new Error('That file is not an ARISE backup, or it is damaged. Nothing was changed.');
  return res.data;
}

/** Replaces everything on this device with the backup. All-or-nothing (one transaction). */
export async function restoreBackup(text: string): Promise<{ logs: number }> {
  const b = parseBackup(text); // validate BEFORE touching any data
  const t = b.tables;
  const all = [db.profile, db.logs, db.settings, db.categories, db.presets, db.quests, db.questTemplates, db.shop, db.purchases, db.inventory, db.shadows, db.journal, db.exercises];
  await db.transaction('rw', all, async () => {
    await Promise.all(all.map((t) => t.clear()));
    await db.profile.bulkPut(t.profile as never[]);
    await db.logs.bulkPut(t.logs as never[]);
    await db.settings.bulkPut(t.settings as never[]);
    await db.categories.bulkPut(t.categories as never[]);
    await db.presets.bulkPut(t.presets as never[]);
    await db.quests.bulkPut(t.quests as never[]);
    await db.questTemplates.bulkPut(t.questTemplates as never[]);
    await db.shop.bulkPut(t.shop as never[]);
    await db.purchases.bulkPut(t.purchases as never[]);
    await db.inventory.bulkPut(t.inventory as never[]);
    await db.shadows.bulkPut(t.shadows as never[]);
    await db.journal.bulkPut(t.journal as never[]);
    await db.exercises.bulkPut(t.exercises as never[]);
  });
  await dailyTick(); // runs any data migrations an older backup still needs, then rebuilds today's quests
  return { logs: t.logs.length };
}

/** Saves the backup as a file download. Returns the file name. */
export async function downloadBackup(): Promise<string> {
  const now = Date.now();
  const name = backupFileName(now);
  const blob = new Blob([JSON.stringify(await buildBackup(now))], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  await setSetting('lastBackup', now);
  return name;
}

/** Opens the phone's share sheet (Drive, WhatsApp, email...) with the backup file. False if unsupported. */
export async function shareBackup(): Promise<boolean> {
  const now = Date.now();
  const file = new File([JSON.stringify(await buildBackup(now))], backupFileName(now), { type: 'application/json' });
  if (!navigator.canShare?.({ files: [file] })) return false;
  await navigator.share({ files: [file], title: 'ARISE backup' });
  await setSetting('lastBackup', now);
  return true;
}
