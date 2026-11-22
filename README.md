# ARISE: The System

A gamified life tracker inspired by the "Hunter" genre. **You are the Player. The app is The System.**
You log real-life things (a run, an hour of study, drinking water, a good night's sleep) and The System turns them into XP, gold, stats, quests and boss fights. Slip up and you get a small, kind course correction, never shaming.

- **Installable app** for Android (made for a Pixel, works on any phone and desktop browser)
- **Works fully offline.** No account, no server, no internet needed after the first load
- **Your data stays on your phone.** Nothing is sent anywhere
- **Free forever to host** on GitHub Pages

Live app: `https://nethran-offcl.github.io/arise/`

---

## 1. Install it on your phone (2 minutes)

1. Open the live app address in **Chrome** on your phone.
2. Tap **⋮** (top right), then **Add to Home screen** (or **Install app**), then **Install**.
3. Open **ARISE** from your home screen. It opens full-screen like a normal app.
4. Test offline: turn on airplane mode and open it again. It still works.
5. Long-press the icon for two shortcuts: **Quick Log** and **Today's Quests**.

### First-time setup (5 minutes, do this once)
1. **Profile**: set your name and title, pick a theme.
2. **Profile → Settings → Weekly schedule**: tick which days you work or have college.
3. **Settings → Sleep schedule**: set your ideal bedtime and wake time.
4. **Settings → Exam mode**: only when you have an exam or deadline coming.
5. **Settings → Backup & restore → Save backup file**: so you have a first backup (see section 5).
6. Optional: **Settings → Demo data → Add demo data** to explore with sample activity. **Wipe demo data** removes only the demo logs.

---

## 2. A normal day

| When | What to do |
|---|---|
| **Morning** | The daily login screen greets you with today's quests. Tap **Begin**. |
| **Any time** | **Log** tab: tap a task, enter the amount, tap **Complete**. Quests tick off by themselves. |
| **Morning** | **Log → 😴 Log last night's sleep**: bedtime and wake time, hours worked out for you. |
| **Whenever you drink** | **Home → Today's habits**: tap +250 ml, +500 ml or +1 L. Or enter your whole day's water at night. The goal is 2 L. |
| **After meals** | Optional one-tap meal quality: Good, Okay, Not great. No calories, no food rules. |
| **Evening** | **Profile → Journal**: mood, energy, optional notes. |
| **Feeling drained?** | **Home → Energy check-in** (set your HP bar by hand) or **Quests → Take a gentle day**. |

You never have to log everything. Even one small task keeps your streak alive.

---

## 3. The screens

- **Home**: your status (level, XP, HP, gold, streak), the System's insights, today's habits, quick recovery mode, recent logs.
- **Log**: everything you can log, grouped by category. **＋ Custom task** and **＋ Category** let you add your own. Tap a recent log to edit, backdate or delete it.
- **Quests**: your day type, daily quests, the weekly boss raid, weekly quests, emergency quests, your own quests, milestones.
- **Stats**: radar chart of your six stats, category mastery, spendable stat points, and the System analysis (7, 14 or 30 days).
- **Profile**: your name, colour theme and **style** (Solo Leveling HUD or the calmer Classic look), **Shop & bag**, and the **Tools**: Run tracker, Sleep tracker, Calendar heatmap, Shadow Army, Trophies & titles, Focus timer, Journal, Weekly review, Manage tasks, Settings.

---

## 4. How the game works

**Levels never slow down.** XP needed for a level is `600 × level`, and everything you earn is multiplied by your level, so the same effort moves you the same distance forever. There is no practical level cap. Ranks: E → D (level 10) → C (25) → B (45) → A (70) → S (100), each paying slightly more.

**Rewards.** `XP = (base + per-unit × amount) × intensity × difficulty × level × rank × mastery`. Every formula is visible and editable in **Settings → XP formula**. Gold is not level-scaled, so shop prices stay meaningful.

**Getting better pays more.** Run faster, lift heavier, do more reps in a set, play better than your starting level and you earn up to +75% XP. A new personal record adds +15%. A slower or lighter day never costs XP. A result that looks too good to be true (more than twice your baseline) is treated as a typo and not rewarded.

**Six stats.** Strength, Agility, Vitality, Intelligence, Discipline, Sense. Each category feeds its own stats. Study feeds Intelligence and Sense, Work feeds Intelligence and Discipline, Core feeds Intelligence and Sense evenly. You also get 3 free points per level to spend.

**Mastery.** The more effort you put into a category, the more every task in it pays (+2% per mastery level, up to +30%). Cardio and Sports share one mastery. Study and Core share one "Mind" mastery.

**HP / energy.** Tiring tasks cost HP in proportion to time, distance and intensity. HP comes back from sleep, rest, and +30 per day automatically (editable). You can always set it by hand.

**Quests.**
- **Daily (3 to 5)**: always a movement quest, 2 L of water and a reading/learning quest, plus office tasks or study depending on your day type, and a few more picked from areas you have neglected.
- **Weekly (3) and the Boss Raid**: every task you log damages the weekly boss. Rest and sick days shrink its HP so being unwell never makes it unbeatable.
- **Emergency quests** (about one day in seven) and **8 milestones** (First 5 km, Run 3 km ten times, streaks and more).
- **Your own quests**: one-off or repeating.
- Skipping is always free. A small penalty only applies if you **accept** quests and finish **none** that day.
- Clear the whole daily set for a bonus.

**The System coach (works offline).** It reads your recent logs and adapts:
- Two hard days in a row make today a recovery day automatically.
- Weekly running distance can never grow by more than 10%.
- It spots burnout (short sleep, many slips, a workload far above your usual, low energy) and recommends rest.
- **Exam mode and deadlines** shift quests toward study and lower workout targets.
- A weekly review lists wins, things to improve and next week's plan.

**Wellbeing rules.** No calorie counting, weight targets or fasting, ever. Penalties are small and never shaming. **Rest Day** and **Sick / Injury mode** pause all penalties and streak loss. A Rest Day switches itself off the next day.

**More to collect.** Shop (real-life rewards you price yourself, plus Rest Day Pass, Streak Shield and Double XP Potion), **Shadow Army** (a habit kept for 21 days becomes a Shadow with a permanent +5% XP in its category), and **41 Trophies** with titles you can wear.

---

## 5. Your data and backups

**Where is my data?** Only on your phone, inside the browser engine that runs the installed app (IndexedDB). It is not on GitHub or any server, and it needs no account.

**What erases it?** Clearing Chrome's "Cookies and site data" for the app, uninstalling the app, or losing/resetting the phone. Clearing the *cache* alone does not.

**Backups.**
- **Profile → Settings → Backup & restore → Save backup file** saves a plain JSON file. **Share backup** sends it to Google Drive, email or WhatsApp.
- Home reminds you if you have data but no backup in 14 days.
- **Restore from backup file** replaces everything on the device. The file is validated first and nothing changes if it is damaged.

**Changing phones.**
1. Old phone: **Share backup** to Drive or email.
2. New phone: install the app (section 1), then **Settings → Backup & restore → Restore from backup file**.
3. Check your level and logs, then you can wipe the old phone.

The backup file works on any phone and any web address, so it does not matter if the app's URL ever changes.

---

## 6. Updating and deploying your own copy

The app **updates itself**: when you push new code, the next time you open the app online it downloads the update. Close it fully and reopen it to see it. **Settings → About → Check for updates** forces a check.

### Put your own copy online (GitHub Pages, free)
1. Create a free account at github.com and a **public** repository named `arise` (do not add a README).
2. In this folder:
   ```powershell
   git init -b main
   git add .
   git commit -m "ARISE"
   git remote add origin https://github.com/YOUR-USERNAME/arise.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Source: GitHub Actions**.
4. Open the **Actions** tab and wait for the green tick (about a minute).
5. Your app is at `https://YOUR-USERNAME.github.io/arise/`. Every push to `main` redeploys it after running the tests.

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| I don't see the newest version | Close the app fully (swipe it away) and reopen it while online. Or Settings → About → Check for updates. |
| "Add to Home screen" is missing | Use Chrome (not another browser), open the live address and wait a few seconds. |
| My streak broke when I stayed up late | Your day starts at 4 AM. Change it in Settings → Day starts at. |
| A quest asks for too much | Skip it (free), or adjust your **Weekly schedule** and difficulty (Settings → Difficulty). |
| I logged something by mistake | Log tab → tap it in Recent logs → Delete. Its XP, gold and stats are reversed exactly. |
| The screen shows "Something went wrong" | Tap **Save a backup file**, then **Reload the app**. Your data is not lost. |
| I lost my data | Settings → Backup & restore → Restore from backup file, using your last saved backup. |

---

## 8. For developers

```powershell
npm install
npm run dev        # http://localhost:5173
npm test           # about 250 automated tests
npm run build      # production build into /dist
```

**Stack:** React, TypeScript, Vite, Tailwind CSS 4, vite-plugin-pwa (Workbox), Dexie (IndexedDB), Zustand, Framer Motion, Recharts (lazy-loaded), Zod (validates backup files).

**Layout**
```
src/engine/   pure, tested game rules (levels, XP, quests, shadows, trophies, the System coach)
src/game/     reads/writes the database (actions, quests, rollover, shop, backup, migrations)
src/db/       Dexie schema (versioned; data is migrated, never lost)
src/pages/    screens          src/components/   shared UI
```

**Design rules.** The engine folder has no database or UI code, so it is unit-tested directly. Every database change is a versioned migration (`SEED_VERSION` in `src/game/actions.ts`) that runs once and never overwrites things you edited. Quest progress is derived from your logs, so editing or deleting a log can never leave it wrong.

**Quality.** Lighthouse (mobile): Performance 97, Accessibility 100, Best Practices 100, SEO 100. The built app contains no secrets and makes no network calls.

**Intentionally not included:** push notifications or reminders, step counting, calorie or weight tracking, and the optional AI coach. The built-in System coach is rule-based and fully offline. If you ever want an AI layer, it can be added on top without changing anything else: the engine's output is already structured.
