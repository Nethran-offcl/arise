import { useState } from 'react';
import { CategoryForm } from '../components/CategoryForm';
import { LogForm } from '../components/LogForm';
import { SleepForm } from '../components/SleepForm';
import { PresetForm } from '../components/PresetForm';
import { SystemWindow } from '../components/SystemWindow';
import { btnGhost, Segmented, Sheet } from '../components/ui';
import { deleteLog } from '../game/actions';
import type { LogEntry } from '../db/db';
import { UNIT_SHORT, type Preset } from '../engine/types';
import { useCategories, usePresets, useRecentLogs } from '../hooks';

type Tab = 'task' | 'penalty';

export default function Log() {
  const cats = useCategories();
  const presets = usePresets();
  const [limit, setLimit] = useState(40);
  const logs = useRecentLogs(limit);
  const [tab, setTab] = useState<Tab>('task');
  const [catId, setCatId] = useState<string>('');
  const [active, setActive] = useState<Preset | null>(null);
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const [newCat, setNewCat] = useState(false);

  const taskCats = cats.filter((c) => c.kind === 'task');
  const selectedCat = catId || taskCats[0]?.id || '';
  const list = tab === 'penalty' ? presets.filter((p) => p.isPenalty && !p.hidden) : presets.filter((p) => p.categoryId === selectedCat);
  const editingPreset = editing ? presets.find((p) => p.id === editing.presetId) : undefined;

  return (
    <div className="space-y-4">
      <SystemWindow title="Log">
        <Segmented label="Log type" value={tab} onChange={setTab}
          options={[{ id: 'task', label: 'Task done' }, { id: 'penalty', label: 'Course correction' }]} />

        {tab === 'task' && (
          <button className={`${btnGhost} mt-3 w-full`} onClick={() => setSleeping(true)}>😴 Log last night's sleep</button>
        )}

        {tab === 'task' && (
          <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Categories">
            {taskCats.map((c) => (
              <button key={c.id} role="tab" aria-selected={selectedCat === c.id} onClick={() => setCatId(c.id)}
                className={`shrink-0 rounded-full border px-4 text-sm ${selectedCat === c.id ? 'border-accent text-accent' : 'border-line text-muted'}`}>
                {c.icon} {c.name}
              </button>
            ))}
            <button onClick={() => setNewCat(true)} className="shrink-0 rounded-full border border-dashed border-accent px-4 text-sm text-accent">＋ Category</button>
          </div>
        )}
        {tab === 'penalty' && (
          <p className="mt-3 text-sm text-muted">[SYSTEM] Slipped up? Log it honestly. Penalties are small and never shaming. Rest/Sick mode pauses them.</p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          {list.map((p) => (
            <button key={p.id} onClick={() => (p.id === 'sleep-hours' ? setSleeping(true) : setActive(p))}
              className="min-h-14 rounded-lg border border-line bg-black/30 px-3 py-2 text-left text-sm active:border-accent">
              {p.name}
            </button>
          ))}
          {tab === 'task' && (
            <button onClick={() => setCreating(true)} className="min-h-14 rounded-lg border border-dashed border-accent px-3 py-2 text-sm text-accent">
              ＋ Custom task
            </button>
          )}
        </div>
      </SystemWindow>

      <SystemWindow title="Recent logs">
        {logs.length === 0 && <p className="text-muted">Nothing logged yet. Pick a task above.</p>}
        <ul className="divide-y divide-line">
          {logs.map((l) => (
            <li key={l.id}>
              <button onClick={() => setEditing(l)} className="flex w-full items-center justify-between gap-2 py-2 text-left">
                <span>
                  <span className="block">{l.label}{l.unit !== 'none' && ` · ${l.qty} ${(UNIT_SHORT as Record<string, string>)[l.unit] ?? ''}`}</span>
                  <span className="block text-xs text-muted">{new Date(l.ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}{l.paused ? ' · paused' : ''}</span>
                </span>
                <span className={l.isPenalty ? 'text-red-300' : 'text-accent'}>{l.xp > 0 ? '+' : ''}{l.xp.toLocaleString()} XP{l.pr ? ' 🏆' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
        {logs.length >= limit && <button className={`${btnGhost} mt-3 w-full`} onClick={() => setLimit(limit + 40)}>Show older logs</button>}
      </SystemWindow>

      {sleeping && <Sheet title="Sleep" onClose={() => setSleeping(false)}><SleepForm onDone={() => setSleeping(false)} /></Sheet>}
      {active && <Sheet title="Log" onClose={() => setActive(null)}><LogForm preset={active} onDone={() => setActive(null)} /></Sheet>}
      {editing && (
        <Sheet title="Edit log" onClose={() => setEditing(null)}>
          {editing.presetId === 'sleep-hours'
            ? <SleepForm existing={editing} onDone={() => setEditing(null)} />
            : editingPreset
            ? <LogForm preset={editingPreset} existing={editing} onDone={() => setEditing(null)} />
            : (
              <div className="space-y-3">
                <p className="text-muted">The task "{editing.label}" was deleted, so this log can't be edited. You can still remove it.</p>
                <button className={`${btnGhost} w-full text-red-300`} onClick={async () => {
                  if (confirm('Delete this log? Its XP, gold and stat gains will be removed.')) { await deleteLog(editing.id!); setEditing(null); }
                }}>Delete log</button>
              </div>
            )}
        </Sheet>
      )}
      {newCat && (
        <Sheet title="New category" onClose={() => setNewCat(false)}>
          <CategoryForm onDone={(id) => { setNewCat(false); if (id) setCatId(id); }} />
        </Sheet>
      )}
      {creating && (
        <Sheet title="Custom task" onClose={() => setCreating(false)}>
          <PresetForm defaultCategory={selectedCat} onDone={(saved) => { setCreating(false); if (saved) setActive(saved); }} />
        </Sheet>
      )}
    </div>
  );
}
