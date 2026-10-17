import { describe, expect, it } from 'vitest';
import { createGameState, restoreSafeCheckpoint, stepWorld, WORLD } from './engine';
import { createSaveCode, normalizeGameState, restoreSaveCode, SaveCodeError } from './save-code';
import { clearAutosave, clearRecords, highestScore, loadAutosave, loadRecords, saveAutosave, saveRecord } from './storage';
import type { EnemyState, ProjectileState } from './types';
import { zlibSync } from 'fflate';

const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function base32(bytes: Uint8Array): string {
  let text = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) { bits -= 5; text += CODE_ALPHABET[(buffer >>> bits) & 31]; }
    buffer &= (1 << bits) - 1;
  }
  if (bits) text += CODE_ALPHABET[(buffer << (5 - bits)) & 31];
  return text;
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}

function detailedState() {
  const state = createGameState(0xdecafbad);
  state.wave = 6;
  state.score = 32_780;
  state.resources = 91;
  state.elapsed = 812.5;
  state.player.x = 721;
  state.player.y = 402;
  state.player.hp = 67;
  state.player.maxHp = 120;
  state.player.attackCooldown = 0.21;
  state.upgrades.power = 3;
  state.upgrades.armor = 2;
  state.farm.health = 74;
  state.farm.crops[2].hp = 16;
  state.farm.facilities.barn.hp = 44;
  state.waveState = { phase: 'defend', total: 13, spawned: 7, spawnTimer: 0.8, phaseTimer: 0, elapsed: 31.25 };
  state.stats = { kills: 47, protectedCrops: 39, wavesCleared: 5 };
  state.enemies = [{ id: 12, kind: 'kingBoar', x: 773, y: 262, hp: 311, maxHp: 620, speed: 60, targetIndex: 4, mood: 'charge', moodTimer: 0.5, attackCooldown: 0.4, contactCooldown: 0.8, hitFlash: 0.07 }];
  state.projectiles = [{ x: 735, y: 396, vx: 412.5, vy: -184.2, damage: 52, life: 0.8 }];
  return state;
}

describe('offline continue codes', () => {
  it('upgrades older saves with the new growth, pickup, and ammunition defaults', () => {
    const older = createGameState(12) as unknown as Record<string, unknown>;
    const oldPlayer = { ...(older.player as Record<string, unknown>) };
    delete oldPlayer.stage;
    delete oldPlayer.lives;
    delete oldPlayer.jumpTimer;
    delete oldPlayer.jumpCooldown;
    older.player = oldPlayer;
    delete older.ammoCounts;
    delete older.milkPickups;
    delete older.nextMilkId;

    const restored = normalizeGameState(older);
    expect(restored?.player.stage).toBe(2);
    expect(restored?.player.lives).toBe(3);
    expect(restored?.ammoCounts.meteor).toBeGreaterThan(0);
    expect(restored?.milkPickups.length).toBeGreaterThan(0);
  });

  it('restores score, wave, crops, facilities, enemies, projectiles, and the random seed exactly', async () => {
    const before = detailedState();
    const code = createSaveCode(before, 'full');
    const after = await restoreSaveCode(code);
    expect(after.kind).toBe('full');
    expect(after.state).toEqual(before);
  });

  it('detects an edited character with the checksum', async () => {
    const code = createSaveCode(detailedState());
    const index = Math.min(12, code.length - 1);
    const replacement = code[index] === '0' ? '1' : '0';
    await expect(restoreSaveCode(code.slice(0, index) + replacement + code.slice(index + 1))).rejects.toThrow(SaveCodeError);
  });

  it('rejects malformed input and unsupported format versions before applying state', async () => {
    await expect(restoreSaveCode('HELLO123')).rejects.toThrow(/아니에요/);
    await expect(restoreSaveCode('HPA9ABCDEFG')).rejects.toThrow(/지원하지 않는 코드 버전/);
    await expect(restoreSaveCode('HPA1-ABC')).rejects.toThrow(/영문자와 숫자/);
    await expect(restoreSaveCode('HPA1A')).rejects.toThrow(/길이/);
  });

  it('never truncates a large active battle snapshot', async () => {
    const state = detailedState();
    const enemies: EnemyState[] = [];
    for (let index = 0; index < 60; index += 1) {
      enemies.push({ ...state.enemies[0], id: index + 1, kind: index % 4 === 0 ? 'boar' : 'rabbit', x: 100 + index * 11, y: 100 + index * 5, hp: 30 + index });
    }
    state.enemies = enemies;
    const projectiles: ProjectileState[] = [];
    for (let index = 0; index < 120; index += 1) projectiles.push({ x: index * 7, y: 600 - index * 3, vx: index - 60, vy: 180 - index, damage: 52, life: 0.4 + index / 1000 });
    state.projectiles = projectiles;
    const code = createSaveCode(state, 'full');
    expect((await restoreSaveCode(code)).state).toEqual(state);
  });

  it('stops a highly compressed expansion at the 1 MB restore limit', async () => {
    const payload = new TextEncoder().encode(JSON.stringify({ formatVersion: 1, kind: 'full', savedAt: Date.now(), state: createGameState() }) + ' '.repeat(1_100_000));
    const checked = new Uint8Array(payload.length + 4);
    checked.set(payload);
    new DataView(checked.buffer).setUint32(payload.length, crc32(payload), false);
    const code = `HPA1${base32(zlibSync(checked, { level: 9 }))}`;
    await expect(restoreSaveCode(code)).rejects.toThrow(/1MB/);
  });

  it('creates an explicit safe checkpoint without silently keeping combat objects', async () => {
    const checkpoint = restoreSafeCheckpoint(detailedState());
    expect(checkpoint.waveState.phase).toBe('rest');
    expect(checkpoint.enemies).toEqual([]);
    expect(checkpoint.projectiles).toEqual([]);
    expect((await restoreSaveCode(createSaveCode(checkpoint, 'checkpoint'))).state).toEqual(checkpoint);
  });

  it('keeps automatic saves separate from personal records and tolerates corrupted browser data', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const data = new Map<string, string>();
    const memoryStorage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, String(value)); },
      removeItem: (key: string) => { data.delete(key); },
      clear: () => data.clear(),
      key: (index: number) => Array.from(data.keys())[index] ?? null,
      get length() { return data.size; },
    } as Storage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: memoryStorage });
    try {
      const state = detailedState();
      expect(saveAutosave(state)).toBe(true);
      expect(loadAutosave()).toEqual(state);
      saveRecord({ score: 9000, wave: 5, kills: 30, protectedCrops: 12, playedAt: 100, seconds: 320 });
      expect(highestScore()).toBe(9000);
      clearRecords();
      expect(loadRecords()).toEqual([]);
      expect(loadAutosave()).toEqual(state);
      memoryStorage.setItem('hyorin-pixel-adventure.autosave.v1', '{broken');
      expect(loadAutosave()).toBeNull();
      clearAutosave();
      expect(loadAutosave()).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});

describe('pixel adventure loop', () => {
  it('begins a new area and introduces farm animals along the path', () => {
    const state = createGameState(44);
    for (let tick = 0; tick < 45; tick += 1) stepWorld(state, 0.05);
    expect(state.wave).toBe(1);
    expect(state.waveState.phase).toBe('defend');
    for (let tick = 0; tick < 8; tick += 1) stepWorld(state, 0.05);
    expect(state.enemies.length).toBeGreaterThan(0);
    expect(state.enemies.length).toBeLessThanOrEqual(2);
    expect(state.enemies.every((enemy) => ['mole', 'rabbit', 'crow', 'boar', 'kingBoar'].includes(enemy.kind))).toBe(true);
  });

  it('scrolls across the path while the slingshot defeats a nearby animal', () => {
    const state = createGameState(1);
    state.wave = 1;
    state.waveState = { phase: 'defend', total: 1, spawned: 1, spawnTimer: 0, phaseTimer: 0, elapsed: 5 };
    state.enemies = [{ id: 1, kind: 'mole', x: 260, y: WORLD.groundY - 20, hp: 10, maxHp: 10, speed: 0, targetIndex: 0, mood: 'seek', moodTimer: 0, attackCooldown: 3, contactCooldown: 2, hitFlash: 0 }];
    state.player.attackCooldown = 0;
    for (let tick = 0; tick < 12; tick += 1) stepWorld(state, 0.05, { attack: true, right: true });
    expect(state.player.x).toBeGreaterThan(120);
    expect(state.player.x).toBeLessThanOrEqual(WORLD.width - 28);
    expect(state.stats.kills).toBe(1);
    expect(state.score).toBeGreaterThan(0);
    expect(state.resources).toBeGreaterThan(20);
    expect(state.waveState.phase).toBe('rest');
  });

  it('keeps the journey clear after an encounter is defeated', () => {
    const state = createGameState(7);
    state.waveState.phaseTimer = 100;
    state.player.x = WORLD.width - 28;
    stepWorld(state, 0.05, { right: true });
    expect(state.player.x).toBe(WORLD.width - 28);
    expect(state.farm.health).toBe(state.farm.maxHealth);
  });
});
