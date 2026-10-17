import type { AmmoType, GameState } from './types';

export interface AmmoDefinition {
  type: AmmoType;
  name: string;
  icon: string;
  description: string;
  speed: number;
  damage: number;
  blastRadius?: number;
  chainCount?: number;
}

export const AMMO_DEFINITIONS: AmmoDefinition[] = [
  { type: 'bb', name: 'BB탄', icon: '⚪', description: '빠름 · 약한 피해', speed: 650, damage: 20 },
  { type: 'steelBb', name: '강철 BB탄', icon: '🔘', description: '매우 빠름 · 조금 강함', speed: 740, damage: 28 },
  { type: 'stone', name: '돌멩이', icon: '🪨', description: '맞으면 넉백', speed: 500, damage: 32 },
  { type: 'blast', name: '폭렬탄', icon: '💥', description: '충돌 지점 광역 피해', speed: 430, damage: 23, blastRadius: 96 },
  { type: 'lightning', name: '번개탄', icon: '⚡', description: '주변 적에게 연쇄 피해', speed: 690, damage: 27, chainCount: 3 },
  { type: 'meteor', name: '메테오탄', icon: '☄️', description: '넓은 충격파 피해', speed: 360, damage: 48, blastRadius: 164 },
];

export const AMMO_CAPACITIES: Record<AmmoType, number> = {
  bb: 30,
  steelBb: 10,
  stone: 3,
  blast: 1,
  lightning: 1,
  meteor: 1,
};

export const AMMO_REFILL_COSTS: Record<AmmoType, number> = {
  bb: 6,
  steelBb: 8,
  stone: 6,
  blast: 8,
  lightning: 8,
  meteor: 10,
};

export function createAmmoCounts(): Record<AmmoType, number> {
  return { ...AMMO_CAPACITIES };
}

export function normalizeAmmoCounts(counts?: Partial<Record<AmmoType, number>>): Record<AmmoType, number> {
  const normalized = createAmmoCounts();
  for (const ammo of AMMO_DEFINITIONS) {
    const count = counts?.[ammo.type];
    normalized[ammo.type] = Number.isFinite(count)
      ? Math.min(AMMO_CAPACITIES[ammo.type], Math.max(0, Math.floor(count as number)))
      : AMMO_CAPACITIES[ammo.type];
  }
  return normalized;
}

export function refillAmmo(state: Pick<GameState, 'resources' | 'ammoCounts' | 'ammo'>, type: AmmoType): boolean {
  const capacity = AMMO_CAPACITIES[type];
  const cost = AMMO_REFILL_COSTS[type];
  if (state.ammoCounts[type] >= capacity || state.resources < cost) return false;
  state.resources -= cost;
  state.ammoCounts[type] = capacity;
  state.ammo = type;
  return true;
}

export function getAmmoDefinition(type: AmmoType): AmmoDefinition {
  return AMMO_DEFINITIONS.find((definition) => definition.type === type) ?? AMMO_DEFINITIONS[0];
}

export function isAmmoType(value: unknown): value is AmmoType {
  return value === 'bb' || value === 'steelBb' || value === 'stone' || value === 'blast' || value === 'lightning' || value === 'meteor';
}
