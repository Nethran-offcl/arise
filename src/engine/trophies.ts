/** Everything the trophy list needs to know about you. Gathered by the game layer. */
export interface TrophyCtx {
  level: number;
  rankIndex: number; // E = 0 ... S = 5
  streak: number;
  bestStreak: number;
  logsTotal: number;
  questsDone: number;
  bossesDefeated: number;
  milestonesDone: number;
  dailySets: number;
  shadows: number;
  purchases: number;
  prs: number;
  studyHours: number;
  runKm: number;
  longestRun: number;
  goodSleepNights: number;
  waterGoalDays: number;
  focusSessions: number;
  journalDays: number;
  hasBackup: boolean;
}

export interface Trophy {
  id: string;
  name: string;
  desc: string;
  icon: string;
  /** Unlocking this trophy lets you wear this title. */
  title?: string;
  target: number;
  value: (c: TrophyCtx) => number;
}

export const TROPHIES: Trophy[] = [
  { id: 'first-log', name: 'First Steps', desc: 'Log your first activity.', icon: '👣', title: 'Fresh Spark', target: 1, value: (c) => c.logsTotal },
  { id: 'logs-100', name: 'Centurion', desc: 'Log 100 activities.', icon: '💯', title: 'The Persistent', target: 100, value: (c) => c.logsTotal },
  { id: 'logs-500', name: 'Veteran', desc: 'Log 500 activities.', icon: '🎖️', title: 'The Relentless', target: 500, value: (c) => c.logsTotal },
  { id: 'streak-7', name: 'Week Strong', desc: 'Reach a 7-day streak.', icon: '🔥', title: 'Unbroken', target: 7, value: (c) => c.bestStreak },
  { id: 'streak-30', name: 'Month of Fire', desc: 'Reach a 30-day streak.', icon: '🔥', title: 'Ironclad', target: 30, value: (c) => c.bestStreak },
  { id: 'streak-100', name: 'Eternal Flame', desc: 'Reach a 100-day streak.', icon: '☄️', title: 'The Eternal Flame', target: 100, value: (c) => c.bestStreak },
  { id: 'level-10', name: 'Double Digits', desc: 'Reach level 10.', icon: '⭐', title: 'Rising Star', target: 10, value: (c) => c.level },
  { id: 'level-25', name: 'Quarter Century', desc: 'Reach level 25.', icon: '🌟', title: 'Hunter of Note', target: 25, value: (c) => c.level },
  { id: 'level-50', name: 'Half Century', desc: 'Reach level 50.', icon: '💫', title: 'Seasoned Veteran', target: 50, value: (c) => c.level },
  { id: 'level-100', name: 'Triple Digits', desc: 'Reach level 100.', icon: '👑', title: 'The Centennial', target: 100, value: (c) => c.level },
  { id: 'rank-d', name: 'Rank D', desc: 'Reach Hunter Rank D.', icon: '🥉', title: 'D-Rank Hunter', target: 1, value: (c) => c.rankIndex },
  { id: 'rank-c', name: 'Rank C', desc: 'Reach Hunter Rank C.', icon: '🥈', title: 'C-Rank Hunter', target: 2, value: (c) => c.rankIndex },
  { id: 'rank-b', name: 'Rank B', desc: 'Reach Hunter Rank B.', icon: '🥇', title: 'B-Rank Hunter', target: 3, value: (c) => c.rankIndex },
  { id: 'rank-a', name: 'Rank A', desc: 'Reach Hunter Rank A.', icon: '🏅', title: 'A-Rank Hunter', target: 4, value: (c) => c.rankIndex },
  { id: 'rank-s', name: 'Rank S', desc: 'Reach Hunter Rank S.', icon: '🏆', title: 'Sovereign', target: 5, value: (c) => c.rankIndex },
  { id: 'boss-1', name: 'Boss Slayer', desc: 'Defeat a weekly boss.', icon: '⚔️', title: 'Boss Slayer', target: 1, value: (c) => c.bossesDefeated },
  { id: 'boss-10', name: 'Raid Leader', desc: 'Defeat 10 weekly bosses.', icon: '🛡️', title: 'Raid Leader', target: 10, value: (c) => c.bossesDefeated },
  { id: 'quests-10', name: 'Questing', desc: 'Complete 10 quests.', icon: '📜', target: 10, value: (c) => c.questsDone },
  { id: 'quests-100', name: 'Quest Master', desc: 'Complete 100 quests.', icon: '📖', title: 'Quest Master', target: 100, value: (c) => c.questsDone },
  { id: 'sweep-7', name: 'Clean Sweep', desc: 'Clear a whole daily quest set 7 times.', icon: '🧹', title: 'The Thorough', target: 7, value: (c) => c.dailySets },
  { id: 'milestone-3', name: 'Milestone Hunter', desc: 'Achieve 3 milestones.', icon: '🚩', target: 3, value: (c) => c.milestonesDone },
  { id: 'milestone-8', name: 'Completionist', desc: 'Achieve all 8 milestones.', icon: '🏁', title: 'The Completionist', target: 8, value: (c) => c.milestonesDone },
  { id: 'shadow-1', name: 'First Shadow', desc: 'Extract your first Shadow (a 21-day habit).', icon: '👤', title: 'Shadow Tamer', target: 1, value: (c) => c.shadows },
  { id: 'shadow-5', name: 'Shadow Army', desc: 'Extract 5 Shadows.', icon: '🌑', title: 'Sovereign of Shadows', target: 5, value: (c) => c.shadows },
  { id: 'pr-1', name: 'Record Breaker', desc: 'Set a personal record.', icon: '📈', title: 'Pacesetter', target: 1, value: (c) => c.prs },
  { id: 'pr-10', name: 'Always Improving', desc: 'Set 10 personal records.', icon: '🚀', title: 'The Improver', target: 10, value: (c) => c.prs },
  { id: 'run-5k', name: 'Five Kilometres', desc: 'Run 5 km in one go.', icon: '🏃', title: 'Road Runner', target: 5, value: (c) => c.longestRun },
  { id: 'run-10k', name: 'Ten Kilometres', desc: 'Run 10 km in one go.', icon: '🏃‍♂️', title: 'Distance Runner', target: 10, value: (c) => c.longestRun },
  { id: 'run-100km', name: 'Road Warrior', desc: 'Run 100 km in total.', icon: '🛣️', title: 'Road Warrior', target: 100, value: (c) => c.runKm },
  { id: 'study-50', name: 'Scholar', desc: 'Study for 50 hours.', icon: '📚', title: 'The Scholar', target: 50, value: (c) => c.studyHours },
  { id: 'study-200', name: 'Sage', desc: 'Study for 200 hours.', icon: '🎓', title: 'The Sage', target: 200, value: (c) => c.studyHours },
  { id: 'sleep-7', name: 'Well Rested', desc: 'Sleep 7 hours or more on 7 nights.', icon: '😴', title: 'The Well Rested', target: 7, value: (c) => c.goodSleepNights },
  { id: 'sleep-30', name: 'Sleep Master', desc: 'Sleep 7 hours or more on 30 nights.', icon: '🌙', title: 'Dreamwalker', target: 30, value: (c) => c.goodSleepNights },
  { id: 'water-7', name: 'Hydrated', desc: 'Reach 2 L of water on 7 days.', icon: '💧', title: 'The Hydrated', target: 7, value: (c) => c.waterGoalDays },
  { id: 'water-30', name: 'Wellspring', desc: 'Reach 2 L of water on 30 days.', icon: '🌊', title: 'Wellspring', target: 30, value: (c) => c.waterGoalDays },
  { id: 'focus-10', name: 'Deep Focus', desc: 'Finish 10 focus sessions.', icon: '🎯', title: 'Deep Worker', target: 10, value: (c) => c.focusSessions },
  { id: 'focus-50', name: 'Flow State', desc: 'Finish 50 focus sessions.', icon: '🧘', title: 'In the Zone', target: 50, value: (c) => c.focusSessions },
  { id: 'journal-7', name: 'Reflective', desc: 'Write 7 journal entries.', icon: '📓', title: 'The Reflective', target: 7, value: (c) => c.journalDays },
  { id: 'journal-30', name: 'Inner Chronicle', desc: 'Write 30 journal entries.', icon: '📔', title: 'The Chronicler', target: 30, value: (c) => c.journalDays },
  { id: 'shopper', name: 'Treat Yourself', desc: 'Buy something from your shop.', icon: '🛍️', target: 1, value: (c) => c.purchases },
  { id: 'backup', name: 'Safe and Sound', desc: 'Save a backup file.', icon: '💾', title: 'The Prepared', target: 1, value: (c) => (c.hasBackup ? 1 : 0) },
];

export interface TrophyStatus {
  trophy: Trophy;
  value: number;
  done: boolean;
}

export function evaluateTrophies(c: TrophyCtx): TrophyStatus[] {
  return TROPHIES.map((t) => {
    const value = t.value(c);
    return { trophy: t, value, done: value >= t.target };
  });
}
