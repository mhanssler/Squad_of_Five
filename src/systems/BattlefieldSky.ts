import Phaser from 'phaser';

type SkyCloud = {
  container: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Graphics;
  speed: number;
};

type Searchlight = {
  beam: Phaser.GameObjects.Graphics;
  baseX: number;
};

export class BattlefieldSky {
  private clouds: SkyCloud[] = [];
  private searchlights: Searchlight[] = [];
  private tracerTimer: Phaser.Time.TimerEvent | null = null;
  private burstTimer: Phaser.Time.TimerEvent | null = null;
  private active = true;

  constructor(
    private scene: Phaser.Scene,
    private worldWidth: number,
    private worldHeight: number,
    private getSurfaceY: (x: number) => number,
  ) {
    this.createClouds();
    this.createSearchlights();
    this.scheduleTracerBurst();
    this.scheduleSkyBurst();
  }

  public update(dt: number): void {
    for (const cloud of this.clouds) {
      cloud.container.x += cloud.speed * dt;
      const margin = 170 * cloud.container.scaleX;
      if (cloud.speed > 0 && cloud.container.x > this.worldWidth + margin) {
        cloud.container.x = -margin;
      } else if (cloud.speed < 0 && cloud.container.x < -margin) {
        cloud.container.x = this.worldWidth + margin;
      }
    }
  }

  public refreshGroundAnchors(): void {
    for (const searchlight of this.searchlights) {
      searchlight.beam.y = this.getSurfaceY(searchlight.baseX) + 4;
    }
  }

  public destroy(): void {
    this.active = false;
    this.tracerTimer?.remove(false);
    this.burstTimer?.remove(false);
    this.clouds.forEach(cloud => cloud.container.destroy(true));
    this.searchlights.forEach(searchlight => searchlight.beam.destroy());
    this.clouds = [];
    this.searchlights = [];
  }

  private createClouds(): void {
    const count = Math.max(6, Math.round(this.worldWidth / 360));
    for (let i = 0; i < count; i++) {
      const container = this.scene.add.container(
        (i + 0.35 + Math.random() * 0.3) * (this.worldWidth / count),
        78 + Math.random() * 220,
      );
      container.setDepth(-7);
      const scale = 0.72 + Math.random() * 0.64;
      container.setScale(scale);

      const base = this.scene.add.graphics();
      this.drawCloud(base, 0x263849, 0.30);
      const glow = this.scene.add.graphics();
      this.drawCloud(glow, 0xc4d9e8, 0.72);
      glow.setAlpha(0);
      glow.setBlendMode(Phaser.BlendModes.ADD);
      container.add([base, glow]);

      this.scene.tweens.add({
        targets: container,
        y: container.y + 4 + Math.random() * 5,
        duration: 4200 + Math.random() * 3600,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });

      this.clouds.push({
        container,
        glow,
        speed: (Math.random() < 0.22 ? -1 : 1) * (4 + Math.random() * 8),
      });
    }
  }

  private drawCloud(graphics: Phaser.GameObjects.Graphics, color: number, alpha: number): void {
    graphics.fillStyle(color, alpha);
    graphics.fillEllipse(-48, 3, 112, 28);
    graphics.fillEllipse(-14, -8, 78, 38);
    graphics.fillEllipse(31, -3, 92, 31);
    graphics.fillEllipse(67, 5, 58, 22);
  }

  private createSearchlights(): void {
    const count = Math.max(3, Math.round(this.worldWidth / 1000));
    for (let i = 0; i < count; i++) {
      const baseX = this.worldWidth * ((i + 0.55) / count);
      const length = 300 + Math.random() * 110;
      const halfWidth = 62 + Math.random() * 24;
      const beam = this.scene.add.graphics();
      beam.fillStyle(0xfff0bf, 0.065);
      beam.fillTriangle(-7, 0, -halfWidth, -length, halfWidth, -length);
      beam.fillStyle(0xfff6d5, 0.045);
      beam.fillTriangle(-3, 0, -halfWidth * 0.34, -length, halfWidth * 0.34, -length);
      beam.lineStyle(1, 0xfff4ce, 0.10);
      beam.lineBetween(0, 0, 0, -length);
      beam.setPosition(baseX, this.getSurfaceY(baseX) + 4);
      beam.setDepth(-8);
      beam.setBlendMode(Phaser.BlendModes.ADD);

      const sweep = 15 + Math.random() * 13;
      this.scene.tweens.add({
        targets: beam,
        angle: { from: -sweep, to: sweep },
        duration: 5200 + Math.random() * 3600,
        delay: Math.random() * 1800,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
      this.searchlights.push({ beam, baseX });
    }
  }

  private scheduleTracerBurst(): void {
    if (!this.active) return;
    this.tracerTimer = this.scene.time.delayedCall(2200 + Math.random() * 2800, () => {
      if (!this.active) return;
      this.spawnTracerBurst();
      this.scheduleTracerBurst();
    });
  }

  private spawnTracerBurst(): void {
    const camera = this.scene.cameras.main;
    const direction = Math.random() < 0.5 ? -1 : 1;
    const startX = camera.scrollX + (direction > 0 ? -55 : camera.width + 55);
    const travel = 360 + Math.random() * 420;
    const startY = 115 + Math.random() * Math.min(210, this.worldHeight * 0.35);
    const rise = (Math.random() - 0.5) * 95;
    const count = 2 + Math.floor(Math.random() * 4);

    for (let i = 0; i < count; i++) {
      this.scene.time.delayedCall(i * (55 + Math.random() * 30), () => {
        if (!this.active) return;
        const offsetY = i * 4 + (Math.random() - 0.5) * 9;
        const endX = startX + direction * travel;
        const endY = startY + rise + offsetY;
        const angle = Math.atan2(endY - (startY + offsetY), endX - startX);
        const tracer = this.scene.add.rectangle(
          startX,
          startY + offsetY,
          36 + Math.random() * 18,
          2,
          Math.random() < 0.24 ? 0xff7a55 : 0xffd27a,
          0.82,
        );
        tracer.setDepth(-5);
        tracer.setRotation(angle);
        tracer.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
          targets: tracer,
          x: endX,
          y: endY,
          alpha: 0,
          duration: 420 + Math.random() * 260,
          ease: 'Linear',
          onComplete: () => tracer.destroy(),
        });
      });
    }
  }

  private scheduleSkyBurst(): void {
    if (!this.active) return;
    this.burstTimer = this.scene.time.delayedCall(6200 + Math.random() * 6200, () => {
      if (!this.active) return;
      this.spawnSkyBurst();
      this.scheduleSkyBurst();
    });
  }

  private spawnSkyBurst(): void {
    const camera = this.scene.cameras.main;
    const x = Phaser.Math.Clamp(
      camera.scrollX + camera.width * (0.16 + Math.random() * 0.68),
      50,
      this.worldWidth - 50,
    );
    const y = 90 + Math.random() * 190;
    const flash = this.scene.add.graphics();
    flash.fillStyle(0xe8f3ff, 0.85);
    flash.fillCircle(0, 0, 5);
    flash.fillStyle(0x9fc8ed, 0.16);
    flash.fillCircle(0, 0, 18);
    flash.lineStyle(2, 0xdceeff, 0.70);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4 + Math.random() * 0.18;
      const inner = 7 + Math.random() * 5;
      const outer = 22 + Math.random() * 20;
      flash.lineBetween(
        Math.cos(angle) * inner,
        Math.sin(angle) * inner,
        Math.cos(angle) * outer,
        Math.sin(angle) * outer,
      );
    }
    flash.setPosition(x, y);
    flash.setDepth(-4);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: flash,
      scale: 2.6,
      alpha: 0,
      duration: 620,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });

    const nearestCloud = [...this.clouds]
      .sort((a, b) => Math.abs(a.container.x - x) - Math.abs(b.container.x - x))[0];
    for (const cloud of this.clouds) {
      const distance = Phaser.Math.Distance.Between(cloud.container.x, cloud.container.y, x, y);
      if (cloud !== nearestCloud && distance > 430) continue;
      const targetAlpha = Phaser.Math.Clamp(0.62 - distance / 900, 0.20, 0.58);
      this.scene.tweens.killTweensOf(cloud.glow);
      cloud.glow.setAlpha(0);
      this.scene.tweens.add({
        targets: cloud.glow,
        alpha: targetAlpha,
        duration: 90,
        hold: 170,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }
  }
}
