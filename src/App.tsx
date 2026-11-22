import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Celebration } from './components/Celebration';
import { requestPersistence } from './db/db';
import { ensureSeed } from './game/actions';
import Home from './pages/Home';
import Log from './pages/Log';
import Placeholder from './pages/Placeholder';
import Presets from './pages/Presets';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Stats from './pages/Stats';
import { useCelebrate } from './store/celebrate';
import { useUI } from './store/ui';

export default function App() {
  const init = useUI((s) => s.init);
  const toast = useCelebrate((s) => s.toast);
  useEffect(() => {
    void init();
    void ensureSeed(); // first launch: creates the Player and the starter presets
    void requestPersistence(); // ask Chrome not to auto-delete our data
  }, [init]);

  return (
    // HashRouter: works on GitHub Pages without server rewrites and with manifest shortcuts.
    <HashRouter>
      <main
        className="mx-auto max-w-md px-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/log" element={<Log />} />
          <Route path="/quests" element={<Placeholder title="Quests" phase={3} />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/presets" element={<Presets />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <BottomNav />
      {toast && (
        <div role="status" className="sys-window fixed inset-x-4 z-20 mx-auto max-w-md p-3 text-sm text-accent"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}>
          {toast}
        </div>
      )}
      <Celebration />
    </HashRouter>
  );
}
