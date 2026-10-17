import type { AmmoType } from './types';

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

export function createAmmoCounts(): Record<AmmoType, number> {
  return { bb: 999, steelBb: 80, stone: 80, blast: 10, lightning: 8, meteor: 4 };
}

export function getAmmoDefinition(type: AmmoType): AmmoDefinition {
  return AMMO_DEFINITIONS.find((definition) => definition.type === type) ?? AMMO_DEFINITIONS[0];
}

export function isAmmoType(value: unknown): value is AmmoType {
  return value === 'bb' || value === 'steelBb' || value === 'stone' || value === 'blast' || value === 'lightning' || value === 'meteor';
}
