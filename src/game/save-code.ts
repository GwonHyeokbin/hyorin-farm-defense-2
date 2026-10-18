import { zlibSync } from 'fflate';
import type { GameState } from './types';
import { isAmmoType, isWeaponType, normalizeAmmoCounts } from './ammo';
import { isPetType, PET_MAX_HP } from './pets';
import { DAD_MESSAGE_TEXTS, WORLD } from './engine';

const CODE_PREFIX = 'HPA1';
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_CODE_LENGTH = 200_000;
const MAX_RESTORED_BYTES = 1_000_000;
const CRC_TABLE = new Uint32Array(256);

for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  CRC_TABLE[index] = value >>> 0;
}

export type SaveCodeKind = 'checkpoint' | 'full';

export class SaveCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveCodeError';
  }
}

function checksum(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function toBase32(bytes: Uint8Array): string {
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += ALPHABET[(buffer >>> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) output += ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

function fromBase32(text: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of text) {
    const value = ALPHABET.indexOf(character);
    if (value < 0) throw new SaveCodeError('코드에는 영문 대문자와 숫자만 사용할 수 있어요.');
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits > 0 && buffer !== 0) throw new SaveCodeError('코드의 끝부분이 올바르지 않아요.');
  return Uint8Array.from(bytes);
}

async function decompressBounded(compressed: Uint8Array): Promise<Uint8Array> {
  try {
    const input = new Uint8Array(compressed.byteLength);
    input.set(compressed);
    const decompressed = new Blob([input]).stream().pipeThrough(new DecompressionStream('deflate'));
    const reader = decompressed.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESTORED_BYTES) {
        await reader.cancel();
        throw new SaveCodeError('복원 데이터가 1MB 제한을 넘어요.');
      }
      chunks.push(value);
    }
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
    return output;
  } catch (cause) {
    if (cause instanceof SaveCodeError) throw cause;
    throw new SaveCodeError('코드가 손상되었거나 압축 데이터를 읽을 수 없어요.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function isValidGameState(value: unknown): value is GameState {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.gameVersion !== '1.0.0') return false;
  if (!finite(value.seed, 0, 0xffffffff) || !finite(value.wave, 0, 100_000) || !finite(value.score, 0, 1_000_000_000)) return false;
  if (!finite(value.resources, 0, 1_000_000) || !finite(value.elapsed, 0, 1_000_000_000)) return false;
  if (!finite(value.nextEnemyId, 1, 10_000_000) || !Number.isInteger(value.nextEnemyId)) return false;
  if (!isRecord(value.player) || !finite(value.player.x, 0, WORLD.width) || !finite(value.player.y, 0, WORLD.height)) return false;
  if (value.player.velocityY !== undefined && !finite(value.player.velocityY, -5000, 5000)) return false;
  if (value.player.grounded !== undefined && typeof value.player.grounded !== 'boolean') return false;
  if (!finite(value.player.hp, 0, 100_000) || !finite(value.player.maxHp, 1, 100_000) || value.player.hp > value.player.maxHp) return false;
  if (!finite(value.player.attackCooldown, 0, 100) || !finite(value.player.invulnerable, 0, 100)) return false;
  if (value.player.meleeCooldown !== undefined && !finite(value.player.meleeCooldown, 0, 100)) return false;
  if (value.player.boulderCooldown !== undefined && !finite(value.player.boulderCooldown, 0, 100)) return false;
  if (!finite(value.player.facingX, -1, 1) || !finite(value.player.facingY, -1, 1)) return false;
  if (value.player.stage !== undefined && ![1, 2, 3, 4].includes(Number(value.player.stage))) return false;
  if (value.player.lives !== undefined && (!finite(value.player.lives, 0, 9) || !Number.isInteger(value.player.lives))) return false;
  if (value.player.jumpTimer !== undefined && !finite(value.player.jumpTimer, 0, 2)) return false;
  if (value.player.jumpCooldown !== undefined && !finite(value.player.jumpCooldown, 0, 10)) return false;
  if (value.level !== undefined && (!finite(value.level, 1, 100_000) || !Number.isInteger(value.level))) return false;
  if (value.experience !== undefined && !finite(value.experience, 0, 100_000_000)) return false;
  if (value.experienceToNext !== undefined && !finite(value.experienceToNext, 1, 100_000_000)) return false;
  if (value.lifeCompleteShown !== undefined && typeof value.lifeCompleteShown !== 'boolean') return false;
  if (value.ammo !== undefined && !isAmmoType(value.ammo)) return false;
  if (value.ammoCounts !== undefined) {
    if (!isRecord(value.ammoCounts)) return false;
    for (const [ammo, count] of Object.entries(value.ammoCounts)) {
      if (!isAmmoType(ammo) || !finite(count, 0, 100_000) || !Number.isInteger(count)) return false;
    }
  }
  if (value.ownedWeapons !== undefined && (!Array.isArray(value.ownedWeapons) || value.ownedWeapons.some((weapon) => !isWeaponType(weapon)) || new Set(value.ownedWeapons).size !== value.ownedWeapons.length)) return false;
  if (value.milkPickups !== undefined) {
    if (!Array.isArray(value.milkPickups) || value.milkPickups.length > 20) return false;
    for (const pickup of value.milkPickups) {
      if (!isRecord(pickup) || !finite(pickup.id, 1, 10_000_000) || !Number.isInteger(pickup.id)
        || !finite(pickup.x, 0, WORLD.width) || !finite(pickup.y, 0, WORLD.height)) return false;
    }
  }
  if (value.nextMilkId !== undefined && (!finite(value.nextMilkId, 1, 10_000_000) || !Number.isInteger(value.nextMilkId))) return false;
  if (value.dadMessagePickups !== undefined) {
    if (!Array.isArray(value.dadMessagePickups) || value.dadMessagePickups.length > 10) return false;
    for (const pickup of value.dadMessagePickups) {
      if (!isRecord(pickup) || !finite(pickup.id, 1, 10_000_000) || !Number.isInteger(pickup.id)
        || !finite(pickup.x, 0, WORLD.width) || !finite(pickup.y, -1000, WORLD.height)
        || !finite(pickup.velocityY, 0, 5000) || !finite(pickup.life, 0, 100)
        || !finite(pickup.phraseIndex, 0, DAD_MESSAGE_TEXTS.length - 1) || !Number.isInteger(pickup.phraseIndex)) return false;
    }
  }
  if (value.nextDadMessageId !== undefined && (!finite(value.nextDadMessageId, 1, 10_000_000) || !Number.isInteger(value.nextDadMessageId))) return false;
  if (value.dadMessageSpawnTimer !== undefined && !finite(value.dadMessageSpawnTimer, 0, 1000)) return false;
  if (value.boulderUnlocked !== undefined && typeof value.boulderUnlocked !== 'boolean') return false;
  if (!isRecord(value.upgrades)) return false;
  for (const key of ['power', 'speed', 'rapid', 'armor', 'vitality', 'fence']) {
    if (!finite(value.upgrades[key], 0, 5) || !Number.isInteger(value.upgrades[key])) return false;
  }
  if (!isRecord(value.farm) || !finite(value.farm.health, 0, 100_000) || !finite(value.farm.maxHealth, 1, 100_000) || value.farm.health > value.farm.maxHealth) return false;
  if (!Array.isArray(value.farm.crops) || value.farm.crops.length !== 4 || !isRecord(value.farm.facilities)) return false;
  for (const crop of value.farm.crops) {
    if (!isRecord(crop) || !finite(crop.hp, 0, 100_000) || !finite(crop.maxHp, 1, 100_000) || crop.hp > crop.maxHp) return false;
  }
  for (const key of ['barn', 'coop', 'silo']) {
    const facility = value.farm.facilities[key];
    if (!isRecord(facility) || !finite(facility.hp, 0, 100_000) || !finite(facility.maxHp, 1, 100_000) || facility.hp > facility.maxHp) return false;
  }
  if (!isRecord(value.waveState) || !['defend', 'rest'].includes(String(value.waveState.phase))) return false;
  if (!finite(value.waveState.total, 0, 1000) || !Number.isInteger(value.waveState.total) || !finite(value.waveState.spawned, 0, 1000) || !Number.isInteger(value.waveState.spawned) || value.waveState.spawned > value.waveState.total) return false;
  if (!finite(value.waveState.spawnTimer, 0, 1000) || !finite(value.waveState.phaseTimer, 0, 1000) || !finite(value.waveState.elapsed, 0, 1_000_000)) return false;
  if (!isRecord(value.stats) || !finite(value.stats.kills, 0, 10_000_000) || !finite(value.stats.protectedCrops, 0, 10_000_000) || !finite(value.stats.wavesCleared, 0, 100_000)) return false;
  if (!Array.isArray(value.enemies) || value.enemies.length > 80 || !Array.isArray(value.projectiles) || value.projectiles.length > 200) return false;
  const kinds = ['mole', 'rabbit', 'crow', 'boar', 'bear', 'tiger', 'wolf', 'kingBoar'];
  for (const enemy of value.enemies) {
    if (!isRecord(enemy) || !kinds.includes(String(enemy.kind))) return false;
    if (!finite(enemy.id, 1, 10_000_000) || !finite(enemy.x, -1000, WORLD.width + 1000) || !finite(enemy.y, -1000, WORLD.height + 1000)) return false;
    if (!finite(enemy.hp, 0, 1_000_000) || !finite(enemy.maxHp, 1, 1_000_000) || enemy.hp > enemy.maxHp || !finite(enemy.speed, 0, 10_000)) return false;
    if (!finite(enemy.targetIndex, 0, 7) || !['seek', 'burrow', 'dive', 'charge'].includes(String(enemy.mood))) return false;
    if (!finite(enemy.moodTimer, 0, 1000) || !finite(enemy.attackCooldown, 0, 1000) || !finite(enemy.contactCooldown, 0, 1000) || !finite(enemy.hitFlash, 0, 100)) return false;
    if (enemy.status !== undefined && enemy.status !== null && !['knockback', 'groggy', 'stun'].includes(String(enemy.status))) return false;
    if (enemy.statusTimer !== undefined && !finite(enemy.statusTimer, 0, 1000)) return false;
  }
  for (const projectile of value.projectiles) {
    if (!isRecord(projectile) || !finite(projectile.x, -1000, WORLD.width + 1000) || !finite(projectile.y, -1000, WORLD.height + 1000)) return false;
    if (!finite(projectile.vx, -5000, 5000) || !finite(projectile.vy, -5000, 5000) || !finite(projectile.damage, 0, 100_000) || !finite(projectile.life, 0, 100)) return false;
    if (projectile.ammo !== undefined && !isAmmoType(projectile.ammo)) return false;
    if (projectile.targetId !== undefined && (!finite(projectile.targetId, 1, 10_000_000) || !Number.isInteger(projectile.targetId))) return false;
  }
  if (value.pets !== undefined) {
    if (!Array.isArray(value.pets) || value.pets.length > 3) return false;
    const petTypes = new Set<string>();
    for (const pet of value.pets) {
      if (!isRecord(pet) || !isPetType(pet.type) || petTypes.has(pet.type)) return false;
      petTypes.add(pet.type);
      if (!finite(pet.x, 0, WORLD.width) || !finite(pet.y, 0, WORLD.height)) return false;
      if (!finite(pet.facingX, -1, 1) || !finite(pet.facingY, -1, 1)) return false;
      if (!finite(pet.attackCooldown, 0, 100) || !finite(pet.patrolIndex, 0, 100) || !Number.isInteger(pet.patrolIndex)) return false;
      if (pet.hp !== undefined && (!finite(pet.hp, 0, 100_000) || !finite(pet.maxHp, 1, 100_000) || pet.hp > pet.maxHp)) return false;
      if (pet.stunnedUntilWave !== undefined && (!finite(pet.stunnedUntilWave, 0, 100_000) || !Number.isInteger(pet.stunnedUntilWave))) return false;
      if (pet.damageCooldown !== undefined && !finite(pet.damageCooldown, 0, 100)) return false;
    }
  }
  for (const key of ['rottenWatermelons', 'fakeNewsPapers']) {
    const hazards = value[key];
    if (hazards === undefined) continue;
    if (!Array.isArray(hazards) || hazards.length > 10) return false;
    for (const hazard of hazards) {
      if (!isRecord(hazard) || !finite(hazard.id, 1, 10_000_000) || !Number.isInteger(hazard.id)
        || !finite(hazard.x, -1000, WORLD.width + 1000) || !finite(hazard.y, -1000, WORLD.height + 1000)
        || !finite(hazard.velocityX, -1000, 1000) || !finite(hazard.life, 0, 100)) return false;
    }
  }
  if (value.nextHazardId !== undefined && (!finite(value.nextHazardId, 1, 10_000_000) || !Number.isInteger(value.nextHazardId))) return false;
  if (value.hazardSpawnTimer !== undefined && !finite(value.hazardSpawnTimer, 0, 1000)) return false;
  if (value.terrainSeed !== undefined && (!finite(value.terrainSeed, 0, 0xffffffff) || !Number.isInteger(value.terrainSeed))) return false;
  if (value.terrainRevision !== undefined && (!finite(value.terrainRevision, 0, 10_000_000) || !Number.isInteger(value.terrainRevision))) return false;
  if (value.terrainSector !== undefined && (!finite(value.terrainSector, 0, 100) || !Number.isInteger(value.terrainSector))) return false;
  return true;
}

export function normalizeGameState(value: unknown): GameState | null {
  if (!isValidGameState(value)) return null;
  const legacy = !('level' in value) && !('ammo' in value);
  const state = structuredClone(value) as GameState;
  state.level = Number.isInteger(state.level) && state.level >= 1 ? state.level : 1;
  state.experience = finite(state.experience, 0, 100_000_000) ? state.experience : 0;
  state.experienceToNext = finite(state.experienceToNext, 1, 100_000_000) ? state.experienceToNext : state.level * 100;
  if (state.experience >= state.experienceToNext) state.experience = state.experienceToNext - 1;
  state.lifeCompleteShown = state.lifeCompleteShown === true;
  state.ownedWeapons = Array.isArray(state.ownedWeapons) ? [...new Set(state.ownedWeapons.filter(isWeaponType))] : ['slingshot'];
  if (!state.ownedWeapons.includes('slingshot')) state.ownedWeapons.unshift('slingshot');
  state.ammo = isWeaponType(state.ammo) && state.ownedWeapons.includes(state.ammo) ? state.ammo : 'slingshot';
  state.ammoCounts = normalizeAmmoCounts(isRecord(state.ammoCounts) ? state.ammoCounts as GameState['ammoCounts'] : undefined);
  state.rottenWatermelons = Array.isArray(state.rottenWatermelons) ? state.rottenWatermelons : [];
  state.fakeNewsPapers = Array.isArray(state.fakeNewsPapers) ? state.fakeNewsPapers : [];
  state.nextHazardId = finite(state.nextHazardId, 1, 10_000_000)
    ? state.nextHazardId
    : Math.max(0, ...state.rottenWatermelons.map((hazard) => hazard.id), ...state.fakeNewsPapers.map((hazard) => hazard.id)) + 1;
  state.hazardSpawnTimer = finite(state.hazardSpawnTimer, 0, 1000) ? state.hazardSpawnTimer : 12;
  state.terrainSeed = finite(state.terrainSeed, 0, 0xffffffff) ? state.terrainSeed : state.seed;
  state.terrainRevision = finite(state.terrainRevision, 0, 10_000_000) ? state.terrainRevision : 0;
  state.terrainSector = finite(state.terrainSector, 0, 100) ? state.terrainSector : Math.floor(state.player.x / 768);
  state.milkPickups = Array.isArray(state.milkPickups) ? state.milkPickups : [
    { id: 1, x: 270, y: 520 }, { id: 2, x: 762, y: 520 }, { id: 3, x: 515, y: 244 },
  ];
  state.nextMilkId = finite(state.nextMilkId, 1, 10_000_000) ? state.nextMilkId : Math.max(0, ...state.milkPickups.map((pickup) => pickup.id)) + 1;
  state.dadMessagePickups = Array.isArray(state.dadMessagePickups) ? state.dadMessagePickups : [];
  state.nextDadMessageId = finite(state.nextDadMessageId, 1, 10_000_000)
    ? state.nextDadMessageId
    : Math.max(0, ...state.dadMessagePickups.map((pickup) => pickup.id)) + 1;
  state.dadMessageSpawnTimer = finite(state.dadMessageSpawnTimer, 0, 1000) ? state.dadMessageSpawnTimer : 8;
  state.boulderUnlocked = state.boulderUnlocked === true;
  state.pets = Array.isArray(state.pets) ? state.pets : [];
  state.pets = state.pets.map((pet) => ({
    ...pet,
    hp: finite(pet.hp, 0, 100_000) ? pet.hp : PET_MAX_HP,
    maxHp: finite(pet.maxHp, 1, 100_000) ? pet.maxHp : PET_MAX_HP,
    stunnedUntilWave: finite(pet.stunnedUntilWave, 0, 100_000) ? Math.floor(pet.stunnedUntilWave) : 0,
    damageCooldown: finite(pet.damageCooldown, 0, 100) ? pet.damageCooldown : 0,
  }));
  state.player.meleeCooldown = finite(state.player.meleeCooldown, 0, 100) ? state.player.meleeCooldown : 0;
  state.player.boulderCooldown = finite(state.player.boulderCooldown, 0, 100) ? state.player.boulderCooldown : 0;
  state.player.stage = [1, 2, 3, 4].includes(Number(state.player.stage)) ? Number(state.player.stage) as GameState['player']['stage'] : 2;
  state.player.lives = finite(state.player.lives, 0, 9) ? Math.floor(state.player.lives) : 3;
  state.player.velocityY = finite(state.player.velocityY, -5000, 5000) ? state.player.velocityY : 0;
  state.player.grounded = typeof state.player.grounded === 'boolean' ? state.player.grounded : state.player.y >= WORLD.groundY;
  state.player.jumpTimer = finite(state.player.jumpTimer, 0, 2) ? state.player.jumpTimer : 0;
  state.player.jumpCooldown = finite(state.player.jumpCooldown, 0, 10) ? state.player.jumpCooldown : 0;
  if (legacy) {
    state.enemies = state.enemies.map((enemy) => ({
      ...enemy,
      status: enemy.status === 'knockback' || enemy.status === 'groggy' || enemy.status === 'stun' ? enemy.status : null,
      statusTimer: finite(enemy.statusTimer, 0, 1000) ? enemy.statusTimer : 0,
    }));
    state.projectiles = state.projectiles.map((projectile) => ({ ...projectile, ammo: isAmmoType(projectile.ammo) ? projectile.ammo : 'bb' }));
  }
  return state;
}

export function createSaveCode(state: GameState, kind: SaveCodeKind = 'full'): string {
  if (!isValidGameState(state)) throw new SaveCodeError('저장할 게임 상태가 올바르지 않아요.');
  const payload = new TextEncoder().encode(JSON.stringify({ formatVersion: 1, kind, savedAt: Date.now(), state }));
  if (payload.byteLength > MAX_RESTORED_BYTES - 4) throw new SaveCodeError('저장 데이터가 너무 커서 코드로 만들 수 없어요.');
  const checked = new Uint8Array(payload.length + 4);
  checked.set(payload);
  const crc = checksum(payload);
  new DataView(checked.buffer).setUint32(payload.length, crc, false);
  return CODE_PREFIX + toBase32(zlibSync(checked, { level: 9 }));
}

export async function restoreSaveCode(input: string): Promise<{ state: GameState; kind: SaveCodeKind; savedAt: number }> {
  const normalized = input.trim().replace(/[\r\n]/g, '').toUpperCase();
  if (normalized.length < 8 || normalized.length > MAX_CODE_LENGTH) throw new SaveCodeError('코드 길이가 올바르지 않아요.');
  if (!/^[A-Z0-9]+$/.test(normalized)) throw new SaveCodeError('코드에는 영문자와 숫자만 입력해 주세요.');
  if (!normalized.startsWith('HPA')) throw new SaveCodeError('효린 농장 디펜스2 코드가 아니에요.');
  if (normalized.slice(3, 4) !== '1') throw new SaveCodeError('지원하지 않는 코드 버전이에요. 최신 게임에서 코드를 만들어 주세요.');
  if (!normalized.startsWith(CODE_PREFIX)) throw new SaveCodeError('코드 형식을 확인할 수 없어요.');
  let compressed: Uint8Array;
  try {
    compressed = fromBase32(normalized.slice(CODE_PREFIX.length));
  } catch (cause) {
    if (cause instanceof SaveCodeError) throw cause;
    throw new SaveCodeError('코드가 손상되었거나 압축 데이터를 읽을 수 없어요.');
  }
  const restored = await decompressBounded(compressed);
  if (restored.byteLength < 8 || restored.byteLength > MAX_RESTORED_BYTES) throw new SaveCodeError('복원 데이터의 크기가 허용 범위를 벗어났어요.');
  const payload = restored.subarray(0, restored.length - 4);
  const expected = new DataView(restored.buffer, restored.byteOffset, restored.byteLength).getUint32(restored.length - 4, false);
  if (checksum(payload) !== expected) throw new SaveCodeError('체크섬이 맞지 않아요. 코드가 변경되었는지 확인해 주세요.');
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload));
  } catch {
    throw new SaveCodeError('저장 내용을 읽을 수 없어요.');
  }
  if (!isRecord(data) || data.formatVersion !== 1) throw new SaveCodeError('지원하지 않는 저장 데이터 버전이에요.');
  if (data.kind !== 'checkpoint' && data.kind !== 'full') throw new SaveCodeError('저장 코드 종류가 올바르지 않아요.');
  const state = normalizeGameState(data.state);
  if (!finite(data.savedAt, 0, Number.MAX_SAFE_INTEGER) || !state) throw new SaveCodeError('저장 상태가 손상되었거나 지원하지 않는 게임 버전이에요.');
  return { state, kind: data.kind, savedAt: data.savedAt };
}

