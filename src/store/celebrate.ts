import { create } from 'zustand';
import type { LogResult } from '../game/actions';
import type { PenaltyQuestHint } from '../engine/types';

export type Celebration =
  | { kind: 'level'; level: number; points: number }
  | { kind: 'rank'; rank: string }
  | { kind: 'penaltyQuest'; hint: PenaltyQuestHint };

interface State {
  queue: Celebration[];
  toast: string | null;
  push: (c: Celebration) => void;
  next: () => void;
  say: (msg: string) => void;
  /** Turns the result of a log into a toast plus any ceremonies. */
  announce: (r: LogResult) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useCelebrate = create<State>((set, get) => ({
  queue: [],
  toast: null,
  push: (c) => set((s) => ({ queue: [...s.queue, c] })),
  next: () => set((s) => ({ queue: s.queue.slice(1) })),
  say: (msg) => {
    set({ toast: msg });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 3500);
  },
  announce: (r) => {
    const { say, push } = get();
    if (r.isPenalty) {
      say(
        r.paused
          ? '[SYSTEM] Rest/Sick mode is active. Penalty paused, no effect applied.'
          : `[SYSTEM] Course correction noted: ${r.xp} XP, ${r.hp} HP. Tomorrow is a new day.`,
      );
      if (r.penaltyQuest) push({ kind: 'penaltyQuest', hint: r.penaltyQuest });
      return;
    }
    const gains = Object.entries(r.statGains)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k} +${v}`)
      .join(' ');
    say(`[SYSTEM] +${r.xp} XP · +${r.gold} gold${gains ? ' · ' + gains : ''}`);
    if (r.levelAfter > r.levelBefore) {
      try { navigator.vibrate?.([80, 40, 80]); } catch { /* vibration not supported */ }
      push({ kind: 'level', level: r.levelAfter, points: (r.levelAfter - r.levelBefore) * 3 });
    }
    if (r.rankAfter !== r.rankBefore) push({ kind: 'rank', rank: r.rankAfter });
  },
}));
