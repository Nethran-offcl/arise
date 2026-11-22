// Generates PNG icons from public/icon.svg. Run: node scripts/gen-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icon.svg');
const out = (n, size, pad = 0) =>
  sharp(svg).resize(size - pad * 2, size - pad * 2).extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#07070f' })
    .png().toFile(`public/${n}`);
await out('pwa-192.png', 192);
await out('pwa-512.png', 512);
await out('pwa-maskable-512.png', 512, 64); // safe-zone padding for maskable
await out('apple-touch-icon.png', 180);
console.log('icons done');
