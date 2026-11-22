import { useState } from 'react';
import { db } from '../db/db';
import type { StatKey } from '../engine/types';
import { STAT_KEYS, STAT_LABEL } from '../engine/types';
import { useCategories } from '../hooks';
import { useCelebrate } from '../store/celebrate';
import { btnPrimary, Field, inputCls } from './ui';

/** Create your own category, e.g. "Music practice" that grows INT. */
export function CategoryForm({ onDone }: { onDone: (id?: string) => void }) {
  const cats = useCategories();
  const say = useCelebrate((s) => s.say);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('⭐');
  const [stat, setStat] = useState<StatKey>('DIS');

  return (
    <div className="space-y-3">
      <Field label="Category name"><input className={inputCls} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="e.g. Music practice" /></Field>
      <Field label="Icon (any emoji)"><input className={inputCls} value={icon} maxLength={4} onChange={(e) => setIcon(e.target.value)} /></Field>
      <Field label="Which stat does it grow?">
        <select className={inputCls} value={stat} onChange={(e) => setStat(e.target.value as StatKey)}>
          {STAT_KEYS.map((k) => <option key={k} value={k}>{k} - {STAT_LABEL[k]}</option>)}
        </select>
      </Field>
      <button className={btnPrimary} disabled={!name.trim()} onClick={async () => {
        const id = `cat-${Date.now().toString(36)}`;
        await db.categories.put({ id, name: name.trim(), icon: icon || '⭐', weights: { [stat]: 1 }, kind: 'task', order: cats.length });
        say('[SYSTEM] Category created. Add a custom task to it.');
        onDone(id);
      }}>Create category</button>
    </div>
  );
}
