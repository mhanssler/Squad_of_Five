import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {} }));
vi.mock('../src/utils/SoundManager', () => ({ SoundManager: {} }));
import { FlameJet } from '../src/entities/Projectile';

describe('production flame update', () => {
  it.each([30, 60, 144])('delivers six waves in half a second at %i FPS', fps => {
    const flame = Object.assign(Object.create(FlameJet.prototype), {
      isActive: true, elapsed: 0, tickCount: 0, maxTicks: 30,
      createFlameParticle: vi.fn(), dealDamageAlongPath: vi.fn(),
    });
    flame.destroy = vi.fn(() => { flame.isActive = false; });
    for (let frame = 0; frame < fps; frame++) flame.update(frame * 1000 / fps, 1000 / fps);
    expect(flame.dealDamageAlongPath).toHaveBeenCalledTimes(6);
    expect(flame.createFlameParticle).toHaveBeenCalledTimes(30);
    expect(flame.destroy).toHaveBeenCalledOnce();
    expect(flame.elapsed).toBeCloseTo(0.5);
  });
});
