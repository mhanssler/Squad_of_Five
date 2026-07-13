import Phaser from 'phaser';
import { WeaponConfig, WeaponType } from '../systems/WeaponTypes';
import { Terrain } from '../systems/Terrain';
import { SoundManager } from '../utils/SoundManager';
import type { Soldier } from './Soldier';

// How long a newly fired explosive ignores its own shooter. Prevents point-blank self-detonation
// at spawn (the muzzle sits inside the shooter's hit circle for downward aims) while still letting
// a badly thrown grenade bounce back and punish you.
const SHOOTER_GRACE_MS = 400;

// Bullet weapon types - these do direct damage without explosions
const BULLET_WEAPONS: WeaponType[] = [
  WeaponType.RIFLE,
  WeaponType.SNIPER,
  WeaponType.PISTOL,
  WeaponType.SMG,
  WeaponType.MINIGUN,
  WeaponType.SHOTGUN,
  WeaponType.CARBINE,
  WeaponType.SLUG,
];

// Play weapon sound based on type
function playWeaponSound(type: WeaponType): void {
  switch (type) {
    case WeaponType.RIFLE:
      SoundManager.playRifleShot();
      break;
    case WeaponType.PISTOL:
      SoundManager.playPistolShot();
      break;
    case WeaponType.SMG:
    case WeaponType.CARBINE:
      SoundManager.playSMGShot();
      break;
    case WeaponType.MINIGUN:
      SoundManager.playMinigunShot();
      break;
    case WeaponType.SHOTGUN:
    case WeaponType.SLUG:
      SoundManager.playShotgunBlast();
      break;
    case WeaponType.SNIPER:
      SoundManager.playSniperShot();
      break;
    case WeaponType.FLAMER:
      SoundManager.playFlamethrower();
      break;
    default:
      // Explosives don't need firing sounds (they make noise on impact)
      break;
  }
}

export class Projectile {
  private scene: Phaser.Scene;
  private sprite: Phaser.Physics.Arcade.Sprite;
  private config: WeaponConfig;
  private hasExploded: boolean = false;
  private hasEnded: boolean = false;
  private trailGraphics: Phaser.GameObjects.Graphics;
  private trailPoints: { x: number; y: number }[] = [];
  private terrain: Terrain;
  private bounceCount: number = 0;
  private maxBounces: number = 3;
  private hasHitGround: boolean = false;
  private fuseTimer: Phaser.Time.TimerEvent | null = null;
  private isBullet: boolean = false;
  private lastX: number;
  private lastY: number;
  private flightSound: { update: (vx: number, vy: number) => void; stop: () => void } | null = null;
  private shooter: Soldier | null;
  private spawnedAt: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    velocityX: number,
    velocityY: number,
    config: WeaponConfig,
    terrain: Terrain,
    shooter: Soldier | null = null
  ) {
    this.scene = scene;
    this.config = config;
    this.terrain = terrain;
    this.shooter = shooter;
    this.spawnedAt = scene.time.now;
    this.isBullet = BULLET_WEAPONS.includes(config.type);

    // Create projectile sprite
    this.sprite = scene.physics.add.sprite(x, y, 'projectile');
    
    // Bullets are smaller and elongated
    if (this.isBullet) {
      this.sprite.setDisplaySize(config.projectileSize * 2, config.projectileSize);
    } else {
      this.sprite.setDisplaySize(config.projectileSize, config.projectileSize);
    }
    
    this.sprite.setVelocity(velocityX, velocityY);
    this.sprite.setBounce(config.bounce);
    this.sprite.setDrag(config.drag * 100, config.drag * 100);
    
    // Set custom gravity for this projectile
    (this.sprite.body as Phaser.Physics.Arcade.Body).setGravityY(500 * config.gravity - 500);
    
    // Tint based on weapon
    this.sprite.setTint(config.trailColor);

    // Create trail graphics
    this.trailGraphics = scene.add.graphics();
    this.trailGraphics.setDepth(5);

    // Store initial position for raycast collision
    this.lastX = x;
    this.lastY = y;

    // In-flight sounds for heavier ordnance (requested).
    if (config.type === WeaponType.GRENADE || config.type === WeaponType.MORTAR || config.type === WeaponType.ROCKET) {
      // Ensure audio is initialized for shots fired before any other SFX.
      SoundManager.init();
      this.flightSound = SoundManager.startProjectileFlightSound(config.type);
      // Kick the loop to an audible state immediately (before the first update tick).
      if (this.flightSound) {
        this.flightSound.update(velocityX, velocityY);
      }
    }

    // Update loop for trail and collision
    scene.events.on('update', this.update, this);

    // Self-destruct after 10 seconds if nothing happens (safety)
    scene.time.delayedCall(10000, () => {
      if (!this.hasExploded) {
        this.destroy();
      }
    });
  }

  private update(): void {
    if (this.hasExploded || !this.sprite.active) return;

    // Check for soldier hits along the path (raycast-style for fast bullets)
    this.checkSoldierCollision();
    
    // If we hit a soldier, stop processing (projectile was destroyed in callback)
    if (this.hasExploded || !this.sprite.active) return;

    // Update in-flight audio based on current velocity (best-effort).
    if (this.flightSound && this.sprite.body) {
      const body = this.sprite.body as Phaser.Physics.Arcade.Body;
      this.flightSound.update(body.velocity.x, body.velocity.y);
    }

    // Add current position to trail
    this.trailPoints.push({ x: this.sprite.x, y: this.sprite.y });
    
    // Bullets have shorter trails
    const maxTrailLength = this.isBullet ? 15 : (this.config.type === WeaponType.SNIPER ? 50 : 30);
    if (this.trailPoints.length > maxTrailLength) {
      this.trailPoints.shift();
    }

    // Draw trail
    this.drawTrail();

    // Rotate sprite based on velocity
    const angle = Math.atan2(
      this.sprite.body!.velocity.y,
      this.sprite.body!.velocity.x
    );
    this.sprite.setRotation(angle);

    // Check terrain collision
    this.checkTerrainCollision();

    // Update last position for next frame's raycast
    this.lastX = this.sprite.x;
    this.lastY = this.sprite.y;

    // Check if out of bounds (fell off map)
    const bounds = this.scene.physics.world.bounds;
    const left = bounds.x;
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;

    // If the terrain is completely destroyed, explosives can fall forever. Treat the bottom world boundary
    // like "ground" so shots still resolve with an impact + detonation instead of silently disappearing.
    if (this.sprite.y >= bottom - 2) {
      this.sprite.setY(bottom - 2);
      if (this.isBullet) {
        this.bulletImpact();
      } else {
        this.explode();
      }
      return;
    }

    if (this.sprite.y > bottom + 50 || this.sprite.x < left - 50 || this.sprite.x > right + 50) {
      this.destroy();
    }
  }

  private checkSoldierCollision(): void {
    // Bullets can never hit their own shooter (they outrun the soldier instantly).
    // Explosives only ignore the shooter during a short spawn grace window.
    const withinGrace = this.scene.time.now - this.spawnedAt < SHOOTER_GRACE_MS;
    const excludedSoldier = this.isBullet ? this.shooter : (withinGrace ? this.shooter : null);

    // Emit event for GameScene to check if projectile hit any soldiers
    // Pass current position, last position, and callback to handle hit
    this.scene.events.emit('check-soldier-hit',
      this.lastX,
      this.lastY,
      this.sprite.x,
      this.sprite.y,
      this.config.damage,
      this.isBullet,
      excludedSoldier,
      (hitX: number, hitY: number) => {
        // Callback when a soldier is hit
        if (this.isBullet) {
          // Bullet hit - create impact at hit location
          this.sprite.setPosition(hitX, hitY);
          this.bulletImpact();
        } else {
          // Explosive hit - explode at hit location
          this.sprite.setPosition(hitX, hitY);
          this.explode();
        }
      }
    );
  }

  private drawTrail(): void {
    this.trailGraphics.clear();
    if (this.trailPoints.length > 1) {
      // Bullets have thinner, faster trails
      for (let i = 1; i < this.trailPoints.length; i++) {
        const alpha = (i / this.trailPoints.length) * (this.isBullet ? 0.5 : 0.7);
        const width = this.isBullet 
          ? (i / this.trailPoints.length) * 1.5 + 0.5
          : (i / this.trailPoints.length) * 3 + 1;
        this.trailGraphics.lineStyle(width, this.config.trailColor, alpha);
        this.trailGraphics.lineBetween(
          this.trailPoints[i - 1].x,
          this.trailPoints[i - 1].y,
          this.trailPoints[i].x,
          this.trailPoints[i].y
        );
      }
    }
  }

  private checkTerrainCollision(): void {
    const x = Math.floor(this.sprite.x);
    const y = Math.floor(this.sprite.y);

    // Check if projectile hit terrain
    if (this.terrain.isPointSolid(x, y)) {
      if (this.isBullet) {
        // Bullets do direct damage on hit - no explosion, just impact
        this.bulletImpact();
      } else if (this.config.bounce > 0 && this.bounceCount < this.maxBounces) {
        // Bounce off terrain (for grenades)
        this.bounceCount++;
        
        // First ground contact - start fuse timer for grenades
        if (!this.hasHitGround && this.config.type === WeaponType.GRENADE) {
          this.hasHitGround = true;
          this.startFuseTimer();
        }
        
        // Reflect velocity
        const velX = this.sprite.body!.velocity.x;
        const velY = this.sprite.body!.velocity.y;
        
        // Simple bounce - reverse and reduce velocity
        this.sprite.setVelocity(
          velX * this.config.bounce * 0.5,
          velY * -this.config.bounce
        );
        
        // Move projectile out of terrain
        this.sprite.y -= 5;
      } else {
        // Explode on impact for explosive weapons
        this.explode();
      }
    }
  }

  private startFuseTimer(): void {
    // Start 2 second fuse when grenade first hits ground
    this.fuseTimer = this.scene.time.delayedCall(2000, () => {
      if (!this.hasExploded) {
        this.explode();
      }
    });
  }

  private bulletImpact(): void {
    if (this.hasExploded) return;
    this.hasExploded = true;

    const x = this.sprite.x;
    const y = this.sprite.y;

    // Create small impact effect (dust/sparks, no big explosion)
    this.createBulletImpactEffect(x, y);

    // Emit hit event - bullets do direct damage using their configured explosion radius.
    // The shooter is passed so their own bullets' ground-impact splash can't chip them
    // (explosives intentionally keep self-splash; bullets shouldn't).
    this.scene.events.emit(
      'projectile-explode',
      x,
      y,
      this.config.explosionRadius,
      this.config.damage,
      this.shooter
    );

    // Cleanup
    this.destroy();
  }

  private createBulletImpactEffect(x: number, y: number): void {
    // Small spark/dust particles
    for (let i = 0; i < 5; i++) {
      const spark = this.scene.add.graphics();
      spark.fillStyle(this.config.trailColor, 1);
      spark.fillCircle(0, 0, 2);
      spark.setPosition(x, y);
      spark.setDepth(10);

      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 100;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - 50;

      this.scene.tweens.add({
        targets: spark,
        x: x + vx * 0.3,
        y: y + vy * 0.3,
        alpha: 0,
        duration: 200,
        onComplete: () => spark.destroy(),
      });
    }
  }

  public explode(): void {
    if (this.hasExploded) return;
    this.hasExploded = true;

    const x = this.sprite.x;
    const y = this.sprite.y;

    // Emit explosion event for GameScene to handle
    this.scene.events.emit(
      'projectile-explode', 
      x, 
      y, 
      this.config.explosionRadius,
      this.config.damage
    );

    // Cleanup
    this.destroy();
  }

  // Methods for camera tracking
  public getSprite(): Phaser.Physics.Arcade.Sprite {
    return this.sprite;
  }

  public getSpeed(): number {
    return this.config.projectileSpeed;
  }

  public getPosition(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  private destroy(): void {
    if (this.hasEnded) return;
    this.hasEnded = true;

    // Signal the shot system that this projectile is fully resolved (hit/exploded/out-of-bounds/timeout).
    this.scene.events.emit('projectile-ended', this);

    if (this.flightSound) {
      this.flightSound.stop();
      this.flightSound = null;
    }
    if (this.fuseTimer) {
      this.fuseTimer.destroy();
    }
    this.scene.events.off('update', this.update, this);
    this.trailGraphics.destroy();
    if (this.sprite.active) {
      this.sprite.destroy();
    }
  }
}

// Flamethrower creates a flame jet instead of projectiles
export class FlameJet {
  private scene: Phaser.Scene;
  private terrain: Terrain;
  private flames: Phaser.GameObjects.Graphics[] = [];
  private isActive: boolean = true;
  private startX: number;
  private startY: number;
  private angle: number;
  private maxRange: number = 150;
  private damagePerTick: number;
  private tickCount: number = 0;
  private maxTicks: number = 30; // About 1 second of flame
  private shooter: Soldier | null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number,
    power: number,
    config: WeaponConfig,
    terrain: Terrain,
    shooter: Soldier | null = null
  ) {
    this.scene = scene;
    this.terrain = terrain;
    this.shooter = shooter;
    this.startX = x;
    this.startY = y;
    this.angle = Phaser.Math.DegToRad(angle);
    this.damagePerTick = config.damage;
    this.maxRange = 100 + (power / 100) * 100; // 100-200 range based on power

    // Play flamethrower sound
    SoundManager.playFlamethrower();

    // Start flame animation
    scene.events.on('update', this.update, this);

    // Emit created event for camera
    scene.events.emit('flame-jet-created', this);
  }

  private update(): void {
    if (!this.isActive) return;

    this.tickCount++;

    // Create flame particles
    this.createFlameParticle();

    // Deal damage along the flame path every few ticks
    if (this.tickCount % 5 === 0) {
      this.dealDamageAlongPath();
    }

    // End after max ticks
    if (this.tickCount >= this.maxTicks) {
      this.destroy();
    }
  }

  private createFlameParticle(): void {
    const flame = this.scene.add.graphics();
    
    // Random position along the flame path
    const distance = Math.random() * this.maxRange;
    const spread = (Math.random() - 0.5) * 0.5; // Some spread
    const x = this.startX + Math.cos(this.angle + spread) * distance;
    const y = this.startY + Math.sin(this.angle + spread) * distance;

    // Check if blocked by terrain
    if (this.terrain.isPointSolid(x, y)) {
      flame.destroy();
      return;
    }

    // Random flame color (orange to yellow to red)
    const colors = [0xff3300, 0xff6600, 0xff9900, 0xffcc00];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    const size = 5 + Math.random() * 10;
    flame.fillStyle(color, 0.8);
    flame.fillCircle(0, 0, size);
    flame.setPosition(x, y);
    flame.setDepth(10);

    this.flames.push(flame);

    // Animate flame particle rising and fading
    this.scene.tweens.add({
      targets: flame,
      y: y - 20 - Math.random() * 20,
      alpha: 0,
      scaleX: 0.5,
      scaleY: 0.5,
      duration: 300 + Math.random() * 200,
      onComplete: () => {
        const index = this.flames.indexOf(flame);
        if (index > -1) {
          this.flames.splice(index, 1);
        }
        flame.destroy();
      },
    });
  }

  private dealDamageAlongPath(): void {
    // Find how far the flame reaches before terrain blocks it.
    let effectiveRange = this.maxRange;
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const distance = (i / steps) * this.maxRange;
      const x = this.startX + Math.cos(this.angle) * distance;
      const y = this.startY + Math.sin(this.angle) * distance;
      if (this.terrain.isPointSolid(x, y)) {
        effectiveRange = distance;
        break;
      }
    }

    // One wave = one damage application per soldier caught in the cone.
    // (Per-point events used to stack 2-4x on the same soldier, one-shotting anyone touched.)
    // The shooter is excluded — the jet starts right at their own body and used to roast them.
    this.scene.events.emit(
      'flame-wave',
      this.startX,
      this.startY,
      this.angle,
      effectiveRange,
      this.damagePerTick,
      this.shooter
    );
  }

  public getPosition(): { x: number; y: number } {
    return { x: this.startX, y: this.startY };
  }

  private destroy(): void {
    this.isActive = false;
    this.scene.events.off('update', this.update, this);
    
    // Cleanup remaining flames
    this.flames.forEach(flame => flame.destroy());
    this.flames = [];

    // Signal end
    this.scene.events.emit('flame-jet-ended');
  }
}

// Factory function to create projectiles with proper weapon physics
// Create muzzle flash effect
function createMuzzleFlash(scene: Phaser.Scene, x: number, y: number, angle: number, intensity: number = 1): void {
  const angleRad = Phaser.Math.DegToRad(angle);
  
  // Main flash
  const flashSize = 8 + intensity * 4;
  const flash = scene.add.circle(x, y, flashSize, 0xffff00, 0.9);
  flash.setDepth(200);
  
  // Secondary orange flash
  const flash2 = scene.add.circle(x + Math.cos(angleRad) * 5, y + Math.sin(angleRad) * 5, flashSize * 0.6, 0xff8800, 0.7);
  flash2.setDepth(199);
  
  scene.tweens.add({
    targets: [flash, flash2],
    scale: 0,
    alpha: 0,
    duration: 60,
    onComplete: () => {
      flash.destroy();
      flash2.destroy();
    },
  });
  
  // Spark particles
  const sparkCount = Math.min(3, Math.floor(intensity));
  for (let i = 0; i < sparkCount; i++) {
    const sparkAngle = angleRad + (Math.random() - 0.5) * 0.8;
    const spark = scene.add.circle(x, y, 2, 0xffff88, 1);
    spark.setDepth(201);
    
    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(sparkAngle) * (15 + Math.random() * 10),
      y: y + Math.sin(sparkAngle) * (15 + Math.random() * 10),
      alpha: 0,
      duration: 100,
      onComplete: () => spark.destroy(),
    });
  }
}

// Create shell casing ejection effect
function createShellCasing(scene: Phaser.Scene, x: number, y: number, angle: number): void {
  const angleRad = Phaser.Math.DegToRad(angle);
  
  // Eject perpendicular to firing direction (upward mostly)
  const ejectAngle = angleRad - Math.PI / 2 + (Math.random() - 0.5) * 0.5;
  
  // Create shell casing (small rectangle)
  const casing = scene.add.rectangle(x, y, 3, 6, 0xccaa44);
  casing.setDepth(150);
  
  // Random eject velocity
  const ejectSpeed = 80 + Math.random() * 60;
  const targetX = x + Math.cos(ejectAngle) * ejectSpeed * 0.4;
  const targetY = y + Math.sin(ejectAngle) * ejectSpeed * 0.3 - 20; // Arc upward
  
  scene.tweens.add({
    targets: casing,
    x: targetX,
    y: targetY + 80, // Fall with gravity
    rotation: Math.random() * 8 - 4,
    alpha: 0.3,
    duration: 500 + Math.random() * 300,
    ease: 'Quad.easeIn',
    onComplete: () => casing.destroy(),
  });
}

export function createProjectile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  angle: number,
  power: number,
  config: WeaponConfig,
  terrain: Terrain,
  shooter: Soldier | null = null
): Projectile | Projectile[] | FlameJet {
  const velocity = (power / 100) * config.projectileSpeed;
  const angleRad = Phaser.Math.DegToRad(angle);

  // Special handling for flamethrower
  if (config.type === WeaponType.FLAMER) {
    return new FlameJet(scene, x, y, angle, power, config, terrain, shooter);
  }

  // Rapid-fire weapons (rifle, SMG, pistol, minigun) - fire in sequence
  const rapidFireWeapons = [WeaponType.RIFLE, WeaponType.SMG, WeaponType.PISTOL, WeaponType.MINIGUN, WeaponType.CARBINE];
  
  if (config.pelletCount > 1 && rapidFireWeapons.includes(config.type)) {
    const projectiles: Projectile[] = [];
    const spreadRad = Phaser.Math.DegToRad(config.spreadAngle);
    
    // Calculate fire rate based on weapon type
    // Minigun: very fast (10ms), SMG: fast (25ms), Rifle: medium (40ms), Pistol: slower (80ms)
    let fireDelay = 40;
    if (config.type === WeaponType.MINIGUN) fireDelay = 10;
    else if (config.type === WeaponType.SMG) fireDelay = 25;
    else if (config.type === WeaponType.CARBINE) fireDelay = 32;
    else if (config.type === WeaponType.RIFLE) fireDelay = 35;
    else if (config.type === WeaponType.PISTOL) fireDelay = 70;
    
    for (let i = 0; i < config.pelletCount; i++) {
      scene.time.delayedCall(i * fireDelay, () => {
        // Random spread for each bullet
        const spreadOffset = (Math.random() - 0.5) * spreadRad * 2;
        const pelletAngle = angleRad + spreadOffset;
        
        const velX = Math.cos(pelletAngle) * velocity;
        const velY = Math.sin(pelletAngle) * velocity;

        const projectile = new Projectile(scene, x, y, velX, velY, config, terrain, shooter);
        projectiles.push(projectile);

        // Shot bookkeeping: emit for every spawned projectile.
        scene.events.emit('projectile-spawned', projectile);
        
        // Camera follows first projectile
        if (i === 0) {
          scene.events.emit('projectile-created', projectile);
        }
        
        // Play gunshot sound for each bullet
        playWeaponSound(config.type);
        
        // Muzzle flash with increasing intensity
        const intensity = 1 + (i % 5) * 0.3; // Pulses every 5 shots
        createMuzzleFlash(scene, x, y, angle, intensity);
        
        // Shell casing ejection
        createShellCasing(scene, x, y, angle);
      });
    }
    
    return projectiles;
  }
  
  // Spread weapons (shotgun) - fire all at once
  if (config.pelletCount > 1) {
    const projectiles: Projectile[] = [];
    const spreadRad = Phaser.Math.DegToRad(config.spreadAngle);
    
    // Play shotgun blast sound
    playWeaponSound(config.type);
    
    // Single big muzzle flash for shotgun
    createMuzzleFlash(scene, x, y, angle, 3);
    createShellCasing(scene, x, y, angle);
    
    for (let i = 0; i < config.pelletCount; i++) {
      const spreadOffset = (i - (config.pelletCount - 1) / 2) * (spreadRad / config.pelletCount);
      const pelletAngle = angleRad + spreadOffset + (Math.random() - 0.5) * 0.1;
      
      const velX = Math.cos(pelletAngle) * velocity;
      const velY = Math.sin(pelletAngle) * velocity;

      const projectile = new Projectile(scene, x, y, velX, velY, config, terrain, shooter);
      projectiles.push(projectile);
      scene.events.emit('projectile-spawned', projectile);
    }
    // Emit event for the first pellet (camera follows this one)
    if (projectiles.length > 0) {
      scene.events.emit('projectile-created', projectiles[0]);
    }
    return projectiles;
  } else {
    // Single projectile (sniper, grenade, rocket, mortar)
    const velX = Math.cos(angleRad) * velocity;
    const velY = Math.sin(angleRad) * velocity;
    const projectile = new Projectile(scene, x, y, velX, velY, config, terrain, shooter);
    scene.events.emit('projectile-spawned', projectile);
    
    // Play weapon sound for single-shot weapons
    playWeaponSound(config.type);
    
    // Muzzle flash for single-shot weapons
    if (BULLET_WEAPONS.includes(config.type)) {
      createMuzzleFlash(scene, x, y, angle, 2);
      createShellCasing(scene, x, y, angle);
    }
    
    // Emit event for camera tracking
    scene.events.emit('projectile-created', projectile);
    
    return projectile;
  }
}
