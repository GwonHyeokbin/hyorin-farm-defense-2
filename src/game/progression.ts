import type { GameState, GrowthStage } from './types';

export const GROWTH_STAGE_MOBILITY_PENALTY: Record<GrowthStage, number> = {
  1: 0.6,
  2: 0.4,
  3: 0.1,
  4: 0.2,
};

export function growthStageMobilityPenalty(stage: GrowthStage): number {
  return GROWTH_STAGE_MOBILITY_PENALTY[stage];
}

export function retainedLevelSteps(state: Pick<GameState, 'level' | 'retainedLevelBonuses'>): number {
  return Math.max(0, state.retainedLevelBonuses ?? 0) + Math.max(0, state.level - 1);
}

export function levelGrowthMultiplier(state: Pick<GameState, 'level' | 'retainedLevelBonuses'>): number {
  return 1 + retainedLevelSteps(state) * 0.01;
}
