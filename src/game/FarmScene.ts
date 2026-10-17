import Phaser from 'phaser';
import { createGameState, DAD_MESSAGE_TEXTS, PLATFORM_SURFACES, stepWorld, WORLD } from './engine';
import { normalizeAmmoCounts, refillAmmo } from './ammo';
import { applyUpgrade, repairFarm, unlockBoulder } from './upgrades';
import type { AmmoType, Controls, EngineEvent, GameState, PetType } from './types';
import { purchasePet } from './pets';

export interface FarmSceneCallbacks {
  onSnapshot: (state: GameState) => void;
  onEvent: (event: EngineEvent, state: GameState) => void;
  onGameOver: (state: GameState) => void;
  onPause: (state: GameState) => void;
  onReady: () => void;
  onAutosave: (state: GameState) => void;
}

const SPRITES = {
  mole: 'mole',
  rabbit: 'rabbit',
  crow: 'crow',
  boar: 'boar',
  kingBoar: 'king-boar',
} as const;

export class FarmScene extends Phaser.Scene {
  private readonly callbacks: FarmSceneCallbacks;
  private state: GameState | null = null;
  private paused = true;
  private pauseKey?: Phaser.Input.Keyboard.Key;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private playerSprite?: Phaser.GameObjects.Sprite;
  private slingshotSprite?: Phaser.GameObjects.Image;
  private stoneSprite?: Phaser.GameObjects.Image;
  private readonly enemySprites = new Map<number, Phaser.GameObjects.Image>();
  private readonly milkSprites = new Map<number, Phaser.GameObjects.Image>();
  private readonly dadMessageSprites = new Map<number, Phaser.GameObjects.Container>();
  private readonly enemyStatusSprites = new Map<number, Phaser.GameObjects.Text>();
  private readonly petSprites = new Map<PetType, Phaser.GameObjects.Image>();
  private readonly previousPetPositions = new Map<PetType, { x: number; y: number }>();
  private readonly projectileSprites: Phaser.GameObjects.Image[] = [];
  private bars: Phaser.GameObjects.Graphics | null = null;
  private effects: Phaser.GameObjects.Graphics | null = null;
  private pointerAttack = false;
  private readonly touchDirections = new Set<'up' | 'down' | 'left' | 'right'>();
  private touchAttack = false;
  private touchJump = false;
  private touchJumpQueued = false;
  private meleeEffectTimer = 0;
  private meleeEffectKind: 'stone' | 'boulder' | null = null;
  private playerAttackTimer = 0;
  private playerHitTimer = 0;
  private specialEffect: { type: string; x: number; y: number; timer: number } | null = null;
  private hudTimer = 0;
  private autosaveTimer = 0;
  private lastAutosaveWave = -1;
  private ended = false;
  private moving = false;

  constructor(callbacks: FarmSceneCallbacks) {
    super({ key: 'FarmScene' });
    this.callbacks = callbacks;
  }

  preload(): void {
    const root = import.meta.env.BASE_URL + 'art/';
    this.load.svg('farm-background', root + 'adventure-background.svg', { width: 1024, height: WORLD.height });
    for (let stage = 1; stage <= 4; stage += 1) {
      for (const animation of ['idle', 'move', 'attack', 'hit']) {
        this.load.spritesheet(`hyorin-stage-${stage}-${animation}`, `${root}hyorin/stage-${stage}-${animation}.png`, { frameWidth: 64, frameHeight: 68 });
      }
    }
    this.load.svg('choco-milk', root + 'choco-milk.svg', { width: 44, height: 54 });
    this.load.image('pet-nuni', root + 'pet-nuni.png');
    this.load.image('pet-yangi', root + 'pet-yangi.png');
    this.load.image('pet-maru', root + 'pet-maru.png');
    this.load.svg('slingshot', root + 'slingshot.svg', { width: 48, height: 64 });
    this.load.svg('mole', root + 'mole.svg', { width: 72, height: 68 });
    this.load.svg('rabbit', root + 'rabbit.svg', { width: 68, height: 76 });
    this.load.svg('crow', root + 'crow.svg', { width: 78, height: 62 });
    this.load.svg('boar', root + 'boar.svg', { width: 84, height: 72 });
    this.load.svg('king-boar', root + 'king-boar.svg', { width: 112, height: 98 });
    this.load.svg('bb-pellet', root + 'bb-pellet.svg', { width: 32, height: 32 });
    this.load.svg('steel-bb-pellet', root + 'steel-bb-pellet.svg', { width: 32, height: 32 });
    this.load.svg('stone-pellet', root + 'stone-pellet.svg', { width: 32, height: 32 });
    this.load.svg('large-stone', root + 'large-stone.svg', { width: 40, height: 40 });
    this.load.svg('boulder', root + 'boulder.svg', { width: 64, height: 64 });
  }

  create(): void {
    this.add.tileSprite(0, 0, WORLD.width, WORLD.height, 'farm-background').setOrigin(0, 0).setDepth(0).setScrollFactor(0.32, 0.25);
    const terrain = this.add.graphics().setDepth(18);
    terrain.fillStyle(0x80604a).fillRect(0, WORLD.groundY, WORLD.width, WORLD.height - WORLD.groundY);
    terrain.fillStyle(0x6b9d53).fillRect(0, WORLD.groundY - 10, WORLD.width, 13);
    terrain.fillStyle(0x9dbb6b, 0.7).fillRect(0, WORLD.groundY - 10, WORLD.width, 3);
    for (let x = 18; x < WORLD.width; x += 43) {
      terrain.fillStyle(x % 2 ? 0x745239 : 0x8c6c4f, 0.72).fillRect(x, WORLD.groundY + 14 + (x % 3) * 9, 10 + (x % 4) * 2, 3);
      terrain.fillStyle(0x517a43, 0.9).fillTriangle(x + 4, WORLD.groundY - 8, x + 8, WORLD.groundY - 20, x + 12, WORLD.groundY - 8);
    }
    for (const platform of PLATFORM_SURFACES) {
      terrain.fillStyle(0x403a30, 0.22).fillRoundedRect(platform.x + 4, platform.y + 5, platform.width, 21, 5);
      terrain.fillStyle(0x8b6242).fillRoundedRect(platform.x, platform.y, platform.width, 19, 4);
      terrain.fillStyle(0x669b50).fillRoundedRect(platform.x - 2, platform.y - 6, platform.width + 4, 10, 4);
      terrain.fillStyle(0xb4c777, 0.85).fillRect(platform.x + 8, platform.y - 5, platform.width - 16, 2);
      for (let stoneX = platform.x + 18; stoneX < platform.x + platform.width - 12; stoneX += 47) {
        terrain.fillStyle(0x6e513b, 0.74).fillRect(stoneX, platform.y + 9, 10, 3);
      }
    }
    for (let stage = 1; stage <= 4; stage += 1) {
      for (const animation of ['idle', 'move', 'attack', 'hit']) {
        const key = `hyorin-stage-${stage}-${animation}`;
        // The adult row in the reference sheet contains different poses rather
        // than a clean animation cycle. Looping through them makes her flicker
        // between unrelated silhouettes, so hold each adult action's first pose.
        const frames = this.anims.generateFrameNumbers(key, stage === 4 ? { start: 0, end: 0 } : undefined);
        this.anims.create({ key, frames, frameRate: stage === 4 ? 1 : animation === 'idle' ? 6 : animation === 'hit' ? 8 : 11, repeat: -1 });
      }
    }
    this.playerSprite = this.add.sprite(120, WORLD.groundY, 'hyorin-stage-2-idle').setDisplaySize(58, 64).setOrigin(0.5, 1).setDepth(500);
    this.playerSprite.play('hyorin-stage-2-idle');
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height).startFollow(this.playerSprite, true, 0.12, 0.08);
    this.slingshotSprite = this.add.image(145, WORLD.groundY - 36, 'slingshot').setDisplaySize(20, 27).setOrigin(0.5, 0.9).setDepth(530);
    this.stoneSprite = this.add.image(120, WORLD.groundY - 20, 'large-stone').setDisplaySize(28, 28).setVisible(false).setDepth(560);
    this.bars = this.add.graphics().setDepth(900);
    this.effects = this.add.graphics().setDepth(820);
    this.pauseKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keys = (this.input.keyboard?.addKeys('A,D,S,LEFT,RIGHT,UP,DOWN,J,F,SPACE') ?? {}) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard?.addCapture([Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.LEFT, Phaser.Input.Keyboard.KeyCodes.RIGHT, Phaser.Input.Keyboard.KeyCodes.UP, Phaser.Input.Keyboard.KeyCodes.DOWN]);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if ((pointer.wasTouch || pointer.leftButtonDown()) && this.state && !this.paused) {
        this.pointerAttack = true;
      }
    });
    this.input.on('pointerup', () => { this.pointerAttack = false; });
    this.input.on('pointerupoutside', () => { this.pointerAttack = false; });
    this.input.on('gameout', () => { this.pointerAttack = false; });
    this.game.canvas.addEventListener('pointercancel', () => { this.pointerAttack = false; }, { passive: true });
    this.callbacks.onReady();
  }

  startRun(snapshot?: GameState): GameState {
    this.clearWorldSprites();
    this.state = snapshot ? structuredClone(snapshot) : createGameState();
    this.state.ammoCounts = normalizeAmmoCounts(this.state.ammoCounts);
    this.paused = false;
    this.clearPointerAndTouchControls();
    this.ended = false;
    this.hudTimer = 0;
    this.autosaveTimer = 0;
    this.lastAutosaveWave = this.state.wave;
    this.renderState();
    this.publishSnapshot();
    return this.snapshot();
  }

  snapshot(): GameState {
    if (!this.state) return createGameState();
    return structuredClone(this.state);
  }

  pauseRun(): GameState {
    this.paused = true;
    this.clearPointerAndTouchControls();
    const state = this.snapshot();
    this.callbacks.onPause(state);
    return state;
  }

  resumeRun(): void {
    this.clearPointerAndTouchControls();
    this.paused = false;
  }

  setTouchDirection(direction: 'up' | 'down' | 'left' | 'right', active: boolean): void {
    if (active) this.touchDirections.add(direction);
    else this.touchDirections.delete(direction);
  }

  releaseTouchDirections(): void {
    this.touchDirections.clear();
    this.touchAttack = false;
    this.touchJump = false;
    this.touchJumpQueued = false;
  }

  setTouchAttack(active: boolean): void {
    this.touchAttack = active;
  }

  setTouchJump(active: boolean): void {
    if (active && !this.touchJump) this.touchJumpQueued = true;
    this.touchJump = active;
  }

  private clearPointerAndTouchControls(): void {
    this.pointerAttack = false;
    this.touchAttack = false;
    this.touchJump = false;
    this.touchJumpQueued = false;
    this.touchDirections.clear();
  }

  selectAmmo(ammo: AmmoType): void {
    if (!this.state || this.state.ammo === ammo || this.state.ammoCounts[ammo] <= 0) return;
    this.state.ammo = ammo;
    this.publishSnapshot();
    this.callbacks.onAutosave(this.snapshot());
  }

  continueFromRest(): void {
    if (this.state) this.state.waveState.phaseTimer = 0;
    this.paused = false;
  }

  purchaseUpgrade(key: Parameters<typeof applyUpgrade>[1]): boolean {
    if (!this.state || !applyUpgrade(this.state, key)) return false;
    this.renderState();
    this.publishSnapshot();
    this.callbacks.onAutosave(this.snapshot());
    return true;
  }

  purchaseBoulder(): boolean {
    if (!this.state || !unlockBoulder(this.state)) return false;
    this.renderState();
    this.publishSnapshot();
    this.callbacks.onAutosave(this.snapshot());
    return true;
  }

  purchasePet(type: PetType): boolean {
    if (!this.state || !purchasePet(this.state, type)) return false;
    this.renderState();
    this.publishSnapshot();
    this.callbacks.onAutosave(this.snapshot());
    return true;
  }

  purchaseAmmo(type: AmmoType): boolean {
    if (!this.state || !refillAmmo(this.state, type)) return false;
    this.renderState();
    this.publishSnapshot();
    this.callbacks.onAutosave(this.snapshot());
    return true;
  }

  repairRun(): boolean {
    if (!this.state || !repairFarm(this.state)) return false;
    this.renderState();
    this.publishSnapshot();
    this.callbacks.onAutosave(this.snapshot());
    return true;
  }

  private controls(): Controls {
    const key = (name: string): boolean => Boolean(this.keys[name]?.isDown);
    return {
      left: this.touchDirections.has('left') || key('A') || key('LEFT'),
      right: this.touchDirections.has('right') || key('D') || key('RIGHT'),
      down: this.touchDirections.has('down') || key('S') || key('DOWN'),
      attack: this.pointerAttack || this.touchAttack || key('J') || key('F'),
      jump: this.consumeJumpInput(),
    };
  }

  private consumeJumpInput(): boolean {
    const touchJump = this.touchJumpQueued;
    this.touchJumpQueued = false;
    return touchJump || Boolean(this.keys.SPACE && Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) || Boolean(this.keys.UP && Phaser.Input.Keyboard.JustDown(this.keys.UP));
  }

  update(_time: number, deltaMs: number): void {
    if (!this.state || this.paused || this.ended) return;
    if (this.pauseKey?.isDown) {
      this.pauseKey.reset();
      this.pauseRun();
      return;
    }
    // A hidden tab must not advance waves by a large timer jump when it is shown again.
    if (deltaMs > 220) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    const controls = this.controls();
    const previousX = this.state.player.x;
    const previousY = this.state.player.y;
    this.meleeEffectTimer = Math.max(0, this.meleeEffectTimer - dt);
    this.playerAttackTimer = Math.max(0, this.playerAttackTimer - dt);
    this.playerHitTimer = Math.max(0, this.playerHitTimer - dt);
    if (this.specialEffect) {
      this.specialEffect.timer -= dt;
      if (this.specialEffect.timer <= 0) this.specialEffect = null;
    }
    const events = stepWorld(this.state, dt, controls);
    this.moving = Math.hypot(this.state.player.x - previousX, this.state.player.y - previousY) > 0.35;
    this.renderState();
    for (const event of events) {
      if (event.type === 'melee') { this.meleeEffectTimer = 0.28; this.meleeEffectKind = 'stone'; }
      if (event.type === 'boulder') { this.meleeEffectTimer = 0.48; this.meleeEffectKind = 'boulder'; }
      if (event.type === 'fire') this.playerAttackTimer = 0.24;
      if (event.type === 'player-hit') this.playerHitTimer = 0.48;
      if (event.type === 'special-attack') this.specialEffect = { type: event.text ?? 'blast', x: event.x ?? this.state.player.x, y: event.y ?? this.state.player.y, timer: 0.48 };
      this.callbacks.onEvent(event, this.snapshot());
      if (event.type === 'life-complete') this.callbacks.onAutosave(this.snapshot());
      if (event.type === 'wave-clear') {
        this.paused = true;
        this.clearPointerAndTouchControls();
        this.lastAutosaveWave = this.state.wave;
        this.callbacks.onAutosave(this.snapshot());
      }
      if (event.type === 'game-over' && !this.ended) {
        this.ended = true;
        this.paused = true;
        this.callbacks.onGameOver(this.snapshot());
      }
    }
    this.hudTimer += dt;
    this.autosaveTimer += dt;
    if (this.hudTimer >= 0.16) {
      this.hudTimer = 0;
      this.publishSnapshot();
    }
    if (this.autosaveTimer >= 12 || this.state.wave !== this.lastAutosaveWave) {
      this.autosaveTimer = 0;
      this.lastAutosaveWave = this.state.wave;
      this.callbacks.onAutosave(this.snapshot());
    }
  }

  private publishSnapshot(): void {
    if (this.state) this.callbacks.onSnapshot(this.snapshot());
  }

  private clearWorldSprites(): void {
    for (const sprite of this.enemySprites.values()) sprite.destroy();
    this.enemySprites.clear();
    for (const sprite of this.enemyStatusSprites.values()) sprite.destroy();
    this.enemyStatusSprites.clear();
    for (const sprite of this.milkSprites.values()) sprite.destroy();
    this.milkSprites.clear();
    for (const sprite of this.dadMessageSprites.values()) sprite.destroy();
    this.dadMessageSprites.clear();
    for (const sprite of this.petSprites.values()) sprite.destroy();
    this.petSprites.clear();
    this.previousPetPositions.clear();
    for (const sprite of this.projectileSprites) sprite.destroy();
    this.projectileSprites.length = 0;
  }

  private renderState(): void {
    if (!this.state || !this.playerSprite) return;
    const state = this.state;
    const time = this.time.now / 1000;
    const playerAnimation = this.playerHitTimer > 0 ? 'hit' : state.player.jumpTimer > 0 ? 'move' : this.playerAttackTimer > 0 ? 'attack' : this.moving ? 'move' : 'idle';
    const animationKey = `hyorin-stage-${state.player.stage}-${playerAnimation}`;
    if (this.playerSprite.anims.currentAnim?.key !== animationKey) this.playerSprite.play(animationKey, true);
    const stageSize: Record<number, [number, number]> = { 1: [54, 54], 2: [68, 74], 3: [76, 84], 4: [82, 92] };
    const [playerWidth, playerHeight] = stageSize[state.player.stage];
    this.playerSprite.setDisplaySize(playerWidth, playerHeight);
    const footBob = state.player.grounded ? (this.moving ? Math.sin(time * 17) * 2.4 : Math.sin(time * 2.3) * 1.1) : 0;
    this.playerSprite.setPosition(state.player.x, state.player.y + footBob);
    this.playerSprite.setDepth(state.player.y + 20);
    this.playerSprite.setRotation(Math.max(-0.07, Math.min(0.07, state.player.facingX * 0.05)));
    this.playerSprite.setFlipX(state.player.facingX < -0.15);
    this.playerSprite.setAlpha(state.player.invulnerable > 0 && Math.floor(time * 16) % 2 === 0 ? 0.48 : 1);
    const aimAngle = Math.atan2(state.player.facingY, state.player.facingX);
    const handSide = state.player.facingX < -0.15 ? -1 : 1;
    this.slingshotSprite?.setPosition(state.player.x + handSide * playerWidth * 0.2, state.player.y + footBob - playerHeight * 0.3)
      .setDisplaySize(20, 27)
      .setRotation(aimAngle + Math.PI / 2)
      .setDepth(state.player.y + 28);
    if (this.stoneSprite) {
      const active = this.meleeEffectTimer > 0;
      const duration = this.meleeEffectKind === 'boulder' ? 0.48 : 0.28;
      const progress = 1 - this.meleeEffectTimer / duration;
      const swing = progress * Math.PI * 1.35 - Math.PI * 0.7;
      const radius = this.meleeEffectKind === 'boulder' ? 56 : 37;
      this.stoneSprite.setVisible(active)
        .setTexture(this.meleeEffectKind === 'boulder' ? 'boulder' : 'large-stone')
        .setDisplaySize(this.meleeEffectKind === 'boulder' ? 48 : 28, this.meleeEffectKind === 'boulder' ? 48 : 28)
        .setPosition(state.player.x + Math.cos(swing) * radius, state.player.y - playerHeight * 0.55 + Math.sin(swing) * radius)
        .setRotation(swing)
        .setDepth(state.player.y + 50);
    }

    const activePetTypes = new Set(state.pets.map((pet) => pet.type));
    for (const [type, sprite] of this.petSprites) {
      if (!activePetTypes.has(type)) {
        sprite.destroy();
        this.petSprites.delete(type);
        this.previousPetPositions.delete(type);
      }
    }
    state.pets.forEach((pet, index) => {
      const texture = `pet-${pet.type}`;
      let sprite = this.petSprites.get(pet.type);
      if (!sprite) {
        sprite = this.add.image(pet.x, pet.y, texture).setDisplaySize(56, 48).setOrigin(0.5, 0.86);
        this.petSprites.set(pet.type, sprite);
      }
      const previous = this.previousPetPositions.get(pet.type);
      const running = previous !== undefined && Math.hypot(pet.x - previous.x, pet.y - previous.y) > 0.5;
      this.previousPetPositions.set(pet.type, { x: pet.x, y: pet.y });
      const bob = Math.sin(time * (running ? 18 : 3) + index * 2.2) * (running ? 2.5 : 0.8);
      sprite.setPosition(pet.x, pet.y + bob)
        .setFlipX(pet.facingX < -0.15)
        .setRotation(pet.facingY * 0.05)
        .setDepth(pet.y + 14);
    });

    const pickupIds = new Set(state.milkPickups.map((pickup) => pickup.id));
    for (const [id, sprite] of this.milkSprites) {
      if (!pickupIds.has(id)) {
        sprite.destroy();
        this.milkSprites.delete(id);
      }
    }
    state.milkPickups.forEach((pickup, index) => {
      let sprite = this.milkSprites.get(pickup.id);
      if (!sprite) {
        sprite = this.add.image(pickup.x, pickup.y, 'choco-milk').setDisplaySize(30, 38).setOrigin(0.5, 0.85).setDepth(pickup.y + 2);
        this.milkSprites.set(pickup.id, sprite);
      }
      const pulse = 1 + Math.sin(time * 5 + index) * 0.08;
      sprite.setPosition(pickup.x, pickup.y - 4 + Math.sin(time * 3 + index) * 2).setScale(pulse).setDepth(pickup.y + 2);
    });

    const messageIds = new Set(state.dadMessagePickups.map((pickup) => pickup.id));
    for (const [id, container] of this.dadMessageSprites) {
      if (!messageIds.has(id)) {
        container.destroy(true);
        this.dadMessageSprites.delete(id);
      }
    }
    state.dadMessagePickups.forEach((pickup) => {
      let container = this.dadMessageSprites.get(pickup.id);
      if (!container) {
        container = this.add.container(pickup.x, pickup.y);
        const paper = this.add.graphics();
        paper.fillStyle(0x493b27, 0.2).fillRoundedRect(-132, -35, 264, 74, 15);
        paper.fillStyle(0xfff5d7, 0.98).fillRoundedRect(-132, -39, 264, 74, 15);
        paper.lineStyle(2, 0xd9a55d, 0.95).strokeRoundedRect(-132, -39, 264, 74, 15);
        paper.fillStyle(0xffffff, 0.66).fillRoundedRect(-124, -32, 248, 60, 11);
        const title = this.add.text(0, -23, '아빠의 응원', {
          fontFamily: 'sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#a36337', align: 'center',
        }).setOrigin(0.5);
        const phrase = this.add.text(0, 4, DAD_MESSAGE_TEXTS[pickup.phraseIndex] ?? DAD_MESSAGE_TEXTS[0], {
          fontFamily: 'Malgun Gothic, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#514735',
          align: 'center', lineSpacing: 1, wordWrap: { width: 230, useAdvancedWrap: true },
        }).setOrigin(0.5);
        container.add([paper, title, phrase]).setDepth(pickup.y + 120);
        this.dadMessageSprites.set(pickup.id, container);
      }
      const flutter = pickup.velocityY > 0 ? Math.sin(time * 5 + pickup.id) * 0.035 : 0;
      const blinking = pickup.life < 2 && Math.floor(time * 8) % 2 === 0;
      container.setPosition(pickup.x, pickup.y).setRotation(flutter).setAlpha(blinking ? 0.45 : 1).setDepth(pickup.y + 120);
    });

    const aliveIds = new Set(state.enemies.map((enemy) => enemy.id));
    for (const [id, sprite] of this.enemySprites) {
      if (!aliveIds.has(id)) {
        sprite.destroy();
        this.enemySprites.delete(id);
        this.enemyStatusSprites.get(id)?.destroy();
        this.enemyStatusSprites.delete(id);
      }
    }
    for (const enemy of state.enemies) {
      let sprite = this.enemySprites.get(enemy.id);
      if (!sprite) {
        const key = SPRITES[enemy.kind];
        sprite = this.add.image(enemy.x, enemy.y, key).setOrigin(0.5, 0.7).setDepth(enemy.y + 10);
        this.enemySprites.set(enemy.id, sprite);
      }
      const bob = enemy.kind === 'crow' ? Math.sin(time * 7 + enemy.id) * 7 : Math.sin(time * 10 + enemy.id) * 1.5;
      sprite.setPosition(enemy.x, enemy.y + bob);
      sprite.setDepth(enemy.y + 12);
      sprite.setAlpha(enemy.kind === 'mole' && enemy.mood === 'burrow' ? 0.12 : 1);
      sprite.setScale(enemy.kind === 'kingBoar' ? 0.85 : enemy.kind === 'boar' ? 0.61 : 0.55);
      if (enemy.hitFlash > 0) sprite.setTint(0xffeee0);
      else sprite.clearTint();
      sprite.setRotation(enemy.kind === 'crow' ? Math.sin(time * 4 + enemy.id) * 0.05 : 0);
      let statusSprite = this.enemyStatusSprites.get(enemy.id);
      if (!statusSprite) {
        statusSprite = this.add.text(enemy.x, enemy.y - 46, '', { fontFamily: 'sans-serif', fontSize: '16px', color: '#fff8df', stroke: '#4a473c', strokeThickness: 3 })
          .setOrigin(0.5).setDepth(enemy.y + 60).setVisible(false);
        this.enemyStatusSprites.set(enemy.id, statusSprite);
      }
      if (enemy.status && (enemy.statusTimer ?? 0) > 0) {
        const icon = enemy.status === 'knockback' ? '💨' : enemy.status === 'groggy' ? '💫' : '⭐';
        statusSprite.setText(icon).setPosition(enemy.x, enemy.y - 43).setDepth(enemy.y + 60).setVisible(true);
      } else statusSprite.setVisible(false);
    }

    while (this.projectileSprites.length < state.projectiles.length) {
      this.projectileSprites.push(this.add.image(0, 0, 'bb-pellet').setDepth(700));
    }
    while (this.projectileSprites.length > state.projectiles.length) this.projectileSprites.pop()?.destroy();
    state.projectiles.forEach((projectile, index) => {
      const sprite = this.projectileSprites[index];
      const type = projectile.ammo ?? 'bb';
      const texture = type === 'steelBb' ? 'steel-bb-pellet' : type === 'stone' ? 'stone-pellet' : 'bb-pellet';
      const size = type === 'stone' || type === 'meteor' ? 16 : type === 'blast' ? 13 : type === 'lightning' ? 11 : type === 'steelBb' ? 11 : 9;
      sprite?.setTexture(texture).setTint(type === 'blast' ? 0xff7045 : type === 'lightning' ? 0xffe45c : type === 'meteor' ? 0xb264e9 : 0xffffff).setDisplaySize(size, size).setPosition(projectile.x, projectile.y).setRotation(Math.atan2(projectile.vy, projectile.vx));
    });

    const graphics = this.bars;
    if (!graphics) return;
    const effects = this.effects;
    if (effects) {
      effects.clear();
      if (this.specialEffect) {
        const progress = 1 - this.specialEffect.timer / 0.48;
        const radius = this.specialEffect.type === 'meteor' ? 164 : this.specialEffect.type === 'lightning' ? 72 : 96;
        const color = this.specialEffect.type === 'meteor' ? 0xc37bff : this.specialEffect.type === 'lightning' ? 0xffed80 : 0xff9d61;
        effects.fillStyle(color, 0.16 * (1 - progress)).fillCircle(this.specialEffect.x, this.specialEffect.y, radius * (0.4 + progress * 0.6));
        effects.lineStyle(this.specialEffect.type === 'lightning' ? 4 : 3, color, 1 - progress).strokeCircle(this.specialEffect.x, this.specialEffect.y, radius * (0.55 + progress * 0.45));
        if (this.specialEffect.type === 'lightning') {
          const target = state.enemies.filter((enemy) => Math.hypot(enemy.x - this.specialEffect!.x, enemy.y - this.specialEffect!.y) < 176).slice(0, 3);
          effects.lineStyle(3, 0xfff0a3, 0.95 - progress).beginPath().moveTo(this.specialEffect.x, this.specialEffect.y);
          for (const enemy of target) effects.lineTo(enemy.x + Math.sin(time * 70 + enemy.id) * 10, enemy.y + Math.cos(time * 55 + enemy.id) * 10);
          effects.strokePath();
        }
      }
    }
    graphics.clear();
    for (const enemy of state.enemies) {
      const boss = enemy.kind === 'kingBoar';
      const width = boss ? 62 : 36;
      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      const x = enemy.x - width / 2;
      const y = enemy.y - (boss ? 58 : 39);
      graphics.fillStyle(0x26362c, 0.76).fillRoundedRect(x - 1, y - 1, width + 2, 6, 3);
      graphics.fillStyle(boss ? 0xe7674f : 0xf2cd73, 1).fillRoundedRect(x, y, width * ratio, 4, 2);
    }
  }
}
