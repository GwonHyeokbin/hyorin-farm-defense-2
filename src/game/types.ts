export type EnemyKind = 'mole' | 'rabbit' | 'crow' | 'boar' | 'bear' | 'tiger' | 'wolf' | 'kingBoar';
export type WeaponType = 'slingshot' | 'bow' | 'crossbow' | 'pistol' | 'rifle';
export type LegacyAmmoType = 'bb' | 'steelBb' | 'stone' | 'blast' | 'lightning' | 'meteor';
export type AmmoType = WeaponType | LegacyAmmoType;
export type GrowthStage = 1 | 2 | 3 | 4;
export type PetType = 'nuni' | 'yangi' | 'maru';
export type EnemyStatus = 'knockback' | 'groggy' | 'stun' | null;
export type UpgradeKey = 'power' | 'speed' | 'rapid' | 'armor' | 'vitality' | 'fence';
export type WavePhase = 'defend' | 'rest';

export interface PlayerState {
  x: number;
  y: number;
  velocityY: number;
  grounded: boolean;
  hp: number;
  maxHp: number;
  attackCooldown: number;
  meleeCooldown: number;
  boulderCooldown: number;
  invulnerable: number;
  facingX: number;
  facingY: number;
  stage: GrowthStage;
  lives: number;
  jumpTimer: number;
  jumpCooldown: number;
}

export interface MilkPickupState {
  id: number;
  x: number;
  y: number;
}

export interface DadMessagePickupState {
  id: number;
  x: number;
  y: number;
  velocityY: number;
  life: number;
  phraseIndex: number;
}

export interface EnemyState {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  targetIndex: number;
  mood: 'seek' | 'burrow' | 'dive' | 'charge';
  moodTimer: number;
  attackCooldown: number;
  contactCooldown: number;
  hitFlash: number;
  status?: EnemyStatus;
  statusTimer?: number;
}

export interface ProjectileState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  ammo?: AmmoType;
  targetId?: number;
  hitEnemyIds?: number[];
}

export interface FarmPetState {
  type: PetType;
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  attackCooldown: number;
  patrolIndex: number;
  hp: number;
  maxHp: number;
  stunnedUntilWave: number;
  damageCooldown: number;
}

export interface HazardPickupState {
  id: number;
  x: number;
  y: number;
  velocityX: number;
  life: number;
}

export interface WeaponDefinition {
  type: WeaponType;
  name: string;
  icon: string;
  ammoName: string;
  projectileSpeed: number;
  shotsPerSecond: number;
  roundsPerPurchase: number;
  ammoCost: number;
  weaponCost: number;
  power: number;
  mobilityPenalty: number;
  description: string;
}

export interface CropState {
  hp: number;
  maxHp: number;
}

export interface FacilityState {
  hp: number;
  maxHp: number;
}

export interface FarmState {
  health: number;
  maxHealth: number;
  crops: CropState[];
  facilities: Record<string, FacilityState>;
}

export interface WaveState {
  phase: WavePhase;
  total: number;
  spawned: number;
  spawnTimer: number;
  phaseTimer: number;
  elapsed: number;
}

export interface RunStats {
  kills: number;
  protectedCrops: number;
  wavesCleared: number;
}

export interface GameState {
  schemaVersion: 1;
  gameVersion: string;
  seed: number;
  nextEnemyId: number;
  wave: number;
  score: number;
  resources: number;
  elapsed: number;
  level: number;
  retainedLevelBonuses: number;
  experience: number;
  experienceToNext: number;
  lifeCompleteShown: boolean;
  ammo: AmmoType;
  ammoCounts: Record<AmmoType, number>;
  ownedWeapons: WeaponType[];
  milkPickups: MilkPickupState[];
  nextMilkId: number;
  dadMessagePickups: DadMessagePickupState[];
  nextDadMessageId: number;
  dadMessageSpawnTimer: number;
  rottenWatermelons: HazardPickupState[];
  fakeNewsPapers: HazardPickupState[];
  nextHazardId: number;
  hazardSpawnTimer: number;
  terrainSeed: number;
  terrainRevision: number;
  terrainSector: number;
  boulderUnlocked: boolean;
  pets: FarmPetState[];
  player: PlayerState;
  upgrades: Record<UpgradeKey, number>;
  farm: FarmState;
  waveState: WaveState;
  stats: RunStats;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
}

export interface Controls {
  // Left/right move across the platformer; up is retained for older callers.
  up?: boolean;
  down?: boolean;
  left?: boolean;
  right?: boolean;
  attack?: boolean;
  jump?: boolean;
  aimX?: number;
  aimY?: number;
  moveToX?: number;
  moveToY?: number;
}

export interface EngineEvent {
  type: 'fire' | 'hit' | 'melee' | 'boulder' | 'level-up' | 'dad-message' | 'life-complete' | 'knockback' | 'groggy' | 'stun' | 'kill' | 'farm-hit' | 'player-hit' | 'wave-start' | 'wave-clear' | 'game-over' | 'milk' | 'special-attack' | 'jump' | 'life-lost' | 'pet-damaged' | 'pet-stunned' | 'fake-news';
  text?: string;
  x?: number;
  y?: number;
}

export interface UpgradeDefinition {
  key: UpgradeKey;
  name: string;
  icon: string;
  description: string;
  baseCost: number;
}
