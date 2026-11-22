import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Celebration } from './components/Celebration';
import { requestPersistence } from './db/db';
import { dailyTick } from './game/startup';
import Home from './pages/Home';
import Log from './pages/Log';
import Presets from './pages/Presets';
import Quests from './pages/Quests';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Stats from './pages/Stats';
import { useCelebrate } from './store/celebrate';
import { useUI } from './store/ui';

export default function App() {
  const init = useUI((s) => s.init);
  const toast = useCelebrate((s) => s.toast);
  const say = useCelebrate((s) => s.say);
  const announceQuests = useCelebrate((s) => s.announceQuests);
  useEffect(() => {
    void init();
    void requestPersistence(); // ask Chrome not to auto-delete our data
    // Open: set up data, close out finished days, create today's quests. Repeats when a new day starts while the app is open.
    const tick = async () => {
      const s = await dailyTick();
      if (s.shieldsUsed) say('[SYSTEM] A Streak Shield protected your streak.', 6000);
      else if (s.penalties) say('[SYSTEM] You accepted yesterday\'s quests but finished none. A small penalty applied. Optional reset quest ready.', 7000);
      else if (s.failed) say('[SYSTEM] Some accepted quests expired yesterday. No penalty, since you finished others.', 5000);
      announceQuests(s.completed);
    };
    void tick();
    const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [init, say, announceQuests]);

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
          <Route path="/quests" element={<Quests />} />
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
