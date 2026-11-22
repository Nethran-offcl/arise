import { useState } from 'react';
import { addReward, buyItem, deleteShopItem, refundPurchase, updateShopItem, useDoubleXp as drinkPotion, useRestPass } from '../game/shop';
import { useDoubleXp, useInventory, useProfile, usePurchases, useShop } from '../hooks';
import type { ShopItem } from '../engine/shop';
import { useCelebrate } from '../store/celebrate';
import { SystemWindow } from './SystemWindow';
import { btnGhost, btnPrimary, Field, inputCls, Sheet } from './ui';

/** Shop (spend gold on real-life rewards you define + 3 consumables), your bag, and spending history. */
export function ShopPanel() {
  const profile = useProfile();
  const items = useShop();
  const bag = useInventory();
  const purchases = usePurchases();
  const potion = useDoubleXp();
  const say = useCelebrate((s) => s.say);
  const [editing, setEditing] = useState<ShopItem | 'new' | null>(null);
  const gold = profile?.gold ?? 0;
  const potionActive = !!potion && potion.until > Date.now();

  const run = async (p: Promise<{ ok: boolean; reason?: string }>, okMsg: string) => {
    const r = await p;
    say(r.ok ? `[SYSTEM] ${okMsg}` : `[SYSTEM] ${r.reason}`);
  };

  return (
    <div className="space-y-4">
      <SystemWindow title="Shop">
        <p className="mb-3 text-lg font-bold glow-text">🪙 {gold.toLocaleString()} gold</p>
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-lg border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{it.icon} {it.name}</p>
                  {it.note && <p className="text-xs text-muted">{it.note}</p>}
                </div>
                <button className="min-h-11 shrink-0 rounded-lg border border-accent px-3 text-accent disabled:border-line disabled:text-muted"
                  disabled={gold < it.price} onClick={() => void run(buyItem(it.id), `Bought ${it.name}.`)}>
                  {it.price} 🪙
                </button>
              </div>
              <div className="mt-1 flex justify-between text-xs">
                <span className="text-muted">{it.kind === 'consumable' ? `You own ${bag[it.id] ?? 0}` : 'Real-life reward: enjoy it, then it is logged'}</span>
                <button className="text-accent" onClick={() => setEditing(it)}>Edit</button>
              </div>
            </li>
          ))}
        </ul>
        <button className={`${btnGhost} mt-3 w-full`} onClick={() => setEditing('new')}>＋ Add a reward</button>
        <p className="mt-2 text-xs text-muted">Add your own, like "Watch an episode: 50 gold", "Cheat meal: 150 gold" or "New shoes: 2000 gold". Prices are yours to set.</p>
      </SystemWindow>

      <SystemWindow title="Your bag">
        <ul className="space-y-3 text-sm">
          <li className="flex items-center justify-between gap-2">
            <span>🛌 Rest Day Pass × {bag['rest-pass'] ?? 0}</span>
            <button className={btnGhost} disabled={!bag['rest-pass']} onClick={() => void run(useRestPass(), 'Today is protected. Rest well.')}>Use today</button>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>🛡️ Streak Shield × {bag.shield ?? 0}</span>
            <span className="text-xs text-muted">Used automatically if you miss a day</span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>⚗️ Double XP Potion × {bag['double-xp'] ?? 0}{potionActive && <span className="ml-1 text-accent">active until {new Date(potion!.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}</span>
            <button className={btnGhost} disabled={!bag['double-xp'] || potionActive} onClick={() => void run(drinkPotion(), 'Double XP for 24 hours!')}>Drink</button>
          </li>
        </ul>
      </SystemWindow>

      <SystemWindow title="Spending history">
        {purchases.length === 0 && <p className="text-sm text-muted">Nothing bought yet.</p>}
        <ul className="divide-y divide-line text-sm">
          {purchases.map((pu) => (
            <li key={pu.id} className="flex items-center justify-between gap-2 py-2">
              <span>{pu.name}<span className="block text-xs text-muted">{new Date(pu.ts).toLocaleDateString()} · {pu.price} 🪙</span></span>
              <button className="px-2 text-accent" onClick={() => void run(refundPurchase(pu.id!), 'Refunded.')}>Undo</button>
            </li>
          ))}
        </ul>
      </SystemWindow>

      {editing && (
        <Sheet title={editing === 'new' ? 'New reward' : 'Edit item'} onClose={() => setEditing(null)}>
          <ItemForm item={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
        </Sheet>
      )}
    </div>
  );
}

function ItemForm({ item, onDone }: { item?: ShopItem; onDone: () => void }) {
  const say = useCelebrate((s) => s.say);
  const [name, setName] = useState(item?.name ?? '');
  const [price, setPrice] = useState(String(item?.price ?? 50));
  const [icon, setIcon] = useState(item?.icon ?? '🎁');
  const [note, setNote] = useState(item?.note ?? '');
  const locked = item?.builtin; // built-in consumables can only be re-priced

  return (
    <div className="space-y-3">
      {!locked && <Field label="Reward name"><input className={inputCls} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Watch an episode" /></Field>}
      <Field label="Price (gold)"><input className={inputCls} type="number" inputMode="numeric" min={1} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
      {!locked && <Field label="Icon (any emoji)"><input className={inputCls} value={icon} maxLength={4} onChange={(e) => setIcon(e.target.value)} /></Field>}
      {!locked && <Field label="Note (optional)"><input className={inputCls} value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} /></Field>}
      <button className={btnPrimary} disabled={!locked && !name.trim()} onClick={async () => {
        if (item) await updateShopItem({ ...item, name: locked ? item.name : name.trim(), price: Number(price) || 1, icon: locked ? item.icon : icon, note: locked ? item.note : note || undefined });
        else await addReward(name, Number(price) || 1, icon, note || undefined);
        say('[SYSTEM] Shop updated.');
        onDone();
      }}>Save</button>
      {item && !locked && (
        <button className={`${btnGhost} w-full text-red-300`} onClick={async () => {
          if (confirm(`Remove "${item.name}" from the shop?`)) { await deleteShopItem(item.id); onDone(); }
        }}>Remove from shop</button>
      )}
    </div>
  );
}
