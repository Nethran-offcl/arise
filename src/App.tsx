import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import Home from './pages/Home';
import Profile from './pages/Profile';
import Placeholder from './pages/Placeholder';
import { useUI } from './store/ui';

export default function App() {
  const init = useUI((s) => s.init);
  useEffect(() => { void init(); }, [init]);

  return (
    // HashRouter: works on GitHub Pages without server rewrites and with manifest shortcuts.
    <HashRouter>
      <main
        className="mx-auto max-w-md px-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/log" element={<Placeholder title="Log" phase={2} />} />
          <Route path="/quests" element={<Placeholder title="Quests" phase={3} />} />
          <Route path="/stats" element={<Placeholder title="Stats" phase={2} />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </main>
      <BottomNav />
    </HashRouter>
  );
}
