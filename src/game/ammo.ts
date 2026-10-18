import type { AmmoType, GameState, LegacyAmmoType, WeaponDefinition, WeaponType } from './types';

export interface AmmoDefinition {
  type: LegacyAmmoType;
  name: string;
  icon: string;
  description: string;
  speed: number;
  damage: number;
  blastRadius?: number;
  chainCount?: number;
}

export const WEAPON_DEFINITIONS: WeaponDefinition[] = [
  { type: 'slingshot', name: '새총', icon: '🪃', ammoName: 'BB탄', projectileSpeed: 670, shotsPerSecond: 1, roundsPerPurchase: 30, ammoCost: 6, weaponCost: 0, power: 1, mobilityPenalty: 0.1, description: '초당 1발 · 파워 1 · 이동속도/점프 높이 -10%' },
  { type: 'bow', name: '활', icon: '🏹', ammoName: '화살', projectileSpeed: 590, shotsPerSecond: 0.5, roundsPerPurchase: 12, ammoCost: 10, weaponCost: 34, power: 3, mobilityPenalty: 0.2, description: '2초당 1발 · 파워 3 · 이동속도/점프 높이 -20%' },
  { type: 'crossbow', name: '크로스보우', icon: '🎯', ammoName: '볼트 화살', projectileSpeed: 760, shotsPerSecond: 1 / 3, roundsPerPurchase: 12, ammoCost: 12, weaponCost: 52, power: 5, mobilityPenalty: 0.3, description: '3초당 1발 · 파워 5 · 관통 · 이동속도/점프 높이 -30%' },
  { type: 'pistol', name: '권총', icon: '🔫', ammoName: '권총 탄약', projectileSpeed: 820, shotsPerSecond: 1, roundsPerPurchase: 12, ammoCost: 14, weaponCost: 72, power: 9, mobilityPenalty: 0.1, description: '초당 1발 · 파워 9 · 이동속도/점프 높이 -10%' },
  { type: 'rifle', name: '자동소총', icon: '🔫', ammoName: '소총 탄약', projectileSpeed: 880, shotsPerSecond: 3, roundsPerPurchase: 30, ammoCost: 36, weaponCost: 95, power: 11, mobilityPenalty: 0.5, description: '초당 3발 · 파워 11 · 이동속도/점프 높이 -50% · 탄약값 2배' },
];

// Kept only to read older save codes. These one-off ammo types are no longer
// offered in the shop; weapon inventory uses WEAPON_DEFINITIONS instead.
export const AMMO_DEFINITIONS: AmmoDefinition[] = [
  { type: 'bb', name: 'BB탄', icon: '⚪', description: '구형 새총 탄약', speed: 650, damage: 20 },
  { type: 'steelBb', name: '강철 BB탄', icon: '🔘', description: '구형 특수 탄약', speed: 740, damage: 28 },
  { type: 'stone', name: '돌멩이', icon: '🪨', description: '맞으면 넉백', speed: 500, damage: 32 },
  { type: 'blast', name: '폭렬탄', icon: '💥', description: '충돌 지점 광역 피해', speed: 430, damage: 23, blastRadius: 96 },
  { type: 'lightning', name: '번개탄', icon: '⚡', description: '주변 적에게 연쇄 피해', speed: 690, damage: 27, chainCount: 3 },
  { type: 'meteor', name: '메테오탄', icon: '☄️', description: '넓은 충격파 피해', speed: 360, damage: 48, blastRadius: 164 },
];

const LEGACY_CAPACITIES: Record<LegacyAmmoType, number> = {
  bb: 30,
  steelBb: 10,
  stone: 3,
  blast: 1,
  lightning: 1,
  meteor: 1,
};

export const AMMO_CAPACITIES: Record<AmmoType, number> = {
  ...Object.fromEntries(WEAPON_DEFINITIONS.map((weapon) => [weapon.type, weapon.roundsPerPurchase])) as Record<WeaponType, number>,
  ...LEGACY_CAPACITIES,
};

export const AMMO_REFILL_COSTS: Record<WeaponType, number> = Object.fromEntries(
  WEAPON_DEFINITIONS.map((weapon) => [weapon.type, weapon.ammoCost]),
) as Record<WeaponType, number>;

export function createAmmoCounts(): Record<AmmoType, number> {
  return {
    slingshot: 30,
    bow: 0,
    crossbow: 0,
    pistol: 0,
    rifle: 0,
    ...LEGACY_CAPACITIES,
  };
}

export function normalizeAmmoCounts(counts?: Partial<Record<AmmoType, number>>): Record<AmmoType, number> {
  const normalized = createAmmoCounts();
  for (const weapon of WEAPON_DEFINITIONS) {
    const count = counts?.[weapon.type];
    const legacySlingshotCount = weapon.type === 'slingshot' ? counts?.bb : undefined;
    const value = Number.isFinite(count) ? count : Number.isFinite(legacySlingshotCount) ? legacySlingshotCount : normalized[weapon.type];
    normalized[weapon.type] = Math.min(AMMO_CAPACITIES[weapon.type], Math.max(0, Math.floor(value as number)));
  }
  for (const ammo of AMMO_DEFINITIONS) {
    const count = counts?.[ammo.type];
    normalized[ammo.type] = Number.isFinite(count)
      ? Math.min(LEGACY_CAPACITIES[ammo.type], Math.max(0, Math.floor(count as number)))
      : LEGACY_CAPACITIES[ammo.type];
  }
  return normalized;
}

export function purchaseWeapon(state: Pick<GameState, 'resources' | 'ownedWeapons'>, type: WeaponType): boolean {
  if (state.ownedWeapons.includes(type)) return false;
  const weapon = getWeaponDefinition(type);
  if (state.resources < weapon.weaponCost) return false;
  state.resources -= weapon.weaponCost;
  state.ownedWeapons.push(type);
  return true;
}

export function refillAmmo(state: Pick<GameState, 'resources' | 'ammoCounts' | 'ammo' | 'ownedWeapons'>, type: WeaponType): boolean {
  const weapon = getWeaponDefinition(type);
  if (!state.ownedWeapons.includes(type) || state.ammoCounts[type] >= AMMO_CAPACITIES[type] || state.resources < weapon.ammoCost) return false;
  state.resources -= weapon.ammoCost;
  state.ammoCounts[type] = Math.min(AMMO_CAPACITIES[type], state.ammoCounts[type] + weapon.roundsPerPurchase);
  state.ammo = type;
  return true;
}

export function getWeaponDefinition(type: WeaponType): WeaponDefinition {
  return WEAPON_DEFINITIONS.find((weapon) => weapon.type === type) ?? WEAPON_DEFINITIONS[0];
}

export function getAmmoDefinition(type: LegacyAmmoType): AmmoDefinition {
  return AMMO_DEFINITIONS.find((definition) => definition.type === type) ?? AMMO_DEFINITIONS[0];
}

export function isWeaponType(value: unknown): value is WeaponType {
  return value === 'slingshot' || value === 'bow' || value === 'crossbow' || value === 'pistol' || value === 'rifle';
}

export function isLegacyAmmoType(value: unknown): value is LegacyAmmoType {
  return value === 'bb' || value === 'steelBb' || value === 'stone' || value === 'blast' || value === 'lightning' || value === 'meteor';
}

export function isAmmoType(value: unknown): value is AmmoType {
  return isWeaponType(value) || isLegacyAmmoType(value);
}
