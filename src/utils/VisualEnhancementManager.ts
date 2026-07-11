import Phaser from 'phaser';
import { WeaponType } from '../systems/WeaponTypes';

type PatchableSoldier = {
  sprite: Phaser.Physics.Arcade.Sprite;
  team: string;
  weapon?: { type?: WeaponType };
  isAlive(): boolean;
  isCurrentlyGrappling?(): boolean;
  update(): void;
  moveLeft(): void;
  moveRight(): void;
  stopMoving(): void;
  jump(): void;
  fire(angle: number, power: number, terrain: unknown): void;
  takeDamage(amount: number): void;
  applyKnockback(forceX: number, forceY: number): void;
  setActive(isActive: boolean): void;
  fallToDeath(): void;
  destroy(): void;
};

type SoldierInternals = PatchableSoldier & {
  scene: Phaser.Scene;
};

type PatchableGameScene = Phaser.Scene & {
  create(): void;
  worldWidth?: number;
  worldHeight?: number;
};

type SoldierVisualState = {
  scene: Phaser.Scene;
  shadow: Phaser.GameObjects.Ellipse;
  selectionGlow: Phaser.GameObjects.Ellipse;
  gearBack: Phaser.GameObjects.Graphics;
  gearFront: Phaser.GameObjects.Graphics;
  baseScaleX: number;
  baseScaleY: number;
  phase: number;
  walking: boolean;
  active: boolean;
  wasAirborne: boolean;
  peakFallSpeed: number;
  groundY: number;
  lastY: number;
  lastDustAt: number;
  recoilStartedAt: number;
  recoilUntil: number;
  hitStartedAt: number;
  hitUntil: number;
  cleaned: boolean;
};

type SceneVisualState = {
  objects: Phaser.GameObjects.GameObject[];
  explosionListener: (x: number, y: number, radius: number) => void;
};

const soldierVisuals = new WeakMap<object, SoldierVisualState>();
const sceneVisuals = new WeakMap<object, SceneVisualState>();
let installed = false;

const BULLET_WEAPONS = new Set<WeaponType>([
  WeaponType.RIFLE,
  WeaponType.SNIPER,
  WeaponType.PISTOL,
  WeaponType.SMG,
  WeaponType.MINIGUN,
  WeaponType.SHOTGUN,
]);

function teamColor(team: string): number {
  return team === 'red' ? 0xff4f45 : 0x4b91ff;
}

function ensureSoldierVisuals(soldier: SoldierInternals): SoldierVisualState | null {
  const existing = soldierVisuals.get(soldier);
  if (existing) return existing.cleaned ? null : existing;

  const scene = soldier.scene;
  const sprite = soldier.sprite;
  if (!scene || !sprite || !sprite.active) return null;

  const color = teamColor(soldier.team);
  const shadow = scene.add.ellipse(sprite.x, sprite.y + 27, 34, 10, 0x000000, 0.32);
  shadow.setDepth(sprite.depth - 2);

  const selectionGlow = scene.add.ellipse(sprite.x, sprite.y + 25, 46, 15, color, 0.04);
  selectionGlow.setStrokeStyle(2, color, 0.65);
  selectionGlow.setBlendMode(Phaser.BlendModes.ADD);
  selectionGlow.setDepth(sprite.depth - 1);
  selectionGlow.setVisible(false);

  const gearBack = scene.add.graphics();
  gearBack.fillStyle(0x172014, 0.95);
  gearBack.fillRoundedRect(-12, -10, 7, 20, 2);
  gearBack.fillStyle(0x4c5d3c, 0.95);
  gearBack.fillRoundedRect(-11, -9, 5, 17, 2);
  gearBack.lineStyle(1, 0x1a2216, 0.9);
  gearBack.lineBetween(-7, -8, 4, 13);
  gearBack.setDepth(sprite.depth - 0.5);

  const gearFront = scene.add.graphics();
  // Collar, belt, pouches and a team armband add readable detail without
  // forcing a complete replacement of every class sprite.
  gearFront.lineStyle(1.5, 0x172014, 0.9);
  gearFront.lineBetween(-5, -10, 0, -6);
  gearFront.lineBetween(5, -10, 0, -6);
  gearFront.fillStyle(0x20291b, 0.92);
  gearFront.fillRect(-7, 7, 14, 2);
  gearFront.fillStyle(0x687651, 0.95);
  gearFront.fillRoundedRect(-6, 9, 5, 5, 1);
  gearFront.fillRoundedRect(1, 9, 5, 5, 1);
  gearFront.fillStyle(0xb5a060, 0.95);
  gearFront.fillRect(-1.5, 7, 3, 2);
  gearFront.fillStyle(color, 0.95);
  gearFront.fillRoundedRect(7, -5, 4, 3, 1);
  gearFront.fillStyle(0xffffff, 0.28);
  gearFront.fillRect(-4, -19, 6, 1);
  gearFront.setDepth(sprite.depth + 0.5);

  const state: SoldierVisualState = {
    scene,
    shadow,
    selectionGlow,
    gearBack,
    gearFront,
    baseScaleX: Math.abs(sprite.scaleX) || 1,
    baseScaleY: Math.abs(sprite.scaleY) || 1,
    phase: Math.random() * Math.PI * 2,
    walking: false,
    active: false,
    wasAirborne: false,
    peakFallSpeed: 0,
    groundY: sprite.y + 27,
    lastY: sprite.y,
    lastDustAt: 0,
    recoilStartedAt: 0,
    recoilUntil: 0,
    hitStartedAt: 0,
    hitUntil: 0,
    cleaned: false,
  };

  soldierVisuals.set(soldier, state);
  return state;
}

function updateSoldierVisuals(soldier: SoldierInternals): void {
  const state = ensureSoldierVisuals(soldier);
  if (!state || state.cleaned || !soldier.sprite.active) return;

  const sprite = soldier.sprite;
  const body = sprite.body as Phaser.Physics.Arcade.Body | null;
  const now = state.scene.time.now;
  const elapsed = now / 1000 + state.phase;
  const velocityX = body?.velocity.x ?? 0;
  const velocityY = body?.velocity.y ?? 0;
  const movedY = Math.abs(sprite.y - state.lastY);
  const grounded = Boolean(
    body &&
    (body.blocked.down || body.touching.down || (Math.abs(velocityY) < 14 && movedY < 1.25)),
  );

  if (grounded) {
    state.groundY = sprite.y + 27;
    if (state.wasAirborne && state.peakFallSpeed > 105) {
      createLandingDust(state.scene, sprite.x, state.groundY, state.peakFallSpeed);
      state.scene.cameras.main.shake(65, Math.min(0.0028, state.peakFallSpeed / 160000));
    }
    state.wasAirborne = false;
    state.peakFallSpeed = 0;
  } else {
    state.wasAirborne = true;
    state.peakFallSpeed = Math.max(state.peakFallSpeed, Math.max(0, velocityY));
  }

  const airDistance = Math.max(0, state.groundY - (sprite.y + 27));
  const shadowScale = Phaser.Math.Clamp(1 - airDistance / 260, 0.38, 1);
  state.shadow.setPosition(sprite.x, state.groundY);
  state.shadow.setScale(shadowScale, shadowScale);
  state.shadow.setAlpha(Phaser.Math.Clamp(0.34 - airDistance / 900, 0.08, 0.34));

  state.selectionGlow.setPosition(sprite.x, state.groundY - 1);
  state.selectionGlow.setVisible(state.active && soldier.isAlive());
  if (state.active) {
    const pulse = (Math.sin(elapsed * 4.2) + 1) * 0.5;
    state.selectionGlow.setScale(0.94 + pulse * 0.12, 0.9 + pulse * 0.08);
    state.selectionGlow.setAlpha(0.3 + pulse * 0.25);
  }

  const grappling = soldier.isCurrentlyGrappling?.() ?? false;
  let scaleX = state.baseScaleX;
  let scaleY = state.baseScaleY;
  let angle = 0;

  if (!grappling && soldier.isAlive()) {
    if (!grounded) {
      const lean = Phaser.Math.Clamp(velocityX / 220, -1, 1);
      angle = lean * 4 + Phaser.Math.Clamp(velocityY / 250, -1, 1) * 1.5;
      scaleY *= 1.018;
      scaleX *= 0.987;
    } else if (state.walking || Math.abs(velocityX) > 18) {
      const stride = Math.sin(elapsed * 13.5);
      const bounce = Math.abs(Math.sin(elapsed * 13.5));
      angle = stride * 1.65;
      scaleY *= 1 - bounce * 0.035;
      scaleX *= 1 + bounce * 0.022;

      if (now - state.lastDustAt > 175 && Math.abs(velocityX) > 55) {
        createFootDust(state.scene, sprite.x - Math.sign(velocityX) * 8, state.groundY);
        state.lastDustAt = now;
      }
    } else {
      const breath = Math.sin(elapsed * 2.25);
      const weightShift = Math.sin(elapsed * 0.72);
      scaleY *= 1 + breath * 0.012;
      scaleX *= 1 - breath * 0.006;
      angle = weightShift * 0.65;
      if (state.active) angle += Math.sin(elapsed * 1.35) * 0.45;
    }

    if (now < state.recoilUntil) {
      const duration = Math.max(1, state.recoilUntil - state.recoilStartedAt);
      const remaining = Phaser.Math.Clamp((state.recoilUntil - now) / duration, 0, 1);
      const facing = sprite.flipX ? -1 : 1;
      angle += facing * -5.5 * remaining;
      scaleX *= 1 - 0.06 * remaining;
      scaleY *= 1 + 0.035 * remaining;
    }

    if (now < state.hitUntil) {
      const duration = Math.max(1, state.hitUntil - state.hitStartedAt);
      const remaining = Phaser.Math.Clamp((state.hitUntil - now) / duration, 0, 1);
      angle += Math.sin((1 - remaining) * Math.PI * 4) * 5.5 * remaining;
      scaleY *= 1 - 0.04 * remaining;
      scaleX *= 1 + 0.035 * remaining;
    }

    sprite.setScale(scaleX, scaleY);
    sprite.setAngle(angle);
  }

  const overlayScaleX = (sprite.flipX ? -1 : 1) * Math.abs(sprite.scaleX);
  const overlayScaleY = Math.abs(sprite.scaleY);
  for (const overlay of [state.gearBack, state.gearFront]) {
    overlay.setPosition(sprite.x, sprite.y);
    overlay.setScale(overlayScaleX, overlayScaleY);
    overlay.setAngle(sprite.angle);
    overlay.setAlpha(sprite.alpha);
    overlay.setVisible(sprite.visible && soldier.isAlive());
  }

  state.lastY = sprite.y;
}

function createFootDust(scene: Phaser.Scene, x: number, y: number): void {
  for (let index = 0; index < 2; index++) {
    const puff = scene.add.circle(
      x + Phaser.Math.FloatBetween(-4, 4),
      y - Phaser.Math.FloatBetween(0, 3),
      Phaser.Math.FloatBetween(2, 4),
      0x8f8068,
      0.28,
    );
    puff.setDepth(12);
    scene.tweens.add({
      targets: puff,
      x: puff.x + Phaser.Math.FloatBetween(-12, 12),
      y: puff.y - Phaser.Math.FloatBetween(4, 10),
      scale: Phaser.Math.FloatBetween(1.8, 2.8),
      alpha: 0,
      duration: Phaser.Math.Between(320, 480),
      ease: 'Sine.easeOut',
      onComplete: () => puff.destroy(),
    });
  }
}

function createLandingDust(scene: Phaser.Scene, x: number, y: number, speed: number): void {
  const count = Phaser.Math.Clamp(Math.round(speed / 35), 5, 12);
  for (let index = 0; index < count; index++) {
    const direction = index % 2 === 0 ? -1 : 1;
    const puff = scene.add.circle(
      x + Phaser.Math.FloatBetween(-8, 8),
      y - 2,
      Phaser.Math.FloatBetween(2.5, 5.5),
      index % 3 === 0 ? 0x6e6454 : 0x9a8d73,
      0.38,
    );
    puff.setDepth(13);
    scene.tweens.add({
      targets: puff,
      x: puff.x + direction * Phaser.Math.FloatBetween(16, 42),
      y: puff.y - Phaser.Math.FloatBetween(5, 18),
      scaleX: Phaser.Math.FloatBetween(2.2, 4),
      scaleY: Phaser.Math.FloatBetween(1.3, 2.3),
      alpha: 0,
      duration: Phaser.Math.Between(420, 720),
      ease: 'Quad.easeOut',
      onComplete: () => puff.destroy(),
    });
  }
}

function createMuzzleEffect(soldier: SoldierInternals, angleDegrees: number): void {
  const state = ensureSoldierVisuals(soldier);
  if (!state || !soldier.sprite.active) return;

  const scene = state.scene;
  const angle = Phaser.Math.DegToRad(angleDegrees);
  const muzzleX = soldier.sprite.x + Math.cos(angle) * 28;
  const muzzleY = soldier.sprite.y - 9 + Math.sin(angle) * 24;
  const flash = scene.add.graphics();
  flash.fillStyle(0xfff2a8, 1);
  flash.fillTriangle(0, -4, 25, 0, 0, 4);
  flash.fillStyle(0xff9f32, 0.95);
  flash.fillTriangle(1, -7, 16, 0, 1, 7);
  flash.fillStyle(0xffffff, 1);
  flash.fillCircle(1, 0, 3);
  flash.setPosition(muzzleX, muzzleY);
  flash.setRotation(angle);
  flash.setBlendMode(Phaser.BlendModes.ADD);
  flash.setDepth(220);
  flash.setScale(0.45);

  scene.tweens.add({
    targets: flash,
    scale: 1.15,
    alpha: 0,
    duration: 95,
    ease: 'Quad.easeOut',
    onComplete: () => flash.destroy(),
  });

  const smoke = scene.add.circle(muzzleX, muzzleY, 3.5, 0xc7c9c8, 0.36);
  smoke.setDepth(205);
  scene.tweens.add({
    targets: smoke,
    x: smoke.x + Math.cos(angle) * 17 + Phaser.Math.FloatBetween(-4, 4),
    y: smoke.y + Math.sin(angle) * 12 - 13,
    scale: 3.2,
    alpha: 0,
    duration: 620,
    ease: 'Sine.easeOut',
    onComplete: () => smoke.destroy(),
  });

  const weaponType = soldier.weapon?.type;
  if (weaponType && BULLET_WEAPONS.has(weaponType)) {
    createShellCasing(scene, soldier.sprite.x, soldier.sprite.y - 8, angle);
  }

  if (weaponType === WeaponType.ROCKET || weaponType === WeaponType.MORTAR || weaponType === WeaponType.MINIGUN) {
    scene.cameras.main.shake(70, 0.0024);
  }
}

function createShellCasing(scene: Phaser.Scene, x: number, y: number, angle: number): void {
  const casing = scene.add.rectangle(x, y, 5, 2, 0xd9ad45, 1);
  casing.setStrokeStyle(1, 0x6b4a17, 0.9);
  casing.setDepth(180);
  casing.setRotation(angle + Math.PI / 2);

  const direction = Math.cos(angle) >= 0 ? -1 : 1;
  scene.tweens.add({
    targets: casing,
    x: x + direction * Phaser.Math.FloatBetween(18, 34),
    y: y - Phaser.Math.FloatBetween(12, 24),
    angle: Phaser.Math.Between(140, 320) * direction,
    duration: 260,
    ease: 'Quad.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: casing,
        y: casing.y + Phaser.Math.FloatBetween(20, 34),
        alpha: 0,
        duration: 360,
        ease: 'Quad.easeIn',
        onComplete: () => casing.destroy(),
      });
    },
  });
}

function createHitAccent(soldier: SoldierInternals, amount: number): void {
  const state = ensureSoldierVisuals(soldier);
  if (!state || !soldier.sprite.active) return;

  const scene = state.scene;
  const ring = scene.add.graphics();
  ring.lineStyle(Math.max(2, Math.min(4, amount / 12)), 0xffb38a, 0.9);
  ring.strokeCircle(0, 0, 12);
  ring.setPosition(soldier.sprite.x, soldier.sprite.y - 5);
  ring.setDepth(215);
  scene.tweens.add({
    targets: ring,
    scale: 2.3,
    alpha: 0,
    duration: 240,
    ease: 'Quad.easeOut',
    onComplete: () => ring.destroy(),
  });

  for (let index = 0; index < Phaser.Math.Clamp(Math.round(amount / 8), 3, 8); index++) {
    const scrap = scene.add.rectangle(
      soldier.sprite.x + Phaser.Math.FloatBetween(-7, 7),
      soldier.sprite.y + Phaser.Math.FloatBetween(-14, 12),
      Phaser.Math.FloatBetween(2, 5),
      Phaser.Math.FloatBetween(1, 3),
      index % 2 === 0 ? 0x667454 : 0x3c472f,
      0.9,
    );
    scrap.setDepth(198);
    scene.tweens.add({
      targets: scrap,
      x: scrap.x + Phaser.Math.FloatBetween(-28, 28),
      y: scrap.y + Phaser.Math.FloatBetween(-25, 18),
      angle: Phaser.Math.Between(-180, 180),
      alpha: 0,
      duration: Phaser.Math.Between(280, 520),
      ease: 'Quad.easeOut',
      onComplete: () => scrap.destroy(),
    });
  }
}

function cleanupSoldierVisuals(soldier: object): void {
  const state = soldierVisuals.get(soldier);
  if (!state || state.cleaned) return;
  state.cleaned = true;

  for (const object of [state.shadow, state.selectionGlow, state.gearBack, state.gearFront]) {
    if (object.active) object.destroy();
  }
  soldierVisuals.delete(soldier);
}

function addBattlefieldDepth(scene: PatchableGameScene): SceneVisualState {
  const oldState = sceneVisuals.get(scene);
  if (oldState) {
    scene.events.off('projectile-explode', oldState.explosionListener);
    oldState.objects.forEach(object => object.destroy());
  }

  const width = scene.worldWidth ?? 2560;
  const height = scene.worldHeight ?? 720;
  const objects: Phaser.GameObjects.GameObject[] = [];

  const moonGlow = scene.add.circle(width * 0.72, 112, 88, 0xd8e8ff, 0.035);
  moonGlow.setBlendMode(Phaser.BlendModes.ADD);
  moonGlow.setScrollFactor(0.05, 0.08);
  moonGlow.setDepth(-85);
  objects.push(moonGlow);

  const moon = scene.add.circle(width * 0.72, 112, 27, 0xdde8ee, 0.78);
  moon.setScrollFactor(0.05, 0.08);
  moon.setDepth(-84);
  objects.push(moon);

  const farHills = scene.add.graphics();
  farHills.fillStyle(0x152238, 0.72);
  farHills.beginPath();
  farHills.moveTo(0, height);
  for (let x = 0; x <= width + 200; x += 140) {
    const y = height - 190 - Math.sin(x * 0.004) * 28 - Math.sin(x * 0.011) * 16;
    farHills.lineTo(x, y);
  }
  farHills.lineTo(width + 200, height);
  farHills.closePath();
  farHills.fillPath();
  farHills.setScrollFactor(0.18, 0.25);
  farHills.setDepth(-70);
  objects.push(farHills);

  const nearHills = scene.add.graphics();
  nearHills.fillStyle(0x1a2b31, 0.72);
  nearHills.beginPath();
  nearHills.moveTo(0, height);
  for (let x = 0; x <= width + 160; x += 90) {
    const y = height - 125 - Math.sin(x * 0.006 + 1.4) * 22 - Math.sin(x * 0.018) * 8;
    nearHills.lineTo(x, y);
  }
  nearHills.lineTo(width + 160, height);
  nearHills.closePath();
  nearHills.fillPath();
  nearHills.setScrollFactor(0.36, 0.45);
  nearHills.setDepth(-60);
  objects.push(nearHills);

  const ruins = scene.add.graphics();
  ruins.fillStyle(0x111a1e, 0.8);
  for (let index = 0; index < Math.max(6, Math.floor(width / 380)); index++) {
    const x = 180 + index * (width / Math.max(6, Math.floor(width / 380))) + Phaser.Math.Between(-70, 70);
    const baseY = height - 132 + Phaser.Math.Between(-12, 10);
    const buildingWidth = Phaser.Math.Between(34, 74);
    const buildingHeight = Phaser.Math.Between(35, 90);
    ruins.fillRect(x, baseY - buildingHeight, buildingWidth, buildingHeight);
    ruins.fillTriangle(
      x - 4,
      baseY - buildingHeight,
      x + buildingWidth * 0.45,
      baseY - buildingHeight - Phaser.Math.Between(8, 25),
      x + buildingWidth,
      baseY - buildingHeight,
    );
    ruins.fillStyle(0x30404a, 0.32);
    for (let windowIndex = 0; windowIndex < 3; windowIndex++) {
      ruins.fillRect(x + 7 + windowIndex * 18, baseY - buildingHeight + 13, 6, 10);
    }
    ruins.fillStyle(0x111a1e, 0.8);
  }
  ruins.setScrollFactor(0.48, 0.56);
  ruins.setDepth(-52);
  objects.push(ruins);

  const horizonHaze = scene.add.rectangle(width / 2, height - 160, width + 500, 190, 0x8ca0aa, 0.045);
  horizonHaze.setScrollFactor(0.25, 0.3);
  horizonHaze.setDepth(-48);
  horizonHaze.setBlendMode(Phaser.BlendModes.SCREEN);
  objects.push(horizonHaze);

  for (let index = 0; index < 14; index++) {
    const smoke = scene.add.circle(
      Phaser.Math.Between(0, width),
      Phaser.Math.Between(Math.round(height * 0.35), Math.round(height * 0.72)),
      Phaser.Math.Between(16, 42),
      index % 2 === 0 ? 0x4f5962 : 0x333b43,
      Phaser.Math.FloatBetween(0.025, 0.065),
    );
    smoke.setScrollFactor(Phaser.Math.FloatBetween(0.25, 0.65));
    smoke.setDepth(-45);
    objects.push(smoke);
    scene.tweens.add({
      targets: smoke,
      x: smoke.x + Phaser.Math.Between(-100, 160),
      y: smoke.y - Phaser.Math.Between(35, 95),
      scale: Phaser.Math.FloatBetween(1.5, 2.8),
      alpha: 0,
      duration: Phaser.Math.Between(14000, 26000),
      repeat: -1,
      onRepeat: () => {
        smoke.setPosition(Phaser.Math.Between(0, width), Phaser.Math.Between(Math.round(height * 0.45), Math.round(height * 0.75)));
        smoke.setScale(1);
        smoke.setAlpha(Phaser.Math.FloatBetween(0.025, 0.065));
      },
    });
  }

  const explosionListener = (x: number, y: number, radius: number): void => {
    if (radius <= 8) return;
    createCinematicExplosion(scene, x, y, radius);
  };
  scene.events.on('projectile-explode', explosionListener);

  const state: SceneVisualState = { objects, explosionListener };
  sceneVisuals.set(scene, state);

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off('projectile-explode', explosionListener);
    objects.forEach(object => object.destroy());
    sceneVisuals.delete(scene);
  });

  return state;
}

function createCinematicExplosion(scene: Phaser.Scene, x: number, y: number, radius: number): void {
  const scale = Phaser.Math.Clamp(radius / 75, 0.55, 1.8);

  const flash = scene.add.circle(x, y, radius * 0.55, 0xfff1b0, 0.72);
  flash.setDepth(225);
  flash.setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: flash,
    scale: 2.2,
    alpha: 0,
    duration: 145,
    ease: 'Quad.easeOut',
    onComplete: () => flash.destroy(),
  });

  const ring = scene.add.graphics();
  ring.lineStyle(Math.max(2, radius * 0.045), 0xffc45a, 0.76);
  ring.strokeCircle(0, 0, radius * 0.38);
  ring.setPosition(x, y);
  ring.setDepth(220);
  ring.setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: ring,
    scale: 2.7,
    alpha: 0,
    duration: 330,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });

  const smokeCount = Phaser.Math.Clamp(Math.round(radius / 7), 7, 18);
  for (let index = 0; index < smokeCount; index++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Phaser.Math.FloatBetween(radius * 0.08, radius * 0.48);
    const smoke = scene.add.circle(
      x + Math.cos(angle) * distance,
      y + Math.sin(angle) * distance * 0.55,
      Phaser.Math.FloatBetween(radius * 0.08, radius * 0.17),
      index % 3 === 0 ? 0x25282c : 0x4a4741,
      Phaser.Math.FloatBetween(0.35, 0.62),
    );
    smoke.setDepth(185 + index * 0.01);
    scene.tweens.add({
      targets: smoke,
      x: smoke.x + Math.cos(angle) * Phaser.Math.FloatBetween(10, radius * 0.55),
      y: smoke.y - Phaser.Math.FloatBetween(radius * 0.25, radius * 0.85),
      scale: Phaser.Math.FloatBetween(2.1, 4.2),
      alpha: 0,
      duration: Phaser.Math.Between(850, 1550),
      ease: 'Sine.easeOut',
      onComplete: () => smoke.destroy(),
    });
  }

  const debrisCount = Phaser.Math.Clamp(Math.round(radius / 6), 8, 24);
  for (let index = 0; index < debrisCount; index++) {
    const angle = Phaser.Math.FloatBetween(Math.PI * 1.08, Math.PI * 1.92);
    const speed = Phaser.Math.FloatBetween(radius * 1.3, radius * 3.2);
    const debris = scene.add.rectangle(
      x,
      y,
      Phaser.Math.FloatBetween(2, 6),
      Phaser.Math.FloatBetween(2, 7),
      index % 4 === 0 ? 0xff9f32 : 0x5f4935,
      0.95,
    );
    debris.setDepth(210);
    scene.tweens.add({
      targets: debris,
      x: x + Math.cos(angle) * speed,
      y: y + Math.sin(angle) * speed + radius * 0.45,
      angle: Phaser.Math.Between(-300, 300),
      alpha: 0,
      duration: Phaser.Math.Between(430, 820),
      ease: 'Quad.easeOut',
      onComplete: () => debris.destroy(),
    });
  }

  for (let index = 0; index < 6; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    const dust = scene.add.ellipse(
      x + Phaser.Math.FloatBetween(-radius * 0.2, radius * 0.2),
      y + radius * 0.15,
      radius * 0.45,
      radius * 0.13,
      0x88755c,
      0.28,
    );
    dust.setDepth(176);
    scene.tweens.add({
      targets: dust,
      x: dust.x + side * Phaser.Math.FloatBetween(radius * 0.35, radius),
      scaleX: Phaser.Math.FloatBetween(2.2, 3.8),
      scaleY: Phaser.Math.FloatBetween(1.2, 2),
      alpha: 0,
      duration: Phaser.Math.Between(520, 850),
      ease: 'Quad.easeOut',
      onComplete: () => dust.destroy(),
    });
  }

  scene.cameras.main.shake(Math.round(90 + 80 * scale), 0.0018 + scale * 0.0012);
}

function patchSoldier(soldierClass: { prototype: object }): void {
  const prototype = soldierClass.prototype as PatchableSoldier;

  const originalUpdate = prototype.update;
  prototype.update = function updateWithVisuals(this: SoldierInternals): void {
    originalUpdate.call(this);
    if (this.isAlive()) updateSoldierVisuals(this);
  };

  const originalMoveLeft = prototype.moveLeft;
  prototype.moveLeft = function moveLeftWithAnimation(this: SoldierInternals): void {
    const state = ensureSoldierVisuals(this);
    if (state) state.walking = true;
    originalMoveLeft.call(this);
  };

  const originalMoveRight = prototype.moveRight;
  prototype.moveRight = function moveRightWithAnimation(this: SoldierInternals): void {
    const state = ensureSoldierVisuals(this);
    if (state) state.walking = true;
    originalMoveRight.call(this);
  };

  const originalStopMoving = prototype.stopMoving;
  prototype.stopMoving = function stopMovingWithAnimation(this: SoldierInternals): void {
    const state = ensureSoldierVisuals(this);
    if (state) state.walking = false;
    originalStopMoving.call(this);
  };

  const originalJump = prototype.jump;
  prototype.jump = function jumpWithAnticipation(this: SoldierInternals): void {
    const state = ensureSoldierVisuals(this);
    originalJump.call(this);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (state && body && body.velocity.y < -50) {
      state.wasAirborne = true;
      createLandingDust(state.scene, this.sprite.x, this.sprite.y + 27, 145);
    }
  };

  const originalFire = prototype.fire;
  prototype.fire = function fireWithRecoil(
    this: SoldierInternals,
    angle: number,
    power: number,
    terrain: unknown,
  ): void {
    const state = ensureSoldierVisuals(this);
    if (state) {
      state.recoilStartedAt = state.scene.time.now;
      state.recoilUntil = state.recoilStartedAt + 190;
      createMuzzleEffect(this, angle);
    }
    originalFire.call(this, angle, power, terrain);
  };

  const originalTakeDamage = prototype.takeDamage;
  prototype.takeDamage = function takeDamageWithReaction(this: SoldierInternals, amount: number): void {
    const state = ensureSoldierVisuals(this);
    originalTakeDamage.call(this, amount);
    if (state) {
      state.hitStartedAt = state.scene.time.now;
      state.hitUntil = state.hitStartedAt + 360;
      createHitAccent(this, amount);
      if (!this.isAlive()) {
        state.scene.time.delayedCall(1550, () => cleanupSoldierVisuals(this));
      }
    }
  };

  const originalApplyKnockback = prototype.applyKnockback;
  prototype.applyKnockback = function knockbackWithAirState(
    this: SoldierInternals,
    forceX: number,
    forceY: number,
  ): void {
    const state = ensureSoldierVisuals(this);
    if (state) {
      state.wasAirborne = true;
      state.peakFallSpeed = Math.max(state.peakFallSpeed, Math.abs(forceY));
    }
    originalApplyKnockback.call(this, forceX, forceY);
  };

  const originalSetActive = prototype.setActive;
  prototype.setActive = function setActiveWithGlow(this: SoldierInternals, isActive: boolean): void {
    const state = ensureSoldierVisuals(this);
    if (state) state.active = isActive;
    originalSetActive.call(this, isActive);
  };

  const originalFallToDeath = prototype.fallToDeath;
  prototype.fallToDeath = function fallToDeathWithCleanup(this: SoldierInternals): void {
    cleanupSoldierVisuals(this);
    originalFallToDeath.call(this);
  };

  const originalDestroy = prototype.destroy;
  prototype.destroy = function destroyWithCleanup(this: SoldierInternals): void {
    cleanupSoldierVisuals(this);
    originalDestroy.call(this);
  };
}

function patchGameScene(gameSceneClass: { prototype: object }): void {
  const prototype = gameSceneClass.prototype as PatchableGameScene;
  const originalCreate = prototype.create;

  prototype.create = function createWithBattlefieldDepth(this: PatchableGameScene): void {
    originalCreate.call(this);
    addBattlefieldDepth(this);
  };
}

export function installVisualEnhancements(
  soldierClass: { prototype: object },
  gameSceneClass: { prototype: object },
): void {
  if (installed) return;
  installed = true;
  patchSoldier(soldierClass);
  patchGameScene(gameSceneClass);
}
