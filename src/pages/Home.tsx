import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SystemWindow } from '../components/SystemWindow';
import { ensureProfile, getSetting, setSetting, type Profile } from '../db/db';

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [opens, setOpens] = useState(0);

  // Proves the data layer works: profile + a counter survive reloads and offline.
  useEffect(() => {
    (async () => {
      setProfile(await ensureProfile());
      const n = (await getSetting<number>('openCount', 0)) + 1;
      await setSetting('openCount', n);
      setOpens(n);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <SystemWindow title="System">
          <p className="text-2xl font-bold glow-text">Hello, System.</p>
          <p className="text-muted mt-1">[SYSTEM] Welcome, {profile?.name ?? '…'}. You have been chosen as a Player.</p>
        </SystemWindow>
      </motion.div>
      <SystemWindow title="Status">
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div><dt className="text-xs text-muted">LEVEL</dt><dd className="text-xl font-bold">{profile?.level ?? '–'}</dd></div>
          <div><dt className="text-xs text-muted">RANK</dt><dd className="text-xl font-bold">E</dd></div>
          <div><dt className="text-xs text-muted">GOLD</dt><dd className="text-xl font-bold">{profile?.gold ?? '–'}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">Data layer check: app opened {opens} time(s), stored on this device.</p>
      </SystemWindow>
    </div>
  );
}
