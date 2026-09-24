import { describe, expect, it } from 'vitest';
import { moveCharacter } from '../src/systems/CharacterPhysics';

describe('production character sweep', () => {
  it('recovers a shallow landing overlap without locking horizontal movement', () => {
    const floor = (_x: number, y: number) => y >= 100;
    const result = moveCharacter({ x: 40, y: 87, grounded: true }, 50, 87, floor, 300);
    expect(result.x).toBe(50);
    expect(result.y).toBe(84);
  });
  it('steps over a four-pixel irregularity but not a wall', () => {
    const terrain = (x: number, y: number) => y >= (x >= 50 ? 96 : 100);
    const result = moveCharacter({ x: 40, y: 84, grounded: true }, 65, 84, terrain, 300);
    expect(result.x).toBe(65);
    expect(result.y).toBe(80);
  });
  it('does not cancel a jump before Arcade has advanced its first step', () => {
    const result = moveCharacter({ x: 50, y: 84, grounded: true }, 50, 84, (_x, y) => y >= 100, 300, true);
    expect(result.grounded).toBe(false);
    expect(result.blockedY).toBe(false);
  });
  it('walks both ways on a floor without vertical bouncing', () => {
    const floor = (_x: number, y: number) => y >= 100;
    const right = moveCharacter({ x: 50, y: 84, grounded: true }, 80, 84, floor, 300);
    expect(right).toMatchObject({ x: 80, y: 84, grounded: true, blockedX: false });
    expect(moveCharacter(right, 30, 84, floor, 300)).toMatchObject({ x: 30, y: 84, grounded: true });
  });
  it('climbs a gentle slope without tunneling through it', () => {
    const slope = (x: number, y: number) => y >= 150 - Math.floor(x / 3);
    const result = moveCharacter({ x: 30, y: 124, grounded: true }, 60, 124, slope, 300);
    expect(result.x).toBe(60);
    expect(result.y).toBe(114);
    expect(result.grounded).toBe(true);
  });
  it('blocks a one-pixel wall even across a long frame', () => {
    const wall = (x: number, y: number) => Math.floor(x) === 70 || y >= 100;
    const result = moveCharacter({ x: 30, y: 84, grounded: true }, 120, 84, wall, 300);
    expect(result.x).toBeLessThan(63);
    expect(result.blockedX).toBe(true);
  });
  it('catches a fast fall on a thin cave floor', () => {
    const result = moveCharacter({ x: 50, y: 40, grounded: false }, 50, 200, (_x, y) => Math.floor(y) === 100, 300);
    expect(result.y).toBeLessThanOrEqual(84);
    expect(result.grounded).toBe(true);
  });
  it('stops a rising body at a cave ceiling', () => {
    const result = moveCharacter({ x: 50, y: 84, grounded: false }, 50, 0, (_x, y) => y <= 40, 300, true);
    expect(result.y).toBeGreaterThan(58);
    expect(result.blockedY).toBe(true);
    expect(result.grounded).toBe(false);
  });
  it('leaves a ledge without snapping down a cliff', () => {
    const result = moveCharacter({ x: 30, y: 84, grounded: true }, 70, 84, (x, y) => y >= (x < 50 ? 100 : 200), 300);
    expect(result.y).toBe(84);
    expect(result.grounded).toBe(false);
  });
});
