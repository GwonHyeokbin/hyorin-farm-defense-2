import type { GameState } from './types';

export function retainedLevelSteps(state: Pick<GameState, 'level' | 'retainedLevelBonuses'>): number {
  return Math.max(0, state.retainedLevelBonuses ?? 0) + Math.max(0, state.level - 1);
}

export function levelGrowthMultiplier(state: Pick<GameState, 'level' | 'retainedLevelBonuses'>): number {
  return 1 + retainedLevelSteps(state) * 0.01;
}
