import Phaser from 'phaser';
import { Soldier } from '../entities/Soldier';
import { Terrain } from '../systems/Terrain';
import { Team } from '../systems/TurnManager';
import { WeaponType } from '../systems/WeaponTypes';
import { BattlefieldSky } from '../systems/BattlefieldSky';
import { playBattleExplosion } from '../systems/BattleEffects';
import { createProjectile } from '../entities/Projectile';
import { WEAPONS } from '../systems/WeaponTypes';
import { getTunnelPlan } from '../systems/GameRules';

export class VisualTestScene extends Phaser.Scene {
  private terrain!: Terrain;
  private soldiers: Soldier[] = [];
  private sky!: BattlefieldSky;
  private walking = false;
  private direction = 1;
  private homeX = 0;

  constructor() { super('VisualTestScene'); }

  create(): void {
    this.walking = false;
    this.direction = 1;
    this.cameras.main.setBackgroundColor('#263b43');
    const backdrop = this.add.graphics().setDepth(-15);
    for (let layer = 0; layer < 3; layer++) {
      backdrop.fillStyle([0x354a50, 0x40554f, 0x293f3c][layer]);
      backdrop.beginPath();
      backdrop.moveTo(0, 720);
      for (let x = 0; x <= 1280; x += 32) {
        backdrop.lineTo(x, 260 + layer * 55 + Math.sin(x / 170 + layer) * 35);
      }
      backdrop.lineTo(1280, 720);
      backdrop.closePath().fillPath();
    }
    this.terrain = new Terrain(this, 1280, 720, 1944, { preset: 'caves' });
    this.sky = new BattlefieldSky(this, 1280, 720, x => this.terrain.getSurfaceY(x));
    // Select a broad patch for comparing the stride against the real collision surface.
    let bestX = 180;
    let bestSpread = Infinity;
    for (let x = 100; x < 1000; x += 16) {
      const samples = [-40, 0, 40].map(offset => this.terrain.getSurfaceY(x + offset));
      const spread = Math.max(...samples) - Math.min(...samples);
      if (spread < bestSpread && Math.max(...samples) < 580) { bestX = x; bestSpread = spread; }
    }
    this.homeX = bestX;
    this.soldiers = [
      new Soldier(this, bestX, this.terrain.getSurfaceY(bestX) - 16, Team.RED, 'US RIFLEMAN', 0, false, WeaponType.RIFLE, 'united-states'),
      new Soldier(this, bestX + 180, this.terrain.getSurfaceY(bestX + 180) - 16, Team.BLUE, 'GERMAN RIFLEMAN', 1, false, WeaponType.RIFLE, 'germany'),
    ];
    this.soldiers[0].setActive(true);
    this.soldiers[0].setMoveSpeed(100);
    this.soldiers[1].sprite.setFlipX(true);
    this.add.rectangle(640, 36, 1280, 72, 0x101c20, 0.96).setDepth(400);
    this.add.text(24, 20, 'SQUAD OF FIVE / FIELD STUDY', { font: 'bold 22px Arial', color: '#e4ebe3' }).setDepth(401);
    const button = (x: number, text: string, action: () => void, y = 28): void => {
      const label = this.add.text(x, y, text, { font: 'bold 14px Arial', color: '#c8dfcf' }).setDepth(401);
      label.setInteractive({ useHandCursor: true }).on('pointerdown', action);
    };
    button(610, 'WALK / STOP', () => { this.walking = !this.walking; });
    button(765, 'DETONATE', () => this.detonate());
    button(900, 'RESET', () => this.scene.restart());
    button(1005, 'PLAY GAME', () => this.scene.start('MenuScene'));
    this.add.rectangle(640, 90, 1280, 36, 0x101c20, 0.96).setDepth(400);
    button(610, 'JUMP', () => this.soldiers[0].jump(), 82);
    button(765, 'GRAPPLE', () => {
      this.walking = false;
      const x = this.homeX + 230;
      this.soldiers[0].startGrapple(x, this.terrain.getSurfaceY(x) + 3, this.terrain);
    }, 82);
    button(900, 'GRENADE', () => {
      const s = this.soldiers[0];
      createProjectile(this, s.x + 18, s.y - 20, -40, 20, WEAPONS[WeaponType.GRENADE], this.terrain, s);
    }, 82);
    button(1005, 'DIG', () => {
      const s = this.soldiers[0];
      const plan = getTunnelPlan(s.x, s.y, 20, 1280);
      this.terrain.digTunnel(plan.startX, plan.startY, plan.endX, plan.endY, plan.radius);
    }, 82);
    button(1100, 'COVER', () => {
      const s = this.soldiers[0];
      this.terrain.buildCrudeBarrier(s.x, s.y + 16, 1);
    }, 82);
    this.events.on('projectile-explode', this.onExplosion, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('projectile-explode', this.onExplosion, this);
      this.sky.destroy();
      this.soldiers.forEach(soldier => soldier.destroy());
    });
  }

  private onExplosion(x: number, y: number, radius: number): void {
    this.terrain.destroyCircle(x, y, radius);
    playBattleExplosion(this, x, y, radius);
  }

  private detonate(): void {
    const x = Math.min(1150, this.homeX + 270);
    const y = this.terrain.getSurfaceY(x) + 8;
    this.terrain.destroyCircle(x, y, 48);
    playBattleExplosion(this, x, y, 64);
  }

  update(_time: number, delta: number): void {
    if (!this.terrain) return;
    const dt = Math.min(delta, 50) / 1000;
    this.sky.update(dt);
    const walker = this.soldiers[0];
    if (walker.x > this.homeX + 38) this.direction = -1;
    if (walker.x < this.homeX - 38) this.direction = 1;
    if (this.walking) {
      if (this.direction > 0) walker.moveRight(); else walker.moveLeft();
    } else walker.stopMoving();
    for (const soldier of this.soldiers) {
      soldier.update(dt, this.terrain);
      soldier.setGrounded(soldier.isCurrentlyGrappling() ? false : this.terrain.checkCollision(soldier.sprite));
    }
  }
}
