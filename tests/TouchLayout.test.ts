import { describe, expect, it } from 'vitest';
import { findOverlaps, getTouchButtons, type TouchContext, type TouchPhase } from '../src/systems/TouchLayout';

const ctx = (o: Partial<TouchContext> = {}): TouchContext => ({
  phase: 'turn',
  isOperations: true,
  isMedic: false,
  hasCrateWeapon: false,
  crateWeaponArmed: false,
  airstrikeCharges: 0,
  artilleryCharges: 0,
  canDetonate: false,
  ...o,
});
const ids = (c: TouchContext) => getTouchButtons(c).map(b => b.id);

describe('Touch layout', () => {
  it('shows nothing while the player cannot act', () => {
    for (const phase of ['menu', 'intro', 'waiting'] as TouchPhase[]) {
      expect(getTouchButtons(ctx({ phase }))).toEqual([]);
    }
  });

  it('offers movement, aiming and a hold-to-fire button on a turn', () => {
    const buttons = getTouchButtons(ctx());
    expect(ids(ctx())).toEqual(expect.arrayContaining(['left', 'right', 'jump', 'aimUp', 'aimDown', 'fire', 'grapple', 'back']));
    expect(buttons.find(b => b.id === 'fire')?.keys).toEqual(['SPACE']);
  });

  it('maps tunnel and cover to the same keys as the keyboard, per ruleset', () => {
    const ops = getTouchButtons(ctx({ isOperations: true }));
    expect(ops.find(b => b.id === 'tunnel')?.keys).toEqual(['B']);
    expect(ops.find(b => b.id === 'cover')?.keys).toEqual(['SHIFT', 'B']);
    const basic = getTouchButtons(ctx({ isOperations: false }));
    expect(basic.find(b => b.id === 'tunnel')).toBeUndefined();
    expect(basic.find(b => b.id === 'cover')?.keys).toEqual(['B']);
  });

  it('only shows abilities the soldier actually has', () => {
    expect(ids(ctx())).not.toEqual(expect.arrayContaining(['heal']));
    expect(ids(ctx({ isMedic: true, hasCrateWeapon: true, airstrikeCharges: 1, artilleryCharges: 2 })))
      .toEqual(expect.arrayContaining(['heal', 'special', 'airstrike', 'howitzer']));
    expect(getTouchButtons(ctx({ hasCrateWeapon: true, crateWeaponArmed: true })).find(b => b.id === 'special')?.label).toBe('PUT AWAY');
  });

  it('has confirm/cancel for previews, cancel for airstrike targeting, and NEW GAME at the end', () => {
    expect(ids(ctx({ phase: 'preview' }))).toEqual(expect.arrayContaining(['confirm', 'cancel']));
    expect(ids(ctx({ phase: 'airstrike' }))).toEqual(['cancel']);
    expect(getTouchButtons(ctx({ phase: 'gameover' }))[0].keys).toEqual(['N']);
    expect(ids(ctx({ phase: 'selecting' }))).toEqual(['prev', 'next', 'select']);
  });

  it('only shows the detonate button while a goat is walking', () => {
    expect(ids(ctx({ phase: 'afterShot', canDetonate: true }))).toEqual(['detonate']);
    expect(ids(ctx({ phase: 'afterShot', canDetonate: false }))).toEqual([]);
  });

  it('never overlaps buttons and keeps them on screen, even with every ability available', () => {
    const phases: TouchPhase[] = ['selecting', 'turn', 'preview', 'airstrike', 'howitzer', 'afterShot', 'gameover'];
    for (const phase of phases) {
      for (const isOperations of [true, false]) {
        const buttons = getTouchButtons(ctx({
          phase, isOperations, isMedic: true, hasCrateWeapon: true, airstrikeCharges: 1, artilleryCharges: 1, canDetonate: true,
        }));
        expect(findOverlaps(buttons), `${phase} ops=${isOperations}`).toEqual([]);
        for (const b of buttons) {
          expect(b.x - b.radius).toBeGreaterThanOrEqual(0);
          expect(b.x + b.radius).toBeLessThanOrEqual(1280);
          expect(b.y - b.radius).toBeGreaterThanOrEqual(0);
          expect(b.y + b.radius).toBeLessThanOrEqual(720);
        }
      }
    }
  });
});
