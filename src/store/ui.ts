import { create } from 'zustand';
import { getSetting, setSetting } from '../db/db';

export type Theme = 'system' | 'monarch' | 'minimal';

interface UIState {
  theme: Theme;
  ready: boolean;
  setTheme: (t: Theme) => void;
  init: () => Promise<void>;
}

const apply = (t: Theme) => document.documentElement.setAttribute('data-theme', t);

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
