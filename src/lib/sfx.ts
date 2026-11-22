import { getSetting, setSetting } from '../db/db';

/**
 * Sound effects and haptics, with no audio files: the sounds are tiny synthesized tones.
 * Both can be switched off in Settings (a mute toggle). Nothing here ever needs the internet.
 */
export type SoundName = 'level' | 'rank' | 'quest' | 'boss' | 'shadow' | 'pr' | 'trophy' | 'tap';

export interface SfxPrefs {
  sound: boolean;
  haptics: boolean;
}

let prefs: SfxPrefs = { sound: true, haptics: true };
let ctx: AudioContext | null = null;

export const getSfxPrefs = (): SfxPrefs => prefs;

export async function loadSfxPrefs(): Promise<SfxPrefs> {
  prefs = { ...prefs, ...(await getSetting<Partial<SfxPrefs>>('sfx', {})) };
  return prefs;
}

export async function saveSfxPrefs(p: SfxPrefs): Promise<void> {
  prefs = p;
  await setSetting('sfx', p);
}

/** [frequency Hz, start offset s, duration s] */
const TONES: Record<SoundName, [number, number, number][]> = {
  level: [[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.14], [1047, 0.36, 0.4]],
  rank: [[392, 0, 0.18], [523, 0.16, 0.18], [659, 0.32, 0.18], [784, 0.48, 0.18], [1047, 0.64, 0.6]],
  quest: [[660, 0, 0.1], [880, 0.1, 0.22]],
  boss: [[196, 0, 0.2], [262, 0.18, 0.2], [392, 0.36, 0.2], [523, 0.54, 0.2], [784, 0.72, 0.6]],
  shadow: [[220, 0, 0.3], [165, 0.25, 0.3], [330, 0.5, 0.45]],
  pr: [[784, 0, 0.1], [988, 0.1, 0.1], [1319, 0.2, 0.3]],
  trophy: [[880, 0, 0.12], [1175, 0.12, 0.12], [1568, 0.24, 0.3]],
  tap: [[600, 0, 0.04]],
};

const VIBRATE: Record<SoundName, number | number[]> = {
  level: [80, 40, 80, 40, 160],
  rank: [100, 50, 100, 50, 100, 50, 220],
  quest: [60, 30, 60],
  boss: [120, 60, 120, 60, 240],
  shadow: [200, 80, 120],
  pr: [60, 30, 60, 30, 120],
  trophy: [50, 30, 90],
  tap: 15,
};

export function play(name: SoundName): void {
  try {
    if (prefs.haptics) navigator.vibrate?.(VIBRATE[name]);
  } catch {
    /* vibration not supported */
  }
  if (!prefs.sound) return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    for (const [freq, at, dur] of TONES[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.09, t0 + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur + 0.02);
    }
  } catch {
    /* audio not available: stay silent */
  }
}
