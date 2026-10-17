import type { Controls, EnemyKind, EnemyState, EngineEvent, GameState, GrowthStage, MilkPickupState } from './types';
import { AMMO_DEFINITIONS, createAmmoCounts, getAmmoDefinition } from './ammo';
import { getPetDefinition } from './pets';

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
export const LEVEL_100_MESSAGE = '효린이는 행복한 가정에서 환생하여 하고 싶은 일 마음껏 하며 원하는 모든 것을 이루고 살아가게 됩니다. 게임은 계속 진행할 수 있습니다.';
export const PLATFORM_SURFACES = [
  { x: 340, y: 460, width: 176 }, { x: 690, y: 390, width: 184 },
  { x: 1090, y: 475, width: 208 }, { x: 1485, y: 408, width: 194 },
  { x: 1875, y: 342, width: 188 }, { x: 2260, y: 442, width: 212 },
  { x: 2670, y: 380, width: 196 },
] as const;
const GROWTH_NAMES: Record<GrowthStage, string> = { 1: '아기 효린', 2: '어린이 효린', 3: '청소년 효린', 4: '성인 효린' };
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
    experience: 0,
    experienceToNext: 100,
    lifeCompleteShown: false,
    ammo: 'bb',
    ammoCounts: createAmmoCounts(),
    milkPickups: structuredClone(STARTING_MILK),
    nextMilkId: STARTING_MILK.length + 1,
    dadMessagePickups: [],
    nextDadMessageId: 1,
    dadMessageSpawnTimer: 8,
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
  state.waveState = {
    phase: 'defend',
    total: Math.min(2 + Math.ceil(state.wave), 12) + (state.wave % 5 === 0 ? 1 : 0),
    spawned: 0,
    spawnTimer: 0.6,
    phaseTimer: 0,
    elapsed: 0,
  };
  return { type: 'wave-start', text: `${state.wave}구간 모험 시작!` };
}

function chooseTarget(state: GameState, kind: EnemyKind): number {
  if (kind === 'crow') return Math.floor(random(state) * CROP_TARGETS.length);
  if (kind === 'rabbit') return Math.floor(random(state) * CROP_TARGETS.length);
  if (kind === 'mole') return Math.floor(random(state) * CROP_TARGETS.length);
  return CROP_TARGETS.length + Math.floor(random(state) * FACILITY_TARGETS.length);
}

function spawnEnemy(state: GameState): void {
  const choice = random(state);
  let kind: EnemyKind;
  if (state.wave % 5 === 0 && state.waveState.spawned === state.waveState.total - 1) kind = 'kingBoar';
  else if (state.wave < 2) kind = choice < 0.55 ? 'mole' : 'rabbit';
  else if (choice < 0.27) kind = 'mole';
  else if (choice < 0.53) kind = 'rabbit';
  else if (choice < 0.78) kind = 'crow';
  else kind = 'boar';

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
    moodTimer: kind === 'mole' ? 1.1 : kind === 'crow' ? 1.5 : kind === 'boar' ? 2.2 : 0,
    attackCooldown: 1.2,
    contactCooldown: 0,
    hitFlash: 0,
    status: null,
    statusTimer: 0,
  };
  state.enemies.push(enemy);
  state.waveState.spawned += 1;
}

function getNearestEnemy(state: GameState, x: number, y: number): { enemy: EnemyState; distance: number } | null {
  let nearest: { enemy: EnemyState; distance: number } | null = null;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || (enemy.kind === 'mole' && enemy.mood === 'burrow')) continue;
    const distance = Math.hypot(enemy.x - x, enemy.y - y);
    if (!nearest || distance < nearest.distance) nearest = { enemy, distance };
  }
  return nearest;
}

function spawnProjectile(state: GameState): boolean {
  const { player } = state;
  const sourceY = player.y - 42;
  const nearest = getNearestEnemy(state, player.x, sourceY);
  if (!nearest || nearest.distance > 900) return false;
  const target = nearest.enemy;
  const dx = target.x - player.x;
  const dy = target.y - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  let ammoType = state.ammo;
  if (state.ammoCounts[ammoType] <= 0) {
    const nextAmmo = AMMO_DEFINITIONS.find((definition) => state.ammoCounts[definition.type] > 0);
    if (!nextAmmo) return false;
    ammoType = nextAmmo.type;
    state.ammo = ammoType;
  }
  const ammo = getAmmoDefinition(ammoType);
  state.ammoCounts[ammoType] -= 1;
  const damage = ammo.damage * (1 + state.upgrades.power * 0.12);
  state.projectiles.push({
    x: player.x + dx / length * 16,
    y: sourceY + dy / length * 16,
    vx: dx / length * ammo.speed,
    vy: dy / length * ammo.speed,
    damage,
    life: 1.6,
    ammo: ammoType,
    targetId: target.id,
  });
  if (state.ammoCounts[ammoType] === 0) {
    const nextAmmo = AMMO_DEFINITIONS.find((definition) => state.ammoCounts[definition.type] > 0);
    if (nextAmmo) state.ammo = nextAmmo.type;
  }
  player.facingX = dx / length;
  player.facingY = dy / length;
  return true;
}

function increaseExperience(state: GameState, amount: number, events: EngineEvent[]): void {
  state.experience += amount;
  while (state.experience >= state.experienceToNext) {
    state.experience -= state.experienceToNext;
    state.level += 1;
    state.experienceToNext = state.level * 100;
    events.push({ type: 'level-up', text: `레벨 ${state.level}! 공격 속도 +1%` });
    announceLevel100(state, events);
  }
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
      state.level += 1;
      state.experienceToNext = state.level * 100;
      events.push({ type: 'dad-message', text: DAD_MESSAGE_TEXTS[pickup.phraseIndex] });
      announceLevel100(state, events);
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
  const rate = (1 + (state.level - 1) * 0.01) * (1 + state.upgrades.rapid * 0.08);
  player.meleeCooldown = 1.15 / rate;
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
  const rate = (1 + (state.level - 1) * 0.01) * (1 + state.upgrades.rapid * 0.08);
  player.boulderCooldown = 5.5 / rate;
  events.push({ type: 'boulder', text: '바위 강타!' });
  for (const enemy of targets) {
    applyEnemyStatus(enemy, 'stun', 1.1);
    events.push({ type: 'stun' });
    damageEnemy(state, enemy, 46 * (1 + state.upgrades.power * 0.12), events);
  }
}

function updateEnemy(state: GameState, enemy: EnemyState, dt: number, events: EngineEvent[], previousPlayerY: number): void {
  const target = { x: state.player.x, y: state.player.y - 30, radius: 24 };
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
  if (enemy.kind === 'boar' || enemy.kind === 'kingBoar') {
    if (enemy.moodTimer <= 0) {
      enemy.mood = enemy.mood === 'charge' ? 'seek' : 'charge';
      enemy.moodTimer = enemy.mood === 'charge' ? 0.95 : 2.7;
    }
    if (enemy.mood === 'charge') speed *= enemy.kind === 'kingBoar' ? 3.2 : 2.7;
  }

  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const distance = enemy.kind === 'crow' ? Math.hypot(dx, dy) || 1 : Math.abs(dx) || 1;
  const attackRange = target.radius + (enemy.kind === 'crow' ? 6 : 2);
  if (distance > attackRange) {
    const direction = Math.sign(dx);
    enemy.x = PhaserMathClamp(enemy.x + direction * speed * dt, -24, WORLD.width + 24);
    if (enemy.kind === 'crow') enemy.y = PhaserMathClamp(enemy.y + dy / distance * speed * dt, 230, WORLD.groundY - 30);
    else enemy.y = WORLD.groundY - 20;
  } else if (enemy.attackCooldown <= 0) enemy.attackCooldown = enemy.kind === 'kingBoar' ? 1.15 : 1.4;

  const stageHeights: Record<GrowthStage, number> = { 1: 48, 2: 64, 3: 72, 4: 80 };
  const playerTop = state.player.y - stageHeights[state.player.stage];
  const enemyTop = enemy.y - (enemy.kind === 'kingBoar' ? 38 : 22);
  const enemyBottom = enemy.y + 10;
  const horizontalOverlap = Math.abs(state.player.x - enemy.x) < (enemy.kind === 'kingBoar' ? 38 : 30);
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
        damageEnemy(state, target.enemy, definition.damage * (1 + state.upgrades.power * 0.06), events);
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
  const moveSpeed = 220 + state.upgrades.speed * 15;
  const previousX = state.player.x;
  const previousY = state.player.y;
  state.player.x = PhaserMathClamp(previousX + vx * moveSpeed * dt, 28, WORLD.width - 28);
  const dropThroughPlatform = Boolean(controls.down && controls.jump && state.player.grounded && state.player.y < WORLD.groundY);
  if (dropThroughPlatform) {
    state.player.grounded = false;
    state.player.velocityY = 180;
    state.player.jumpTimer = 0;
  } else if (controls.jump && state.player.grounded && state.player.jumpCooldown <= 0) {
    state.player.velocityY = -620 - state.upgrades.fence * 24;
    state.player.grounded = false;
    state.player.jumpTimer = 0;
    state.player.jumpCooldown = 0.18;
    events.push({ type: 'jump' });
  }
  if (!state.player.grounded) {
    state.player.jumpTimer = Math.min(2, state.player.jumpTimer + dt);
    state.player.velocityY = Math.min(900, state.player.velocityY + 1450 * dt);
    // A recovery guard prevents stale airborne saves or missed contacts from leaving Hyorin suspended.
    if (state.player.jumpTimer >= 1.35) state.player.velocityY = Math.max(360, state.player.velocityY);
    state.player.y += state.player.velocityY * dt;
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
  const nearestEnemy = getNearestEnemy(state, state.player.x, state.player.y);
  if (nearestEnemy && nearestEnemy.distance <= 900) {
    const aimX = nearestEnemy.enemy.x - state.player.x;
    const aimY = nearestEnemy.enemy.y - state.player.y;
    const aimLength = Math.hypot(aimX, aimY) || 1;
    state.player.facingX = aimX / aimLength;
    state.player.facingY = aimY / aimLength;
  } else if (vx) {
    state.player.facingX = Math.sign(vx);
    state.player.facingY = 0;
  }

  if (controls.attack && state.player.attackCooldown <= 0) {
    if (spawnProjectile(state)) {
      events.push({ type: 'fire' });
      const rate = (1 + (state.level - 1) * 0.01) * (1 + state.upgrades.rapid * 0.08);
      state.player.attackCooldown = 0.48 / rate;
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

  for (const enemy of state.enemies) updateEnemy(state, enemy, dt, events, previousY);
  updatePets(state, dt, events);
  attackWithLargeStone(state, events);
  attackWithBoulder(state, events);
  const remainingProjectiles: GameState['projectiles'] = [];
  for (const projectile of state.projectiles) {
    let target = projectile.targetId === undefined
      ? undefined
      : state.enemies.find((enemy) => enemy.id === projectile.targetId && enemy.hp > 0);
    if (!target) {
      target = getNearestEnemy(state, projectile.x, projectile.y)?.enemy;
      if (target) projectile.targetId = target.id;
    }
    if (target) {
      const dx = target.x - projectile.x;
      const dy = target.y - projectile.y;
      const distance = Math.hypot(dx, dy) || 1;
      const speed = Math.hypot(projectile.vx, projectile.vy) || getAmmoDefinition(projectile.ammo ?? 'bb').speed;
      projectile.vx = dx / distance * speed;
      projectile.vy = dy / distance * speed;
    }
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;
    let hit = false;
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      if (Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y) > (enemy.kind === 'kingBoar' ? 29 : 21)) continue;
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
      const definition = getAmmoDefinition(ammoType);
      if (ammoType === 'blast' || ammoType === 'meteor') {
        const radius = definition.blastRadius ?? 90;
        const affected = state.enemies.filter((candidate) => candidate.hp > 0 && Math.hypot(candidate.x - projectile.x, candidate.y - projectile.y) <= radius);
        for (const candidate of affected) {
          const distance = Math.hypot(candidate.x - projectile.x, candidate.y - projectile.y);
          damageEnemy(state, candidate, projectile.damage * (distance <= 24 ? 1 : ammoType === 'meteor' ? 0.76 : 0.68), events);
        }
        events.push({ type: 'special-attack', text: ammoType, x: projectile.x, y: projectile.y });
      } else if (ammoType === 'lightning') {
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
        events.push({ type: 'special-attack', text: ammoType, x: projectile.x, y: projectile.y });
      } else damageEnemy(state, enemy, projectile.damage, events);
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

