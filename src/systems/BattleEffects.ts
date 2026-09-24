import Phaser from 'phaser';

export function createBattleEffectTextures(scene: Phaser.Scene): void {
  for (let variant = 0; variant < 4; variant++) {
    const key = `battle-smoke-${variant}`;
    if (scene.textures.exists(key)) continue;
    const texture = scene.textures.createCanvas(key, 96, 96);
    if (!texture) continue;
    const ctx = texture.context;
    for (let lobe = 0; lobe < 9; lobe++) {
      const angle = lobe * 2.4 + variant;
      const x = 48 + Math.cos(angle) * 21;
      const y = 48 + Math.sin(angle) * 18;
      const gradient = ctx.createRadialGradient(x - 5, y - 8, 1, x, y, 26);
      gradient.addColorStop(0, '#a7aaa1');
      gradient.addColorStop(0.5, '#656e6b');
      gradient.addColorStop(1, 'rgba(43,51,52,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - 26, y - 26, 52, 52);
    }
    texture.refresh();
  }
}

export function playBattleExplosion(scene: Phaser.Scene, x: number, y: number, radius: number): void {
  createBattleEffectTextures(scene);
  const size = Phaser.Math.Clamp(radius, 16, 120);
  const flash = scene.add.graphics().setPosition(x, y).setDepth(205);
  flash.fillStyle(0xffd77b, 0.9);
  flash.beginPath();
  for (let i = 0; i < 24; i++) {
    const angle = i * Math.PI / 12;
    const r = size * (i % 2 ? 0.28 : 0.8 + Math.random() * 0.3);
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) flash.moveTo(px, py); else flash.lineTo(px, py);
  }
  flash.closePath().fillPath();
  flash.setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: flash, alpha: 0, scale: 1.3, duration: 140, onComplete: () => flash.destroy() });

  for (let i = 0; i < 10; i++) {
    const angle = i * 2.4;
    const cloud = scene.add.image(x + Math.cos(angle) * size * 0.18, y + Math.sin(angle) * size * 0.15, `battle-smoke-${i % 4}`);
    cloud.setDepth(198).setDisplaySize(size * 0.8, size * 0.8).setAlpha(0);
    cloud.setTint(i < 4 ? 0xffaf62 : 0x8a9491);
    const initialScale = cloud.scaleX;
    scene.tweens.add({ targets: cloud, alpha: 0.8, duration: 80, delay: i * 22 });
    scene.tweens.add({
      targets: cloud, x: cloud.x + Math.cos(angle) * size * 0.6 + 18,
      y: cloud.y - size * (0.6 + i * 0.09), scale: initialScale * 2.2,
      angle: Math.sin(angle) * 35, duration: 1400 + i * 75, ease: 'Cubic.easeOut',
    });
    scene.tweens.add({ targets: cloud, alpha: 0, delay: 300 + i * 25, duration: 1100, onComplete: () => {
      scene.tweens.killTweensOf(cloud);
      cloud.destroy();
    } });
  }
  const debris = scene.add.particles(x, y, 'explosion-particle', {
    emitting: false, speed: { min: 70, max: size * 4 }, angle: { min: 205, max: 335 },
    gravityY: 480, lifespan: { min: 350, max: 1000 },
    scale: { start: 0.35, end: 0.05 }, tint: [0x8e9a91, 0x504b40, 0xe7bd70],
    alpha: { start: 1, end: 0 },
  }).setDepth(202);
  debris.explode(24);
  scene.time.delayedCall(1100, () => debris.destroy());
  scene.cameras.main.shake(150, Math.min(0.009, size / 16000));
}
