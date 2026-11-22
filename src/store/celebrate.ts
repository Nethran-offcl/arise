import { create } from 'zustand';
import { play } from '../lib/sfx';
import type { LogResult } from '../game/actions';
import type { QuestCompletion } from '../game/quests';
import type { UnlockedTrophy } from '../game/trophies';
import type { PenaltyQuestHint } from '../engine/types';

export type Celebration =
  | { kind: 'level'; level: number; points: number }
  | { kind: 'rank'; rank: string }
  | { kind: 'penaltyQuest'; hint: PenaltyQuestHint; refund: number }
  | { kind: 'boss'; name: string; xp: number; gold: number }
  | { kind: 'shadow'; name: string }
  | { kind: 'trophy'; items: UnlockedTrophy[] };

interface State {
  queue: Celebration[];
  toast: string | null;
  push: (c: Celebration) => void;
  next: () => void;
  say: (msg: string, ms?: number) => void;
  /** Toast and ceremonies for quests that were just completed. */
  announceQuests: (list: QuestCompletion[]) => void;
  /** Turns the result of a log into a toast plus any ceremonies and sounds. */
  announce: (r: LogResult) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useCelebrate = create<State>((set, get) => ({
  queue: [],
  toast: null,
  push: (c) => set((s) => ({ queue: [...s.queue, c] })),
  next: () => set((s) => ({ queue: s.queue.slice(1) })),
  say: (msg, ms = 3500) => {
    set({ toast: msg });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), ms);
  },
  announceQuests: (list) => {
    for (const c of list) if (c.kind === 'boss') get().push({ kind: 'boss', name: c.bossName ?? c.title, xp: c.xp, gold: c.gold });
    if (!list.length) return;
    play(list.some((c) => c.kind === 'boss') ? 'boss' : 'quest');
    get().say(`[SYSTEM] Quest complete: ${list.map((c) => c.title).join(', ')} (+${list.reduce((s, c) => s + c.xp, 0).toLocaleString()} XP, +${list.reduce((s, c) => s + c.gold, 0)} gold)`, 6000);
  },
  announce: (r) => {
    const { say, push } = get();
    if (r.isPenalty) {
      say(
        r.paused
          ? '[SYSTEM] Rest/Sick mode is active. Penalty paused, no effect applied.'
          : `[SYSTEM] Course correction noted: ${r.xp} XP, ${r.hp} HP. Tomorrow is a new day.`,
      );
      if (r.penaltyQuest) push({ kind: 'penaltyQuest', hint: r.penaltyQuest, refund: Math.abs(r.xp) });
    } else {
      const gains = Object.entries(r.statGains)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k} +${v}`)
        .join(' ');
      const bonus = r.perfBonus > 0 ? ` · progress +${Math.round(r.perfBonus * 100)}%` : '';
      say(`[SYSTEM] ${r.pr ? 'NEW PERSONAL RECORD! ' : ''}+${r.xp.toLocaleString()} XP · +${r.gold} gold${bonus}${gains ? ' · ' + gains : ''}`);
      if (r.pr) play('pr');
      get().announceQuests(r.questsCompleted);
    }
    if (r.levelAfter > r.levelBefore) {
      play('level');
      push({ kind: 'level', level: r.levelAfter, points: (r.levelAfter - r.levelBefore) * 3 });
    }
    if (r.rankAfter !== r.rankBefore) {
      play('rank');
      push({ kind: 'rank', rank: r.rankAfter });
    }
    for (const s of r.shadowsExtracted) {
      play('shadow');
      push({ kind: 'shadow', name: s.name });
    }
    if (r.trophiesUnlocked.length) {
      play('trophy');
      push({ kind: 'trophy', items: r.trophiesUnlocked });
    }
  },
}));
