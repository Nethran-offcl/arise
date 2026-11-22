import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' makes the build work on any GitHub Pages sub-path (user.github.io/<repo>/).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'ARISE — The System',
        short_name: 'ARISE',
        description: 'A gamified life tracker. You are the Player.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#07070f',
        theme_color: '#07070f',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Quick Log', short_name: 'Log', url: './#/log', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
          { name: "Today's Quests", short_name: 'Quests', url: './#/quests', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], navigateFallback: 'index.html' },
    }),
  ],
  test: { environment: 'node' },
});
