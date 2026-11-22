import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PresetForm } from '../components/PresetForm';
import { SystemWindow } from '../components/SystemWindow';
import { btnGhost, Field, inputCls, Sheet } from '../components/ui';
import { db } from '../db/db';
import type { Preset, StatKey } from '../engine/types';
import { STAT_KEYS } from '../engine/types';
import { useCategories, usePresets } from '../hooks';
import { useCelebrate } from '../store/celebrate';

/** Manage presets (edit XP/gold values, delete, add) and add your own categories. */
export default function Presets() {
  const cats = useCategories();
  const presets = usePresets();
  const say = useCelebrate((s) => s.say);
  const [editing, setEditing] = useState<Preset | 'new' | null>(null);
  const [newCat, setNewCat] = useState(false);
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('⭐');
  const [catStat, setCatStat] = useState<StatKey>('DIS');

  return (
    <div className="space-y-4">
      <Link to="/profile" className="inline-block text-accent">← Back</Link>

      {cats.filter((c) => c.kind === 'task').map((c) => (
        <SystemWindow key={c.id} title={`${c.icon} ${c.name}`}>
          <ul className="divide-y divide-line">
            {presets.filter((p) => p.categoryId === c.id).map((p) => (
              <li key={p.id}>
                <button className="flex w-full items-center justify-between py-2 text-left" onClick={() => setEditing(p)}>
                  <span>{p.name}</span>
                  <span className="text-xs text-muted">{p.baseXp ? `${p.baseXp} + ` : ''}{p.xpPerUnit}/{p.unit === 'none' ? 'log' : p.unit} XP</span>
                </button>
              </li>
            ))}
          </ul>
        </SystemWindow>
      ))}

      <div className="grid grid-cols-2 gap-2">
        <button className={btnGhost} onClick={() => setEditing('new')}>＋ New task</button>
        <button className={btnGhost} onClick={() => setNewCat(true)}>＋ New category</button>
      </div>

      {editing && (
        <Sheet title={editing === 'new' ? 'New task' : 'Edit task'} onClose={() => setEditing(null)}>
          <PresetForm initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
          {editing !== 'new' && (
            <button className={`${btnGhost} mt-2 w-full text-red-300`} onClick={async () => {
              if (confirm(`Delete "${editing.name}"? Existing logs are kept.`)) {
                await db.presets.delete(editing.id);
                say('[SYSTEM] Task removed.');
                setEditing(null);
              }
            }}>Delete task</button>
          )}
        </Sheet>
      )}

      {newCat && (
        <Sheet title="New category" onClose={() => setNewCat(false)}>
          <div className="space-y-3">
            <Field label="Name"><input className={inputCls} value={catName} maxLength={24} onChange={(e) => setCatName(e.target.value)} /></Field>
            <Field label="Icon (any emoji)"><input className={inputCls} value={catIcon} maxLength={4} onChange={(e) => setCatIcon(e.target.value)} /></Field>
            <Field label="Raises this stat">
              <select className={inputCls} value={catStat} onChange={(e) => setCatStat(e.target.value as StatKey)}>
                {STAT_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Field>
            <button className="min-h-12 w-full rounded-lg bg-accent font-semibold text-black" disabled={!catName.trim()} onClick={async () => {
              await db.categories.put({ id: `cat-${Date.now().toString(36)}`, name: catName.trim(), icon: catIcon || '⭐', weights: { [catStat]: 1 }, kind: 'task', order: cats.length });
              setCatName(''); setNewCat(false); say('[SYSTEM] Category created.');
            }}>Create</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
