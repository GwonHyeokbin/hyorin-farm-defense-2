import type { Controls, EnemyKind, EnemyState, EngineEvent, GameState, GrowthStage, MilkPickupState } from './types';
import { createAmmoCounts, getAmmoDefinition, getWeaponDefinition, isLegacyAmmoType, isWeaponType, WEAPON_DEFINITIONS } from './ammo';
import { FAKE_NEWS_FRIENDLY_FIRE_DAMAGE, getPetDefinition, PET_MAX_HP } from './pets';
import { growthStageMobilityPenalty, levelGrowthMultiplier, retainedLevelSteps } from './progression';

export const WORLD = { width: 3072, height: 640, groundY: 560 } as const;
export const DAD_MESSAGE_TEXTS = [
  '효린아 아무것도 안 해도 된다',
  '아빠는 효린이가 건강하기만 하면 돼',
  '효린아 아무리 힘들어도 자신을 버려선 안돼',
  '효린아 포기하지 않으면 실패란 없다',
  '잘 하지 않아도 돼',
  '괜찮아 아빠한테 기대',
  '고민있으면 아빠한테 말하렴',
] as const;
export const LEVEL_100_MESSAGE = '행복한 가정에서 환생하여 하고 싶은 것을 모두 하고 살아갑니다.';
export const SEASONS = ['봄', '여름', '가을', '겨울'] as const;
export const ENEMY_NAMES: Record<EnemyKind, string> = {
  mole: '두더지',
  rabbit: '토끼',
  crow: '까마귀',
  boar: '멧돼지',
  bear: '곰',
  tiger: '호랑이',
  wolf: '늑대',
  fox: '여우',
  raccoon: '너구리',
  kingBoar: '왕멧돼지',
};
export type SeasonName = (typeof SEASONS)[number];
export function seasonForWave(wave: number): SeasonName {
  return SEASONS[Math.floor(Math.max(0, wave - 1) / 3) % SEASONS.length];
}
export const PLATFORM_SURFACES = [
  { x: 340, y: 460, width: 176 }, { x: 690, y: 390, width: 184 },
  { x: 1090, y: 475, width: 208 }, { x: 1485, y: 408, width: 194 },
  { x: 1875, y: 342, width: 188 }, { x: 2260, y: 442, width: 212 },
  { x: 2670, y: 380, width: 196 },
] as const;
const GROWTH_NAMES: Record<GrowthStage, string> = { 1: '아기 효린', 2: '어린이 효린', 3: '청소년 효린', 4: '성인 효린' };
const PLAYER_STAGE_HEIGHTS: Record<GrowthStage, number> = { 1: 48, 2: 64, 3: 72, 4: 80 };
const STARTING_MILK: MilkPickupState[] = [
  { id: 1, x: 250, y: WORLD.groundY - 23 },
  { id: 2, x: 422, y: 437 },
  { id: 3, x: 1560, y: 385 },
  { id: 4, x: 2768, y: 357 },
];
export const CROP_TARGETS = [
  { x: 575, y: WORLD.groundY - 20, radius: 32 },
  { x: 1310, y: WORLD.groundY - 20, radius: 32 },
  { x: 2215, y: WORLD.groundY - 20, radius: 32 },
  { x: 2940, y: WORLD.groundY - 20, radius: 32 },
] as const;
export const FACILITY_TARGETS = [
  { id: 'barn', x: 900, y: WORLD.groundY - 20, radius: 48 },
  { id: 'coop', x: 1800, y: WORLD.groundY - 20, radius: 38 },
  { id: 'silo', x: 2600, y: WORLD.groundY - 20, radius: 40 },
] as const;
const ENEMY_INFO: Record<EnemyKind, { hp: number; speed: number; damage: number; score: number; resource: number; experience: number }> = {
  mole: { hp: 21, speed: 45, damage: 4, score: 90, resource: 2, experience: 12 },
  rabbit: { hp: 28, speed: 58, damage: 5, score: 120, resource: 3, experience: 16 },
  crow: { hp: 18, speed: 64, damage: 4, score: 110, resource: 2, experience: 14 },
  boar: { hp: 58, speed: 40, damage: 8, score: 250, resource: 5, experience: 32 },
  bear: { hp: 106, speed: 27, damage: 12, score: 420, resource: 9, experience: 48 },
  tiger: { hp: 620, speed: 86, damage: 24, score: 2200, resource: 30, experience: 180 },
  wolf: { hp: 42, speed: 78, damage: 7, score: 275, resource: 6, experience: 31 },
  fox: { hp: 36, speed: 84, damage: 6, score: 230, resource: 4, experience: 24 },
  raccoon: { hp: 52, speed: 48, damage: 6, score: 240, resource: 5, experience: 28 },
  kingBoar: { hp: 260, speed: 47, damage: 14, score: 1600, resource: 25, experience: 120 },
};

export function createGameState(seed = Date.now() >>> 0): GameState {
  return {
    schemaVersion: 1,
    gameVersion: '1.0.0',
    seed: seed >>> 0 || 1,
    nextEnemyId: 1,
    wave: 0,
    score: 0,
    resources: 20,
    elapsed: 0,
    level: 1,
    retainedLevelBonuses: 0,
    experience: 0,
    experienceToNext: 100,
    lifeCompleteShown: false,
    ammo: 'slingshot',
    ammoCounts: createAmmoCounts(),
    ownedWeapons: ['slingshot'],
    milkPickups: structuredClone(STARTING_MILK),
    nextMilkId: STARTING_MILK.length + 1,
    dadMessagePickups: [],
    nextDadMessageId: 1,
    dadMessageSpawnTimer: 8,
    rottenWatermelons: [],
    fakeNewsPapers: [],
    nextHazardId: 1,
    hazardSpawnTimer: 12,
    terrainSeed: (seed >>> 0) || 1,
    terrainRevision: 0,
    terrainSector: 0,
    boulderUnlocked: false,
    pets: [],
    player: { x: 120, y: WORLD.groundY, velocityY: 0, grounded: true, hp: 100, maxHp: 100, attackCooldown: 0, meleeCooldown: 0, boulderCooldown: 0, invulnerable: 0, facingX: 1, facingY: 0, stage: 2, lives: 3, jumpTimer: 0, jumpCooldown: 0 },
    upgrades: { power: 0, speed: 0, rapid: 0, armor: 0, vitality: 0, fence: 0 },
    farm: {
      health: 120,
      maxHealth: 120,
      crops: Array.from({ length: 4 }, () => ({ hp: 70, maxHp: 70 })),
      facilities: {
        barn: { hp: 120, maxHp: 120 },
        coop: { hp: 100, maxHp: 100 },
        silo: { hp: 110, maxHp: 110 },
      },
    },
    waveState: { phase: 'rest', total: 0, spawned: 0, spawnTimer: 0, phaseTimer: 2, elapsed: 0 },
    stats: { kills: 0, protectedCrops: 0, wavesCleared: 0 },
    enemies: [],
    projectiles: [],
  };
}

function random(state: GameState): number {
  state.seed = (state.seed + 0x6d2b79f5) >>> 0;
  let value = state.seed;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function beginWave(state: GameState): EngineEvent {
  state.wave += 1;
  state.ammo = 'slingshot';
  state.terrainSeed = random(state) * 0xffffffff >>> 0;
  state.terrainRevision += 1;
  state.waveState = {
    phase: 'defend',
    total: Math.min(2 + Math.ceil(state.wave), 12) + (state.wave % 5 === 0 ? 1 : 0),
    spawned: 0,
    spawnTimer: 0.6,
    phaseTimer: 0,
    elapsed: 0,
  };
  return { type: 'wave-start', text: `${state.wave}구간 · ${seasonForWave(state.wave)} 모험 시작!${state.wave % 5 === 0 ? ' 호랑이 보스가 다가와요!' : ''}` };
}

function chooseTarget(state: GameState, kind: EnemyKind): number {
  if (kind === 'crow' || kind === 'rabbit' || kind === 'mole' || kind === 'raccoon') return Math.floor(random(state) * CROP_TARGETS.length);
  if (kind === 'wolf' || kind === 'fox') return CROP_TARGETS.length + 1;
  return CROP_TARGETS.length + Math.floor(random(state) * FACILITY_TARGETS.length);
}

interface FarmRaidTarget {
  x: number;
  y: number;
  radius: number;
  label: string;
  cropIndex?: number;
  facilityId?: string;
}

function getFarmRaidTarget(state: GameState, enemy: EnemyState): FarmRaidTarget | null {
  const targets: (FarmRaidTarget | null)[] = [
    ...CROP_TARGETS.map((position, index) => state.farm.crops[index].hp > 0
      ? { ...position, label: `밭 ${index + 1}`, cropIndex: index }
      : null),
    ...FACILITY_TARGETS.map((position) => state.farm.facilities[position.id]?.hp > 0
      ? { ...position, label: position.id === 'coop' ? '닭장' : position.id === 'barn' ? '헛간' : '곡식 창고', facilityId: position.id }
      : null),
  ];
  const preferred = targets[enemy.targetIndex];
  if (preferred) return preferred;
  return targets
    .map((target) => target ? { target, distance: Math.abs(target.x - enemy.x) } : null)
    .filter((entry): entry is { target: FarmRaidTarget; distance: number } => entry !== null)
    .sort((a, b) => a.distance - b.distance)[0]?.target ?? null;
}

function attackFarmTarget(state: GameState, enemy: EnemyState, target: FarmRaidTarget, events: EngineEvent[]): void {
  const damage = ENEMY_INFO[enemy.kind].damage;
  let destroyed = false;
  if (target.cropIndex !== undefined) {
    const crop = state.farm.crops[target.cropIndex];
    crop.hp = Math.max(0, crop.hp - damage);
    destroyed = crop.hp === 0;
  } else if (target.facilityId) {
    const facility = state.farm.facilities[target.facilityId];
    if (facility) {
      facility.hp = Math.max(0, facility.hp - damage);
      destroyed = facility.hp === 0;
    }
  }
  if (!destroyed) return;
  const farmDamage = target.cropIndex !== undefined ? 15 : 20;
  state.farm.health = Math.max(0, state.farm.health - farmDamage);
  events.push({
    type: 'farm-hit',
    text: `${ENEMY_NAMES[enemy.kind]}가 ${target.label}에 피해를 줬어요. 농장 체력 ${state.farm.health}/${state.farm.maxHealth}`,
  });
}

function keepOnlyOneLivingTiger(state: GameState): void {
  const tigers = state.enemies.filter((enemy) => enemy.kind === 'tiger' && enemy.hp > 0);
  if (tigers.length <= 1) return;
  const strongestTiger = tigers.reduce((strongest, candidate) => candidate.maxHp > strongest.maxHp ? candidate : strongest);
  state.enemies = state.enemies.filter((enemy) => enemy.kind !== 'tiger' || enemy.hp <= 0 || enemy === strongestTiger);
}

function spawnEnemy(state: GameState): void {
  const choice = random(state);
  let kind: EnemyKind;
  if (state.wave % 5 === 0 && state.waveState.spawned === state.waveState.total - 1
    && !state.enemies.some((enemy) => enemy.kind === 'tiger' && enemy.hp > 0)) kind = 'tiger';
  else if (state.wave < 2) kind = choice < 0.55 ? 'mole' : 'rabbit';
  else if (choice < 0.17) kind = 'mole';
  else if (choice < 0.34) kind = 'rabbit';
  else if (choice < 0.49) kind = 'crow';
  else if (choice < 0.63) kind = 'wolf';
  else if (choice < 0.73) kind = 'fox';
  else if (choice < 0.82) kind = 'raccoon';
  else if (choice < 0.91) kind = 'boar';
  else kind = 'bear';

  if (kind === 'tiger' && state.enemies.some((enemy) => enemy.kind === 'tiger' && enemy.hp > 0)) kind = 'bear';

  const fromLeft = random(state) < 0.5;
  const x = PhaserMathClamp(state.player.x + (fromLeft ? -1 : 1) * (430 + random(state) * 220), 30, WORLD.width - 30);
  const y = kind === 'crow' ? 300 + random(state) * 125 : WORLD.groundY - 20;
  const info = ENEMY_INFO[kind];
  const difficulty = 1 + (state.wave - 1) * 0.04;
  const targetIndex = chooseTarget(state, kind);
  const enemy: EnemyState = {
    id: state.nextEnemyId++,
    kind,
    x,
    y,
    hp: Math.round(info.hp * difficulty),
    maxHp: Math.round(info.hp * difficulty),
    speed: info.speed * Math.min(1.18, 1 + (state.wave - 1) * 0.01),
    targetIndex,
    mood: kind === 'mole' ? 'burrow' : kind === 'crow' ? 'dive' : 'seek',
    moodTimer: kind === 'mole' ? 1.1 : kind === 'crow' ? 1.5 : ['boar', 'bear', 'tiger'].includes(kind) ? 2.2 : 0,
    attackCooldown: kind === 'tiger' ? 0.9 : 1.2,
    contactCooldown: 0,
    hitFlash: 0,
    status: null,
    statusTimer: 0,
  };
  state.enemies.push(enemy);
  state.waveState.spawned += 1;
}

function spawnProjectile(state: GameState): boolean {
  const { player } = state;
  const facing = player.facingX < 0 ? -1 : 1;
  const sourceY = player.y - 32;
  let ammoType = state.ammo;
  let damage: number;
  let speed: number;
  let cooldown: number;

  if (isLegacyAmmoType(ammoType)) {
    if (state.ammoCounts[ammoType] <= 0) return false;
    const ammo = getAmmoDefinition(ammoType);
    damage = ammo.damage * (1 + state.upgrades.power * 0.12);
    speed = ammo.speed;
    cooldown = 0.48;
  } else {
    if (!state.ownedWeapons.includes(ammoType) || state.ammoCounts[ammoType] <= 0) {
      const nextWeapon = WEAPON_DEFINITIONS.find((weapon) => state.ownedWeapons.includes(weapon.type) && state.ammoCounts[weapon.type] > 0);
      if (!nextWeapon) return false;
      ammoType = nextWeapon.type;
      state.ammo = ammoType;
    }
    const weapon = getWeaponDefinition(ammoType);
    damage = weapon.power * 20 * (1 + state.upgrades.power * 0.12);
    speed = weapon.projectileSpeed;
    cooldown = 1 / weapon.shotsPerSecond;
  }
  state.ammoCounts[ammoType] -= 1;
  state.projectiles.push({
    x: player.x + facing * 24,
    y: sourceY,
    vx: facing * speed,
    vy: 0,
    damage,
    life: 1.6,
    ammo: ammoType,
  });
  player.attackCooldown = cooldown;
  if (isWeaponType(ammoType)) {
    if (state.ammoCounts[ammoType] === 0) {
      const nextWeapon = WEAPON_DEFINITIONS.find((weapon) => state.ownedWeapons.includes(weapon.type) && state.ammoCounts[weapon.type] > 0);
      if (nextWeapon) state.ammo = nextWeapon.type;
    }
  }
  player.facingX = facing;
  player.facingY = 0;
  return true;
}

function increaseExperience(state: GameState, amount: number, events: EngineEvent[]): void {
  state.experience += amount;
  while (state.experience >= state.experienceToNext) {
    state.experience -= state.experienceToNext;
    increaseLevel(state, events);
  }
}

function growPetsOnLevelUp(state: GameState): void {
  const hpPerLevel = PET_MAX_HP * 0.01;
  for (const pet of state.pets) {
    pet.maxHp += hpPerLevel;
    if (pet.hp > 0) pet.hp = Math.min(pet.maxHp, pet.hp + hpPerLevel);
  }
}

function increaseLevel(state: GameState, events: EngineEvent[]): void {
  state.level += 1;
  state.experienceToNext = state.level * 100;
  growPetsOnLevelUp(state);
  const totalGrowth = retainedLevelSteps(state);
  events.push({ type: 'level-up', text: `레벨 ${state.level}! 이동 속도·점프 높이·고양이 공격력·체력 +1% (누적 ${totalGrowth}%)` });
  announceLevel100(state, events);
}

function announceLevel100(state: GameState, events: EngineEvent[]): void {
  if (state.level < 100 || state.lifeCompleteShown) return;
  state.lifeCompleteShown = true;
  events.push({ type: 'life-complete', text: LEVEL_100_MESSAGE });
}

function spawnDadMessage(state: GameState): void {
  const x = PhaserMathClamp(state.player.x + (random(state) - 0.5) * 560, 140, WORLD.width - 140);
  state.dadMessagePickups.push({
    id: state.nextDadMessageId++,
    x,
    y: -52,
    velocityY: 82 + random(state) * 22,
    life: 20,
    phraseIndex: Math.floor(random(state) * DAD_MESSAGE_TEXTS.length),
  });
}

function updateDadMessages(state: GameState, dt: number, events: EngineEvent[]): void {
  const remaining = [] as GameState['dadMessagePickups'];
  const playerHalfHeight: Record<GrowthStage, number> = { 1: 24, 2: 32, 3: 36, 4: 40 };

  for (const pickup of state.dadMessagePickups) {
    pickup.life -= dt;
    if (pickup.velocityY > 0) {
      const previousY = pickup.y;
      const nextY = pickup.y + pickup.velocityY * dt;
      const landing = PLATFORM_SURFACES
        .filter((platform) => pickup.x >= platform.x && pickup.x <= platform.x + platform.width
          && previousY < platform.y - 38 && nextY >= platform.y - 38)
        .sort((a, b) => a.y - b.y)[0];
      const groundY = WORLD.groundY - 38;
      if (landing) {
        pickup.y = landing.y - 38;
        pickup.velocityY = 0;
      } else if (nextY >= groundY) {
        pickup.y = groundY;
        pickup.velocityY = 0;
      } else pickup.y = nextY;
    }

    const playerCenterY = state.player.y - playerHalfHeight[state.player.stage];
    const touchesMessage = Math.abs(pickup.x - state.player.x) <= 158
      && Math.abs(pickup.y - playerCenterY) <= 74;
    if (touchesMessage) {
      increaseLevel(state, events);
      events.push({ type: 'dad-message', text: DAD_MESSAGE_TEXTS[pickup.phraseIndex] });
      continue;
    }
    if (pickup.life > 0) remaining.push(pickup);
  }
  state.dadMessagePickups = remaining;
}

function damageEnemy(state: GameState, enemy: EnemyState, amount: number, events: EngineEvent[]): void {
  if (enemy.hp <= 0) return;
  enemy.hp = Math.max(0, enemy.hp - amount);
  enemy.hitFlash = 0.14;
  events.push({ type: 'hit' });
  if (enemy.hp > 0) return;
  state.score += ENEMY_INFO[enemy.kind].score;
  state.resources += ENEMY_INFO[enemy.kind].resource;
  state.stats.kills += 1;
  if (state.milkPickups.length < 12 && random(state) < 0.14) {
    const x = PhaserMathClamp(enemy.x, 42, WORLD.width - 42);
    const platform = PLATFORM_SURFACES.find((surface) => x >= surface.x && x <= surface.x + surface.width);
    state.milkPickups.push({ id: state.nextMilkId++, x, y: platform ? platform.y - 23 : WORLD.groundY - 23 });
  }
  increaseExperience(state, ENEMY_INFO[enemy.kind].experience, events);
  if (CROP_TARGETS.some((crop) => Math.hypot(enemy.x - crop.x, enemy.y - crop.y) < 180)) state.stats.protectedCrops += 1;
  events.push({ type: 'kill' });
}

function applyEnemyStatus(enemy: EnemyState, status: NonNullable<EnemyState['status']>, seconds: number): void {
  enemy.status = status;
  enemy.statusTimer = Math.max(enemy.statusTimer ?? 0, seconds);
}

function attackWithLargeStone(state: GameState, events: EngineEvent[]): void {
  const { player } = state;
  if (player.meleeCooldown > 0) return;
  const target = state.enemies
    .filter((enemy) => enemy.hp > 0)
    .map((enemy) => ({ enemy, distance: Math.hypot(enemy.x - player.x, enemy.y - player.y) }))
    .filter((entry) => entry.distance <= 68)
    .sort((a, b) => a.distance - b.distance)[0];
  if (!target) return;
  player.meleeCooldown = 1.15;
  applyEnemyStatus(target.enemy, 'groggy', 1.4);
  events.push({ type: 'melee' }, { type: 'groggy' });
  damageEnemy(state, target.enemy, 34 * (1 + state.upgrades.power * 0.12), events);
}

function attackWithBoulder(state: GameState, events: EngineEvent[]): void {
  const { player } = state;
  if (!state.boulderUnlocked || player.boulderCooldown > 0) return;
  const targets = state.enemies
    .filter((enemy) => enemy.hp > 0 && Math.hypot(enemy.x - player.x, enemy.y - player.y) <= 92)
    .slice(0, 4);
  if (targets.length === 0) return;
  player.boulderCooldown = 5.5;
  events.push({ type: 'boulder', text: '바위 강타!' });
  for (const enemy of targets) {
    applyEnemyStatus(enemy, 'stun', 1.1);
    events.push({ type: 'stun' });
    damageEnemy(state, enemy, 46 * (1 + state.upgrades.power * 0.12), events);
  }
}

function updateEnemy(state: GameState, enemy: EnemyState, dt: number, events: EngineEvent[], previousPlayerY: number): void {
  const farmTarget = getFarmRaidTarget(state, enemy);
  const target = farmTarget ?? { x: state.player.x, y: state.player.y - 30, radius: 24 };
  enemy.moodTimer = Math.max(0, enemy.moodTimer - dt);
  enemy.statusTimer = Math.max(0, (enemy.statusTimer ?? 0) - dt);
  if (enemy.statusTimer <= 0) enemy.status = null;
  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt * (enemy.status === 'groggy' ? 0.4 : 1));
  enemy.contactCooldown = Math.max(0, enemy.contactCooldown - dt);
  enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
  if (enemy.status === 'stun') return;

  if (enemy.kind === 'mole' && enemy.mood === 'burrow') {
    if (enemy.moodTimer <= 0) {
      enemy.x = PhaserMathClamp(target.x + (random(state) - 0.5) * 130, 45, WORLD.width - 45);
      enemy.y = WORLD.groundY - 20;
      enemy.mood = 'seek';
      enemy.moodTimer = 0;
    }
    return;
  }

  let speed = enemy.speed * (enemy.status === 'groggy' ? 0.4 : 1);
  if (enemy.kind === 'crow' && enemy.mood === 'dive') {
    speed *= 1.5;
    if (enemy.moodTimer <= 0) { enemy.moodTimer = 2.8; enemy.mood = 'seek'; }
  } else if (enemy.kind === 'crow' && enemy.moodTimer <= 0) {
    enemy.mood = 'dive';
    enemy.moodTimer = 0.8;
  }
  if (enemy.kind === 'boar' || enemy.kind === 'kingBoar' || enemy.kind === 'bear' || enemy.kind === 'tiger') {
    if (enemy.moodTimer <= 0) {
      enemy.mood = enemy.mood === 'charge' ? 'seek' : 'charge';
      enemy.moodTimer = enemy.mood === 'charge' ? (enemy.kind === 'tiger' ? 0.65 : 1.05) : (enemy.kind === 'tiger' ? 2.0 : 2.8);
    }
    if (enemy.mood === 'charge') speed *= enemy.kind === 'tiger' ? 3.8 : enemy.kind === 'kingBoar' ? 3.2 : enemy.kind === 'bear' ? 1.9 : 2.3;
  }
  if (enemy.kind === 'wolf' && state.enemies.some((ally) => ally.id !== enemy.id && ally.kind === 'wolf' && ally.hp > 0 && Math.abs(ally.x - enemy.x) < 150)) speed *= 1.14;

  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const distance = enemy.kind === 'crow' ? Math.hypot(dx, dy) || 1 : Math.abs(dx) || 1;
  const attackRange = target.radius + (enemy.kind === 'crow' ? 6 : 2);
  if (distance > attackRange) {
    const direction = Math.sign(dx);
    enemy.x = PhaserMathClamp(enemy.x + direction * speed * dt, -24, WORLD.width + 24);
    if (enemy.kind === 'crow') enemy.y = PhaserMathClamp(enemy.y + dy / distance * speed * dt, 230, WORLD.groundY - 30);
    else enemy.y = WORLD.groundY - 20;
  } else if (enemy.attackCooldown <= 0) {
    if (farmTarget) {
      enemy.attackCooldown = enemy.kind === 'tiger' ? 1.8 : enemy.kind === 'fox' || enemy.kind === 'raccoon' ? 1.2 : 1.5;
      attackFarmTarget(state, enemy, farmTarget, events);
    } else enemy.attackCooldown = enemy.kind === 'tiger' ? 0.9 : enemy.kind === 'kingBoar' ? 1.15 : 1.4;
  }

  const playerTop = state.player.y - PLAYER_STAGE_HEIGHTS[state.player.stage];
  const enemyTop = enemy.y - (enemy.kind === 'tiger' ? 52 : enemy.kind === 'kingBoar' || enemy.kind === 'bear' ? 42 : 22);
  const enemyBottom = enemy.y + 10;
  const horizontalOverlap = Math.abs(state.player.x - enemy.x) < (enemy.kind === 'tiger' ? 48 : enemy.kind === 'kingBoar' || enemy.kind === 'bear' ? 42 : 30);
  const verticalOverlap = playerTop < enemyBottom && state.player.y > enemyTop;
  if (enemy.hp > 0 && horizontalOverlap && verticalOverlap) {
    if (previousPlayerY <= enemyTop && state.player.y >= enemyTop && state.player.velocityY > 0) {
      damageEnemy(state, enemy, 24 * (1 + state.upgrades.power * 0.12), events);
      state.player.velocityY = -315;
      state.player.grounded = false;
      return;
    }
    if (enemy.contactCooldown <= 0 && state.player.invulnerable <= 0) {
      const player = state.player;
      player.invulnerable = 1.4 + state.upgrades.armor * 0.14;
      player.hp = Math.max(1, player.hp - Math.max(2, ENEMY_INFO[enemy.kind].damage - state.upgrades.armor * 2));
      enemy.contactCooldown = 2;
      player.x = PhaserMathClamp(player.x + Math.sign(player.x - enemy.x || -player.facingX) * 42, 28, WORLD.width - 28);
      if (player.stage > 1) {
        player.stage = (player.stage - 1) as GrowthStage;
        events.push({ type: 'player-hit', text: `${GROWTH_NAMES[player.stage]}로 한 단계 어려졌어요.` });
      } else {
        player.lives = Math.max(0, player.lives - 1);
        events.push({ type: 'life-lost', text: `아기 효린의 목숨이 하나 줄었어요. 남은 목숨 ${player.lives}개.` });
        if (player.lives > 0) {
          player.x = 120;
          player.y = WORLD.groundY;
          player.velocityY = 0;
          player.grounded = true;
          player.hp = player.maxHp;
          player.invulnerable = 1.4;
        } else player.hp = 0;
        events.push({ type: 'player-hit', text: player.lives > 0 ? '출발점에서 다시 시작해요.' : '목숨을 모두 잃었어요.' });
      }
    }
  }
}

function collectMilk(state: GameState, events: EngineEvent[]): void {
  const remaining: MilkPickupState[] = [];
  for (const milk of state.milkPickups) {
    if (Math.hypot(milk.x - state.player.x, milk.y - state.player.y) > 34) {
      remaining.push(milk);
      continue;
    }
    if (state.player.stage < 4) {
      state.player.stage = (state.player.stage + 1) as GrowthStage;
      events.push({ type: 'milk', text: `초코우유를 마셨어요! ${GROWTH_NAMES[state.player.stage]}로 성장했어요.` });
    } else {
      state.score += 250;
      state.resources += 4;
      events.push({ type: 'milk', text: '성인 효린 보너스! 점수 250점과 모험 포인트 4개를 얻었어요.' });
    }
  }
  state.milkPickups = remaining;
}

function updatePets(state: GameState, dt: number, events: EngineEvent[]): void {
  for (const pet of state.pets) {
    pet.damageCooldown = Math.max(0, pet.damageCooldown - dt);
    if (pet.hp <= 0 || pet.stunnedUntilWave > state.wave) continue;
    const definition = getPetDefinition(pet.type);
    pet.attackCooldown = Math.max(0, pet.attackCooldown - dt);
    const target = state.enemies
      .filter((enemy) => enemy.hp > 0)
      .map((enemy) => ({ enemy, distance: Math.hypot(enemy.x - pet.x, enemy.y - pet.y) }))
      .filter((entry) => entry.distance <= 250)
      .sort((a, b) => a.distance - b.distance)[0];

    if (target && target.distance <= 46) {
      const dx = target.enemy.x - pet.x;
      const dy = target.enemy.y - pet.y;
      const length = Math.hypot(dx, dy) || 1;
      pet.facingX = dx / length;
      pet.facingY = dy / length;
      if (pet.attackCooldown <= 0) {
        pet.attackCooldown = definition.attackCooldown;
        damageEnemy(state, target.enemy, definition.damage * (1 + state.upgrades.power * 0.06) * levelGrowthMultiplier(state), events);
      }
      continue;
    }

    const followOffset = pet.type === 'nuni' ? -48 : pet.type === 'yangi' ? 0 : 48;
    const destination = target?.enemy ?? { x: state.player.x + followOffset, y: state.player.y - 3 };
    const dx = destination.x - pet.x;
    const dy = destination.y - pet.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 13) {
      continue;
    }

    const length = Math.max(1, distance);
    const stepDistance = Math.min(distance, definition.speed * dt);
    const next = {
      x: PhaserMathClamp(pet.x + dx / length * stepDistance, 28, WORLD.width - 28),
      y: PhaserMathClamp(pet.y + dy / length * stepDistance, 0, WORLD.groundY),
    };
    const movedX = next.x - pet.x;
    const movedY = next.y - pet.y;
    if (Math.hypot(movedX, movedY) > 0.1) {
      pet.x = next.x;
      pet.y = next.y;
      const movedLength = Math.hypot(movedX, movedY);
      pet.facingX = movedX / movedLength;
      pet.facingY = movedY / movedLength;
    }
  }
}

function damagePet(pet: GameState['pets'][number], damage: number, events: EngineEvent[], text: string): void {
  if (pet.hp <= 0) return;
  pet.hp = Math.max(0, pet.hp - damage);
  const petName = getPetDefinition(pet.type).name;
  events.push({ type: 'pet-damaged', text: pet.hp <= 0 ? `${text} ${petName}의 체력이 0이 됐어요. 쉼터에서 츄르를 먹여 주세요.` : text });
}

function spawnRottenWatermelon(state: GameState): void {
  const availablePets = state.pets.filter((pet) => pet.hp > 0 && pet.stunnedUntilWave <= state.wave);
  if (!availablePets.length || state.rottenWatermelons.length >= 2) return;
  const target = availablePets[Math.floor(random(state) * availablePets.length)];
  const direction = random(state) < 0.5 ? -1 : 1;
  state.rottenWatermelons.push({
    id: state.nextHazardId++,
    x: PhaserMathClamp(target.x + direction * (170 + random(state) * 130), 40, WORLD.width - 40),
    y: target.y,
    velocityX: -direction * (42 + random(state) * 26),
    life: 16,
  });
}

function spawnFakeNews(state: GameState): void {
  const availablePets = state.pets.filter((pet) => pet.hp > 0 && pet.stunnedUntilWave <= state.wave);
  if (!availablePets.length || state.fakeNewsPapers.length >= 2) return;
  const target = availablePets[Math.floor(random(state) * availablePets.length)];
  const direction = random(state) < 0.5 ? -1 : 1;
  state.fakeNewsPapers.push({
    id: state.nextHazardId++,
    x: PhaserMathClamp(target.x - direction * (220 + random(state) * 90), 30, WORLD.width - 30),
    y: PhaserMathClamp(target.y - 20, 100, WORLD.groundY - 35),
    velocityX: direction * (125 + random(state) * 45),
    life: 8,
  });
}

function updateHazards(state: GameState, dt: number, events: EngineEvent[]): void {
  state.hazardSpawnTimer = Math.max(0, state.hazardSpawnTimer - dt);
  if (state.hazardSpawnTimer <= 0) {
    if (state.pets.some((pet) => pet.hp > 0)) {
      if (random(state) < 0.55) spawnRottenWatermelon(state);
      else spawnFakeNews(state);
    }
    state.hazardSpawnTimer = 14 + random(state) * 9;
  }

  const remainingWatermelons = [] as GameState['rottenWatermelons'];
  for (const hazard of state.rottenWatermelons) {
    hazard.x += hazard.velocityX * dt;
    hazard.life -= dt;
    if (hazard.x < 26 || hazard.x > WORLD.width - 26) hazard.velocityX *= -1;
    const target = state.pets.find((pet) => pet.hp > 0 && pet.stunnedUntilWave <= state.wave && Math.hypot(pet.x - hazard.x, pet.y - hazard.y) <= 38);
    if (target) {
      target.stunnedUntilWave = state.wave + 2;
      events.push({ type: 'pet-stunned', text: `썩은 수박에 닿은 ${getPetDefinition(target.type).name}가 한 구간 동안 기절했어요.` });
    } else if (hazard.life > 0) remainingWatermelons.push(hazard);
  }
  state.rottenWatermelons = remainingWatermelons;

  const remainingPapers = [] as GameState['fakeNewsPapers'];
  for (const paper of state.fakeNewsPapers) {
    paper.x += paper.velocityX * dt;
    paper.life -= dt;
    const target = state.pets.find((pet) => pet.hp > 0 && Math.hypot(pet.x - paper.x, pet.y - paper.y) <= 34);
    if (target) {
      const other = state.pets
        .filter((pet) => pet.type !== target.type && pet.hp > 0)
        .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
      if (other) damagePet(other, FAKE_NEWS_FRIENDLY_FIRE_DAMAGE, events, `가짜뉴스 종이에 놀란 ${getPetDefinition(target.type).name}가 ${getPetDefinition(other.type).name}를 한 번 공격했어요.`);
      else events.push({ type: 'fake-news', text: '가짜뉴스가 사라졌어요. 공격할 다른 고양이가 없어요.' });
    } else if (paper.life > 0 && paper.x > 20 && paper.x < WORLD.width - 20) remainingPapers.push(paper);
  }
  state.fakeNewsPapers = remainingPapers;

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    for (const pet of state.pets) {
      if (pet.hp <= 0 || pet.stunnedUntilWave > state.wave || pet.damageCooldown > 0) continue;
      if (Math.hypot(enemy.x - pet.x, enemy.y - pet.y) > (enemy.kind === 'bear' ? 48 : 36)) continue;
      pet.damageCooldown = 1.3;
      damagePet(pet, Math.max(4, ENEMY_INFO[enemy.kind].damage), events, `${getPetDefinition(pet.type).name}가 ${ENEMY_NAMES[enemy.kind]}에게 공격받았어요.`);
    }
  }
}

function PhaserMathClamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function stepWorld(state: GameState, rawDt: number, controls: Controls = {}): EngineEvent[] {
  const dt = Math.max(0, Math.min(rawDt, 0.05));
  if (dt === 0 || state.farm.health <= 0 || state.player.hp <= 0) return [];
  const events: EngineEvent[] = [];
  announceLevel100(state, events);
  state.elapsed += dt;
  state.dadMessageSpawnTimer = Math.max(0, state.dadMessageSpawnTimer - dt);
  if (state.dadMessageSpawnTimer <= 0) {
    if (state.dadMessagePickups.length < 2) spawnDadMessage(state);
    state.dadMessageSpawnTimer = 14 + random(state) * 8;
  }
  state.player.invulnerable = Math.max(0, state.player.invulnerable - dt);
  state.player.jumpTimer = Math.max(0, state.player.jumpTimer - dt);
  state.player.jumpCooldown = Math.max(0, state.player.jumpCooldown - dt);
  state.player.attackCooldown = Math.max(0, state.player.attackCooldown - dt);
  state.player.meleeCooldown = Math.max(0, state.player.meleeCooldown - dt);
  state.player.boulderCooldown = Math.max(0, state.player.boulderCooldown - dt);

  const vx = Number(Boolean(controls.right)) - Number(Boolean(controls.left));
  const levelBonus = levelGrowthMultiplier(state);
  const equippedWeapon = isWeaponType(state.ammo) ? getWeaponDefinition(state.ammo) : null;
  const weaponMobilityMultiplier = 1 - (equippedWeapon?.mobilityPenalty ?? 0);
  const stageMobilityMultiplier = 1 - growthStageMobilityPenalty(state.player.stage);
  const mobilityMultiplier = weaponMobilityMultiplier * stageMobilityMultiplier;
  const moveSpeed = (220 + state.upgrades.speed * 15) * levelBonus * mobilityMultiplier;
  const previousX = state.player.x;
  const previousY = state.player.y;
  state.player.x = PhaserMathClamp(previousX + vx * moveSpeed * dt, 28, WORLD.width - 28);
  if (vx) {
    state.player.facingX = Math.sign(vx);
    state.player.facingY = 0;
  }
  const sector = Math.floor(state.player.x / 768);
  if (sector !== state.terrainSector) {
    state.terrainSector = sector;
    state.terrainSeed = Math.floor(random(state) * 0xffffffff) >>> 0;
    state.terrainRevision += 1;
  }
  const dropThroughPlatform = Boolean(controls.down && controls.jump && state.player.grounded && state.player.y < WORLD.groundY);
  if (dropThroughPlatform) {
    state.player.grounded = false;
    state.player.velocityY = 180;
    state.player.jumpTimer = 0;
  } else if (controls.jump && state.player.grounded && state.player.jumpCooldown <= 0) {
    state.player.velocityY = -620 * levelBonus * Math.sqrt(mobilityMultiplier);
    state.player.grounded = false;
    state.player.jumpTimer = 0;
    state.player.jumpCooldown = 0.18;
    events.push({ type: 'jump' });
  } else if (state.player.grounded && state.player.y < WORLD.groundY) {
    const hasPlatformSupport = PLATFORM_SURFACES.some((platform) => Math.abs(platform.y - state.player.y) <= 0.5
      && state.player.x + 15 >= platform.x && state.player.x - 15 <= platform.x + platform.width);
    if (!hasPlatformSupport) {
      state.player.grounded = false;
      state.player.velocityY = 0;
    }
  }
  if (!state.player.grounded) {
    state.player.jumpTimer = Math.min(2, state.player.jumpTimer + dt);
    state.player.velocityY = Math.min(900, state.player.velocityY + 1450 * dt);
    // A recovery guard prevents stale airborne saves or missed contacts from leaving Hyorin suspended.
    if (state.player.jumpTimer >= 1.35) state.player.velocityY = Math.max(360, state.player.velocityY);
    state.player.y += state.player.velocityY * dt;
    const screenTopLimit = PLAYER_STAGE_HEIGHTS[state.player.stage] + 2;
    if (state.player.y < screenTopLimit) {
      state.player.y = screenTopLimit;
      if (state.player.velocityY < 0) state.player.velocityY = 0;
    }
    if (state.player.velocityY >= 0) {
      const landing = PLATFORM_SURFACES
        .filter((platform) => !controls.down && previousY <= platform.y && state.player.y >= platform.y && state.player.x + 15 >= platform.x && state.player.x - 15 <= platform.x + platform.width)
        .sort((a, b) => a.y - b.y)[0];
      if (landing) {
        state.player.y = landing.y;
        state.player.velocityY = 0;
        state.player.grounded = true;
      } else if (state.player.y >= WORLD.groundY) {
        state.player.y = WORLD.groundY;
        state.player.velocityY = 0;
        state.player.grounded = true;
      }
    }
  }
  if (state.player.grounded) {
    state.player.velocityY = 0;
    state.player.jumpTimer = 0;
  }
  collectMilk(state, events);
  updateDadMessages(state, dt, events);
  if (controls.attack && state.player.attackCooldown <= 0) {
    if (spawnProjectile(state)) {
      events.push({ type: 'fire' });
    }
  }

  if (state.waveState.phase === 'rest') {
    state.waveState.phaseTimer -= dt;
    if (state.waveState.phaseTimer <= 0) events.push(beginWave(state));
  } else {
    state.waveState.elapsed += dt;
    if (state.waveState.spawned < state.waveState.total) {
      state.waveState.spawnTimer = Math.max(0, state.waveState.spawnTimer - dt);
      if (state.waveState.spawnTimer <= 0 && state.enemies.length < 14) {
        spawnEnemy(state);
        state.waveState.spawnTimer = Math.max(1.9, 2.8 - state.wave * 0.04);
      }
    }
  }

  keepOnlyOneLivingTiger(state);
  for (const enemy of state.enemies) updateEnemy(state, enemy, dt, events, previousY);
  updateHazards(state, dt, events);
  updatePets(state, dt, events);
  attackWithLargeStone(state, events);
  attackWithBoulder(state, events);
  const remainingProjectiles: GameState['projectiles'] = [];
  for (const projectile of state.projectiles) {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;
    let hit = false;
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      if (projectile.ammo === 'crossbow' && projectile.hitEnemyIds?.includes(enemy.id)) continue;
      if (Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y) > (enemy.kind === 'tiger' ? 34 : enemy.kind === 'kingBoar' ? 29 : 21)) continue;
      if (projectile.ammo === 'stone') {
        const awayX = enemy.x - projectile.x;
        const awayY = enemy.y - projectile.y;
        const awayLength = Math.hypot(awayX, awayY) || 1;
        enemy.x = PhaserMathClamp(enemy.x + awayX / awayLength * 48, -12, WORLD.width + 12);
        enemy.y = PhaserMathClamp(enemy.y + awayY / awayLength * 48, -12, WORLD.height + 12);
        applyEnemyStatus(enemy, 'knockback', 0.24);
        events.push({ type: 'knockback' });
      }
      const ammoType = projectile.ammo ?? 'bb';
      const legacyType = isLegacyAmmoType(ammoType) ? ammoType : null;
      const definition = legacyType ? getAmmoDefinition(legacyType) : null;
      if (legacyType === 'blast' || legacyType === 'meteor') {
        if (!definition) continue;
        const radius = definition.blastRadius ?? 90;
        const affected = state.enemies.filter((candidate) => candidate.hp > 0 && Math.hypot(candidate.x - projectile.x, candidate.y - projectile.y) <= radius);
        for (const candidate of affected) {
          const distance = Math.hypot(candidate.x - projectile.x, candidate.y - projectile.y);
          damageEnemy(state, candidate, projectile.damage * (distance <= 24 ? 1 : legacyType === 'meteor' ? 0.76 : 0.68), events);
        }
        events.push({ type: 'special-attack', text: legacyType, x: projectile.x, y: projectile.y });
      } else if (legacyType === 'lightning') {
        if (!definition) continue;
        const chained = [enemy];
        let origin = enemy;
        while (chained.length < (definition.chainCount ?? 3) + 1) {
          const next = state.enemies
            .filter((candidate) => candidate.hp > 0 && !chained.includes(candidate))
            .map((candidate) => ({ candidate, distance: Math.hypot(candidate.x - origin.x, candidate.y - origin.y) }))
            .filter((entry) => entry.distance <= 175)
            .sort((a, b) => a.distance - b.distance)[0]?.candidate;
          if (!next) break;
          chained.push(next);
          origin = next;
        }
        chained.forEach((candidate, index) => damageEnemy(state, candidate, projectile.damage * (index === 0 ? 1 : 0.68 ** index), events));
        events.push({ type: 'special-attack', text: legacyType, x: projectile.x, y: projectile.y });
      } else {
        damageEnemy(state, enemy, projectile.damage, events);
        if (projectile.ammo === 'crossbow') {
          (projectile.hitEnemyIds ??= []).push(enemy.id);
          continue;
        }
      }
      hit = true;
      break;
    }
    if (!hit && projectile.life > 0 && projectile.x > -20 && projectile.x < WORLD.width + 20 && projectile.y > -20 && projectile.y < WORLD.height + 20) remainingProjectiles.push(projectile);
  }
  state.projectiles = remainingProjectiles;
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);

  if (state.waveState.phase === 'defend' && state.waveState.spawned >= state.waveState.total && state.enemies.length === 0) {
    state.waveState.phase = 'rest';
    state.waveState.phaseTimer = 12;
    state.player.hp = state.player.maxHp;
    state.player.attackCooldown = 0;
    state.player.meleeCooldown = 0;
    state.player.boulderCooldown = 0;
    state.player.invulnerable = 0;
    state.projectiles = [];
    state.score += state.wave * 350;
    state.resources += 12 + Math.min(20, state.wave * 2);
    state.stats.wavesCleared += 1;
    state.farm.health = Math.min(state.farm.maxHealth, state.farm.health + 6);
    for (const crop of state.farm.crops) crop.hp = Math.min(crop.maxHp, crop.hp + 8);
    for (const facility of Object.values(state.farm.facilities)) facility.hp = Math.min(facility.maxHp, facility.hp + 8);
    events.push({ type: 'wave-clear', text: `${state.wave}구간 통과!` });
  }

  if (state.farm.health <= 0 || state.player.hp <= 0) events.push({ type: 'game-over' });
  return events;
}

export function restoreSafeCheckpoint(state: GameState): GameState {
  return {
    ...structuredClone(state),
    enemies: [],
    projectiles: [],
    waveState: { phase: 'rest', total: 0, spawned: 0, spawnTimer: 0, phaseTimer: 8, elapsed: state.waveState.elapsed },
  };
}

