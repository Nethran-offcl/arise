import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PresetForm } from '../components/PresetForm';
import { SystemWindow } from '../components/SystemWindow';
import { CategoryForm } from '../components/CategoryForm';
import { btnGhost, Sheet } from '../components/ui';
import { db } from '../db/db';
import type { Category, Preset } from '../engine/types';
import { useCategories, usePresets } from '../hooks';
import { useCelebrate } from '../store/celebrate';

/** Manage presets (edit XP/gold values, delete, add) and add your own categories. */
export default function Presets() {
  const cats = useCategories();
  const presets = usePresets();
  const say = useCelebrate((s) => s.say);
  const [editing, setEditing] = useState<Preset | 'new' | null>(null);
  const [newCat, setNewCat] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);

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
          <button className="mt-2 text-sm text-accent" onClick={() => setEditCat(c)}>Edit category</button>
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

      {editCat && (
        <Sheet title="Edit category" onClose={() => setEditCat(null)}>
          <CategoryForm initial={editCat} onDone={() => setEditCat(null)} />
        </Sheet>
      )}

      {newCat && (
        <Sheet title="New category" onClose={() => setNewCat(false)}>
          <CategoryForm onDone={() => setNewCat(false)} />
        </Sheet>
      )}
    </div>
  );
}
