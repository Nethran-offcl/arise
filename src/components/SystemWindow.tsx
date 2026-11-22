import type { ReactNode } from 'react';

/** The signature "[SYSTEM]" box used all over the app. */
export function SystemWindow({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`sys-window p-4 ${className}`}>
      {title && <h2 className="sys-title mb-2">[ {title} ]</h2>}
      {children}
    </section>
  );
}
