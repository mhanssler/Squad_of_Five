import Phaser from 'phaser';

// Sprite size constant - 64x64 for better detail
const SPRITE_SIZE = 64;
const HALF = SPRITE_SIZE / 2;

// Color constants for better contrast
const ARMY_GREEN = 0x2d5016; // Dark army green for body
const ARMY_GREEN_LIGHT = 0x4a7c23; // Lighter green for highlights
const ARMY_GREEN_DARK = 0x1e3a0f; // Shadow green
const SKIN_COLOR = 0xe0b89a; // Skin tone
const SKIN_SHADOW = 0xc49a7a; // Skin shadow
const SKIN_HIGHLIGHT = 0xf0c8aa; // Skin highlight
const HELMET_COLOR = 0x3d3d3d; // Dark helmet
const HELMET_HIGHLIGHT = 0x5a5a5a; // Helmet highlight
const HELMET_DARK = 0x2a2a2a; // Helmet shadow
const BOOTS_COLOR = 0x2a1810; // Dark brown boots
const BOOTS_HIGHLIGHT = 0x3d2820; // Boot highlight
const METAL_DARK = 0x333333; // Dark metal
const METAL_MID = 0x555555; // Mid metal
const METAL_LIGHT = 0x777777; // Light metal
const WOOD_DARK = 0x3a2718; // Dark wood
const WOOD_MID = 0x4a3728; // Mid wood
const WOOD_LIGHT = 0x5a4738; // Light wood
const VEST_COLOR = 0x4a5a3a; // Tactical vest
const VEST_DARK = 0x3a4a2a; // Vest shadow
const POUCH_COLOR = 0x5a6a4a; // Equipment pouch

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Display loading progress
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

    const loadingText = this.add.text(width / 2, height / 2 - 50, 'Loading...', {
      font: '20px Arial',
      color: '#ffffff',
    });
    loadingText.setOrigin(0.5, 0.5);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x4ade80, 1);
      progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
    });

    // Generate placeholder graphics (will be replaced with actual assets)
    this.createPlaceholderAssets();
  }

  create(): void {
    this.scene.start('MenuScene');
  }

  private createPlaceholderAssets(): void {
    // Create unique toy soldier sprites for each weapon class (standing poses)
    this.createRiflemanSprite();
    this.createGrenadierSprite();
    this.createRocketeerSprite();
    this.createShotgunnerSprite();
    this.createSniperSprite();
    
    // Additional weapon class sprites
    this.createMortarSprite();
    this.createFlamerSprite();
    this.createPistolSprite();
    this.createSMGSprite();
    this.createMinigunSprite();
    
    // Create walking animation frames for each class
    this.createWalkingSprites();
    
    // Default worm sprite (fallback)
    this.createDefaultWormSprite();

    // Create projectile sprite
    const projectileGraphics = this.make.graphics({ x: 0, y: 0 });
    projectileGraphics.fillStyle(0x333333, 1);
    projectileGraphics.fillCircle(8, 8, 6);
    projectileGraphics.lineStyle(2, 0xff4444, 1);
    projectileGraphics.strokeCircle(8, 8, 6);
    projectileGraphics.generateTexture('projectile', 16, 16);
    projectileGraphics.destroy();

    // Create crosshair/aim indicator
    const crosshairGraphics = this.make.graphics({ x: 0, y: 0 });
    crosshairGraphics.lineStyle(2, 0xff0000, 1);
    crosshairGraphics.strokeCircle(16, 16, 12);
    crosshairGraphics.lineBetween(16, 0, 16, 8);
    crosshairGraphics.lineBetween(16, 24, 16, 32);
    crosshairGraphics.lineBetween(0, 16, 8, 16);
    crosshairGraphics.lineBetween(24, 16, 32, 16);
    crosshairGraphics.generateTexture('crosshair', 32, 32);
    crosshairGraphics.destroy();

    // Create explosion particle
    const explosionGraphics = this.make.graphics({ x: 0, y: 0 });
    explosionGraphics.fillStyle(0xffaa00, 1);
    explosionGraphics.fillCircle(8, 8, 8);
    explosionGraphics.generateTexture('explosion-particle', 16, 16);
    explosionGraphics.destroy();

    // Supply crate (used for airdrops / powerups)
    const crateG = this.make.graphics({ x: 0, y: 0 });
    crateG.fillStyle(0x5a3b22, 1);
    crateG.fillRoundedRect(0, 0, 36, 26, 4);
    // Planks
    crateG.fillStyle(0x6b4628, 1);
    crateG.fillRect(3, 3, 30, 4);
    crateG.fillRect(3, 10, 30, 4);
    crateG.fillRect(3, 17, 30, 4);
    // Straps
    crateG.fillStyle(0x2a1a10, 0.9);
    crateG.fillRect(9, 1, 3, 24);
    crateG.fillRect(24, 1, 3, 24);
    // Edge highlight
    crateG.lineStyle(2, 0x9a6b3a, 0.9);
    crateG.strokeRoundedRect(1, 1, 34, 24, 4);
    crateG.generateTexture('supply-crate', 36, 26);
    crateG.destroy();
  }

  // Rifleman - classic toy soldier stance with rifle held diagonally
  // Enhanced 64x64 version with better proportions and shading
  private createRiflemanSprite(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = HALF; // Center X = 32
    
    // === HELMET with shading ===
    // Helmet shadow/outline
    g.fillStyle(HELMET_DARK, 1);
    g.beginPath();
    g.arc(cx, 10, 11, Math.PI, 0, false);
    g.fillPath();
    
    // Main helmet
    g.fillStyle(HELMET_COLOR, 1);
    g.beginPath();
    g.arc(cx, 10, 10, Math.PI, 0, false);
    g.fillPath();
    
    // Helmet highlight (top curve)
    g.fillStyle(HELMET_HIGHLIGHT, 1);
    g.beginPath();
    g.arc(cx - 2, 8, 5, Math.PI, 0, false);
    g.fillPath();
    
    // Helmet rim
    g.fillStyle(HELMET_DARK, 1);
    g.fillRect(cx - 11, 10, 22, 3);
    
    // === FACE with shading ===
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx, 16, 8);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 1, 15, 7);
    g.fillStyle(SKIN_HIGHLIGHT, 1);
    g.fillCircle(cx - 3, 13, 3);
    
    // Eyes
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 3, 15, 1.5);
    g.fillCircle(cx + 3, 15, 1.5);
    
    // === BODY / TORSO with tactical vest ===
    // Body shadow
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx - 8, 22, 16, 22);
    
    // Main torso
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx - 7, 22, 14, 20);
    
    // Highlight edge
    g.fillStyle(ARMY_GREEN_LIGHT, 1);
    g.fillRect(cx - 7, 22, 3, 18);
    
    // Tactical vest
    g.fillStyle(VEST_COLOR, 1);
    g.fillRect(cx - 6, 24, 12, 14);
    g.fillStyle(VEST_DARK, 1);
    g.fillRect(cx - 6, 24, 12, 2);
    g.fillRect(cx + 4, 24, 2, 14);
    
    // Vest pouches
    g.fillStyle(POUCH_COLOR, 1);
    g.fillRect(cx - 5, 30, 4, 5);
    g.fillRect(cx + 1, 30, 4, 5);
    g.lineStyle(1, ARMY_GREEN_DARK, 1);
    g.strokeRect(cx - 5, 30, 4, 5);
    g.strokeRect(cx + 1, 30, 4, 5);
    
    // === ARMS holding rifle diagonally ===
    // Left arm (back arm on stock)
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx - 7, 28, cx - 16, 38);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx - 7, 28, cx - 16, 38);
    
    // Left hand
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx - 16, 38, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 16, 37, 3);
    
    // Right arm (forward on barrel)
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx + 7, 26, cx + 18, 16);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx + 7, 26, cx + 18, 16);
    
    // Right hand
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx + 18, 16, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx + 18, 15, 3);
    
    // === RIFLE (diagonal across body) ===
    // Wood stock
    g.lineStyle(6, WOOD_DARK, 1);
    g.lineBetween(cx - 20, 42, cx - 12, 34);
    g.lineStyle(5, WOOD_MID, 1);
    g.lineBetween(cx - 20, 42, cx - 12, 34);
    g.lineStyle(2, WOOD_LIGHT, 1);
    g.lineBetween(cx - 19, 41, cx - 13, 35);
    
    // Metal barrel
    g.lineStyle(4, METAL_DARK, 1);
    g.lineBetween(cx - 12, 34, cx + 24, 10);
    g.lineStyle(3, METAL_MID, 1);
    g.lineBetween(cx - 12, 34, cx + 24, 10);
    g.lineStyle(1, METAL_LIGHT, 1);
    g.lineBetween(cx - 10, 32, cx + 22, 11);
    
    // Front sight
    g.fillStyle(METAL_DARK, 1);
    g.fillRect(cx + 22, 8, 3, 4);
    
    // === LEGS - standing at attention ===
    // Left leg shadow
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx - 7, 42, 7, 16);
    // Left leg
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx - 6, 42, 5, 14);
    g.fillStyle(ARMY_GREEN_LIGHT, 1);
    g.fillRect(cx - 6, 42, 2, 12);
    
    // Right leg shadow
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx, 42, 7, 16);
    // Right leg
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx + 1, 42, 5, 14);
    
    // === BOOTS ===
    // Left boot
    g.fillStyle(BOOTS_COLOR, 1);
    g.fillRect(cx - 8, 54, 8, 8);
    g.fillStyle(BOOTS_HIGHLIGHT, 1);
    g.fillRect(cx - 7, 55, 3, 2);
    
    // Right boot
    g.fillStyle(BOOTS_COLOR, 1);
    g.fillRect(cx, 54, 8, 8);
    g.fillStyle(BOOTS_HIGHLIGHT, 1);
    g.fillRect(cx + 1, 55, 3, 2);
    
    // Boot soles
    g.fillStyle(0x1a0a08, 1);
    g.fillRect(cx - 8, 60, 8, 2);
    g.fillRect(cx, 60, 8, 2);
    
    g.generateTexture('worm-rifle', SPRITE_SIZE, SPRITE_SIZE);
    g.destroy();
  }

  // Grenadier - arm cocked back ready to throw
  // Enhanced 64x64 version with bandolier and grenades
  private createGrenadierSprite(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = HALF;
    
    // === HELMET with camo netting ===
    g.fillStyle(HELMET_DARK, 1);
    g.beginPath();
    g.arc(cx, 10, 11, Math.PI, 0, false);
    g.fillPath();
    
    g.fillStyle(HELMET_COLOR, 1);
    g.beginPath();
    g.arc(cx, 10, 10, Math.PI, 0, false);
    g.fillPath();
    
    // Camo netting strips
    g.lineStyle(2, 0x556b2f, 0.9);
    g.lineBetween(cx - 8, 6, cx + 8, 6);
    g.lineBetween(cx - 9, 3, cx + 7, 3);
    g.lineBetween(cx - 6, 0, cx + 6, 0);
    
    // Helmet rim
    g.fillStyle(HELMET_DARK, 1);
    g.fillRect(cx - 11, 10, 22, 3);
    
    // === FACE ===
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx, 16, 8);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 1, 15, 7);
    g.fillStyle(SKIN_HIGHLIGHT, 1);
    g.fillCircle(cx - 3, 13, 3);
    
    // Determined expression
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 3, 15, 1.5);
    g.fillCircle(cx + 3, 15, 1.5);
    // Gritted teeth
    g.lineStyle(1, 0x000000, 0.5);
    g.lineBetween(cx - 3, 19, cx + 3, 19);
    
    // === BODY with bandolier ===
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx - 8, 22, 16, 22);
    
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx - 7, 22, 14, 20);
    
    g.fillStyle(ARMY_GREEN_LIGHT, 1);
    g.fillRect(cx - 7, 22, 3, 18);
    
    // Bandolier (diagonal strap with grenades)
    g.lineStyle(5, 0x5a4a3a, 1);
    g.lineBetween(cx - 6, 24, cx + 6, 40);
    g.lineStyle(3, 0x6a5a4a, 1);
    g.lineBetween(cx - 6, 24, cx + 6, 40);
    
    // Grenades on bandolier
    g.fillStyle(0x3d4a3d, 1);
    g.fillCircle(cx - 4, 27, 4);
    g.fillCircle(cx - 1, 32, 4);
    g.fillCircle(cx + 3, 37, 4);
    // Grenade details
    g.lineStyle(1, 0x2a2a2a, 1);
    g.lineBetween(cx - 4, 23, cx - 4, 25);
    g.lineBetween(cx - 1, 28, cx - 1, 30);
    g.lineBetween(cx + 3, 33, cx + 3, 35);
    
    // === LEFT ARM down at side ===
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx - 7, 28, cx - 14, 42);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx - 7, 28, cx - 14, 42);
    
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx - 14, 42, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 14, 41, 3);
    
    // === RIGHT ARM raised back - throwing pose ===
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx + 7, 26, cx + 20, 8);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx + 7, 26, cx + 20, 8);
    
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx + 20, 7, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx + 20, 6, 3);
    
    // === GRENADE in hand ===
    g.fillStyle(0x3d4a3d, 1);
    g.fillCircle(cx + 24, 2, 6);
    g.fillStyle(0x4a5a4a, 1);
    g.fillCircle(cx + 23, 1, 4);
    // Spoon and pin
    g.lineStyle(2, METAL_MID, 1);
    g.lineBetween(cx + 24, -4, cx + 24, -8);
    g.fillStyle(METAL_DARK, 1);
    g.fillCircle(cx + 24, -9, 2);
    
    // === LEGS - wide throwing stance ===
    // Left leg (forward)
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx - 10, 42, 7, 16);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx - 9, 42, 5, 14);
    g.fillStyle(ARMY_GREEN_LIGHT, 1);
    g.fillRect(cx - 9, 42, 2, 12);
    
    // Right leg (back, supporting)
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx + 3, 42, 7, 16);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx + 4, 42, 5, 14);
    
    // === BOOTS ===
    g.fillStyle(BOOTS_COLOR, 1);
    g.fillRect(cx - 12, 54, 8, 8);
    g.fillRect(cx + 4, 54, 8, 8);
    g.fillStyle(BOOTS_HIGHLIGHT, 1);
    g.fillRect(cx - 11, 55, 3, 2);
    g.fillRect(cx + 5, 55, 3, 2);
    
    // Boot soles
    g.fillStyle(0x1a0a08, 1);
    g.fillRect(cx - 12, 60, 8, 2);
    g.fillRect(cx + 4, 60, 8, 2);
    
    g.generateTexture('worm-grenade', SPRITE_SIZE, SPRITE_SIZE);
    g.destroy();
  }

  // Rocketeer - kneeling with launcher on shoulder
  // Enhanced 64x64 version with ammo backpack
  private createRocketeerSprite(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = HALF - 4; // Offset left since launcher extends right
    
    // === HEAVY HELMET ===
    g.fillStyle(HELMET_DARK, 1);
    g.beginPath();
    g.arc(cx, 14, 12, Math.PI, 0, false);
    g.fillPath();
    
    g.fillStyle(HELMET_COLOR, 1);
    g.beginPath();
    g.arc(cx, 14, 11, Math.PI, 0, false);
    g.fillPath();
    
    // Visor/face shield
    g.fillStyle(0x334455, 0.7);
    g.beginPath();
    g.arc(cx, 12, 6, Math.PI * 0.8, Math.PI * 0.2, false);
    g.fillPath();
    
    g.fillStyle(HELMET_HIGHLIGHT, 1);
    g.beginPath();
    g.arc(cx - 3, 10, 4, Math.PI, 0, false);
    g.fillPath();
    
    // Helmet rim
    g.fillStyle(HELMET_DARK, 1);
    g.fillRect(cx - 12, 14, 24, 3);
    
    // === FACE (partially visible under visor) ===
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx, 20, 7);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 1, 19, 6);
    
    // Eyes focused
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 3, 18, 1.5);
    g.fillCircle(cx + 2, 18, 1.5);
    
    // === BACKPACK with rockets ===
    g.fillStyle(0x3a3a3a, 1);
    g.fillRect(cx - 16, 26, 10, 20);
    g.fillStyle(0x4a4a4a, 1);
    g.fillRect(cx - 15, 27, 8, 18);
    
    // Spare rockets in backpack
    g.fillStyle(0x4a5a4a, 1);
    g.fillCircle(cx - 12, 32, 3);
    g.fillCircle(cx - 12, 40, 3);
    g.fillStyle(0xff4400, 1);
    g.fillCircle(cx - 12, 29, 2);
    g.fillCircle(cx - 12, 37, 2);
    
    // Backpack straps
    g.lineStyle(3, 0x5a4a3a, 1);
    g.lineBetween(cx - 10, 26, cx - 4, 26);
    g.lineBetween(cx - 10, 44, cx - 4, 44);
    
    // === BODY (leaning into shot) ===
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx - 6, 24, 14, 20);
    
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx - 5, 24, 12, 18);
    
    g.fillStyle(ARMY_GREEN_LIGHT, 1);
    g.fillRect(cx + 5, 24, 2, 16);
    
    // === ARMS supporting launcher ===
    // Left arm (trigger hand)
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx - 5, 30, cx - 12, 20);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx - 5, 30, cx - 12, 20);
    
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx - 12, 20, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 12, 19, 3);
    
    // Right arm (supporting barrel)
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx + 7, 28, cx + 18, 18);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx + 7, 28, cx + 18, 18);
    
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx + 18, 18, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx + 18, 17, 3);
    
    // === ROCKET LAUNCHER ===
    // Main tube
    g.fillStyle(METAL_DARK, 1);
    g.fillRect(cx - 16, 12, 54, 10);
    g.fillStyle(METAL_MID, 1);
    g.fillRect(cx - 14, 14, 50, 6);
    g.fillStyle(METAL_LIGHT, 1);
    g.fillRect(cx - 12, 15, 46, 2);
    
    // Front sight
    g.fillStyle(METAL_DARK, 1);
    g.fillRect(cx + 32, 10, 4, 4);
    
    // Rear grip/trigger assembly
    g.fillStyle(0x2a2a2a, 1);
    g.fillRect(cx - 8, 18, 8, 8);
    
    // Rocket tip (loaded)
    g.fillStyle(0xff4400, 1);
    g.beginPath();
    g.moveTo(cx + 40, 17);
    g.lineTo(cx + 48, 17);
    g.lineTo(cx + 40, 17);
    g.fillPath();
    g.fillCircle(cx + 42, 17, 5);
    g.fillStyle(0xffaa00, 1);
    g.fillCircle(cx + 44, 17, 3);
    g.fillStyle(0xffdd00, 1);
    g.fillCircle(cx + 45, 17, 1);
    
    // === LEGS - kneeling pose ===
    // Left leg (forward, bent)
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx - 6, 42, 8, 8);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx - 5, 42, 6, 6);
    
    // Left shin going forward
    g.lineStyle(7, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx - 2, 48, cx - 10, 58);
    g.lineStyle(6, ARMY_GREEN, 1);
    g.lineBetween(cx - 2, 48, cx - 10, 58);
    
    // Right leg (kneeling, tucked under)
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx + 4, 42, 8, 18);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx + 5, 42, 6, 16);
    
    // === BOOTS ===
    // Left boot (forward)
    g.fillStyle(BOOTS_COLOR, 1);
    g.fillRect(cx - 14, 56, 9, 6);
    g.fillStyle(BOOTS_HIGHLIGHT, 1);
    g.fillRect(cx - 13, 57, 3, 2);
    
    // Right boot (kneeling)
    g.fillStyle(BOOTS_COLOR, 1);
    g.fillRect(cx + 4, 56, 9, 6);
    g.fillStyle(BOOTS_HIGHLIGHT, 1);
    g.fillRect(cx + 5, 57, 3, 2);
    
    g.generateTexture('worm-rocket', SPRITE_SIZE, SPRITE_SIZE);
    g.destroy();
  }

  // Shotgunner - hip fire stance
  // Enhanced 64x64 version with tactical vest and shells
  private createShotgunnerSprite(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = HALF;
    
    // === TACTICAL CAP/BERET ===
    g.fillStyle(0x1d1d3a, 1);
    g.beginPath();
    g.arc(cx, 8, 10, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(0x2d2d4a, 1);
    g.beginPath();
    g.arc(cx, 8, 9, Math.PI, 0, false);
    g.fillPath();
    
    // Cap brim
    g.fillStyle(0x1d1d3a, 1);
    g.fillRect(cx - 11, 8, 22, 4);
    g.fillRect(cx - 13, 10, 8, 3); // Extended front brim
    
    // Cap highlight
    g.fillStyle(0x3d3d5a, 1);
    g.beginPath();
    g.arc(cx - 3, 5, 4, Math.PI, 0, false);
    g.fillPath();
    
    // === FACE ===
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx, 16, 8);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 1, 15, 7);
    g.fillStyle(SKIN_HIGHLIGHT, 1);
    g.fillCircle(cx - 3, 13, 3);
    
    // Intense eyes
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 3, 15, 2);
    g.fillCircle(cx + 3, 15, 2);
    
    // Stubble/5 o'clock shadow
    g.fillStyle(0x8a7a6a, 0.3);
    g.fillRect(cx - 5, 18, 10, 4);
    
    // === BODY with tactical vest ===
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx - 8, 22, 16, 20);
    
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx - 7, 22, 14, 18);
    
    // Tactical vest
    g.fillStyle(VEST_COLOR, 1);
    g.fillRect(cx - 6, 24, 12, 14);
    g.fillStyle(VEST_DARK, 1);
    g.fillRect(cx - 6, 24, 12, 2);
    g.fillRect(cx + 4, 24, 2, 14);
    
    // Shell holders on vest (shotgun shells)
    g.fillStyle(0xaa3333, 1);
    g.fillRect(cx - 5, 28, 3, 6);
    g.fillRect(cx - 1, 28, 3, 6);
    g.fillRect(cx + 3, 28, 3, 6);
    // Shell brass bases
    g.fillStyle(0xccaa44, 1);
    g.fillRect(cx - 5, 32, 3, 2);
    g.fillRect(cx - 1, 32, 3, 2);
    g.fillRect(cx + 3, 32, 3, 2);
    
    // === ARMS at hip holding shotgun ===
    // Left arm (on pump)
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx - 7, 30, cx - 16, 36);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx - 7, 30, cx - 16, 36);
    
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx - 16, 36, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 16, 35, 3);
    
    // Right arm (on grip)
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx + 7, 30, cx + 18, 38);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx + 7, 30, cx + 18, 38);
    
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx + 18, 38, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx + 18, 37, 3);
    
    // === SHOTGUN at hip ===
    // Stock
    g.fillStyle(WOOD_DARK, 1);
    g.fillRect(cx + 12, 34, 16, 8);
    g.fillStyle(WOOD_MID, 1);
    g.fillRect(cx + 13, 35, 14, 6);
    g.fillStyle(WOOD_LIGHT, 1);
    g.fillRect(cx + 14, 36, 12, 2);
    
    // Receiver/action
    g.fillStyle(METAL_DARK, 1);
    g.fillRect(cx - 4, 32, 18, 7);
    g.fillStyle(METAL_MID, 1);
    g.fillRect(cx - 3, 33, 16, 5);
    
    // Barrel
    g.fillStyle(METAL_DARK, 1);
    g.fillRect(cx - 22, 33, 20, 5);
    g.fillStyle(METAL_MID, 1);
    g.fillRect(cx - 21, 34, 18, 3);
    g.fillStyle(METAL_LIGHT, 1);
    g.fillRect(cx - 20, 35, 16, 1);
    
    // Pump grip
    g.fillStyle(WOOD_MID, 1);
    g.fillRect(cx - 18, 32, 6, 7);
    g.fillStyle(WOOD_LIGHT, 1);
    g.fillRect(cx - 17, 33, 4, 5);
    
    // Muzzle
    g.fillStyle(0x222222, 1);
    g.fillCircle(cx - 24, 35, 4);
    g.fillStyle(0x111111, 1);
    g.fillCircle(cx - 24, 35, 2);
    
    // === LEGS - action stance ===
    // Left leg
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx - 8, 40, 7, 18);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx - 7, 40, 5, 16);
    g.fillStyle(ARMY_GREEN_LIGHT, 1);
    g.fillRect(cx - 7, 40, 2, 14);
    
    // Right leg
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx + 1, 40, 7, 18);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx + 2, 40, 5, 16);
    
    // === BOOTS ===
    g.fillStyle(BOOTS_COLOR, 1);
    g.fillRect(cx - 9, 54, 8, 8);
    g.fillRect(cx + 1, 54, 8, 8);
    g.fillStyle(BOOTS_HIGHLIGHT, 1);
    g.fillRect(cx - 8, 55, 3, 2);
    g.fillRect(cx + 2, 55, 3, 2);
    
    // Boot soles
    g.fillStyle(0x1a0a08, 1);
    g.fillRect(cx - 9, 60, 8, 2);
    g.fillRect(cx + 1, 60, 8, 2);
    
    g.generateTexture('worm-shotgun', SPRITE_SIZE, SPRITE_SIZE);
    g.destroy();
  }

  // Sniper - prone/crouched with long rifle
  // Enhanced 64x64 version with ghillie suit details
  private createSniperSprite(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = HALF - 6; // Offset since rifle extends right
    
    // === GHILLIE HOOD ===
    // Outer ragged edges
    g.fillStyle(0x3d4a2d, 1);
    g.beginPath();
    g.arc(cx, 16, 14, Math.PI * 0.6, Math.PI * 0.4, false);
    g.fillPath();
    
    // Main hood shape
    g.fillStyle(0x4a5a3d, 1);
    g.beginPath();
    g.arc(cx, 16, 12, Math.PI * 0.65, Math.PI * 0.35, false);
    g.fillPath();
    
    // Hood texture/leaves
    g.fillStyle(0x556b2f, 0.8);
    g.fillCircle(cx - 8, 10, 4);
    g.fillCircle(cx - 4, 6, 3);
    g.fillCircle(cx + 2, 8, 4);
    g.fillCircle(cx + 8, 12, 3);
    g.fillCircle(cx - 10, 16, 3);
    g.fillStyle(0x4a5a2d, 0.7);
    g.fillCircle(cx - 6, 14, 3);
    g.fillCircle(cx + 4, 14, 4);
    
    // Darker underside
    g.fillStyle(0x2a3a1d, 1);
    g.fillRect(cx - 10, 18, 20, 6);
    
    // === FACE (mostly hidden) ===
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx + 2, 20, 6);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx + 1, 19, 5);
    
    // One visible eye, focused
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx + 3, 18, 2);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx + 4, 17, 0.5);
    
    // Camo face paint
    g.fillStyle(0x3a4a2a, 0.4);
    g.fillRect(cx - 2, 17, 6, 2);
    g.fillRect(cx, 20, 4, 2);
    
    // === GHILLIE BODY (crouched low) ===
    // Main body covered in ghillie
    g.fillStyle(0x3d4a2d, 1);
    g.fillRect(cx - 4, 24, 20, 16);
    g.fillStyle(0x4a5a3d, 1);
    g.fillRect(cx - 2, 25, 16, 14);
    
    // Ghillie texture strips
    g.fillStyle(0x556b2f, 0.8);
    g.fillCircle(cx, 28, 4);
    g.fillCircle(cx + 6, 26, 3);
    g.fillCircle(cx + 12, 30, 4);
    g.fillCircle(cx + 2, 34, 3);
    g.fillCircle(cx + 8, 36, 4);
    g.fillStyle(0x4a5a2d, 0.7);
    g.fillCircle(cx + 4, 30, 3);
    g.fillCircle(cx + 10, 34, 3);
    
    // === ARMS extended on rifle ===
    // Left arm (on stock)
    g.lineStyle(7, 0x3d4a2d, 1);
    g.lineBetween(cx - 2, 30, cx - 12, 26);
    g.lineStyle(6, 0x4a5a3d, 1);
    g.lineBetween(cx - 2, 30, cx - 12, 26);
    
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx - 12, 26, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 12, 25, 3);
    
    // Right arm (forward on barrel)
    g.lineStyle(7, 0x3d4a2d, 1);
    g.lineBetween(cx + 14, 32, cx + 26, 26);
    g.lineStyle(6, 0x4a5a3d, 1);
    g.lineBetween(cx + 14, 32, cx + 26, 26);
    
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx + 26, 26, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx + 26, 25, 3);
    
    // === SNIPER RIFLE ===
    // Stock (wrapped)
    g.fillStyle(0x3a4a2a, 1);
    g.fillRect(cx - 20, 22, 14, 8);
    g.fillStyle(0x4a5a3a, 1);
    g.fillRect(cx - 19, 23, 12, 6);
    // Stock butt pad
    g.fillStyle(0x2a2a2a, 1);
    g.fillRect(cx - 22, 22, 4, 8);
    
    // Main barrel
    g.fillStyle(METAL_DARK, 1);
    g.fillRect(cx - 6, 22, 48, 6);
    g.fillStyle(METAL_MID, 1);
    g.fillRect(cx - 4, 23, 44, 4);
    g.fillStyle(METAL_LIGHT, 1);
    g.fillRect(cx - 2, 24, 40, 1);
    
    // Suppressor
    g.fillStyle(0x2a2a2a, 1);
    g.fillRect(cx + 38, 21, 14, 8);
    g.fillStyle(0x3a3a3a, 1);
    g.fillRect(cx + 40, 22, 10, 6);
    // Suppressor vents
    g.lineStyle(1, 0x4a4a4a, 1);
    g.lineBetween(cx + 42, 22, cx + 42, 28);
    g.lineBetween(cx + 45, 22, cx + 45, 28);
    g.lineBetween(cx + 48, 22, cx + 48, 28);
    
    // === SCOPE (detailed) ===
    // Scope body
    g.fillStyle(0x1a1a2a, 1);
    g.fillRect(cx + 8, 14, 16, 9);
    g.fillStyle(0x2a2a3a, 1);
    g.fillRect(cx + 9, 15, 14, 7);
    
    // Scope lens (front)
    g.fillStyle(0x222244, 1);
    g.fillCircle(cx + 22, 18, 5);
    g.fillStyle(0x4466aa, 0.8);
    g.fillCircle(cx + 22, 17, 3);
    g.fillStyle(0x88aaff, 0.5);
    g.fillCircle(cx + 21, 16, 1);
    
    // Scope eyepiece (rear)
    g.fillStyle(0x1a1a2a, 1);
    g.fillCircle(cx + 10, 18, 4);
    g.fillStyle(0x111111, 1);
    g.fillCircle(cx + 10, 18, 2);
    
    // Scope adjustment knobs
    g.fillStyle(0x3a3a3a, 1);
    g.fillRect(cx + 14, 12, 4, 3);
    g.fillRect(cx + 18, 12, 4, 3);
    
    // Bipod
    g.lineStyle(3, METAL_DARK, 1);
    g.lineBetween(cx + 30, 28, cx + 24, 40);
    g.lineBetween(cx + 34, 28, cx + 40, 40);
    g.lineStyle(2, METAL_MID, 1);
    g.lineBetween(cx + 30, 28, cx + 24, 40);
    g.lineBetween(cx + 34, 28, cx + 40, 40);
    
    // === LEGS - kneeling/prone ===
    // Left leg (forward knee)
    g.fillStyle(0x3d4a2d, 1);
    g.fillRect(cx - 4, 38, 8, 10);
    g.fillStyle(0x4a5a3d, 1);
    g.fillRect(cx - 3, 39, 6, 8);
    
    // Right leg (back, extended)
    g.fillStyle(0x3d4a2d, 1);
    g.fillRect(cx + 6, 38, 10, 18);
    g.fillStyle(0x4a5a3d, 1);
    g.fillRect(cx + 7, 39, 8, 16);
    
    // === BOOTS ===
    // Left boot (tucked)
    g.fillStyle(BOOTS_COLOR, 1);
    g.fillRect(cx - 8, 46, 9, 6);
    g.fillStyle(BOOTS_HIGHLIGHT, 1);
    g.fillRect(cx - 7, 47, 3, 2);
    
    // Right boot
    g.fillStyle(BOOTS_COLOR, 1);
    g.fillRect(cx + 8, 54, 9, 6);
    g.fillStyle(BOOTS_HIGHLIGHT, 1);
    g.fillRect(cx + 9, 55, 3, 2);
    
    g.generateTexture('worm-sniper', SPRITE_SIZE, SPRITE_SIZE);
    g.destroy();
  }

  // Mortar - soldier with tube mortar, kneeling to fire upward
  private createMortarSprite(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = HALF;
    
    // === HELMET with rangefinder ===
    g.fillStyle(HELMET_DARK, 1);
    g.beginPath();
    g.arc(cx, 10, 11, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(HELMET_COLOR, 1);
    g.beginPath();
    g.arc(cx, 10, 10, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(HELMET_HIGHLIGHT, 1);
    g.beginPath();
    g.arc(cx - 2, 8, 5, Math.PI, 0, false);
    g.fillPath();
    
    // Rangefinder on helmet
    g.fillStyle(0x2a2a3a, 1);
    g.fillRect(cx + 6, 4, 8, 6);
    g.fillStyle(0x4466aa, 0.8);
    g.fillCircle(cx + 12, 7, 2);
    
    g.fillStyle(HELMET_DARK, 1);
    g.fillRect(cx - 11, 10, 22, 3);
    
    // === FACE ===
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx, 16, 8);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 1, 15, 7);
    g.fillStyle(SKIN_HIGHLIGHT, 1);
    g.fillCircle(cx - 3, 13, 3);
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 3, 15, 1.5);
    g.fillCircle(cx + 3, 15, 1.5);
    
    // === BODY ===
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx - 8, 22, 16, 20);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx - 7, 22, 14, 18);
    g.fillStyle(ARMY_GREEN_LIGHT, 1);
    g.fillRect(cx - 7, 22, 3, 16);
    
    // Ammo pouches for mortar rounds
    g.fillStyle(POUCH_COLOR, 1);
    g.fillRect(cx - 6, 28, 5, 8);
    g.fillRect(cx + 1, 28, 5, 8);
    g.lineStyle(1, ARMY_GREEN_DARK, 1);
    g.strokeRect(cx - 6, 28, 5, 8);
    g.strokeRect(cx + 1, 28, 5, 8);
    // Round tops visible
    g.fillStyle(0x4a5a4a, 1);
    g.fillCircle(cx - 4, 30, 2);
    g.fillCircle(cx + 3, 30, 2);
    
    // === ARMS holding mortar shell ===
    // Left arm
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx - 7, 28, cx - 14, 22);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx - 7, 28, cx - 14, 22);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx - 14, 22, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 14, 21, 3);
    
    // Right arm up holding shell
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx + 7, 26, cx + 4, 14);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx + 7, 26, cx + 4, 14);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx + 4, 14, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx + 4, 13, 3);
    
    // Mortar shell in hand
    g.fillStyle(0x4a5a4a, 1);
    g.fillRect(cx + 1, 2, 6, 14);
    g.fillStyle(0x5a6a5a, 1);
    g.fillRect(cx + 2, 3, 4, 12);
    // Fins
    g.fillStyle(0x3a3a3a, 1);
    g.fillRect(cx - 1, 12, 3, 4);
    g.fillRect(cx + 6, 12, 3, 4);
    
    // === MORTAR TUBE on ground ===
    g.fillStyle(METAL_DARK, 1);
    g.fillRect(cx - 20, 38, 10, 24);
    g.fillStyle(METAL_MID, 1);
    g.fillRect(cx - 19, 40, 8, 20);
    // Tube opening
    g.fillStyle(0x1a1a1a, 1);
    g.fillCircle(cx - 15, 40, 4);
    // Baseplate
    g.fillStyle(METAL_DARK, 1);
    g.fillRect(cx - 24, 58, 18, 4);
    // Bipod legs
    g.lineStyle(3, METAL_DARK, 1);
    g.lineBetween(cx - 18, 50, cx - 8, 60);
    g.lineBetween(cx - 12, 50, cx - 2, 60);
    
    // === LEGS - kneeling ===
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx - 4, 40, 7, 10);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx - 3, 40, 5, 8);
    
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx + 5, 40, 7, 18);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx + 6, 40, 5, 16);
    
    // === BOOTS ===
    g.fillStyle(BOOTS_COLOR, 1);
    g.fillRect(cx - 6, 48, 8, 6);
    g.fillRect(cx + 6, 54, 8, 6);
    g.fillStyle(BOOTS_HIGHLIGHT, 1);
    g.fillRect(cx - 5, 49, 3, 2);
    g.fillRect(cx + 7, 55, 3, 2);
    
    g.generateTexture('worm-mortar', SPRITE_SIZE, SPRITE_SIZE);
    g.destroy();
  }

  // Flamer - soldier with flamethrower and fuel tank
  private createFlamerSprite(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = HALF;
    
    // === PROTECTIVE HELMET/MASK ===
    g.fillStyle(HELMET_DARK, 1);
    g.beginPath();
    g.arc(cx, 10, 11, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(HELMET_COLOR, 1);
    g.beginPath();
    g.arc(cx, 10, 10, Math.PI, 0, false);
    g.fillPath();
    
    // Face shield/visor
    g.fillStyle(0x334455, 0.8);
    g.fillRect(cx - 8, 8, 16, 10);
    g.fillStyle(0x4466aa, 0.5);
    g.fillRect(cx - 6, 10, 12, 6);
    
    g.fillStyle(HELMET_DARK, 1);
    g.fillRect(cx - 11, 10, 22, 3);
    
    // === FACE (behind visor) ===
    g.fillStyle(SKIN_SHADOW, 0.6);
    g.fillCircle(cx, 14, 6);
    
    // === FUEL TANK (backpack) ===
    g.fillStyle(0x8B0000, 1);
    g.fillRect(cx - 18, 24, 12, 24);
    g.fillStyle(0xAA2222, 1);
    g.fillRect(cx - 17, 25, 10, 22);
    // Tank details
    g.fillStyle(0x660000, 1);
    g.fillRect(cx - 16, 28, 8, 3);
    g.fillRect(cx - 16, 38, 8, 3);
    // Fuel gauge
    g.fillStyle(0x333333, 1);
    g.fillRect(cx - 15, 32, 6, 4);
    g.fillStyle(0x00ff00, 1);
    g.fillRect(cx - 14, 33, 4, 2);
    // Warning symbol
    g.fillStyle(0xffaa00, 1);
    g.fillCircle(cx - 12, 44, 3);
    
    // Hose from tank
    g.lineStyle(4, 0x333333, 1);
    g.lineBetween(cx - 10, 36, cx - 4, 32);
    
    // === BODY (fire-resistant suit) ===
    g.fillStyle(0x4a4a3a, 1);
    g.fillRect(cx - 8, 22, 16, 20);
    g.fillStyle(0x5a5a4a, 1);
    g.fillRect(cx - 7, 22, 14, 18);
    g.fillStyle(0x6a6a5a, 1);
    g.fillRect(cx - 7, 22, 3, 16);
    
    // === ARMS holding flamethrower ===
    // Left arm (on fuel line)
    g.lineStyle(6, 0x4a4a3a, 1);
    g.lineBetween(cx - 7, 28, cx - 8, 38);
    g.lineStyle(5, 0x5a5a4a, 1);
    g.lineBetween(cx - 7, 28, cx - 8, 38);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx - 8, 38, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 8, 37, 3);
    
    // Right arm (on nozzle)
    g.lineStyle(6, 0x4a4a3a, 1);
    g.lineBetween(cx + 7, 28, cx + 16, 32);
    g.lineStyle(5, 0x5a5a4a, 1);
    g.lineBetween(cx + 7, 28, cx + 16, 32);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx + 16, 32, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx + 16, 31, 3);
    
    // === FLAMETHROWER ===
    // Main body
    g.fillStyle(METAL_DARK, 1);
    g.fillRect(cx - 2, 34, 22, 8);
    g.fillStyle(METAL_MID, 1);
    g.fillRect(cx - 1, 35, 20, 6);
    
    // Nozzle
    g.fillStyle(0x333333, 1);
    g.fillRect(cx + 18, 32, 12, 12);
    g.fillStyle(0x444444, 1);
    g.fillRect(cx + 20, 34, 8, 8);
    // Pilot flame
    g.fillStyle(0xff6600, 1);
    g.fillCircle(cx + 28, 38, 4);
    g.fillStyle(0xffaa00, 1);
    g.fillCircle(cx + 28, 38, 2);
    
    // Igniter
    g.fillStyle(0xaa0000, 1);
    g.fillRect(cx + 8, 30, 4, 5);
    
    // === LEGS ===
    g.fillStyle(0x3a3a2a, 1);
    g.fillRect(cx - 7, 40, 7, 18);
    g.fillStyle(0x4a4a3a, 1);
    g.fillRect(cx - 6, 40, 5, 16);
    
    g.fillStyle(0x3a3a2a, 1);
    g.fillRect(cx, 40, 7, 18);
    g.fillStyle(0x4a4a3a, 1);
    g.fillRect(cx + 1, 40, 5, 16);
    
    // === BOOTS (heat resistant) ===
    g.fillStyle(0x2a2a20, 1);
    g.fillRect(cx - 8, 54, 8, 8);
    g.fillRect(cx, 54, 8, 8);
    g.fillStyle(0x3a3a30, 1);
    g.fillRect(cx - 7, 55, 3, 2);
    g.fillRect(cx + 1, 55, 3, 2);
    
    g.generateTexture('worm-flamer', SPRITE_SIZE, SPRITE_SIZE);
    g.destroy();
  }

  // Pistol - officer with sidearm and beret
  private createPistolSprite(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = HALF;
    
    // === OFFICER BERET ===
    g.fillStyle(0x8B0000, 1);
    g.beginPath();
    g.arc(cx, 8, 10, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(0xAA2222, 1);
    g.beginPath();
    g.arc(cx + 2, 6, 8, Math.PI, 0, false);
    g.fillPath();
    // Beret badge
    g.fillStyle(0xFFD700, 1);
    g.fillCircle(cx - 6, 8, 3);
    g.fillStyle(0xFFAA00, 1);
    g.fillCircle(cx - 6, 8, 2);
    
    // === FACE ===
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx, 16, 8);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 1, 15, 7);
    g.fillStyle(SKIN_HIGHLIGHT, 1);
    g.fillCircle(cx - 3, 13, 3);
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 3, 15, 1.5);
    g.fillCircle(cx + 3, 15, 1.5);
    // Slight smirk
    g.lineStyle(1, 0x000000, 0.5);
    g.beginPath();
    g.arc(cx, 18, 3, 0.2, Math.PI - 0.2, false);
    g.strokePath();
    
    // === OFFICER UNIFORM ===
    g.fillStyle(0x1a3a1a, 1);
    g.fillRect(cx - 8, 22, 16, 20);
    g.fillStyle(0x2a4a2a, 1);
    g.fillRect(cx - 7, 22, 14, 18);
    g.fillStyle(0x3a5a3a, 1);
    g.fillRect(cx - 7, 22, 3, 16);
    
    // Rank insignia/medals
    g.fillStyle(0xFFD700, 1);
    g.fillRect(cx - 5, 24, 3, 1);
    g.fillRect(cx - 5, 26, 3, 1);
    g.fillRect(cx - 5, 28, 3, 1);
    // Medal
    g.fillStyle(0xC0C0C0, 1);
    g.fillCircle(cx + 3, 27, 3);
    g.fillStyle(0xFFD700, 1);
    g.fillCircle(cx + 3, 27, 2);
    
    // Belt with holster
    g.fillStyle(0x3a2a1a, 1);
    g.fillRect(cx - 8, 36, 16, 3);
    g.fillStyle(0x4a3a2a, 1);
    g.fillRect(cx + 4, 36, 5, 8);
    
    // === ARMS ===
    // Left arm at side
    g.lineStyle(6, 0x1a3a1a, 1);
    g.lineBetween(cx - 7, 28, cx - 12, 40);
    g.lineStyle(5, 0x2a4a2a, 1);
    g.lineBetween(cx - 7, 28, cx - 12, 40);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx - 12, 40, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 12, 39, 3);
    
    // Right arm extended with pistol
    g.lineStyle(6, 0x1a3a1a, 1);
    g.lineBetween(cx + 7, 26, cx + 20, 22);
    g.lineStyle(5, 0x2a4a2a, 1);
    g.lineBetween(cx + 7, 26, cx + 20, 22);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx + 20, 22, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx + 20, 21, 3);
    
    // === PISTOL ===
    g.fillStyle(METAL_DARK, 1);
    g.fillRect(cx + 22, 18, 12, 6);
    g.fillStyle(METAL_MID, 1);
    g.fillRect(cx + 23, 19, 10, 4);
    // Grip
    g.fillStyle(0x2a2a2a, 1);
    g.fillRect(cx + 22, 22, 4, 6);
    // Barrel
    g.fillStyle(METAL_LIGHT, 1);
    g.fillRect(cx + 32, 19, 4, 3);
    
    // === LEGS ===
    g.fillStyle(0x1a3a1a, 1);
    g.fillRect(cx - 7, 40, 7, 18);
    g.fillStyle(0x2a4a2a, 1);
    g.fillRect(cx - 6, 40, 5, 16);
    
    g.fillStyle(0x1a3a1a, 1);
    g.fillRect(cx, 40, 7, 18);
    g.fillStyle(0x2a4a2a, 1);
    g.fillRect(cx + 1, 40, 5, 16);
    
    // === POLISHED BOOTS ===
    g.fillStyle(0x1a1a10, 1);
    g.fillRect(cx - 8, 54, 8, 8);
    g.fillRect(cx, 54, 8, 8);
    g.fillStyle(0x3a3a30, 1);
    g.fillRect(cx - 7, 55, 4, 3);
    g.fillRect(cx + 1, 55, 4, 3);
    
    g.generateTexture('worm-pistol', SPRITE_SIZE, SPRITE_SIZE);
    g.destroy();
  }

  // SMG - fast assault soldier with submachine gun
  private createSMGSprite(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = HALF;
    
    // === TACTICAL HELMET with goggles ===
    g.fillStyle(HELMET_DARK, 1);
    g.beginPath();
    g.arc(cx, 10, 11, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(HELMET_COLOR, 1);
    g.beginPath();
    g.arc(cx, 10, 10, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(HELMET_HIGHLIGHT, 1);
    g.beginPath();
    g.arc(cx - 2, 8, 5, Math.PI, 0, false);
    g.fillPath();
    
    // Goggles on helmet
    g.fillStyle(0x2a2a2a, 1);
    g.fillRect(cx - 8, 2, 16, 6);
    g.fillStyle(0x44aaaa, 0.7);
    g.fillCircle(cx - 4, 5, 3);
    g.fillCircle(cx + 4, 5, 3);
    
    g.fillStyle(HELMET_DARK, 1);
    g.fillRect(cx - 11, 10, 22, 3);
    
    // === FACE ===
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx, 16, 8);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 1, 15, 7);
    g.fillStyle(SKIN_HIGHLIGHT, 1);
    g.fillCircle(cx - 3, 13, 3);
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 3, 15, 1.5);
    g.fillCircle(cx + 3, 15, 1.5);
    
    // === BODY with mag pouches ===
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx - 8, 22, 16, 20);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx - 7, 22, 14, 18);
    g.fillStyle(ARMY_GREEN_LIGHT, 1);
    g.fillRect(cx - 7, 22, 3, 16);
    
    // Tactical vest with SMG mags
    g.fillStyle(VEST_COLOR, 1);
    g.fillRect(cx - 6, 24, 12, 12);
    // Magazine pouches (3 mags)
    g.fillStyle(0x3a3a3a, 1);
    g.fillRect(cx - 5, 26, 3, 8);
    g.fillRect(cx - 1, 26, 3, 8);
    g.fillRect(cx + 3, 26, 3, 8);
    g.fillStyle(0x4a4a4a, 1);
    g.fillRect(cx - 4, 27, 1, 6);
    g.fillRect(cx, 27, 1, 6);
    g.fillRect(cx + 4, 27, 1, 6);
    
    // === ARMS in ready position ===
    // Left arm (on foregrip)
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx - 7, 28, cx - 12, 36);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx - 7, 28, cx - 12, 36);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx - 12, 36, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 12, 35, 3);
    
    // Right arm (on grip)
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx + 7, 28, cx + 8, 38);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx + 7, 28, cx + 8, 38);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx + 8, 38, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx + 8, 37, 3);
    
    // === SMG (compact) ===
    // Main body
    g.fillStyle(METAL_DARK, 1);
    g.fillRect(cx - 18, 32, 24, 8);
    g.fillStyle(METAL_MID, 1);
    g.fillRect(cx - 17, 33, 22, 6);
    
    // Folding stock
    g.fillStyle(METAL_DARK, 1);
    g.fillRect(cx + 4, 34, 8, 4);
    g.lineStyle(2, METAL_MID, 1);
    g.lineBetween(cx + 10, 36, cx + 16, 40);
    
    // Magazine (in gun)
    g.fillStyle(0x2a2a2a, 1);
    g.fillRect(cx - 6, 38, 4, 10);
    g.fillStyle(0x3a3a3a, 1);
    g.fillRect(cx - 5, 39, 2, 8);
    
    // Foregrip
    g.fillStyle(0x2a2a2a, 1);
    g.fillRect(cx - 14, 38, 4, 5);
    
    // Barrel/suppressor
    g.fillStyle(METAL_DARK, 1);
    g.fillRect(cx - 26, 34, 10, 5);
    g.fillStyle(METAL_MID, 1);
    g.fillRect(cx - 25, 35, 8, 3);
    
    // === LEGS in ready stance ===
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx - 8, 40, 7, 18);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx - 7, 40, 5, 16);
    
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx + 1, 40, 7, 18);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx + 2, 40, 5, 16);
    
    // === BOOTS ===
    g.fillStyle(BOOTS_COLOR, 1);
    g.fillRect(cx - 9, 54, 8, 8);
    g.fillRect(cx + 1, 54, 8, 8);
    g.fillStyle(BOOTS_HIGHLIGHT, 1);
    g.fillRect(cx - 8, 55, 3, 2);
    g.fillRect(cx + 2, 55, 3, 2);
    
    g.generateTexture('worm-smg', SPRITE_SIZE, SPRITE_SIZE);
    g.destroy();
  }

  // Minigun - heavy weapons specialist with rotating barrel minigun
  private createMinigunSprite(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = HALF - 4;
    
    // === HEAVY HELMET with visor ===
    g.fillStyle(HELMET_DARK, 1);
    g.beginPath();
    g.arc(cx, 12, 13, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(HELMET_COLOR, 1);
    g.beginPath();
    g.arc(cx, 12, 12, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(HELMET_HIGHLIGHT, 1);
    g.beginPath();
    g.arc(cx - 3, 9, 6, Math.PI, 0, false);
    g.fillPath();
    
    // Flip-down visor
    g.fillStyle(0x334455, 0.8);
    g.fillRect(cx - 10, 10, 20, 8);
    g.fillStyle(0x4466aa, 0.5);
    g.fillRect(cx - 8, 12, 16, 4);
    
    g.fillStyle(HELMET_DARK, 1);
    g.fillRect(cx - 13, 12, 26, 3);
    
    // === FACE (bulky soldier) ===
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx, 20, 9);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 1, 19, 8);
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 4, 18, 2);
    g.fillCircle(cx + 3, 18, 2);
    // Grimace
    g.lineStyle(2, 0x000000, 0.6);
    g.lineBetween(cx - 4, 24, cx + 4, 24);
    
    // === AMMO BACKPACK ===
    g.fillStyle(0x3a3a3a, 1);
    g.fillRect(cx - 20, 26, 14, 26);
    g.fillStyle(0x4a4a4a, 1);
    g.fillRect(cx - 19, 27, 12, 24);
    // Ammo belt feed
    g.lineStyle(4, 0xccaa44, 1);
    g.lineBetween(cx - 10, 38, cx + 2, 38);
    // Ammo rounds visible
    g.fillStyle(0xccaa44, 1);
    g.fillCircle(cx - 16, 32, 3);
    g.fillCircle(cx - 16, 38, 3);
    g.fillCircle(cx - 16, 44, 3);
    g.fillCircle(cx - 10, 32, 3);
    g.fillCircle(cx - 10, 38, 3);
    g.fillCircle(cx - 10, 44, 3);
    
    // === BULKY BODY (heavy armor) ===
    g.fillStyle(0x2a3a2a, 1);
    g.fillRect(cx - 8, 26, 18, 22);
    g.fillStyle(0x3a4a3a, 1);
    g.fillRect(cx - 7, 26, 16, 20);
    g.fillStyle(0x4a5a4a, 1);
    g.fillRect(cx - 7, 26, 4, 18);
    
    // Armor plates
    g.fillStyle(0x4a4a4a, 1);
    g.fillRect(cx - 5, 28, 12, 10);
    g.lineStyle(1, 0x5a5a5a, 1);
    g.strokeRect(cx - 5, 28, 12, 10);
    
    // === ARMS (muscular, braced) ===
    // Left arm (supporting barrel)
    g.lineStyle(8, 0x2a3a2a, 1);
    g.lineBetween(cx - 6, 32, cx - 8, 44);
    g.lineStyle(7, 0x3a4a3a, 1);
    g.lineBetween(cx - 6, 32, cx - 8, 44);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx - 8, 44, 5);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 8, 43, 4);
    
    // Right arm (on trigger assembly)
    g.lineStyle(8, 0x2a3a2a, 1);
    g.lineBetween(cx + 8, 32, cx + 14, 42);
    g.lineStyle(7, 0x3a4a3a, 1);
    g.lineBetween(cx + 8, 32, cx + 14, 42);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx + 14, 42, 5);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx + 14, 41, 4);
    
    // === MINIGUN ===
    // Motor housing
    g.fillStyle(METAL_DARK, 1);
    g.fillRect(cx + 10, 36, 14, 12);
    g.fillStyle(METAL_MID, 1);
    g.fillRect(cx + 11, 37, 12, 10);
    
    // Rotating barrel assembly
    g.fillStyle(METAL_DARK, 1);
    g.fillRect(cx + 22, 34, 26, 16);
    g.fillStyle(METAL_MID, 1);
    // Multiple barrels
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const bx = cx + 36 + Math.cos(angle) * 5;
      const by = 42 + Math.sin(angle) * 5;
      g.fillStyle(METAL_DARK, 1);
      g.fillCircle(bx, by, 2);
    }
    // Central barrel
    g.fillStyle(METAL_LIGHT, 1);
    g.fillCircle(cx + 36, 42, 3);
    
    // Barrel tips
    g.fillStyle(0x2a2a2a, 1);
    g.fillRect(cx + 44, 36, 6, 12);
    
    // Ammo feed into gun
    g.fillStyle(0xccaa44, 1);
    g.fillRect(cx + 4, 36, 8, 4);
    
    // Handle/grip
    g.fillStyle(0x2a2a2a, 1);
    g.fillRect(cx + 12, 46, 6, 8);
    
    // === LEGS (wide braced stance) ===
    g.fillStyle(0x2a3a2a, 1);
    g.fillRect(cx - 10, 46, 9, 16);
    g.fillStyle(0x3a4a3a, 1);
    g.fillRect(cx - 9, 46, 7, 14);
    
    g.fillStyle(0x2a3a2a, 1);
    g.fillRect(cx + 3, 46, 9, 16);
    g.fillStyle(0x3a4a3a, 1);
    g.fillRect(cx + 4, 46, 7, 14);
    
    // === HEAVY BOOTS ===
    g.fillStyle(0x1a1a10, 1);
    g.fillRect(cx - 12, 58, 10, 6);
    g.fillRect(cx + 2, 58, 10, 6);
    g.fillStyle(0x2a2a20, 1);
    g.fillRect(cx - 11, 59, 4, 2);
    g.fillRect(cx + 3, 59, 4, 2);
    
    g.generateTexture('worm-minigun', SPRITE_SIZE, SPRITE_SIZE);
    g.destroy();
  }

  // Walking animation frames for all soldier types
  // Enhanced 64x64 versions
  private createWalkingSprites(): void {
    // Walk frame 1 - left leg forward
    this.createWalkFrame1();
    // Walk frame 2 - right leg forward  
    this.createWalkFrame2();
  }

  private createWalkFrame1(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = HALF;
    
    // === HELMET ===
    g.fillStyle(HELMET_DARK, 1);
    g.beginPath();
    g.arc(cx, 10, 11, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(HELMET_COLOR, 1);
    g.beginPath();
    g.arc(cx, 10, 10, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(HELMET_HIGHLIGHT, 1);
    g.beginPath();
    g.arc(cx - 2, 8, 5, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(HELMET_DARK, 1);
    g.fillRect(cx - 11, 10, 22, 3);
    
    // === FACE ===
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx, 16, 8);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 1, 15, 7);
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 3, 15, 1.5);
    g.fillCircle(cx + 3, 15, 1.5);
    
    // === BODY leaning forward ===
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx - 7, 22, 14, 20);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx - 6, 22, 12, 18);
    g.fillStyle(ARMY_GREEN_LIGHT, 1);
    g.fillRect(cx - 6, 22, 3, 16);
    
    // === ARMS swinging - left forward, right back ===
    // Left arm forward
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx - 6, 28, cx - 14, 42);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx - 6, 28, cx - 14, 42);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx - 14, 42, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 14, 41, 3);
    
    // Right arm back
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx + 6, 28, cx + 16, 18);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx + 6, 28, cx + 16, 18);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx + 16, 18, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx + 16, 17, 3);
    
    // === LEGS - left forward, right back ===
    // Left leg forward
    g.lineStyle(8, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx - 3, 40, cx - 14, 56);
    g.lineStyle(7, ARMY_GREEN, 1);
    g.lineBetween(cx - 3, 40, cx - 14, 56);
    
    // Right leg back
    g.lineStyle(8, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx + 3, 40, cx + 14, 56);
    g.lineStyle(7, ARMY_GREEN, 1);
    g.lineBetween(cx + 3, 40, cx + 14, 56);
    
    // === BOOTS ===
    g.fillStyle(BOOTS_COLOR, 1);
    g.fillCircle(cx - 14, 58, 5);
    g.fillCircle(cx + 14, 58, 5);
    g.fillStyle(BOOTS_HIGHLIGHT, 1);
    g.fillCircle(cx - 15, 57, 2);
    g.fillCircle(cx + 13, 57, 2);
    
    g.generateTexture('soldier-walk1', SPRITE_SIZE, SPRITE_SIZE);
    g.destroy();
  }

  private createWalkFrame2(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = HALF;
    
    // === HELMET ===
    g.fillStyle(HELMET_DARK, 1);
    g.beginPath();
    g.arc(cx, 10, 11, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(HELMET_COLOR, 1);
    g.beginPath();
    g.arc(cx, 10, 10, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(HELMET_HIGHLIGHT, 1);
    g.beginPath();
    g.arc(cx - 2, 8, 5, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(HELMET_DARK, 1);
    g.fillRect(cx - 11, 10, 22, 3);
    
    // === FACE ===
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx, 16, 8);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 1, 15, 7);
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 3, 15, 1.5);
    g.fillCircle(cx + 3, 15, 1.5);
    
    // === BODY leaning forward ===
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx - 7, 22, 14, 20);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx - 6, 22, 12, 18);
    g.fillStyle(ARMY_GREEN_LIGHT, 1);
    g.fillRect(cx - 6, 22, 3, 16);
    
    // === ARMS swinging - right forward, left back ===
    // Right arm forward
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx + 6, 28, cx + 14, 42);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx + 6, 28, cx + 14, 42);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx + 14, 42, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx + 14, 41, 3);
    
    // Left arm back
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx - 6, 28, cx - 16, 18);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx - 6, 28, cx - 16, 18);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx - 16, 18, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 16, 17, 3);
    
    // === LEGS - right forward, left back ===
    // Right leg forward
    g.lineStyle(8, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx + 3, 40, cx + 14, 56);
    g.lineStyle(7, ARMY_GREEN, 1);
    g.lineBetween(cx + 3, 40, cx + 14, 56);
    
    // Left leg back
    g.lineStyle(8, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx - 3, 40, cx - 14, 56);
    g.lineStyle(7, ARMY_GREEN, 1);
    g.lineBetween(cx - 3, 40, cx - 14, 56);
    
    // === BOOTS - swap positions ===
    g.fillStyle(BOOTS_COLOR, 1);
    g.fillCircle(cx + 14, 58, 5);
    g.fillCircle(cx - 14, 58, 5);
    g.fillStyle(BOOTS_HIGHLIGHT, 1);
    g.fillCircle(cx + 13, 57, 2);
    g.fillCircle(cx - 15, 57, 2);
    
    g.generateTexture('soldier-walk2', SPRITE_SIZE, SPRITE_SIZE);
    g.destroy();
  }

  // Default fallback sprite
  // Enhanced 64x64 version
  private createDefaultWormSprite(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = HALF;
    
    // === HELMET ===
    g.fillStyle(HELMET_DARK, 1);
    g.beginPath();
    g.arc(cx, 10, 11, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(HELMET_COLOR, 1);
    g.beginPath();
    g.arc(cx, 10, 10, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(HELMET_HIGHLIGHT, 1);
    g.beginPath();
    g.arc(cx - 2, 8, 5, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(HELMET_DARK, 1);
    g.fillRect(cx - 11, 10, 22, 3);
    
    // === FACE ===
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx, 16, 8);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 1, 15, 7);
    g.fillStyle(SKIN_HIGHLIGHT, 1);
    g.fillCircle(cx - 3, 13, 3);
    
    // Eyes
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 3, 15, 1.5);
    g.fillCircle(cx + 3, 15, 1.5);
    
    // === BODY ===
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx - 8, 22, 16, 20);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx - 7, 22, 14, 18);
    g.fillStyle(ARMY_GREEN_LIGHT, 1);
    g.fillRect(cx - 7, 22, 3, 16);
    
    // === ARMS at sides ===
    // Left arm
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx - 7, 28, cx - 14, 40);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx - 7, 28, cx - 14, 40);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx - 14, 40, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx - 14, 39, 3);
    
    // Right arm
    g.lineStyle(6, ARMY_GREEN_DARK, 1);
    g.lineBetween(cx + 7, 28, cx + 14, 40);
    g.lineStyle(5, ARMY_GREEN, 1);
    g.lineBetween(cx + 7, 28, cx + 14, 40);
    g.fillStyle(SKIN_SHADOW, 1);
    g.fillCircle(cx + 14, 40, 4);
    g.fillStyle(SKIN_COLOR, 1);
    g.fillCircle(cx + 14, 39, 3);
    
    // === LEGS ===
    // Left leg
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx - 7, 40, 7, 18);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx - 6, 40, 5, 16);
    g.fillStyle(ARMY_GREEN_LIGHT, 1);
    g.fillRect(cx - 6, 40, 2, 14);
    
    // Right leg
    g.fillStyle(ARMY_GREEN_DARK, 1);
    g.fillRect(cx, 40, 7, 18);
    g.fillStyle(ARMY_GREEN, 1);
    g.fillRect(cx + 1, 40, 5, 16);
    
    // === BOOTS ===
    g.fillStyle(BOOTS_COLOR, 1);
    g.fillRect(cx - 8, 54, 8, 8);
    g.fillRect(cx, 54, 8, 8);
    g.fillStyle(BOOTS_HIGHLIGHT, 1);
    g.fillRect(cx - 7, 55, 3, 2);
    g.fillRect(cx + 1, 55, 3, 2);
    
    // Boot soles
    g.fillStyle(0x1a0a08, 1);
    g.fillRect(cx - 8, 60, 8, 2);
    g.fillRect(cx, 60, 8, 2);
    
    g.generateTexture('worm', SPRITE_SIZE, SPRITE_SIZE);
    g.destroy();
  }
}
