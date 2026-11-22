import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SystemWindow } from '../components/SystemWindow';
import { btnGhost, btnPrimary, inputCls } from '../components/ui';
import { db } from '../db/db';
import { dayKey } from '../engine/streak';
import { deleteJournal, ENERGIES, MOODS, saveJournal } from '../game/journal';
import { useCelebrate } from '../store/celebrate';

/** End-of-day journal: how you feel (mood, energy) and anything you want to remember. */
export default function Journal() {
  const today = dayKey(Date.now());
  const entry = useLiveQuery(() => db.journal.get(today), [today]);
  const recent = useLiveQuery(() => db.journal.orderBy('ts').reverse().limit(14).toArray(), [], []);
  const announce = useCelebrate((s) => s.announce);
  const say = useCelebrate((s) => s.say);
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Fill the form once with today's entry if there is one
  useEffect(() => {
    if (!loaded && entry !== undefined) {
      if (entry) { setMood(entry.mood); setEnergy(entry.energy); setText(entry.text); }
      setLoaded(true);
    }
  }, [entry, loaded]);

  const scale = (label: string, icons: string[], value: number, set: (n: number) => void) => (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wider text-muted">{label}</p>
      <div className="grid grid-cols-5 gap-2" role="group" aria-label={label}>
        {icons.map((ic, i) => (
          <button key={i} aria-pressed={value === i + 1} onClick={() => set(i + 1)}
            className={`h-14 rounded-lg border text-2xl ${value === i + 1 ? 'border-accent bg-accent/15' : 'border-line'}`}>{ic}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Link to="/profile" className="inline-block text-accent">← Back</Link>
      <SystemWindow title={entry ? "Today's entry" : 'End-of-day journal'}>
        <div className="space-y-4">
          {scale('Mood', MOODS, mood, setMood)}
          {scale('Energy', ENERGIES, energy, setEnergy)}
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-muted">Anything to remember? (optional)</p>
            <textarea className={`${inputCls} h-32 py-2`} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="What went well? What was hard?" />
          </div>
          <button className={btnPrimary} onClick={async () => {
            const { result } = await saveJournal({ mood, energy, text });
            if (result) announce(result); else say('[SYSTEM] Entry updated.');
          }}>{entry ? 'Update entry' : 'Save entry'}</button>
          <p className="text-xs text-muted">Your first entry each day earns Journaling XP. The text stays on this phone and is never analysed or sent anywhere. Only your mood and energy ratings feed the System's advice.</p>
        </div>
      </SystemWindow>

      <SystemWindow title="Recent entries">
        {recent.length === 0 && <p className="text-muted">Nothing yet.</p>}
        <ul className="space-y-2 text-sm">
          {recent.map((e) => (
            <li key={e.id} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{e.id}</span>
                <span>{MOODS[e.mood - 1]} {ENERGIES[e.energy - 1]}</span>
              </div>
              {e.text && <p className="mt-1 whitespace-pre-wrap text-muted">{e.text}</p>}
              <button className={`${btnGhost} mt-2 min-h-9 px-3 text-xs text-red-300`} onClick={async () => { if (confirm('Delete this entry?')) { await deleteJournal(e.id); say('[SYSTEM] Entry deleted.'); } }}>Delete</button>
            </li>
          ))}
        </ul>
      </SystemWindow>
    </div>
  );
}
