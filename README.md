# ARISE — The System

A Solo Leveling-inspired self-improvement PWA. You are the Player. Local-first (IndexedDB), works offline, installable on Android.

> Status: **Phase 1 of 7** (setup, PWA, theme, navigation, data layer, deploy pipeline).

## Run it on your PC

```powershell
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build    # production build into /dist
```

## Deploy to GitHub Pages (free) — beginner steps

1. Go to https://github.com/new. Name the repo `arise`, set it to **Public**, leave "Add a README" **unticked**, click **Create repository**.
2. In PowerShell, inside this project folder, run these one at a time (replace `YOUR-USERNAME`):
   ```powershell
   git init -b main
   git add .
   git commit -m "Phase 1"
   git remote add origin https://github.com/YOUR-USERNAME/arise.git
   git push -u origin main
   ```
3. On the repo page: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Open the **Actions** tab. Wait for "Deploy to GitHub Pages" to show a green tick (about 1 minute).
5. Your app is live at `https://YOUR-USERNAME.github.io/arise/`.

Every `git push` to `main` redeploys automatically.

## Install on your Pixel 9

1. Open your app URL in **Chrome** on the phone.
2. Tap the **⋮** menu (top right) → **Add to Home screen** (or **Install app**) → **Install**.
3. Launch **ARISE** from the home screen. It opens full-screen.
4. Test offline: turn on airplane mode and reopen the app. It should still load.
5. Long-press the icon to see the shortcuts: **Quick Log** and **Today's Quests**.

## Notes

- Routing uses `#/` URLs so refreshing works on GitHub Pages.
- Secrets: nothing secret lives in this repo. The Groq key (Phase 5) lives only in a Cloudflare Worker secret.
- Icons are generated from `public/icon.svg` with `node scripts/gen-icons.mjs`.

## How XP works (so levelling never slows down)

- XP needed per level = 600 x level.
- Every reward is multiplied by your level, so the same effort pays more as levels cost more. A normal day always moves you the same distance through a level.
- Progress bonuses add on top: run faster / lift heavier / play better than your starting level (up to +75%), new personal records (+15%), and category mastery (+2% per mastery level, up to +30%).
- A slower or lighter day never costs XP. Gold is not level-scaled, so shop prices stay meaningful.
