import { ensureSeed } from './actions';
import { ensureQuests, settleQuests, type QuestCompletion } from './quests';
import { processRollover, type RolloverSummary } from './rollover';
import { ensureShopSeed } from './shop';

/**
 * Everything that must happen when the app opens or a new day begins:
 * data setup and migrations, closing out finished days, then creating today's quests.
 */
export type TickSummary = RolloverSummary & { completed: QuestCompletion[] };

export async function dailyTick(now = Date.now()): Promise<TickSummary> {
  await ensureSeed();
  await ensureShopSeed();
  const summary = await processRollover(now);
  await ensureQuests(now);
  const completed = await settleQuests(now); // pays quests that are already satisfied by earlier logs
  return { ...summary, completed };
}
