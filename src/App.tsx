import { motion, useReducedMotion } from 'framer-motion';
import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Celebration } from './components/Celebration';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Ritual } from './components/Ritual';
import { requestPersistence } from './db/db';
import { dailyTick } from './game/startup';
import { loadSfxPrefs } from './lib/sfx';
import Home from './pages/Home';
import Log from './pages/Log';
import { useCelebrate } from './store/celebrate';
import { useUI } from './store/ui';

// Screens other than Home and Log load on demand (smaller first load). They are cached for offline use after the first visit.
const Focus = lazy(() => import('./pages/Focus'));
const Heatmap = lazy(() => import('./pages/Heatmap'));
const Journal = lazy(() => import('./pages/Journal'));
const Presets = lazy(() => import('./pages/Presets'));
const Profile = lazy(() => import('./pages/Profile'));
const Quests = lazy(() => import('./pages/Quests'));
const Review = lazy(() => import('./pages/Review'));
const Runs = lazy(() => import('./pages/Runs'));
const Settings = lazy(() => import('./pages/Settings'));
const Shadows = lazy(() => import('./pages/Shadows'));
const SleepPage = lazy(() => import('./pages/Sleep'));
const Stats = lazy(() => import('./pages/Stats'));
const Trophies = lazy(() => import('./pages/Trophies'));

/** Routes with a short fade/slide when you change screens (skipped if you prefer reduced motion). */
function AnimatedRoutes() {
  const location = useLocation();
  const reduce = useReducedMotion();
  return (
    <motion.div key={location.pathname} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/log" element={<Log />} />
        <Route path="/quests" element={<Quests />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/presets" element={<Presets />} />
        <Route path="/review" element={<Review />} />
        <Route path="/runs" element={<Runs />} />
        <Route path="/sleep" element={<SleepPage />} />
        <Route path="/heatmap" element={<Heatmap />} />
        <Route path="/shadows" element={<Shadows />} />
        <Route path="/trophies" element={<Trophies />} />
        <Route path="/focus" element={<Focus />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      </Suspense>
    </motion.div>
  );
}

export default function App() {
  const init = useUI((s) => s.init);
  const toast = useCelebrate((s) => s.toast);
  const say = useCelebrate((s) => s.say);
  const announceQuests = useCelebrate((s) => s.announceQuests);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void init();
    void loadSfxPrefs();
    void requestPersistence(); // ask Chrome not to auto-delete our data
    // Open: set up data, close out finished days, create today's quests. Repeats when a new day starts while the app is open.
    const tick = async () => {
      const s = await dailyTick();
      setReady(true);
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
        <ErrorBoundary>
          <AnimatedRoutes />
        </ErrorBoundary>
      </main>
      <BottomNav />
      {toast && (
        <div role="status" className="sys-window toast-in fixed inset-x-4 z-20 mx-auto max-w-md border-l-4 border-l-accent p-3 text-sm text-ink"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}>
          {toast}
        </div>
      )}
      <Celebration />
      <Ritual ready={ready} />
    </HashRouter>
  );
}
