import { SystemWindow } from '../components/SystemWindow';
import { useUI, type Theme } from '../store/ui';

const themes: { id: Theme; label: string }[] = [
  { id: 'system', label: 'System Blue' },
  { id: 'monarch', label: 'Shadow Monarch' },
  { id: 'minimal', label: 'Minimal' },
];

export default function Profile() {
  const { theme, setTheme } = useUI();
  return (
    <div className="space-y-4">
      <SystemWindow title="Theme">
        <div className="grid grid-cols-1 gap-2">
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              aria-pressed={theme === t.id}
              className={`rounded-lg border px-4 text-left ${theme === t.id ? 'border-accent text-accent' : 'border-line text-ink'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </SystemWindow>
      <SystemWindow title="Shop & Profile">
        <p className="text-muted">[SYSTEM] Shop and full profile unlock in Phases 2-3.</p>
      </SystemWindow>
    </div>
  );
}
