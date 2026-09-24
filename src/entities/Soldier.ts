import Phaser from 'phaser';
import { getMuzzle, sweepTerrain } from '../systems/Ballistics';
import { moveCharacter } from '../systems/CharacterPhysics';
import { getHookCastPose } from '../systems/SpecialActions';
import { Team } from '../systems/TurnManager';
import { createProjectile } from './Projectile';
import { WeaponConfig, WeaponType, WEAPONS, SQUAD_WEAPONS } from '../systems/WeaponTypes';
import { Terrain } from '../systems/Terrain';
import { SoundManager } from '../utils/SoundManager';
import { getPromotion, getRankForKills, type Rank } from '../systems/Veterancy';
import type { SpecialWeaponId } from '../systems/SpecialWeapons';
import {
  FactionDefinition,
  FactionId,
  getFaction,
  getFactionSpriteTextureKey,
} from '../systems/Factions';
import { getFactionWalkTextureKey } from '../systems/FactionSprites';

// Map weapon types to sprite keys (each weapon has unique sprite)
const WEAPON_SPRITES: Record<WeaponType, string> = {
  [WeaponType.RIFLE]: 'worm-rifle',
  [WeaponType.GRENADE]: 'worm-grenade',
  [WeaponType.ROCKET]: 'worm-rocket',
  [WeaponType.SHOTGUN]: 'worm-shotgun',
  [WeaponType.SNIPER]: 'worm-sniper',
  [WeaponType.MORTAR]: 'worm-mortar',
  [WeaponType.FLAMER]: 'worm-flamer',
  [WeaponType.PISTOL]: 'worm-pistol',
  [WeaponType.SMG]: 'worm-smg',
  [WeaponType.MINIGUN]: 'worm-minigun',
  [WeaponType.CARBINE]: 'worm-rifle',
  [WeaponType.SLUG]: 'worm-shotgun',
  [WeaponType.DEMO]: 'worm-grenade',
};

// Military quips for speech bubbles
const MILITARY_QUIPS = {
  selected: ['Orders?', 'I had plans tonight.', 'Point me at trouble.', 'Reporting-ish!', 'Ready enough.', 'This feels important.'],
  moving: ['Moving out!', 'Cardio under fire!', 'Tiny legs, big mission.', 'Advancing carefully!', 'I miss the truck.'],
  firing: ['Sending it!', 'Loud noises!', 'This ought to work!', 'Duck, probably!', 'Ballistics says maybe!'],
  hit: ['That was personal!', 'Medic-ish person!', 'My good side!', 'Incoming hurts!', 'Armor sold separately!'],
  lowHealth: ['I can see my warranty!', 'Everything is blinking!', 'One sneeze from disaster!', 'Walk it off? Really?'],
  healing: ['Hold still!', 'This tape is tactical.', 'You get one bandage.', 'Medical confidence: high!', 'Probably sterile!'],
  kill: ['Problem solved!', 'That counted!', 'Textbook-ish!', 'Area now quieter!', 'Good talk!'],
  death: ['Delete my browser history.', 'Avenge my lunch...', 'I regret the bright helmet.', 'Tell command: rude.'],
  grapple: ['Hook deployed!', 'Gravity is optional!', 'Wheee!', 'Definitely trained for this!', 'Yoink!'],
  tunneling: ['Going underground!', 'Dirt is cover!', 'Secret tunnel business!', 'Shovel diplomacy!', 'I dig this plan!'],
  blocked: ['That is mostly air.', 'Need dirt, not optimism.', 'No tunnel here!', 'The shovel votes no.'],
  tired: ['Shovel break!', 'Out of digging budget!', 'My arms filed a complaint.', 'Next turn, geology.'],
  objective: ['Signal is ours!', 'Bars! Full bars!', 'Command can hear us now!', 'Captured, technically!', 'Plant the tiny flag!'],
  nearMiss: ['Define "near"!', 'That parted my hair!', 'Too close!', 'I felt the punctuation!'],
  allyDown: ['That was our guy!', 'Keep moving for them!', 'We are down one!', 'I liked that one!'],
  supply: ['Care package!', 'Logistics loves me!', 'Free stuff, suspiciously!', 'Requisition approved!'],
};

export class Soldier {
  public sprite: Phaser.Physics.Arcade.Sprite;
  public team: Team;
  public name: string;
  public weapon: WeaponConfig;
  public squadIndex: number;
  public faction: FactionDefinition;
  
  private scene: Phaser.Scene;
  private health: number = 100;
  private maxHealth: number = 100;
  private alive: boolean = true;
  private active: boolean = false;
  
  private moveSpeed: number = 150;
  private jumpForce: number = -350;

  // Movement physics: soldiers accelerate/decelerate instead of snapping to full speed,
  // climb slopes slower, and get a landing impact after real falls.
  private moveInput: -1 | 0 | 1 = 0;
  private grounded: boolean = true;
  private jumpBufferedUntil = 0;
  private grappleTerrain: Terrain | null = null;
  private grappleElapsed = 0;
  private suppressed = false;
  private suppressionActiveTurn = false;
  private suppressionText: Phaser.GameObjects.Text | null = null;
  private peakFallSpeed: number = 0;
  private static readonly WALK_ACCEL = 900; // px/s^2 while there is input
  private static readonly WALK_DECEL = 1500; // px/s^2 braking to a stop
  private static readonly AIR_CONTROL = 0.45; // fraction of ground accel while airborne
  private static readonly BODY_WIDTH = 20;
  private static readonly BODY_HEIGHT = 36;
  
  private healthBar: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private weaponText: Phaser.GameObjects.Text;
  private healthBarVisible: boolean = false;
  private healthBarTimer: Phaser.Time.TimerEvent | null = null;
  
  // Speech bubble
  private speechBubble: Phaser.GameObjects.Container | null = null;
  private speechTimer: Phaser.Time.TimerEvent | null = null;
  private speechBubbleOffsetX: number = 0;
  
  // Grappling hook
  private isGrappling: boolean = false;
  private grappleTarget: { x: number; y: number } | null = null;
  private grappleLine: Phaser.GameObjects.Graphics | null = null;
  private grappleUsesThisTurn: number = 0;
  private maxGrappleUsesPerTurn: number = 3; // Increased from 2
  
  // Visual outline for better visibility
  private outline: Phaser.GameObjects.Graphics;
  private contrastOutlineDark: Phaser.GameObjects.Image;
  private contrastOutlineLight: Phaser.GameObjects.Image;
  private groundShadow: Phaser.GameObjects.Ellipse;
  private equipmentGraphics: Phaser.GameObjects.Graphics;
  private equipmentText: Phaser.GameObjects.Text;
  
  // Animation state
  private standingTexture: string;
  private walkTextures: string[] = [];
  private isWalking: boolean = false;
  private walkFrameTimer: Phaser.Time.TimerEvent | null = null;
  private walkFrameIndex: number = 0;
  private walkBobTween: Phaser.Tweens.Tween | null = null;
  private walkDustTimer: Phaser.Time.TimerEvent | null = null;
  private idleTween: Phaser.Tweens.Tween | null = null;
  private actionTween: Phaser.Tweens.Tween | null = null;
  private baseScaleX: number = 1;
  private baseScaleY: number = 1;

// Call-in powerups (from supply drops)
  private airstrikeCharges: number = 0;
  private artilleryCharges: number = 0;
  private armor: number = 0;

  // Veterancy + one-shot special weapon from crates
  private kills: number = 0;
  private specialWeapon: SpecialWeaponId | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    team: Team,
    name: string,
    squadIndex: number,
    disableGravity: boolean = false,
    weaponType?: WeaponType,
    factionId: FactionId = 'united-states',
  ) {
    this.scene = scene;
    this.team = team;
    this.name = name;
    this.squadIndex = squadIndex;
    this.faction = getFaction(factionId);
    
    // Assign weapon - use provided type or fall back to squad position default
    const actualWeaponType = weaponType || SQUAD_WEAPONS[squadIndex % SQUAD_WEAPONS.length];
    this.weapon = WEAPONS[actualWeaponType];
    
    // Get the appropriate sprite for this weapon class
    const factionSpriteKey = getFactionSpriteTextureKey(factionId, actualWeaponType);
    const spriteKey = scene.textures.exists(factionSpriteKey)
      ? factionSpriteKey
      : WEAPON_SPRITES[actualWeaponType] || 'worm';
    this.standingTexture = spriteKey; // Store for returning to stance after walking
    this.walkTextures = Array.from({ length: 8 }, (_, frame) => frame)
      .map(phase => getFactionWalkTextureKey(factionId, actualWeaponType, phase))
      .filter(textureKey => scene.textures.exists(textureKey));

    // Create sprite with weapon-specific texture
    this.sprite = scene.physics.add.sprite(x, y, spriteKey);
    this.sprite.setCollideWorldBounds(false); // Don't use world bounds, use terrain collision
    this.sprite.setBounce(0);
    this.sprite.setDrag(100, 0);
    
    // Set sprite display size - 64x64 sprites displayed at 56x56 for good detail
    this.sprite.setDisplaySize(56, 56);
    this.baseScaleX = this.sprite.scaleX;
    this.baseScaleY = this.sprite.scaleY;
    this.applyCollisionBody();

    // A two-tone silhouette rim stays legible against both pale sky and dark terrain.
    this.contrastOutlineDark = scene.add.image(x, y, spriteKey);
    this.contrastOutlineDark.setTintFill(0x050709);
    this.contrastOutlineDark.setAlpha(0.9);
    this.contrastOutlineDark.setDepth(this.sprite.depth - 0.55);
    this.contrastOutlineLight = scene.add.image(x, y, spriteKey);
    this.contrastOutlineLight.setTintFill(team === Team.RED ? 0xffb5a8 : 0xb8d8ff);
    this.contrastOutlineLight.setAlpha(0.82);
    this.contrastOutlineLight.setDepth(this.sprite.depth - 0.3);
    this.syncContrastLayers();
    
    // Disable gravity if requested (for paratrooper drop)
    if (disableGravity) {
      (this.sprite.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    }
    
    // No tint - use natural sprite colors for better visibility
    // Team identification through outline circle instead
    
    // Add outline for better visibility
    this.outline = scene.add.graphics();
    this.outline.setDepth(this.sprite.depth - 1);
    // Outlines caused confusing "orbs" around units. Keep disabled by default.
    this.outline.setVisible(false);
    this.outline.clear();

    this.groundShadow = scene.add.ellipse(x, y + 19, 30, 8, 0x000000, 0.32);
    this.groundShadow.setDepth(this.sprite.depth - 1);

    this.equipmentGraphics = scene.add.graphics();
    this.equipmentGraphics.setDepth(48);
    this.equipmentText = scene.add.text(x + 25, y - 17, '', {
      font: 'bold 8px Courier New',
      color: '#9eeaff',
      stroke: '#061019',
      strokeThickness: 3,
    });
    this.equipmentText.setDepth(49);
    this.equipmentText.setOrigin(0, 0.5);
    this.equipmentText.setVisible(false);

    // Create health bar (hidden by default)
    this.healthBar = scene.add.graphics();
    this.healthBar.setVisible(false);

    // Create name label - bigger and more visible, colored by team so sides are readable at a glance
    this.nameText = scene.add.text(x, y - 40, name, {
      font: 'bold 11px Arial',
      color: team === Team.RED ? '#ff8877' : '#88bbff',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.nameText.setOrigin(0.5);
    
    // Create weapon label
    this.weaponText = scene.add.text(x, y - 52, this.weapon.name, {
      font: 'bold 9px Arial',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.weaponText.setOrigin(0.5);
    this.weaponText.setVisible(false);

    // Store reference to this soldier on the sprite for collision detection
    (this.sprite as any).soldierRef = this;
    this.startIdleAnimation();
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  public isAlive(): boolean {
    return this.alive;
  }

  public getHealth(): number {
    return this.health;
  }

  public getWeaponType(): WeaponType {
    return this.weapon.type;
  }

  public getWeaponName(): string {
    return this.weapon.name;
  }

  public getFactionId(): FactionId {
    return this.faction.id;
  }

  public getPortraitTextureKey(): string {
    return this.standingTexture;
  }

  public getAirstrikeCharges(): number {
    return this.airstrikeCharges;
  }

  public getArtilleryCharges(): number {
    return this.artilleryCharges;
  }

  public getKills(): number {
    return this.kills;
  }

  public getRank(): Rank {
    return getRankForKills(this.kills);
  }

  /** Record an enemy kill. Returns the new rank if this kill earned a promotion. */
  public addKill(): Rank | null {
    const promotion = getPromotion(this.kills, this.kills + 1);
    this.kills++;
    if (promotion) {
      if (promotion.promotionArmor > 0) this.addArmor(promotion.promotionArmor);
      const stars = promotion.stars;
      this.nameText.setText(`${stars} ${this.name}`);
      this.nameText.setColor(this.team === Team.RED ? '#ffcc88' : '#aaddff');
    }
    return promotion;
  }

  public getSpecialWeapon(): SpecialWeaponId | null {
    return this.specialWeapon;
  }

  public setSpecialWeapon(id: SpecialWeaponId | null): void {
    this.specialWeapon = id;
  }

  /** Hard launch that ignores the usual knockback caps (sledgehammer). */
  public launch(velocityX: number, velocityY: number): void {
    if (!this.alive) return;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(true);
    this.sprite.setVelocity(velocityX, velocityY);
  }

  public getArmor(): number {
    return this.armor;
  }

  public addAirstrikeCharges(count: number = 1): void {
    if (!this.alive) return;
    const add = Math.max(0, Math.floor(count));
    this.airstrikeCharges = Math.min(3, this.airstrikeCharges + add);
  }

  public addArtilleryCharges(count: number = 1): void {
    if (!this.alive) return;
    const add = Math.max(0, Math.floor(count));
    this.artilleryCharges = Math.min(3, this.artilleryCharges + add);
  }

  public addArmor(amount: number): void {
    if (!this.alive) return;
    const add = Math.max(0, Math.floor(amount));
    this.armor = Math.min(75, this.armor + add);
    this.showHealthBar();
    this.updateEquipmentVisuals();
  }

  public consumeAirstrikeCharge(): boolean {
    if (!this.alive) return false;
    if (this.airstrikeCharges <= 0) return false;
    this.airstrikeCharges--;
    return true;
  }

  public consumeArtilleryCharge(): boolean {
    if (!this.alive) return false;
    if (this.artilleryCharges <= 0) return false;
    this.artilleryCharges--;
    return true;
  }

  public setActive(isActive: boolean): void {
    if (!isActive && this.active && this.suppressionActiveTurn) {
      this.suppressed = false;
      this.suppressionActiveTurn = false;
      this.suppressionText?.destroy();
      this.suppressionText = null;
    }
    if (isActive && this.suppressed) this.suppressionActiveTurn = true;
    this.active = isActive;
    this.weaponText.setVisible(isActive);

    if (!isActive) {
      // Movement steering only runs on the active soldier — kill any leftover walk speed
      // so a soldier can't keep sliding after their turn ends.
      this.moveInput = 0;
      if (this.sprite.body) {
        this.sprite.setVelocityX(0);
      }
      this.stopWalkingAnimation();
    }

    // Show speech bubble when selected
    if (isActive) {
      this.showSpeechBubble('selected');
    }
    this.updateOutline();
  }

  public moveLeft(): void {
    if (!this.active || !this.alive || this.isGrappling) return;
    this.moveInput = -1;
    this.sprite.setFlipX(true);
    this.startWalkingAnimation();
  }

  public moveRight(): void {
    if (!this.active || !this.alive || this.isGrappling) return;
    this.moveInput = 1;
    this.sprite.setFlipX(false);
    this.startWalkingAnimation();
  }

  public stopMoving(): void {
    if (!this.alive || this.isGrappling) return;
    this.moveInput = 0;
    this.stopWalkingAnimation();
  }

  public setMoveSpeed(speed: number): void {
    this.moveSpeed = Math.max(80, speed);
  }

  // Alternate planted leg poses while keeping the upper body stable and readable.
  private startWalkingAnimation(): void {
    this.sprite.setAngle(this.moveInput * 1.25);
    if (this.isWalking) return;
    this.isWalking = true;
    this.stopIdleAnimation(false);

    this.walkFrameIndex = (this.walkFrameIndex + 1) % Math.max(1, this.walkTextures.length);
    if (this.walkTextures.length > 0) {
      this.setVisualTexture(this.walkTextures[this.walkFrameIndex]);
    }
    this.walkFrameTimer = this.scene.time.addEvent({
      delay: 65,
      loop: true,
      callback: () => {
        if (!this.isWalking || !this.alive || this.walkTextures.length === 0) return;
        if (!this.grounded || Math.abs(this.sprite.body?.velocity.x ?? 0) < 8) return;
        this.walkFrameIndex = (this.walkFrameIndex + 1) % this.walkTextures.length;
        this.setVisualTexture(this.walkTextures[this.walkFrameIndex]);
      },
    });

    this.sprite.setScale(this.baseScaleX, this.baseScaleY);

    this.walkDustTimer = this.scene.time.addEvent({
      delay: 300,
      loop: true,
      callback: () => {
        if (!this.isWalking || !this.alive || !this.grounded) return;
        this.spawnFootstepDust();
      },
    });
  }

  private spawnFootstepDust(): void {
    const puff = this.scene.add.circle(
      this.sprite.x + (Math.random() - 0.5) * 10,
      this.sprite.y + 22,
      2 + Math.random() * 2.5,
      0xbfa77a,
      0.45
    );
    puff.setDepth(this.sprite.depth - 1);
    this.scene.tweens.add({
      targets: puff,
      x: puff.x - (this.sprite.flipX ? -1 : 1) * (6 + Math.random() * 8),
      y: puff.y - (3 + Math.random() * 5),
      alpha: 0,
      scale: 1.8,
      duration: 280 + Math.random() * 140,
      ease: 'Quad.easeOut',
      onComplete: () => puff.destroy(),
    });
  }

  private stopWalkingAnimation(resumeIdle: boolean = true): void {
    if (!this.isWalking) return;
    this.isWalking = false;

    if (this.walkFrameTimer) {
      this.walkFrameTimer.destroy();
      this.walkFrameTimer = null;
    }
    if (this.walkBobTween) {
      this.walkBobTween.stop();
      this.walkBobTween = null;
    }
    if (this.walkDustTimer) {
      this.walkDustTimer.destroy();
      this.walkDustTimer = null;
    }

    // Settle back into the class-specific standing pose.
    this.sprite.setAngle(0);
    this.sprite.setScale(this.baseScaleX, this.baseScaleY);
    this.setVisualTexture(this.standingTexture);
    if (resumeIdle && this.alive) this.startIdleAnimation();
  }

  public applySuppression(): void {
    if (!this.alive || this.suppressed) return;
    this.suppressed = true;
    this.suppressionActiveTurn = this.active;
    this.suppressionText = this.scene.add.text(this.sprite.x, this.sprite.y + 36, 'PINNED: MOVE -20%', {
      font: 'bold 10px Arial', color: '#ffe09a', stroke: '#172125', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(220);
  }

  private setVisualTexture(textureKey: string): void {
    this.sprite.setTexture(textureKey);
    this.applyCollisionBody();
    this.contrastOutlineDark.setTexture(textureKey);
    this.contrastOutlineLight.setTexture(textureKey);
  }

  private applyCollisionBody(): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    body.setSize(Soldier.BODY_WIDTH, Soldier.BODY_HEIGHT, true);
  }

  private syncContrastLayers(): void {
    const syncLayer = (layer: Phaser.GameObjects.Image, scale: number): void => {
      if (!layer.active) return;
      layer.setPosition(this.sprite.x, this.sprite.y);
      layer.setRotation(this.sprite.rotation);
      layer.setFlip(this.sprite.flipX, this.sprite.flipY);
      layer.setScale(this.sprite.scaleX * scale, this.sprite.scaleY * scale);
      layer.setVisible(this.sprite.visible && this.alive);
      layer.setAlpha(this.sprite.alpha * (layer === this.contrastOutlineDark ? 0.9 : 0.82));
    };

    syncLayer(this.contrastOutlineDark, 1.08);
    syncLayer(this.contrastOutlineLight, 1.035);
  }

  private startIdleAnimation(): void {
    if (!this.alive || this.isWalking || this.idleTween || this.actionTween) return;
    this.idleTween = this.scene.tweens.add({
      targets: this.sprite,
      scaleX: { from: this.baseScaleX * 0.99, to: this.baseScaleX * 1.015 },
      scaleY: { from: this.baseScaleY * 1.015, to: this.baseScaleY * 0.985 },
      duration: 900 + this.squadIndex * 55,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopIdleAnimation(resetScale: boolean = true): void {
    if (this.idleTween) {
      this.idleTween.stop();
      this.idleTween = null;
    }
    if (resetScale) this.sprite.setScale(this.baseScaleX, this.baseScaleY);
  }

  public playActionAnimation(action: 'fire' | 'dig' | 'heal' | 'celebrate', facing: -1 | 1 = 1): void {
    if (!this.alive) return;
    if (this.actionTween) {
      this.actionTween.stop();
      this.actionTween = null;
    }
    this.stopWalkingAnimation(false);
    this.stopIdleAnimation();

    const config: Phaser.Types.Tweens.TweenBuilderConfig = action === 'dig'
      ? {
          targets: this.sprite,
          angle: { from: -facing * 7, to: facing * 10 },
          scaleY: this.baseScaleY * 0.9,
          scaleX: this.baseScaleX * 1.06,
          duration: 95,
          yoyo: true,
          repeat: 3,
          ease: 'Quad.easeInOut',
        }
      : action === 'heal'
        ? {
            targets: this.sprite,
            angle: { from: -3, to: 3 },
            scaleX: this.baseScaleX * 1.08,
            scaleY: this.baseScaleY * 0.94,
            duration: 130,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.easeInOut',
          }
        : action === 'celebrate'
          ? {
              targets: this.sprite,
              angle: { from: -8, to: 8 },
              scaleX: this.baseScaleX * 1.08,
              scaleY: this.baseScaleY * 1.08,
              duration: 120,
              yoyo: true,
              repeat: 2,
              ease: 'Back.easeOut',
            }
          : {
              targets: this.sprite,
              angle: facing * -4,
              scaleX: this.baseScaleX * 1.07,
              scaleY: this.baseScaleY * 0.93,
              duration: 70,
              yoyo: true,
              ease: 'Quad.easeOut',
            };

    config.onComplete = () => {
      this.actionTween = null;
      if (!this.alive) return;
      this.sprite.setAngle(0);
      this.sprite.setScale(this.baseScaleX, this.baseScaleY);
      this.startIdleAnimation();
    };
    this.actionTween = this.scene.tweens.add(config);
  }

  public jump(): void {
    if (!this.active || !this.alive || this.isGrappling) return;
    this.jumpBufferedUntil = this.scene.time.now + 120;
    this.tryBufferedJump();
  }

  public getMovementAllowanceMultiplier(): number {
    return this.suppressed ? 0.8 : 1;
  }

  private tryBufferedJump(): void {
    if (!this.active || !this.alive || this.isGrappling) return;
    if (!this.grounded || this.scene.time.now > this.jumpBufferedUntil || this.jumpBufferedUntil === 0) return;
    this.jumpBufferedUntil = 0;
    this.grounded = false;
    this.stopIdleAnimation();
    (this.sprite.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
    this.sprite.setVelocityY(this.jumpForce);
  }

  public fire(angle: number, power: number, terrain: Terrain): void {
    if (!this.active || !this.alive) return;

    // Show firing quip
    this.showSpeechBubble('firing');

    // Offset in direction of aim
    const angleRad = Phaser.Math.DegToRad(angle);
    const muzzle = getMuzzle(this.sprite.x, this.sprite.y - 10, angle);
    
    // Flip sprite to face firing direction
    this.sprite.setFlipX(Math.cos(angleRad) < 0);
    this.playActionAnimation('fire', Math.cos(angleRad) < 0 ? -1 : 1);
    
    createProjectile(
      this.scene,
      muzzle.x,
      muzzle.y,
      angle,
      power,
      this.weapon,
      terrain,
      this
    );
  }


  // Grappling hook system - can also target empty air (jetpack mode)
  public startGrapple(targetX: number, targetY: number, terrain: Terrain, requireTerrain: boolean = true): boolean {
    if (!this.active || !this.alive || this.isGrappling) return false;
    
    // Check if we've used up grapple uses this turn
    if (this.grappleUsesThisTurn >= this.maxGrappleUsesPerTurn) {
      this.showSpeechBubble('hit'); // "Out of grapples!"
      return false;
    }
    
    // Check range (max 400 pixels - increased from 300)
    const distance = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, targetX, targetY);
    if (distance > 400) return false;
    
    // Check if grapple would hit terrain (raycast along the path)
    const hitPoint = this.findGrappleHitPoint(this.sprite.x, this.sprite.y - 16, targetX, targetY, terrain);
    
    if (!hitPoint) {
      if (requireTerrain) {
        // No terrain connection - grapple fails
        this.showSpeechBubble('hit'); // Use hit quip for failure
        return false;
      }
      // Jetpack mode - can grapple to any point in air
      this.grappleTarget = { x: targetX, y: targetY };
    } else {
      // Use the hit point as the actual target
      this.grappleTarget = hitPoint;
    }
    
    // Use a grapple
    this.grappleUsesThisTurn++;
    
    this.isGrappling = true;
    
    // Create grapple line (hidden initially during windup)
    this.grappleLine = this.scene.add.graphics();
    this.grappleLine.setDepth(50);
    
    // Show quip
    this.showSpeechBubble('grapple');
    
    this.grappleTerrain = terrain;
    this.grappleElapsed = 0;
    this.moveInput = 0;
    this.stopWalkingAnimation();
    this.stopIdleAnimation();
    this.actionTween?.stop();
    this.sprite.setAngle(0);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAllowGravity(false);
    body.moves = false;
    this.grounded = false;
    terrain.forgetCollision(this.sprite);
    
    return true;
  }

  // Reset grapple uses for new turn
  public resetGrappleUses(): void {
    this.grappleUsesThisTurn = 0;
  }

  // Get remaining grapple uses
  public getRemainingGrapples(): number {
    return this.maxGrappleUsesPerTurn - this.grappleUsesThisTurn;
  }

  // Raycast to find where grapple hits terrain
  private findGrappleHitPoint(startX: number, startY: number, endX: number, endY: number, terrain: Terrain): { x: number; y: number } | null {
    return sweepTerrain(startX, startY, endX, endY, (x, y) => terrain.isPointSolid(x, y));
  }

  private updateGrapple(dt: number): void {
    if (!this.grappleTarget || !this.grappleTerrain) return;
    this.grappleElapsed += dt;
    this.sprite.setAngle(0);
    const hook = getHookCastPose(this.grappleElapsed, this.sprite.x, this.sprite.y - 12, this.grappleTarget.x, this.grappleTarget.y);
    if (!hook.attached) return;
    const dx = this.grappleTarget.x - this.sprite.x;
    const dy = this.grappleTarget.y - this.sprite.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 20 || this.grappleElapsed > 3.5) { this.endGrapple(); return; }
    const step = Math.min(distance - 18, 420 * dt);
    const supported = this.grappleTerrain.isPointSolid(this.sprite.x, this.sprite.y + 17);
    const result = moveCharacter({ x: this.sprite.x, y: this.sprite.y, grounded: supported },
      this.sprite.x + dx / distance * step, this.sprite.y + dy / distance * step,
      (x, y) => this.grappleTerrain!.isPointSolid(x, y), this.scene.physics.world.bounds.height, dy / distance < -0.5);
    const progress = Math.hypot(result.x - this.sprite.x, result.y - this.sprite.y);
    this.sprite.setPosition(result.x, result.y);
    this.grappleTerrain.forgetCollision(this.sprite);
    if (progress < 0.1 || result.blockedX || result.blockedY) this.endGrapple();
  }

  private updateGrappleLine(): void {
    if (!this.grappleLine || !this.grappleTarget) return;
    
    this.grappleLine.clear();
    const handX = this.sprite.x, handY = this.sprite.y - 12;
    const hook = getHookCastPose(this.grappleElapsed, handX, handY, this.grappleTarget.x, this.grappleTarget.y);
    const sag = hook.attached ? 4 : 12;
    this.grappleLine.lineStyle(2, 0xd6c69b, 1);
    for (let i = 0; i < 16; i++) {
      const a = i / 16, b = (i + 1) / 16;
      this.grappleLine.lineBetween(handX + (hook.x - handX) * a, handY + (hook.y - handY) * a + Math.sin(a * Math.PI) * sag,
        handX + (hook.x - handX) * b, handY + (hook.y - handY) * b + Math.sin(b * Math.PI) * sag);
    }
    this.grappleLine.lineStyle(3, 0xe2e9e9, 1);
    this.grappleLine.lineBetween(hook.x, hook.y + 6, hook.x, hook.y - 6);
    this.grappleLine.lineBetween(hook.x - 6, hook.y - 2, hook.x, hook.y - 6);
    this.grappleLine.lineBetween(hook.x + 6, hook.y - 2, hook.x, hook.y - 6);
  }

  private endGrapple(): void {
    this.sprite.setAngle(0);
    this.isGrappling = false;
    this.grappleTarget = null;
    this.grappleTerrain?.forgetCollision(this.sprite);
    this.grappleTerrain = null;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.moves = true;
    body.reset(this.sprite.x, this.sprite.y);
    
    if (this.grappleLine) {
      this.grappleLine.destroy();
      this.grappleLine = null;
    }
    
    // Re-enable gravity
    (this.sprite.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
  }

  public isCurrentlyGrappling(): boolean {
    return this.isGrappling;
  }

  // Speech bubble system
  private showSpeechBubble(type: keyof typeof MILITARY_QUIPS): void {
    const quips = MILITARY_QUIPS[type];
    this.say(quips[Math.floor(Math.random() * quips.length)]);
  }

  /** Show an arbitrary line in this soldier's speech bubble. */
  public say(quip: string): void {
    if (!this.sprite.active) return;
    // Clear existing bubble
    if (this.speechBubble) {
      this.speechBubble.destroy();
      this.speechBubble = null;
    }
    if (this.speechTimer) {
      this.speechTimer.destroy();
      this.speechTimer = null;
    }

    const worldWidth = this.scene.physics.world.bounds.width || 1280;
    const desiredOffset = this.squadIndex % 2 === 0 ? -18 : 18;
    const bubbleX = Phaser.Math.Clamp(this.sprite.x + desiredOffset, 76, Math.max(76, worldWidth - 76));
    this.speechBubbleOffsetX = bubbleX - this.sprite.x;
    const bubbleY = this.sprite.y - 64 - (this.squadIndex % 2) * 8;

    // Stagger neighboring bubbles and clamp them inside the battlefield.
    this.speechBubble = this.scene.add.container(bubbleX, bubbleY);
    this.speechBubble.setDepth(200);
    
    // Bubble background
    const padding = 6;
    const text = this.scene.add.text(0, 0, quip, {
      font: 'bold 10px Arial',
      color: '#111820',
      align: 'center',
      wordWrap: { width: 132 },
    });
    text.setOrigin(0.5);
    
    const bgWidth = text.width + padding * 2;
    const bgHeight = text.height + padding * 2;
    
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x000000, 0.28);
    bg.fillRoundedRect(-bgWidth / 2 + 2, -bgHeight / 2 + 3, bgWidth, bgHeight, 5);
    bg.fillStyle(0xf4f1df, 0.98);
    bg.fillRoundedRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 5);
    bg.lineStyle(1, this.team === Team.RED ? 0xbd4a43 : 0x4779b8, 0.85);
    bg.strokeRoundedRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 5);
    
    // Speech bubble tail
    const tailX = Phaser.Math.Clamp(-this.speechBubbleOffsetX, -bgWidth / 2 + 10, bgWidth / 2 - 10);
    bg.fillStyle(0xf4f1df, 0.98);
    bg.fillTriangle(
      tailX - 5, bgHeight / 2 - 2,
      tailX + 5, bgHeight / 2 - 2,
      tailX, bgHeight / 2 + 7
    );
    
    this.speechBubble.add(bg);
    this.speechBubble.add(text);
    
    // Fade in
    this.speechBubble.setAlpha(0);
    this.speechBubble.setScale(0.72);
    this.scene.tweens.add({
      targets: this.speechBubble,
      alpha: 1,
      scale: 1,
      y: bubbleY - 4,
      duration: 180,
      ease: 'Back.easeOut',
    });
    
    const displayTime = Phaser.Math.Clamp(1700 + quip.length * 24, 1900, 2900);
    this.speechTimer = this.scene.time.delayedCall(displayTime, () => {
      if (this.speechBubble) {
        this.scene.tweens.add({
          targets: this.speechBubble,
          alpha: 0,
          duration: 300,
          onComplete: () => {
            if (this.speechBubble) {
              this.speechBubble.destroy();
              this.speechBubble = null;
            }
          },
        });
      }
    });
  }

  public sayQuip(type: keyof typeof MILITARY_QUIPS): void {
    this.showSpeechBubble(type);
  }

  public takeDamage(amount: number): void {
    if (!this.alive) return;

    let damageToHealth = amount;
    let absorbed = 0;
    if (this.armor > 0) {
      absorbed = Math.min(this.armor, Math.ceil(amount * 0.65));
      this.armor -= absorbed;
      damageToHealth = Math.max(0, amount - absorbed);
    }

    this.health = Math.max(0, this.health - damageToHealth);
    this.updateEquipmentVisuals();
    
    // Show hit quip
    if (this.health > 0) {
      this.showSpeechBubble(this.health <= 30 ? 'lowHealth' : 'hit');
    }
    
    // Show health bar when damaged
    this.showHealthBar();

    // Flash effect - more dramatic
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.3,
      duration: 60,
      yoyo: true,
      repeat: 4,
    });
    
    // Red tint flash
    this.sprite.setTint(0xff0000);
    this.scene.time.delayedCall(150, () => {
      if (this.sprite && this.alive) {
        this.sprite.clearTint();
      }
    });

    // Show damage number with minus sign - BIGGER and more dramatic
    const damageText = this.scene.add.text(
      this.sprite.x + (Math.random() - 0.5) * 20,
      this.sprite.y - 40,
      damageToHealth > 0 ? `-${damageToHealth}` : 'BLOCKED',
      {
        font: 'bold 24px Arial',
        color: damageToHealth === 0 ? '#66ccff' : damageToHealth >= 30 ? '#ff0000' : '#ff6644',
        stroke: '#000000',
        strokeThickness: 4,
      }
    );
    damageText.setOrigin(0.5);
    damageText.setDepth(200);

    this.scene.tweens.add({
      targets: damageText,
      y: damageText.y - 60,
      alpha: 0,
      scale: 1.3,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => damageText.destroy(),
    });

    if (absorbed > 0) {
      const armorText = this.scene.add.text(
        this.sprite.x + 18,
        this.sprite.y - 23,
        this.armor > 0 ? `ARMOR -${absorbed}` : 'ARMOR BROKEN',
        {
          font: 'bold 13px Arial',
          color: '#75ddff',
          stroke: '#061019',
          strokeThickness: 3,
        },
      );
      armorText.setOrigin(0.5);
      armorText.setDepth(201);
      this.scene.tweens.add({
        targets: armorText,
        x: armorText.x + 24,
        y: armorText.y - 38,
        alpha: 0,
        duration: 1000,
        ease: 'Power2',
        onComplete: () => armorText.destroy(),
      });
    }
    
    // Blood/hit particles
    for (let i = 0; i < Math.min(damageToHealth / 5, 8); i++) {
      const particle = this.scene.add.circle(
        this.sprite.x + (Math.random() - 0.5) * 20,
        this.sprite.y + (Math.random() - 0.5) * 20,
        2 + Math.random() * 3,
        0xff3333
      );
      particle.setDepth(150);
      
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 40;
      
      this.scene.tweens.add({
        targets: particle,
        x: particle.x + Math.cos(angle) * dist,
        y: particle.y + Math.sin(angle) * dist + 30,
        alpha: 0,
        scale: 0,
        duration: 400 + Math.random() * 300,
        onComplete: () => particle.destroy(),
      });
    }

    if (this.health <= 0) {
      this.die();
    }
  }

  private showHealthBar(): void {
    this.healthBarVisible = true;
    this.healthBar.setVisible(true);
    this.updateHealthBar();
    
    // Clear existing timer
    if (this.healthBarTimer) {
      this.healthBarTimer.destroy();
    }
    
    // Hide health bar after 3 seconds
    this.healthBarTimer = this.scene.time.delayedCall(3000, () => {
      this.healthBarVisible = false;
      this.healthBar.setVisible(false);
    });
  }

  public heal(amount: number, healerName?: string): number {
    if (!this.alive) return 0;
    if (amount <= 0) return 0;

    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    const healed = this.health - before;
    if (healed <= 0) return 0;

    this.showHealthBar();

    // Small green pulse on the sprite
    this.sprite.setTint(0x44ff44);
    this.scene.time.delayedCall(200, () => {
      if (this.sprite && this.alive) this.sprite.clearTint();
    });

    // Floating +heal number
    const label = this.scene.add.text(
      this.sprite.x,
      this.sprite.y - 40,
      `+${healed}`,
      {
        font: 'bold 22px Arial',
        color: '#44ff44',
        stroke: '#000000',
        strokeThickness: 4,
      }
    );
    label.setOrigin(0.5);
    label.setDepth(200);

    this.scene.tweens.add({
      targets: label,
      y: label.y - 55,
      alpha: 0,
      scale: 1.15,
      duration: 1100,
      ease: 'Power2',
      onComplete: () => label.destroy(),
    });

    // Small sparkle dots
    for (let i = 0; i < 7; i++) {
      const dot = this.scene.add.circle(
        this.sprite.x + (Math.random() - 0.5) * 25,
        this.sprite.y + (Math.random() - 0.5) * 25,
        1 + Math.random() * 2.5,
        0x66ff66,
        0.8
      );
      dot.setDepth(199);
      this.scene.tweens.add({
        targets: dot,
        alpha: 0,
        scale: 0,
        duration: 450 + Math.random() * 250,
        onComplete: () => dot.destroy(),
      });
    }

    if (healerName) {
      // Optional: show the medic quip on the healed unit.
      this.showSpeechBubble('healing');
    }

    return healed;
  }

  public applyKnockback(forceX: number, forceY: number): void {
    if (!this.alive) return;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const maxImpulseX = 180;
    const maxImpulseY = 150;
    const maxVelocityX = 230;
    const maxVelocityY = 210;

    const impulseX = Phaser.Math.Clamp(forceX, -maxImpulseX, maxImpulseX);
    const impulseY = Phaser.Math.Clamp(forceY, -maxImpulseY, maxImpulseY);

    body.setAllowGravity(true);
    this.sprite.setVelocity(
      Phaser.Math.Clamp(body.velocity.x * 0.35 + impulseX, -maxVelocityX, maxVelocityX),
      Phaser.Math.Clamp(body.velocity.y * 0.35 + impulseY, -maxVelocityY, maxVelocityY)
    );
  }

  private die(): void {
    this.suppressionText?.destroy();
    this.suppressionText = null;
    this.alive = false;
    this.active = false;
    this.stopWalkingAnimation(false);
    this.stopIdleAnimation();
    if (this.actionTween) {
      this.actionTween.stop();
      this.actionTween = null;
    }
    this.outline.clear();
    this.outline.setVisible(false);
    this.equipmentGraphics.setVisible(false);
    this.equipmentText.setVisible(false);
    this.scene.tweens.add({
      targets: this.groundShadow,
      alpha: 0,
      scaleX: 0.5,
      duration: 650,
    });
    this.scene.events.emit('soldier-died', this);

    // Play death sound
    SoundManager.playDeath();

    // Show death quip
    this.showSpeechBubble('death');
    
    // DRAMATIC DEATH EFFECTS
    // Screen shake
    this.scene.cameras.main.shake(200, 0.008);
    
    // Slow-mo effect (brief)
    this.scene.time.timeScale = 0.5;
    this.scene.time.delayedCall(300, () => {
      this.scene.time.timeScale = 1;
    });

    // Death animation (delayed to show quip)
    this.scene.time.delayedCall(800, () => {
      // Spin and fade
      this.scene.tweens.add({
        targets: [this.contrastOutlineDark, this.contrastOutlineLight, this.sprite],
        alpha: 0,
        y: this.sprite.y + 30,
        rotation: (Math.random() > 0.5 ? 1 : -1) * 0.5,
        duration: 600,
        ease: 'Power2',
        onComplete: () => {
          this.contrastOutlineDark.destroy();
          this.contrastOutlineLight.destroy();
          this.sprite.destroy();
          this.healthBar.destroy();
          this.nameText.destroy();
          this.weaponText.destroy();
        },
      });
    });

    // Compact casualty marker with a font-independent silhouette.
    const deathText = this.scene.add.text(
      this.sprite.x,
      this.sprite.y - 20,
      'X_X',
      { font: 'bold 28px Courier New', color: '#f1ead8', stroke: '#000000', strokeThickness: 5 }
    );
    deathText.setOrigin(0.5);
    deathText.setDepth(200);
    deathText.setScale(0);

    this.scene.tweens.add({
      targets: deathText,
      scale: 1.5,
      duration: 200,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: deathText,
          y: deathText.y - 80,
          alpha: 0,
          scale: 2,
          duration: 1200,
          ease: 'Power2',
          onComplete: () => deathText.destroy(),
        });
      }
    });
    
    // "ELIMINATED" text
    const elimText = this.scene.add.text(
      this.sprite.x,
      this.sprite.y + 20,
      'ELIMINATED',
      {
        font: 'bold 16px Arial',
        color: '#ff0000',
        stroke: '#000000',
        strokeThickness: 3,
      }
    );
    elimText.setOrigin(0.5);
    elimText.setDepth(200);
    elimText.setAlpha(0);
    
    this.scene.tweens.add({
      targets: elimText,
      alpha: 1,
      duration: 200,
      onComplete: () => {
        this.scene.tweens.add({
          targets: elimText,
          alpha: 0,
          y: elimText.y + 30,
          duration: 1500,
          delay: 500,
          onComplete: () => elimText.destroy(),
        });
      }
    });
    
    // Death particles
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const particle = this.scene.add.circle(this.sprite.x, this.sprite.y, 4, 0xff4444);
      particle.setDepth(199);
      
      this.scene.tweens.add({
        targets: particle,
        x: this.sprite.x + Math.cos(angle) * 60,
        y: this.sprite.y + Math.sin(angle) * 60,
        alpha: 0,
        scale: 0,
        duration: 500,
        onComplete: () => particle.destroy(),
      });
    }
  }

  // Called when soldier falls off the map
  public fallToDeath(): void {
    if (!this.alive) return;

    this.alive = false;
    this.active = false;
    this.health = 0;
    this.stopWalkingAnimation(false);
    this.stopIdleAnimation();
    this.scene.events.emit('soldier-died', this);
    
    // Immediately hide and destroy - they fell off!
    this.sprite.setVisible(false);
    this.contrastOutlineDark.setVisible(false);
    this.contrastOutlineLight.setVisible(false);
    this.healthBar.setVisible(false);
    this.nameText.setVisible(false);
    this.weaponText.setVisible(false);
    this.outline.setVisible(false);
    this.groundShadow.setVisible(false);
    this.equipmentGraphics.setVisible(false);
    this.equipmentText.setVisible(false);
    
    if (this.speechBubble) {
      this.speechBubble.destroy();
      this.speechBubble = null;
    }
    
    if (this.grappleLine) {
      this.grappleLine.destroy();
      this.grappleLine = null;
    }
    
    // Clean up after a short delay
    this.scene.time.delayedCall(500, () => {
      this.sprite.destroy();
      this.contrastOutlineDark.destroy();
      this.contrastOutlineLight.destroy();
      this.healthBar.destroy();
      this.nameText.destroy();
      this.weaponText.destroy();
      this.outline.destroy();
      this.groundShadow.destroy();
    });
  }

  private updateHealthBar(): void {
    this.healthBar.clear();
    
    if (!this.healthBarVisible) return;

    const barWidth = 30;
    const barHeight = 4;
    const x = this.sprite.x - barWidth / 2;
    const y = this.sprite.y - 28;

    // Background (minimalist dark)
    this.healthBar.fillStyle(0x222222, 0.9);
    this.healthBar.fillRect(x - 1, y - 1, barWidth + 2, barHeight + 2);

    // Health fill - simple green to red
    const healthPercent = this.health / this.maxHealth;
    let color: number;
    if (healthPercent > 0.5) {
        color = this.armor > 0 ? 0x66ccff : 0x44ff44;
    } else if (healthPercent > 0.25) {
      color = 0xffff44;
    } else {
      color = 0xff4444;
    }

    this.healthBar.fillStyle(color, 1);
    this.healthBar.fillRect(x, y, barWidth * healthPercent, barHeight);
  }

  // Terrain collision runs in GameScene; it reports back here so landings can react.
  public setGrounded(isGrounded: boolean): void {
    if (!this.alive || !this.sprite.body) return;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;

    if (!isGrounded) {
      this.peakFallSpeed = Math.max(this.peakFallSpeed, body.velocity.y);
    } else if (!this.grounded) {
      // Just touched down — a real fall gets a thump (small step-downs don't).
      if (this.peakFallSpeed > 260) {
        this.playLandingEffect();
      }
      this.peakFallSpeed = 0;
    }

    this.grounded = isGrounded;
  }

  private playLandingEffect(): void {
    // Squash on impact (skip while the walk tweens own the sprite's scale)
    if (!this.isWalking) {
      this.sprite.setScale(this.baseScaleX * 1.12, this.baseScaleY * 0.8);
      this.scene.tweens.add({
        targets: this.sprite,
        scaleX: this.baseScaleX,
        scaleY: this.baseScaleY,
        duration: 160,
        ease: 'Back.easeOut',
      });
    }

    // Dust kicked out to both sides
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const puff = this.scene.add.circle(
        this.sprite.x + side * (4 + Math.random() * 6),
        this.sprite.y + 22,
        2.5 + Math.random() * 3,
        0xbfa77a,
        0.5
      );
      puff.setDepth(this.sprite.depth - 1);
      this.scene.tweens.add({
        targets: puff,
        x: puff.x + side * (10 + Math.random() * 14),
        y: puff.y - (2 + Math.random() * 6),
        alpha: 0,
        scale: 2,
        duration: 320 + Math.random() * 160,
        ease: 'Quad.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  // Accelerate toward the input direction rather than snapping to full speed.
  // Uphill slows the soldier down, downhill gives a slight boost.
  private updateMovementPhysics(dt: number, terrain: Terrain | null): void {
    if (!this.active || this.isGrappling || !this.sprite.body) return;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;

    let targetVX = 0;
    if (this.moveInput !== 0) {
      let slopeFactor = 1;
      if (terrain) {
        const lookAhead = 16;
        const footY = this.sprite.y + 14;
        const hereY = terrain.findWalkableSurfaceNear(this.sprite.x, footY, 8, 18);
        const aheadY = terrain.findWalkableSurfaceNear(
          this.sprite.x + this.moveInput * lookAhead,
          footY,
          8,
          18,
        );
        if (hereY !== null && aheadY !== null) {
          const rise = (hereY - aheadY) / lookAhead; // > 0 means climbing
          slopeFactor = rise > 0
            ? Phaser.Math.Clamp(1 - rise * 0.5, 0.45, 1)
            : Math.min(1.15, 1 - rise * 0.12);
        }
      }
      targetVX = this.moveInput * this.moveSpeed * slopeFactor;
    }

    const baseAccel = this.moveInput !== 0 ? Soldier.WALK_ACCEL : Soldier.WALK_DECEL;
    const accel = baseAccel * (this.grounded ? 1 : Soldier.AIR_CONTROL);
    const dv = targetVX - body.velocity.x;
    const step = accel * dt;

    if (Math.abs(dv) <= step) {
      body.setVelocityX(targetVX);
    } else {
      body.setVelocityX(body.velocity.x + Math.sign(dv) * step);
    }
  }

  public update(dt: number = 0.016, terrain: Terrain | null = null): void {
    if (!this.alive) return;

    this.tryBufferedJump();
    if (this.isGrappling) this.updateGrapple(dt);
    this.updateMovementPhysics(dt, terrain);
    this.suppressionText?.setPosition(this.sprite.x, this.sprite.y + 36);
    this.syncContrastLayers();

    // Update health bar position if visible
    if (this.healthBarVisible) {
      this.healthBar.clear();
      this.updateHealthBar();
    }
    
    // Always update name and weapon text positions to follow sprite
    this.nameText.setPosition(this.sprite.x, this.sprite.y - 40);
    this.weaponText.setPosition(this.sprite.x, this.sprite.y - 52);
    this.groundShadow.setPosition(this.sprite.x, this.sprite.y + 19);
    this.groundShadow.setScale(this.grounded ? 1 : 0.7, this.grounded ? 1 : 0.65);
    this.groundShadow.setAlpha(this.grounded ? 0.32 : 0.16);
    this.updateEquipmentVisuals();
    
    // Update outline position
    this.updateOutline();
    
    // Update speech bubble position
    if (this.speechBubble) {
      this.speechBubble.setPosition(
        this.sprite.x + this.speechBubbleOffsetX,
        this.sprite.y - 68 - (this.squadIndex % 2) * 8,
      );
    }
    
    // Update grapple line
    if (this.isGrappling) {
      this.updateGrappleLine();
    }
  }

  private updateOutline(): void {
    if (!this.outline || !this.alive) return;

    this.outline.clear();
    this.outline.setVisible(this.active);
    if (!this.active) return;

    const color = this.team === Team.RED ? 0xff6655 : 0x66aaff;
    this.outline.lineStyle(2, color, 0.9);
    this.outline.strokeEllipse(this.sprite.x, this.sprite.y + 20, 38, 11);
    this.outline.fillStyle(color, 0.95);
    this.outline.fillTriangle(
      this.sprite.x - 6,
      this.sprite.y - 39,
      this.sprite.x + 6,
      this.sprite.y - 39,
      this.sprite.x,
      this.sprite.y - 31,
    );
  }

  private updateEquipmentVisuals(): void {
    if (!this.equipmentGraphics || !this.equipmentText) return;

    this.equipmentGraphics.clear();
    if (!this.alive || this.armor <= 0) {
      this.equipmentGraphics.setVisible(false);
      this.equipmentText.setVisible(false);
      return;
    }

    const x = this.sprite.x;
    const y = this.sprite.y;
    this.equipmentGraphics.setVisible(true);
    this.equipmentGraphics.lineStyle(2, 0x75ddff, 0.95);
    this.equipmentGraphics.lineBetween(x - 23, y - 12, x - 23, y + 10);
    this.equipmentGraphics.lineBetween(x - 23, y - 12, x - 18, y - 16);
    this.equipmentGraphics.lineBetween(x - 23, y + 10, x - 18, y + 14);
    this.equipmentGraphics.lineBetween(x + 23, y - 12, x + 23, y + 10);
    this.equipmentGraphics.lineBetween(x + 23, y - 12, x + 18, y - 16);
    this.equipmentGraphics.lineBetween(x + 23, y + 10, x + 18, y + 14);
    this.equipmentText.setText(`A:${this.armor}`);
    this.equipmentText.setPosition(x + 25, y - 17);
    this.equipmentText.setVisible(true);
  }

  public destroy(): void {
    this.suppressionText?.destroy();
    if (this.healthBarTimer) {
      this.healthBarTimer.destroy();
    }
    if (this.speechTimer) {
      this.speechTimer.destroy();
    }
    if (this.speechBubble) {
      this.speechBubble.destroy();
    }
    if (this.grappleLine) {
      this.grappleLine.destroy();
    }
    if (this.outline) {
      this.outline.destroy();
    }
    if (this.contrastOutlineDark?.active) {
      this.contrastOutlineDark.destroy();
    }
    if (this.contrastOutlineLight?.active) {
      this.contrastOutlineLight.destroy();
    }
    if (this.groundShadow) {
      this.groundShadow.destroy();
    }
    if (this.equipmentGraphics) {
      this.equipmentGraphics.destroy();
    }
    if (this.equipmentText) {
      this.equipmentText.destroy();
    }
    if (this.walkFrameTimer) {
      this.walkFrameTimer.destroy();
    }
    if (this.walkBobTween) {
      this.walkBobTween.stop();
    }
    if (this.walkDustTimer) {
      this.walkDustTimer.destroy();
    }
    if (this.idleTween) {
      this.idleTween.stop();
    }
    if (this.actionTween) {
      this.actionTween.stop();
    }
    this.healthBar.destroy();
    this.nameText.destroy();
    this.weaponText.destroy();
    this.sprite.destroy();
  }
}
