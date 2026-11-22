import { useState } from 'react';
import { db } from '../db/db';
import type { Category, StatKey } from '../engine/types';
import { STAT_KEYS, STAT_LABEL } from '../engine/types';
import { useCategories, usePresets } from '../hooks';
import { useCelebrate } from '../store/celebrate';
import { btnGhost, btnPrimary, Field, inputCls } from './ui';

const mainStat = (c?: Category): StatKey =>
  c ? ((Object.entries(c.weights).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] as StatKey) ?? 'DIS') : 'DIS';

/** Create or edit a category, e.g. "Music practice" that grows INT. */
export function CategoryForm({ initial, onDone }: { initial?: Category; onDone: (id?: string) => void }) {
  const cats = useCategories();
  const presets = usePresets();
  const say = useCelebrate((s) => s.say);
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '⭐');
  const [stat, setStat] = useState<StatKey>(mainStat(initial));
  const [mastery, setMastery] = useState(initial?.mastery !== false);
  const used = initial ? presets.filter((p) => p.categoryId === initial.id).length : 0;
  const split = initial && Object.keys(initial.weights).length > 1;

  async function save() {
    if (initial) {
      // Keep a multi-stat split (e.g. Sports) unless you pick a different main stat.
      const weights = stat === mainStat(initial) ? initial.weights : { [stat]: 1 };
      await db.categories.put({ ...initial, name: name.trim(), icon: icon || '⭐', weights, mastery });
      say('[SYSTEM] Category updated.');
      onDone(initial.id);
      return;
    }
    const id = `cat-${Date.now().toString(36)}`;
    await db.categories.put({ id, name: name.trim(), icon: icon || '⭐', weights: { [stat]: 1 }, kind: 'task', order: cats.length, mastery });
    say('[SYSTEM] Category created. Add a custom task to it.');
    onDone(id);
  }

  return (
    <div className="space-y-3">
      <Field label="Category name"><input className={inputCls} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="e.g. Music practice" /></Field>
      <Field label="Icon (any emoji)"><input className={inputCls} value={icon} maxLength={4} onChange={(e) => setIcon(e.target.value)} /></Field>
      <Field label="Which stat does it grow?">
        <select className={inputCls} value={stat} onChange={(e) => setStat(e.target.value as StatKey)}>
          {STAT_KEYS.map((k) => <option key={k} value={k}>{k} - {STAT_LABEL[k]}</option>)}
        </select>
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={mastery} onChange={(e) => setMastery(e.target.checked)} />
        <span>Track mastery for this category (tasks pay more as you put effort in)</span>
      </label>
      {split && <p className="text-xs text-muted">This category splits between stats. Keep the main stat to keep the split, or pick another to use that stat only.</p>}
      <button className={btnPrimary} disabled={!name.trim()} onClick={save}>{initial ? 'Save category' : 'Create category'}</button>
      {initial && (
        used === 0
          ? <button className={`${btnGhost} w-full text-red-300`} onClick={async () => {
              if (confirm(`Delete the category "${initial.name}"?`)) { await db.categories.delete(initial.id); say('[SYSTEM] Category deleted.'); onDone(); }
            }}>Delete category</button>
          : <p className="text-xs text-muted">To delete this category, first move or delete its {used} task(s).</p>
      )}
    </div>
  );
}
