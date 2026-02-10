import Phaser from 'phaser';
import { Team } from '../systems/TurnManager';
import { createProjectile } from './Projectile';
import { WeaponConfig, WeaponType, WEAPONS, SQUAD_WEAPONS } from '../systems/WeaponTypes';
import { Terrain } from '../systems/Terrain';
import { SoundManager } from '../utils/SoundManager';

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
};

// Military quips for speech bubbles
const MILITARY_QUIPS = {
  selected: ['Yes sir!', 'Ready for action!', 'Reporting in!', 'At your service!', 'On it!', 'Locked and loaded!'],
  moving: ['Moving out!', 'Oscar mike!', 'On the move!', 'Advancing!', 'Double time!'],
  firing: ['Get some!', 'Fire in the hole!', 'Engaging!', 'Weapons free!', 'Suppressing fire!', 'Eat lead!'],
  hit: ['Medic!', "I'm hit!", 'Taking fire!', 'Ow! That hurt!', 'Man down!'],
  healing: ['Patchin you up!', 'Hold still!', 'Medic here!', 'Stay with me!', 'Youll be fine!'],
  kill: ['Tango down!', 'Target eliminated!', 'Scratch one!', "Got 'em!", 'Enemy neutralized!'],
  death: ['Tell my wife...', 'Avenge me...', 'Go on without me...', "It's been an honor..."],
  grapple: ['Hook deployed!', 'Going up!', 'Wheee!', 'Spider-man!', 'Yoink!'],
};

export class Soldier {
  public sprite: Phaser.Physics.Arcade.Sprite;
  public team: Team;
  public name: string;
  public weapon: WeaponConfig;
  public squadIndex: number;
  
  private scene: Phaser.Scene;
  private health: number = 100;
  private maxHealth: number = 100;
  private alive: boolean = true;
  private active: boolean = false;
  
  private moveSpeed: number = 150;
  private jumpForce: number = -350;
  
  private healthBar: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private weaponText: Phaser.GameObjects.Text;
  private healthBarVisible: boolean = false;
  private healthBarTimer: Phaser.Time.TimerEvent | null = null;
  
  // Speech bubble
  private speechBubble: Phaser.GameObjects.Container | null = null;
  private speechTimer: Phaser.Time.TimerEvent | null = null;
  
  // Grappling hook
  private isGrappling: boolean = false;
  private grappleTarget: { x: number; y: number } | null = null;
  private grappleLine: Phaser.GameObjects.Graphics | null = null;
  private grappleUsesThisTurn: number = 0;
  private maxGrappleUsesPerTurn: number = 2;
  
  // Visual outline for better visibility
  private outline: Phaser.GameObjects.Graphics;
  
  // Animation state
  private standingTexture: string;
  private isWalking: boolean = false;
  private walkAnimTimer: Phaser.Time.TimerEvent | null = null;
  private currentWalkFrame: number = 1;

  // Call-in powerups (from supply drops)
  private airstrikeCharges: number = 0;
  private artilleryCharges: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, team: Team, name: string, squadIndex: number, disableGravity: boolean = false, weaponType?: WeaponType) {
    this.scene = scene;
    this.team = team;
    this.name = name;
    this.squadIndex = squadIndex;
    
    // Assign weapon - use provided type or fall back to squad position default
    const actualWeaponType = weaponType || SQUAD_WEAPONS[squadIndex % SQUAD_WEAPONS.length];
    this.weapon = WEAPONS[actualWeaponType];
    
    // Get the appropriate sprite for this weapon class
    const spriteKey = WEAPON_SPRITES[actualWeaponType] || 'worm';
    this.standingTexture = spriteKey; // Store for returning to stance after walking

    // Create sprite with weapon-specific texture
    this.sprite = scene.physics.add.sprite(x, y, spriteKey);
    this.sprite.setCollideWorldBounds(false); // Don't use world bounds, use terrain collision
    this.sprite.setBounce(0.1);
    this.sprite.setDrag(100, 0);
    
    // Set sprite display size - 64x64 sprites displayed at 56x56 for good detail
    this.sprite.setDisplaySize(56, 56);
    this.sprite.body!.setSize(20, 36); // Tighter collision box adjusted for new proportions
    
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

    // Create health bar (hidden by default)
    this.healthBar = scene.add.graphics();
    this.healthBar.setVisible(false);

    // Create name label - bigger and more visible
    this.nameText = scene.add.text(x, y - 40, name, {
      font: 'bold 11px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
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

  public getAirstrikeCharges(): number {
    return this.airstrikeCharges;
  }

  public getArtilleryCharges(): number {
    return this.artilleryCharges;
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
    this.active = isActive;
    this.weaponText.setVisible(isActive);
    
    // Show speech bubble when selected
    if (isActive) {
      this.showSpeechBubble('selected');
    }
  }

  public moveLeft(): void {
    if (!this.active || !this.alive || this.isGrappling) return;
    this.sprite.setVelocityX(-this.moveSpeed);
    this.sprite.setFlipX(true);
    this.startWalkingAnimation();
  }

  public moveRight(): void {
    if (!this.active || !this.alive || this.isGrappling) return;
    this.sprite.setVelocityX(this.moveSpeed);
    this.sprite.setFlipX(false);
    this.startWalkingAnimation();
  }

  public stopMoving(): void {
    if (!this.alive || this.isGrappling) return;
    this.sprite.setVelocityX(0);
    this.stopWalkingAnimation();
  }

  private startWalkingAnimation(): void {
    if (this.isWalking) return;
    this.isWalking = true;
    
    // Switch to walking sprite
    this.sprite.setTexture('soldier-walk1');
    this.currentWalkFrame = 1;
    
    // Alternate between walk frames
    this.walkAnimTimer = this.scene.time.addEvent({
      delay: 250,
      callback: () => {
        if (!this.isWalking || !this.alive) return;
        this.currentWalkFrame = this.currentWalkFrame === 1 ? 2 : 1;
        this.sprite.setTexture(`soldier-walk${this.currentWalkFrame}`);
      },
      loop: true,
    });
  }

  private stopWalkingAnimation(): void {
    if (!this.isWalking) return;
    this.isWalking = false;
    
    // Stop the animation timer
    if (this.walkAnimTimer) {
      this.walkAnimTimer.destroy();
      this.walkAnimTimer = null;
    }
    
    // Return to unique standing pose
    this.sprite.setTexture(this.standingTexture);
  }

  public jump(): void {
    if (!this.active || !this.alive || this.isGrappling) return;
    
    // Only jump if on ground (check if velocity Y is very small)
    if (Math.abs(this.sprite.body!.velocity.y) < 10) {
      this.sprite.setVelocityY(this.jumpForce);
    }
  }

  public fire(angle: number, power: number, terrain: Terrain): void {
    if (!this.active || !this.alive) return;

    // Show firing quip
    this.showSpeechBubble('firing');

    // Offset in direction of aim
    const angleRad = Phaser.Math.DegToRad(angle);
    const offsetX = Math.cos(angleRad) * 20;
    const offsetY = Math.sin(angleRad) * 10;
    
    // Flip sprite to face firing direction
    this.sprite.setFlipX(Math.cos(angleRad) < 0);
    
    createProjectile(
      this.scene,
      this.sprite.x + offsetX,
      this.sprite.y - 10 + offsetY,
      angle,
      power,
      this.weapon,
      terrain
    );
  }


  // Grappling hook system - requires terrain connection
  public startGrapple(targetX: number, targetY: number, terrain: Terrain): boolean {
    if (!this.active || !this.alive || this.isGrappling) return false;
    
    // Check if we've used up grapple uses this turn
    if (this.grappleUsesThisTurn >= this.maxGrappleUsesPerTurn) {
      this.showSpeechBubble('hit'); // "Out of grapples!"
      return false;
    }
    
    // Check range (max 300 pixels)
    const distance = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, targetX, targetY);
    if (distance > 300) return false;
    
    // Check if grapple would hit terrain (raycast along the path)
    const hitPoint = this.findGrappleHitPoint(this.sprite.x, this.sprite.y, targetX, targetY, terrain);
    
    if (!hitPoint) {
      // No terrain connection - grapple fails
      this.showSpeechBubble('hit'); // Use hit quip for failure
      return false;
    }
    
    // Use a grapple
    this.grappleUsesThisTurn++;
    
    // Use the hit point as the actual target
    this.isGrappling = true;
    this.grappleTarget = hitPoint;
    
    // Create grapple line (hidden initially during windup)
    this.grappleLine = this.scene.add.graphics();
    this.grappleLine.setDepth(50);
    
    // Show quip
    this.showSpeechBubble('grapple');
    
    // Disable gravity temporarily
    (this.sprite.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    
    // Calculate landing position (just below the hit point on the terrain surface)
    const landingY = terrain.getSurfaceY(hitPoint.x) - 15;
    
    // *** TWIRLING ANIMATION before throwing ***
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: 0, to: 360 },
      duration: 300,
      ease: 'Power1',
      onComplete: () => {
        // Reset rotation and throw the hook
        this.sprite.setAngle(0);
        
        // Animate movement to target
        this.scene.tweens.add({
          targets: this.sprite,
          x: hitPoint.x,
          y: landingY,
          duration: 500,
          ease: 'Power2',
          onUpdate: () => this.updateGrappleLine(),
          onComplete: () => this.endGrapple(),
        });
      }
    });
    
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
    const steps = 50; // Check 50 points along the line
    const dx = (endX - startX) / steps;
    const dy = (endY - startY) / steps;
    
    for (let i = 1; i <= steps; i++) {
      const checkX = startX + dx * i;
      const checkY = startY + dy * i;
      
      if (terrain.isPointSolid(checkX, checkY)) {
        return { x: checkX, y: checkY };
      }
    }
    
    return null; // No terrain hit
  }

  private updateGrappleLine(): void {
    if (!this.grappleLine || !this.grappleTarget) return;
    
    this.grappleLine.clear();
    this.grappleLine.lineStyle(2, 0x888888, 1);
    this.grappleLine.lineBetween(
      this.sprite.x, this.sprite.y,
      this.grappleTarget.x, this.grappleTarget.y
    );
  }

  private endGrapple(): void {
    this.isGrappling = false;
    this.grappleTarget = null;
    
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
    // Clear existing bubble
    if (this.speechBubble) {
      this.speechBubble.destroy();
      this.speechBubble = null;
    }
    if (this.speechTimer) {
      this.speechTimer.destroy();
      this.speechTimer = null;
    }
    
    // Pick random quip
    const quips = MILITARY_QUIPS[type];
    const quip = quips[Math.floor(Math.random() * quips.length)];
    
    // Create bubble container
    this.speechBubble = this.scene.add.container(this.sprite.x, this.sprite.y - 55);
    this.speechBubble.setDepth(200);
    
    // Bubble background
    const padding = 6;
    const text = this.scene.add.text(0, 0, quip, {
      font: 'bold 10px Arial',
      color: '#000000',
    });
    text.setOrigin(0.5);
    
    const bgWidth = text.width + padding * 2;
    const bgHeight = text.height + padding * 2;
    
    const bg = this.scene.add.graphics();
    bg.fillStyle(0xffffff, 0.95);
    bg.fillRoundedRect(-bgWidth/2, -bgHeight/2, bgWidth, bgHeight, 4);
    
    // Speech bubble tail
    bg.fillTriangle(
      -5, bgHeight/2 - 2,
      5, bgHeight/2 - 2,
      0, bgHeight/2 + 6
    );
    
    this.speechBubble.add(bg);
    this.speechBubble.add(text);
    
    // Fade in
    this.speechBubble.setAlpha(0);
    this.scene.tweens.add({
      targets: this.speechBubble,
      alpha: 1,
      duration: 150,
    });
    
    // Auto-hide after 2 seconds
    this.speechTimer = this.scene.time.delayedCall(2000, () => {
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

    this.health = Math.max(0, this.health - amount);
    
    // Show hit quip
    if (this.health > 0) {
      this.showSpeechBubble('hit');
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
      `-${amount}`,
      {
        font: 'bold 24px Arial',
        color: amount >= 30 ? '#ff0000' : '#ff6644',
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
    
    // Blood/hit particles
    for (let i = 0; i < Math.min(amount / 5, 8); i++) {
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
    this.sprite.setVelocity(
      this.sprite.body!.velocity.x + forceX,
      this.sprite.body!.velocity.y + forceY
    );
  }

  private die(): void {
    this.alive = false;
    this.active = false;

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
        targets: this.sprite,
        alpha: 0,
        y: this.sprite.y + 30,
        rotation: (Math.random() > 0.5 ? 1 : -1) * 0.5,
        duration: 600,
        ease: 'Power2',
        onComplete: () => {
          this.sprite.destroy();
          this.healthBar.destroy();
          this.nameText.destroy();
          this.weaponText.destroy();
        },
      });
    });

    // Big skull emoji with dramatic animation
    const deathText = this.scene.add.text(
      this.sprite.x,
      this.sprite.y - 20,
      '💀',
      { font: '48px Arial' }
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
    
    // Immediately hide and destroy - they fell off!
    this.sprite.setVisible(false);
    this.healthBar.setVisible(false);
    this.nameText.setVisible(false);
    this.weaponText.setVisible(false);
    this.outline.setVisible(false);
    
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
      this.healthBar.destroy();
      this.nameText.destroy();
      this.weaponText.destroy();
      this.outline.destroy();
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
      color = 0x44ff44;
    } else if (healthPercent > 0.25) {
      color = 0xffff44;
    } else {
      color = 0xff4444;
    }

    this.healthBar.fillStyle(color, 1);
    this.healthBar.fillRect(x, y, barWidth * healthPercent, barHeight);
  }

  public update(): void {
    if (!this.alive) return;

    // Update health bar position if visible
    if (this.healthBarVisible) {
      this.healthBar.clear();
      this.updateHealthBar();
    }
    
    // Always update name and weapon text positions to follow sprite
    this.nameText.setPosition(this.sprite.x, this.sprite.y - 40);
    this.weaponText.setPosition(this.sprite.x, this.sprite.y - 52);
    
    // Update outline position
    this.updateOutline();
    
    // Update speech bubble position
    if (this.speechBubble) {
      this.speechBubble.setPosition(this.sprite.x, this.sprite.y - 60);
    }
    
    // Update grapple line
    if (this.isGrappling) {
      this.updateGrappleLine();
    }
  }

  private updateOutline(): void {
    if (!this.outline || !this.alive) return;

    // Disabled: keep this graphics object empty and hidden.
    this.outline.clear();
    this.outline.setVisible(false);
  }

  public destroy(): void {
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
    if (this.walkAnimTimer) {
      this.walkAnimTimer.destroy();
    }
    this.healthBar.destroy();
    this.nameText.destroy();
    this.weaponText.destroy();
    this.sprite.destroy();
  }
}
