import { db, ensureProfile, getSetting, setSetting } from '../db/db';
import { DEFAULT_SHOP, DOUBLE_XP_MS, type ShopItem } from '../engine/shop';
import { dayKey } from '../engine/streak';

/** First launch (and upgrades): gives you the three built-in consumables. Never re-adds what you deleted. */
export async function ensureShopSeed(): Promise<void> {
  if (await getSetting<boolean>('shopSeeded', false)) return;
  for (const item of DEFAULT_SHOP) if (!(await db.shop.get(item.id))) await db.shop.put(item);
  await setSetting('shopSeeded', true);
}

/** 2 while a Double XP Potion is active at time `at`, otherwise 1. */
export async function doubleXpBoost(at: number): Promise<number> {
  const d = await getSetting<{ from: number; until: number } | null>('doubleXp', null);
  return d && at >= d.from && at < d.until ? 2 : 1;
}

export const getCount = async (id: string): Promise<number> => (await db.inventory.get(id))?.count ?? 0;

async function addCount(id: string, delta: number): Promise<void> {
  const next = Math.max(0, (await getCount(id)) + delta);
  await db.inventory.put({ id, count: next });
}

export const consumeOne = async (id: string): Promise<boolean> => {
  if ((await getCount(id)) < 1) return false;
  await addCount(id, -1);
  return true;
};

export interface ActionResult {
  ok: boolean;
  reason?: string;
}

/** Spend gold. Real-life rewards are just recorded ("I treated myself"); consumables go to your bag. */
export async function buyItem(id: string): Promise<ActionResult> {
  return db.transaction('rw', [db.shop, db.profile, db.purchases, db.inventory], async () => {
    const item = await db.shop.get(id);
    if (!item) return { ok: false, reason: 'That item no longer exists.' };
    const p = await ensureProfile();
    if (p.gold < item.price) return { ok: false, reason: `You need ${item.price - p.gold} more gold.` };
    await db.profile.update(1, { gold: p.gold - item.price });
    if (item.kind === 'consumable') await addCount(item.id, 1);
    await db.purchases.add({ ts: Date.now(), itemId: item.id, name: item.name, price: item.price, kind: item.kind });
    return { ok: true };
  });
}

/** Undo a purchase and get the gold back. A consumable you already used can't be refunded. */
export async function refundPurchase(purchaseId: number): Promise<ActionResult> {
  return db.transaction('rw', [db.profile, db.purchases, db.inventory], async () => {
    const pur = await db.purchases.get(purchaseId);
    if (!pur) return { ok: false, reason: 'Purchase not found.' };
    if (pur.kind === 'consumable') {
      if ((await getCount(pur.itemId)) < 1) return { ok: false, reason: 'You already used it, so it cannot be refunded.' };
      await addCount(pur.itemId, -1);
    }
    const p = await ensureProfile();
    await db.profile.update(1, { gold: p.gold + pur.price });
    await db.purchases.delete(purchaseId);
    return { ok: true };
  });
}

/** Rest Day Pass: today pauses penalties and streak loss, but you can still earn XP. */
export async function useRestPass(now = Date.now()): Promise<ActionResult> {
  return db.transaction('rw', [db.inventory, db.settings], async () => {
    const today = dayKey(now);
    const days = new Set(await getSetting<string[]>('pausedDays', []));
    if (days.has(today)) return { ok: false, reason: 'Today is already protected.' };
    if (!(await consumeOne('rest-pass'))) return { ok: false, reason: 'You have no Rest Day Pass.' };
    days.add(today);
    await setSetting('pausedDays', [...days]);
    return { ok: true };
  });
}

export async function useDoubleXp(now = Date.now()): Promise<ActionResult> {
  return db.transaction('rw', [db.inventory, db.settings], async () => {
    if ((await doubleXpBoost(now)) > 1) return { ok: false, reason: 'A potion is already active.' };
    if (!(await consumeOne('double-xp'))) return { ok: false, reason: 'You have no Double XP Potion.' };
    await setSetting('doubleXp', { from: now, until: now + DOUBLE_XP_MS });
    return { ok: true };
  });
}

/** Add your own real-life reward, e.g. "Watch an episode" for 50 gold. */
export async function addReward(name: string, price: number, icon = '🎁', note?: string): Promise<void> {
  const order = (await db.shop.count()) + 1;
  await db.shop.put({ id: `reward-${Date.now().toString(36)}`, name: name.trim(), price: Math.max(1, Math.round(price)), kind: 'reward', icon: icon || '🎁', note, builtin: false, order });
}

export const updateShopItem = (item: ShopItem) => db.shop.put({ ...item, price: Math.max(1, Math.round(item.price)) });

/** Built-in consumables can be re-priced but not removed. */
export async function deleteShopItem(id: string): Promise<boolean> {
  const item = await db.shop.get(id);
  if (!item || item.builtin) return false;
  await db.shop.delete(id);
  return true;
}
