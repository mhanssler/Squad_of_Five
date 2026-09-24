import { describe, expect, it } from 'vitest';
import { getHookCastPose } from '../src/systems/SpecialActions';

describe('hook cast staging', () => {
  it('swings the hook around the hand before casting, not the soldier', () => {
    const a = getHookCastPose(0, 20, 50, 200, 0);
    const b = getHookCastPose(0.02, 20, 50, 200, 0);
    expect(a.phase).toBe('windup');
    expect(b.phase).toBe('windup');
    expect(a.x).not.toBe(b.x);
    expect(a.attached).toBe(false);
  });
  it('casts toward the anchor before beginning the pull', () => {
    const cast = getHookCastPose(0.4, 20, 50, 200, 0);
    expect(cast.phase).toBe('cast');
    expect(cast.x).toBeGreaterThan(20);
    expect(cast.x).toBeLessThan(200);
    expect(getHookCastPose(1, 20, 50, 200, 0)).toMatchObject({ x: 200, y: 0, attached: true });
  });
});
