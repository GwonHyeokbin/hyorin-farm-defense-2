import type { GameState, UpgradeDefinition, UpgradeKey } from './types';

export const BOULDER_UPGRADE_COST = 35;

export const UPGRADE_DEFINITIONS: UpgradeDefinition[] = [
  { key: 'power', name: '무기 위력', icon: '🎯', description: '무기 공격 피해량 증가', baseCost: 18 },
  { key: 'speed', name: '가벼운 장화', icon: '👢', description: '이동 속도가 추가로 증가해요', baseCost: 16 },
  { key: 'armor', name: '포근한 목도리', icon: '🧣', description: '피격 뒤 잠깐 더 안전해져요', baseCost: 20 },
  { key: 'vitality', name: '든든한 새참', icon: '🍲', description: '최대 체력과 현재 체력 회복', baseCost: 24 },
];

export function upgradeCost(key: UpgradeKey, level: number): number {
  const definition = UPGRADE_DEFINITIONS.find((item) => item.key === key);
  return definition ? definition.baseCost + level * definition.baseCost * 0.65 : Infinity;
}

export function applyUpgrade(state: GameState, key: UpgradeKey): boolean {
  const level = state.upgrades[key];
  if (level >= 5) return false;
  const cost = upgradeCost(key, level);
  if (state.resources < cost) return false;
  state.resources -= cost;
  state.upgrades[key] += 1;
  if (key === 'vitality') {
    state.player.maxHp += 20;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 35);
  }
  return true;
}

export function repairFarm(state: GameState): boolean {
  const cost = 20;
  if (state.resources < cost || state.farm.health >= state.farm.maxHealth) return false;
  state.resources -= cost;
  state.farm.health = Math.min(state.farm.maxHealth, state.farm.health + 24);
  for (const crop of state.farm.crops) crop.hp = Math.min(crop.maxHp, crop.hp + 16);
  for (const facility of Object.values(state.farm.facilities)) {
    facility.hp = Math.min(facility.maxHp, facility.hp + 12);
  }
  return true;
}

export function unlockBoulder(state: GameState): boolean {
  if (state.boulderUnlocked || state.resources < BOULDER_UPGRADE_COST) return false;
  state.resources -= BOULDER_UPGRADE_COST;
  state.boulderUnlocked = true;
  return true;
}
