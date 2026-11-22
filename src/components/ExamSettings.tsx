import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { dayKey } from '../engine/streak';
import { addDeadline, getDeadlines, getExam, removeDeadline, setExam } from '../game/system';
import { SystemWindow } from './SystemWindow';
import { btnGhost, Field, inputCls } from './ui';

/** Exam mode and deadlines: quests lean toward study and workout targets drop as dates get close. */
export function ExamSettings() {
  const exam = useLiveQuery(getExam, [], undefined);
  const deadlines = useLiveQuery(getDeadlines, [], []);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const today = dayKey(Date.now());

  return (
    <SystemWindow title="Exam mode & deadlines">
      <p className="mb-3 text-sm text-muted">
        When an exam is near, daily and weekly quests shift toward study, workout targets go down, and the last 3 days are gentle. A deadline in the next 3 days triggers a study focus too.
      </p>
      {exam && (
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input type="checkbox" className="h-6 w-6" checked={exam.active} onChange={(e) => void setExam({ ...exam, active: e.target.checked })} />
            <span>Exam mode</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Exam name"><input className={inputCls} value={exam.name} maxLength={30} placeholder="e.g. Finals" onChange={(e) => void setExam({ ...exam, name: e.target.value })} /></Field>
            <Field label="Exam date"><input className={inputCls} type="date" min={today} value={exam.date ?? ''} onChange={(e) => void setExam({ ...exam, date: e.target.value || null })} /></Field>
          </div>
        </div>
      )}

      <p className="mb-1 mt-4 text-xs uppercase tracking-wider text-muted">Deadlines</p>
      <ul className="divide-y divide-line text-sm">
        {deadlines.length === 0 && <li className="py-2 text-muted">No deadlines yet.</li>}
        {deadlines.map((d) => (
          <li key={d.id} className="flex items-center justify-between py-2">
            <span>{d.title} <span className="text-muted">· {d.date}</span></span>
            <button className="px-2 text-red-300" onClick={() => void removeDeadline(d.id)}>Remove</button>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input className={inputCls} placeholder="Assignment name" value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} aria-label="Deadline name" />
        <input className={inputCls} type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Deadline date" />
      </div>
      <button className={`${btnGhost} mt-2 w-full`} disabled={!title.trim() || !date} onClick={async () => { await addDeadline(title, date); setTitle(''); setDate(''); }}>＋ Add deadline</button>
    </SystemWindow>
  );
}
