import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {} }));
vi.mock('../src/utils/SoundManager', () => ({ SoundManager: {} }));
import { Soldier } from '../src/entities/Soldier';

function fixture() {
  const text = { setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(), destroy: vi.fn() };
  return Object.assign(Object.create(Soldier.prototype), {
    active: true, alive: true, grounded: false, isGrappling: false, jumpBufferedUntil: 0,
    jumpForce: -350, suppressed: false, suppressionActiveTurn: false,
    scene: { time: { now: 1000 }, add: { text: () => text } },
    sprite: { x: 0, y: 0, body: { setAllowGravity: vi.fn(), velocity: { y: 0 } }, setVelocityY: vi.fn(), setVelocityX: vi.fn(), setAngle: vi.fn() },
    stopIdleAnimation: vi.fn(), stopWalkingAnimation: vi.fn(), showSpeechBubble: vi.fn(), updateOutline: vi.fn(),
    weaponText: { setVisible: vi.fn() },
  });
}

describe('production soldier actions', () => {
  it('grappling stops at a wall without moving to the surface above a cave', () => {
    const soldier = fixture();
    soldier.sprite.x = 10;
    soldier.sprite.y = 84;
    soldier.sprite.setPosition = (x: number, y: number) => { soldier.sprite.x = x; soldier.sprite.y = y; };
    soldier.sprite.body.reset = vi.fn();
    soldier.grappleTarget = { x: 100, y: 84 };
    soldier.grappleTerrain = { isPointSolid: (x: number) => x >= 50, forgetCollision: vi.fn() };
    soldier.scene.physics = { world: { bounds: { height: 300 } } };
    soldier.grappleElapsed = 0;
    soldier.isGrappling = true;
    soldier.grappleLine = null;
    soldier.updateGrapple(1);
    expect(soldier.sprite.x).toBeLessThan(42);
    expect(soldier.sprite.y).toBe(84);
    expect(soldier.isGrappling).toBe(false);
    expect(soldier.sprite.body.moves).toBe(true);
  });
  it('does not jump again at the apex just because vertical speed is zero', () => {
    const soldier = fixture();
    soldier.jump();
    expect(soldier.sprite.setVelocityY).not.toHaveBeenCalled();
  });
  it('buffers a jump shortly before landing and consumes it exactly once', () => {
    const soldier = fixture();
    soldier.jump();
    soldier.grounded = true;
    soldier.scene.time.now += 80;
    soldier.tryBufferedJump();
    expect(soldier.sprite.setVelocityY).toHaveBeenCalledExactlyOnceWith(-350);
    expect(soldier.grounded).toBe(false);
    soldier.tryBufferedJump();
    expect(soldier.sprite.setVelocityY).toHaveBeenCalledOnce();
  });
  it('expires a buffered jump instead of unexpectedly firing it later', () => {
    const soldier = fixture();
    soldier.jump();
    soldier.grounded = true;
    soldier.scene.time.now += 200;
    soldier.tryBufferedJump();
    expect(soldier.sprite.setVelocityY).not.toHaveBeenCalled();
  });
  it('suppression does not stack and expires after the affected activation', () => {
    const soldier = fixture();
    soldier.active = false;
    soldier.applySuppression();
    soldier.applySuppression();
    expect(soldier.getMovementAllowanceMultiplier()).toBe(0.8);
    soldier.setActive(false);
    expect(soldier.getMovementAllowanceMultiplier()).toBe(0.8);
    soldier.setActive(true);
    soldier.setActive(false);
    expect(soldier.getMovementAllowanceMultiplier()).toBe(1);
  });
});
