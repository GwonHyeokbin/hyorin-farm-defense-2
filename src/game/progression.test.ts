import { describe, expect, it } from 'vitest';
import { createGameState, PLATFORM_SURFACES, stepWorld, WORLD } from './engine';
import type { EnemyState } from './types';

function addEnemy(state: ReturnType<typeof createGameState>, x: number, y = WORLD.groundY - 20, hp = 200): EnemyState {
  const enemy: EnemyState = {
    id: state.nextEnemyId++, kind: 'rabbit', x, y, hp, maxHp: hp, speed: 0,
    targetIndex: 0, mood: 'seek', moodTimer: 0, attackCooldown: 8,
    contactCooldown: 0, hitFlash: 0, status: null, statusTimer: 0,
  };
  state.enemies.push(enemy);
  return enemy;
}

function resetPlayerOnPath(state: ReturnType<typeof createGameState>): void {
  state.player.x = 120;
  state.player.y = WORLD.groundY;
  state.player.velocityY = 0;
  state.player.grounded = true;
  state.player.invulnerable = 0;
}

describe('platform movement and growth', () => {
  it('starts as a child and grows one stage for each chocolate milk', () => {
    const state = createGameState(7);
    expect(state.player.stage).toBe(2);
    expect(state.milkPickups.length).toBeGreaterThan(0);

    state.milkPickups = [{ id: 9, x: state.player.x, y: state.player.y }];
    const first = stepWorld(state, 0.05);
    expect(state.player.stage).toBe(3);
    expect(first.some((event) => event.type === 'milk')).toBe(true);
    expect(state.milkPickups).toHaveLength(0);

    state.milkPickups = [{ id: 10, x: state.player.x, y: state.player.y }];
    stepWorld(state, 0.05);
    expect(state.player.stage).toBe(4);

    const score = state.score;
    state.milkPickups = [{ id: 11, x: state.player.x, y: state.player.y }];
    stepWorld(state, 0.05);
    expect(state.player.stage).toBe(4);
    expect(state.score).toBe(score + 250);
  });

  it('jumps once per landing and lands on a platform surface', () => {
    const state = createGameState(5);
    state.waveState.phaseTimer = 100;
    state.milkPickups = [];
    state.player.x = PLATFORM_SURFACES[0].x + 50;

    const jumped = stepWorld(state, 0.05, { jump: true });
    expect(jumped.some((event) => event.type === 'jump')).toBe(true);
    expect(state.player.grounded).toBe(false);
    expect(state.player.velocityY).toBeLessThan(0);

    stepWorld(state, 0.05, { jump: true });
    expect(state.player.y).toBeLessThan(WORLD.groundY);
    for (let tick = 0; tick < 16; tick += 1) stepWorld(state, 0.05);
    expect(state.player.grounded).toBe(true);
    expect(state.player.y).toBe(PLATFORM_SURFACES[0].y);
  });

  it('moves horizontally across the scrolling world without top-down movement', () => {
    const state = createGameState(6);
    state.waveState.phaseTimer = 100;
    for (let tick = 0; tick < 12; tick += 1) stepWorld(state, 0.05, { right: true, down: true });
    expect(state.player.x).toBeGreaterThan(120);
    expect(state.player.y).toBe(WORLD.groundY);

    for (let tick = 0; tick < 400; tick += 1) stepWorld(state, 0.05, { right: true });
    expect(state.player.x).toBe(WORLD.width - 28);
  });

  it('bounces off an animal when landing on it from above', () => {
    const state = createGameState(13);
    state.waveState.phase = 'rest';
    state.waveState.phaseTimer = 100;
    state.player.x = 400;
    state.player.y = 512;
    state.player.velocityY = 100;
    state.player.grounded = false;
    const enemy = addEnemy(state, 400);

    stepWorld(state, 0.05);

    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(state.player.velocityY).toBeLessThan(0);
    expect(state.player.stage).toBe(2);
  });

  it('downgrades on contact, then spends a life and respawns as a baby', () => {
    const state = createGameState(8);
    state.player.stage = 4;
    const enemy = addEnemy(state, state.player.x, WORLD.groundY - 20);
    stepWorld(state, 0.05);
    expect(state.player.stage).toBe(3);

    for (const expectedStage of [2, 1] as const) {
      resetPlayerOnPath(state);
      enemy.contactCooldown = 0;
      stepWorld(state, 0.05);
      expect(state.player.stage).toBe(expectedStage);
    }

    resetPlayerOnPath(state);
    enemy.contactCooldown = 0;
    const lifeLost = stepWorld(state, 0.05);
    expect(state.player.lives).toBe(2);
    expect(state.player.x).toBe(120);
    expect(state.player.y).toBe(WORLD.groundY);
    expect(lifeLost.some((event) => event.type === 'life-lost')).toBe(true);
  });

  it('ends the run when the baby loses the last life', () => {
    const state = createGameState(9);
    state.player.stage = 1;
    state.player.lives = 1;
    addEnemy(state, state.player.x, WORLD.groundY - 20);
    const events = stepWorld(state, 0.05);
    expect(state.player.lives).toBe(0);
    expect(state.player.hp).toBe(0);
    expect(events.some((event) => event.type === 'game-over')).toBe(true);
  });
});

describe('slingshot ammunition', () => {
  it('consumes a blast round and damages nearby enemies together', () => {
    const state = createGameState(10);
    state.player.x = 200;
    state.player.y = WORLD.groundY;
    state.ammo = 'blast';
    const first = addEnemy(state, 350);
    const second = addEnemy(state, 380);
    const before = state.ammoCounts.blast;
    stepWorld(state, 0.05, { attack: true });
    for (let tick = 0; tick < 10; tick += 1) stepWorld(state, 0.05);
    expect(state.ammoCounts.blast).toBe(before - 1);
    expect(first.hp).toBeLessThan(first.maxHp);
    expect(second.hp).toBeLessThan(second.maxHp);
  });

  it('chains a lightning shot to nearby enemies', () => {
    const state = createGameState(11);
    state.player.x = 200;
    state.player.y = WORLD.groundY;
    state.ammo = 'lightning';
    const targets = [addEnemy(state, 350), addEnemy(state, 400), addEnemy(state, 450)];
    stepWorld(state, 0.05, { attack: true });
    for (let tick = 0; tick < 10; tick += 1) stepWorld(state, 0.05);
    expect(targets.every((enemy) => enemy.hp < enemy.maxHp)).toBe(true);
  });

  it('has enemies chase Hyorin along the path instead of attacking farm crops', () => {
    const state = createGameState(12);
    state.waveState.phase = 'rest';
    const enemy = addEnemy(state, state.player.x + 150);
    enemy.speed = 60;
    const cropHealth = state.farm.crops[0].hp;
    const farmHealth = state.farm.health;
    stepWorld(state, 0.05);
    expect(enemy.x).toBeLessThan(state.player.x + 150);
    expect(state.farm.crops[0].hp).toBe(cropHealth);
    expect(state.farm.health).toBe(farmHealth);
  });
});
