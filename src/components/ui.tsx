import type { ReactNode } from 'react';

/** Glowing progress bar (XP, HP, boss HP...). */
export function Bar({ value, max, color = 'var(--accent)', label }: { value: number; max: number; color?: string; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}
      className="h-3 w-full overflow-hidden rounded-full bg-black/50 border border-line">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
    </div>
  );
}

/** Bottom sheet used for forms. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/70" onClick={onClose} role="dialog" aria-modal aria-label={title}>
      <div className="sys-window mx-auto max-h-[92vh] w-full max-w-md overflow-y-auto rounded-b-none p-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="sys-title">[ {title} ]</h2>
          <button onClick={onClose} aria-label="Close" className="px-3 text-xl text-muted">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-lg border border-line p-1">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} aria-pressed={value === o.id}
          className={`flex-1 rounded-md text-sm ${value === o.id ? 'bg-accent/20 text-accent' : 'text-muted'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const inputCls = 'w-full min-h-11 rounded-lg border border-line bg-black/40 px-3 text-ink';
export const btnPrimary = 'min-h-12 w-full rounded-lg bg-accent px-4 font-semibold text-black';
export const btnGhost = 'min-h-11 rounded-lg border border-line px-4 text-ink';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}
