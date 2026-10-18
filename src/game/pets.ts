import type { FarmPetState, GameState, PetType } from './types';

export interface PetDefinition {
  type: PetType;
  name: string;
  image: string;
  price: number;
  description: string;
  damage: number;
  attackCooldown: number;
  speed: number;
}

export const PET_MAX_HP = 100;
export const CHURU_PRICE = 8;
export const CHURU_HEAL = 40;
export const FAKE_NEWS_FRIENDLY_FIRE_DAMAGE = 14;

export const PET_DEFINITIONS: PetDefinition[] = [
  { type: 'nuni', name: '누니', image: 'pet-nuni.png', price: 40, description: '빠르게 달려가 동물 친구를 공격해요.', damage: 9, attackCooldown: 1.05, speed: 158 },
  { type: 'yangi', name: '양이', image: 'pet-yangi.png', price: 60, description: '가까이 다가온 적을 함께 막아요.', damage: 12, attackCooldown: 1.2, speed: 148 },
  { type: 'maru', name: '마루', image: 'pet-maru.png', price: 75, description: '강한 한 방으로 길을 열어요.', damage: 17, attackCooldown: 1.55, speed: 138 },
];

export const PET_PATROLS: Record<PetType, Array<{ x: number; y: number }>> = {
  nuni: [
    { x: 265, y: 258 }, { x: 315, y: 445 }, { x: 125, y: 455 }, { x: 108, y: 300 },
  ],
  yangi: [
    { x: 732, y: 258 }, { x: 890, y: 312 }, { x: 935, y: 405 }, { x: 748, y: 520 },
  ],
  maru: [
    { x: 440, y: 250 }, { x: 595, y: 252 }, { x: 760, y: 465 }, { x: 585, y: 535 }, { x: 420, y: 465 },
  ],
};

export function isPetType(value: unknown): value is PetType {
  return value === 'nuni' || value === 'yangi' || value === 'maru';
}

export function getPetDefinition(type: PetType): PetDefinition {
  return PET_DEFINITIONS.find((pet) => pet.type === type) ?? PET_DEFINITIONS[0];
}

function newPet(type: PetType, x: number, y: number): FarmPetState {
  return { type, x, y, facingX: 1, facingY: 0, attackCooldown: 0.4, patrolIndex: 0, hp: PET_MAX_HP, maxHp: PET_MAX_HP, stunnedUntilWave: 0, damageCooldown: 0 };
}

export function purchasePet(state: GameState, type: PetType): boolean {
  if (state.pets.some((pet) => pet.type === type)) return false;
  const definition = getPetDefinition(type);
  if (state.resources < definition.price) return false;

  const offsets: Record<PetType, { x: number; y: number }> = {
    nuni: { x: -48, y: -3 },
    yangi: { x: 0, y: -3 },
    maru: { x: 48, y: -3 },
  };
  const offset = offsets[type];
  state.resources -= definition.price;
  const x = Math.max(28, Math.min(3044, state.player.x + offset.x));
  const y = Math.max(0, Math.min(560, state.player.y + offset.y));
  state.pets.push(newPet(type, x, y));
  return true;
}

export function feedPet(state: GameState, type: PetType): boolean {
  const pet = state.pets.find((companion) => companion.type === type);
  if (!pet || (pet.hp >= pet.maxHp && pet.stunnedUntilWave <= state.wave) || state.resources < CHURU_PRICE) return false;
  state.resources -= CHURU_PRICE;
  pet.hp = Math.min(pet.maxHp, pet.hp + CHURU_HEAL);
  pet.stunnedUntilWave = 0;
  return true;
}
