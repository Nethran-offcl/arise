import type { Rank } from './types';

export interface RankInfo {
  rank: Rank;
  minLevel: number;
  /** Rewards are multiplied by this (higher ranks pay slightly more). */
  rewardMult: number;
  /** Quest targets are multiplied by this (used from Phase 3). */
  questMult: number;
  title: string;
}

export const RANKS: RankInfo[] = [
  { rank: 'E', minLevel: 1, rewardMult: 1.0, questMult: 1.0, title: 'Novice Hunter' },
  { rank: 'D', minLevel: 10, rewardMult: 1.05, questMult: 1.05, title: 'Rising Hunter' },
  { rank: 'C', minLevel: 20, rewardMult: 1.1, questMult: 1.1, title: 'Seasoned Hunter' },
  { rank: 'B', minLevel: 35, rewardMult: 1.15, questMult: 1.15, title: 'Elite Hunter' },
  { rank: 'A', minLevel: 50, rewardMult: 1.2, questMult: 1.2, title: 'Master Hunter' },
  { rank: 'S', minLevel: 70, rewardMult: 1.25, questMult: 1.25, title: 'Sovereign' },
];

export function rankInfoForLevel(level: number): RankInfo {
  let current = RANKS[0];
  for (const r of RANKS) if (level >= r.minLevel) current = r;
  return current;
}
