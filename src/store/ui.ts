import { create } from 'zustand';
import { getSetting, setSetting } from '../db/db';

export type Theme = 'system' | 'monarch' | 'crimson' | 'gold' | 'emerald' | 'frost' | 'void' | 'minimal';

/** Background colour per theme, so the phone's status bar matches. */
const BG: Record<Theme, string> = { system: '#07090f', monarch: '#08060f', crimson: '#0b0506', gold: '#0a0805', emerald: '#04090a', frost: '#04080f', void: '#050507', minimal: '#0b0b0c' };

interface UIState {
  theme: Theme;
  ready: boolean;
  setTheme: (t: Theme) => void;
  init: () => Promise<void>;
}

const apply = (t: Theme) => {
  document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BG[t] ?? BG.system);
};

export const useUI = create<UIState>((set) => ({
  theme: 'system',
  ready: false,
  setTheme: (theme) => {
    apply(theme);
    set({ theme });
    void setSetting('theme', theme);
  },
  init: async () => {
    const theme = await getSetting<Theme>('theme', 'system');
    apply(theme);
    set({ theme, ready: true });
  },
}));
