import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));
import { Terrain } from '../src/systems/Terrain';

function context() {
  return {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), ellipse: vi.fn(),
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(64 * 64 * 4) })),
  };
}

function fixture() {
  // Exercise production geometry methods without starting Phaser or rendering a scene.
  const terrain = Object.assign(Object.create(Terrain.prototype), {
    width: 64, height: 64, ctx: context(), solidCtx: context(),
    collisionData: new Uint8ClampedArray(64 * 64 * 4),
    rebuildHeightMapFromPixels: vi.fn(), redrawGrassInArea: vi.fn(), updateDisplay: vi.fn(),
  });
  return terrain;
}

describe('Terrain visual / collision separation', () => {
  it('rebuilds collision exclusively from geometry, never painted pixels', () => {
    const terrain = fixture();
    const pixels = new Uint8ClampedArray(64 * 64 * 4);
    pixels[3] = 255;
    terrain.solidCtx.getImageData.mockReturnValue({ data: pixels });
    terrain.refreshCollisionAndHeightMap(0, 63);
    expect(terrain.collisionData).toBe(pixels);
    expect(terrain.ctx.getImageData).not.toHaveBeenCalled();
    expect(terrain.rebuildHeightMapFromPixels).toHaveBeenCalledWith(pixels, 0, 63);
  });

  it('cuts craters into both layers but paints scorch marks only on the art', () => {
    const terrain = fixture();
    terrain.destroyCircle(30, 30, 10);
    expect(terrain.solidCtx.arc).toHaveBeenCalledExactlyOnceWith(30, 30, 10, 0, Math.PI * 2);
    expect(terrain.ctx.arc).toHaveBeenCalledWith(30, 30, 10, 0, Math.PI * 2);
    expect(terrain.ctx.stroke).toHaveBeenCalledOnce();
    expect(terrain.solidCtx.stroke).not.toHaveBeenCalled();
  });

  it('digs the same tunnel in both layers', () => {
    const terrain = fixture();
    terrain.isPointSolid = () => true;
    expect(terrain.digTunnel(10, 30, 40, 30, 8)).toBe(true);
    expect(terrain.solidCtx.moveTo.mock.calls).toEqual(terrain.ctx.moveTo.mock.calls);
    expect(terrain.solidCtx.lineTo.mock.calls).toEqual(terrain.ctx.lineTo.mock.calls);
    expect(terrain.solidCtx.arc.mock.calls).toEqual(terrain.ctx.arc.mock.calls);
    expect(terrain.solidCtx.stroke).toHaveBeenCalledOnce();
  });

  it('adds the berm and all five sandbags to collision geometry', () => {
    const terrain = fixture();
    terrain.buildCrudeBarrier(10, 40, 1);
    expect(terrain.solidCtx.ellipse).toHaveBeenCalledTimes(6);
    expect(terrain.solidCtx.ellipse.mock.calls).toEqual(terrain.ctx.ellipse.mock.calls);
  });
});
