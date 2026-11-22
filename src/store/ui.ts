import { create } from 'zustand';
import { getSetting, setSetting } from '../db/db';

/** Look and feel: the Solo Leveling HUD, or the calmer Classic look. Both use the same colour themes. */
export type UIStyle = 'solo' | 'classic';

export type Theme = 'system' | 'monarch' | 'crimson' | 'gold' | 'emerald' | 'frost' | 'void' | 'minimal';

/** Background colour per theme, so the phone's status bar matches. */
const BG: Record<Theme, string> = { system: '#07090f', monarch: '#08060f', crimson: '#0b0506', gold: '#0a0805', emerald: '#04090a', frost: '#04080f', void: '#050507', minimal: '#0b0b0c' };

interface UIState {
  theme: Theme;
  style: UIStyle;
  ready: boolean;
  setTheme: (t: Theme) => void;
  setStyle: (s: UIStyle) => void;
  init: () => Promise<void>;
}

const apply = (t: Theme) => {
  document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BG[t] ?? BG.system);
};

const applyStyle = (s: UIStyle) => document.documentElement.setAttribute('data-style', s);

export const useUI = create<UIState>((set) => ({
  theme: 'system',
  style: 'solo',
  ready: false,
  setStyle: (style) => {
    applyStyle(style);
    set({ style });
    void setSetting('style', style);
  },
  setTheme: (theme) => {
    apply(theme);
    set({ theme });
    void setSetting('theme', theme);
  },
  init: async () => {
    const [theme, style] = await Promise.all([getSetting<Theme>('theme', 'system'), getSetting<UIStyle>('style', 'solo')]);
    apply(theme);
    applyStyle(style);
    set({ theme, style, ready: true });
  },
}));
