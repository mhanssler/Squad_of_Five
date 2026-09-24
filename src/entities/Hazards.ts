import Phaser from 'phaser';
import { Terrain } from '../systems/Terrain';
import { SoundManager } from '../utils/SoundManager';

// Explosive barrels and proximity landmines scattered over the battlefield.
// Barrels go off when caught in a blast or shot; mines arm after landing and blow when someone steps close.

export type HazardKind = 'barrel' | 'mine';

export const HAZARD_STATS: Record<HazardKind, { radius: number; damage: number; hitRadius: number }> = {
  barrel: { radius: 85, damage: 50, hitRadius: 12 },
  mine: { radius: 62, damage: 45, hitRadius: 8 },
};

/** How close a soldier must get to set off a mine. */
export const MINE_TRIGGER_DISTANCE = 26;
/** Beeping delay between a mine being tripped and it exploding - time to jump away. */
export const MINE_FUSE_MS = 1100;

interface Hazard {
  kind: HazardKind;
  view: Phaser.GameObjects.Container;
  light: Phaser.GameObjects.Arc | null;
  fallSpeed: number;
  armed: boolean;
  triggered: boolean;
  gone: boolean;
}

interface SoldierLike {
  x: number;
  y: number;
  isAlive(): boolean;
}

export type HazardExplodeFn = (x: number, y: number, radius: number, damage: number, kind: HazardKind) => void;

export class HazardField {
  private hazards: Hazard[] = [];
  private pendingDetonations = 0;
  private token = 0;

  constructor(
    private scene: Phaser.Scene,
    private terrain: Terrain,
    private onExplode: HazardExplodeFn,
  ) {}

  /** Scatter hazards across the map, keeping clear of `avoidXs` (soldier positions). */
  public spawn(worldWidth: number, avoidXs: number[], barrels: number, mines: number): void {
    const taken: number[] = [...avoidXs];
    const pickX = (clearance: number): number | null => {
      for (let attempt = 0; attempt < 40; attempt++) {
        const x = Phaser.Math.Between(90, worldWidth - 90);
        if (taken.every(t => Math.abs(t - x) > clearance)) {
          taken.push(x);
          return x;
        }
      }
      return null;
    };

    for (let i = 0; i < barrels; i++) {
      const x = pickX(80);
      if (x !== null) this.add('barrel', x);
    }
    for (let i = 0; i < mines; i++) {
      const x = pickX(90);
      if (x !== null) this.add('mine', x);
    }
  }

  private add(kind: HazardKind, x: number): void {
    const y = this.terrain.getSurfaceY(x);
    const view = this.scene.add.container(x, y);
    view.setDepth(90);
    let light: Phaser.GameObjects.Arc | null = null;

    if (kind === 'barrel') {
      const g = this.scene.add.graphics();
      g.fillStyle(0xb3261e, 1);
      g.fillRoundedRect(-8, -22, 16, 22, 3);
      g.fillStyle(0x7d1a14, 1);
      g.fillRect(-8, -16, 16, 2);
      g.fillRect(-8, -7, 16, 2);
      g.fillStyle(0xffd21f, 1);
      g.fillTriangle(0, -15, -4, -9, 4, -9);
      g.fillStyle(0x000000, 1);
      g.fillRect(-0.5, -14, 1, 3);
      view.add(g);
    } else {
      const g = this.scene.add.graphics();
      g.fillStyle(0x3d4a36, 1);
      g.fillEllipse(0, -3, 18, 8);
      g.fillStyle(0x59664f, 1);
      g.fillEllipse(0, -5, 10, 5);
      view.add(g);
      light = this.scene.add.circle(0, -7, 1.8, 0xff2222, 1);
      view.add(light);
      this.scene.tweens.add({ targets: light, alpha: 0.15, duration: 600, yoyo: true, repeat: -1 });
    }

    const hazard: Hazard = { kind, view, light, fallSpeed: 0, armed: kind === 'barrel', triggered: false, gone: false };
    this.hazards.push(hazard);

    if (kind === 'mine') {
      // Arm shortly after placement so nothing trips at spawn.
      this.scene.time.delayedCall(1500, () => { hazard.armed = true; });
    }
  }

  public update(dt: number, soldiers: SoldierLike[], worldBottom: number): void {
    for (const h of this.hazards) {
      if (h.gone) continue;

      // Settle onto the terrain; fall if the ground under it was blown away.
      const surface = this.terrain.findSurfaceYAtOrBelow(h.view.x, h.view.y - 6, 12 + h.fallSpeed * dt);
      if (surface !== null) {
        h.view.y = surface;
        h.fallSpeed = 0;
      } else {
        h.fallSpeed = Math.min(900, h.fallSpeed + 900 * dt);
        h.view.y += h.fallSpeed * dt;
        if (h.view.y > worldBottom + 40) this.remove(h);
        continue;
      }

      if (h.kind === 'mine' && h.armed && !h.triggered) {
        const close = soldiers.some(s => s.isAlive() && Phaser.Math.Distance.Between(s.x, s.y + 12, h.view.x, h.view.y) < MINE_TRIGGER_DISTANCE);
        if (close) this.trigger(h, MINE_FUSE_MS);
      }
    }
    this.hazards = this.hazards.filter(h => !h.gone);
  }

  /** An explosion happened: set off anything caught in it (chain reactions). */
  public onExplosion(x: number, y: number, radius: number): void {
    if (radius <= 0) return;
    for (const h of this.hazards) {
      if (h.gone || h.triggered) continue;
      const dist = Phaser.Math.Distance.Between(x, y, h.view.x, h.view.y - 8);
      if (dist <= radius + HAZARD_STATS[h.kind].hitRadius) {
        this.trigger(h, 140 + Math.random() * 180);
      }
    }
  }

  /**
   * Does a projectile moving from (x0,y0) to (x1,y1) hit a barrel? Returns the impact point.
   * (Mines sit flush with the ground, so shots hit the terrain around them instead.)
   */
  public findBarrelHit(x0: number, y0: number, x1: number, y1: number): { x: number; y: number } | null {
    for (const h of this.hazards) {
      if (h.gone || h.triggered || h.kind !== 'barrel') continue;
      const cx = h.view.x;
      const cy = h.view.y - 11;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq > 0 ? Phaser.Math.Clamp(((cx - x0) * dx + (cy - y0) * dy) / lenSq, 0, 1) : 0;
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      if (Phaser.Math.Distance.Between(px, py, cx, cy) <= HAZARD_STATS.barrel.hitRadius) {
        return { x: px, y: py };
      }
    }
    return null;
  }

  /** True while a tripped hazard is counting down, so the turn waits for the boom. */
  public isBusy(): boolean {
    return this.pendingDetonations > 0;
  }

  private trigger(h: Hazard, delayMs: number): void {
    h.triggered = true;
    this.pendingDetonations++;
    const token = this.token;

    if (h.kind === 'mine') {
      SoundManager.playSelect();
      if (h.light) {
        this.scene.tweens.killTweensOf(h.light);
        h.light.setAlpha(1);
        this.scene.tweens.add({ targets: h.light, scale: 2.4, duration: 90, yoyo: true, repeat: Math.floor(delayMs / 180) });
      }
      const warn = this.scene.add.text(h.view.x, h.view.y - 26, 'MINE!', {
        font: 'bold 13px Arial', color: '#ff4444', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(200);
      this.scene.tweens.add({ targets: warn, y: warn.y - 16, alpha: 0, duration: delayMs, onComplete: () => warn.destroy() });
    } else {
      this.scene.tweens.add({ targets: h.view, angle: { from: -6, to: 6 }, duration: 50, yoyo: true, repeat: 2 });
    }

    this.scene.time.delayedCall(delayMs, () => {
      if (token !== this.token) return;
      this.pendingDetonations = Math.max(0, this.pendingDetonations - 1);
      if (h.gone) return;
      const x = h.view.x;
      const y = h.view.y - 8;
      this.remove(h);
      const stats = HAZARD_STATS[h.kind];
      this.onExplode(x, y, stats.radius, stats.damage, h.kind);
    });
  }

  private remove(h: Hazard): void {
    h.gone = true;
    if (h.light) this.scene.tweens.killTweensOf(h.light);
    this.scene.tweens.killTweensOf(h.view);
    h.view.destroy();
  }

  public clear(): void {
    this.token++;
    this.pendingDetonations = 0;
    this.hazards.forEach(h => this.remove(h));
    this.hazards = [];
  }
}
