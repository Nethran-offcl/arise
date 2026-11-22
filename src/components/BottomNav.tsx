import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Home', icon: '◈' },
  { to: '/log', label: 'Log', icon: '✚' },
  { to: '/quests', label: 'Quests', icon: '⚔' },
  { to: '/stats', label: 'Stats', icon: '⬡' },
  { to: '/profile', label: 'Profile', icon: '☗' },
];

export function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 inset-x-0 z-10 border-t border-line bg-panel/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-md">
        {items.map((i) => (
          <li key={i.to} className="flex-1">
            <NavLink
              to={i.to}
              end={i.to === '/'}
              className={({ isActive }) =>
                `flex h-16 flex-col items-center justify-center gap-0.5 text-xs ${isActive ? 'text-accent glow-text' : 'text-muted'}`
              }
            >
              <span className="text-xl leading-none" aria-hidden>{i.icon}</span>
              {i.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
