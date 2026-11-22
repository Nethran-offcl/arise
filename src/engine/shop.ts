/** SHOP: rewards YOU define (priced in gold) plus three built-in consumables. */
export type ConsumableEffect = 'rest-pass' | 'shield' | 'double-xp';

export interface ShopItem {
  id: string;
  name: string;
  price: number;
  kind: 'reward' | 'consumable';
  effect?: ConsumableEffect;
  icon: string;
  note?: string;
  builtin: boolean;
  order: number;
}

export interface Purchase {
  id?: number;
  ts: number;
  itemId: string;
  name: string;
  price: number;
  kind: ShopItem['kind'];
}

export interface InventoryRow {
  id: string;
  count: number;
}

export const DEFAULT_SHOP: ShopItem[] = [
  { id: 'rest-pass', name: 'Rest Day Pass', price: 150, kind: 'consumable', effect: 'rest-pass', icon: '🛌', note: 'Pause penalties and streak loss for today, without switching to Rest mode.', builtin: true, order: 1 },
  { id: 'shield', name: 'Streak Shield', price: 200, kind: 'consumable', effect: 'shield', icon: '🛡️', note: 'Automatically saves your streak the next time you miss a day.', builtin: true, order: 2 },
  { id: 'double-xp', name: 'Double XP Potion', price: 250, kind: 'consumable', effect: 'double-xp', icon: '⚗️', note: 'Doubles XP from logs and quests for 24 hours after you drink it.', builtin: true, order: 3 },
];

export const DOUBLE_XP_MS = 24 * 3_600_000;
