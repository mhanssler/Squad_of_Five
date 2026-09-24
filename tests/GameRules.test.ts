import { describe, expect, it } from 'vitest';
import {
  RELAY_CAPTURE_RADIUS,
  getTunnelPlan,
  resolveRelayControl,
} from '../src/systems/GameRules';

describe('Expanded game rules', () => {
  it('plans tunnels in the aimed horizontal direction and inside world bounds', () => {
    const right = getTunnelPlan(400, 300, -35, 1280);
    const left = getTunnelPlan(400, 300, -145, 1280);

    expect(right.facing).toBe(1);
    expect(right.endX).toBeGreaterThan(right.startX);
    expect(right.endY).toBeLessThan(right.startY);
    expect(left.facing).toBe(-1);
    expect(left.endX).toBeLessThan(left.startX);

    const edge = getTunnelPlan(1268, 300, 0, 1280);
    expect(edge.endX).toBeLessThanOrEqual(1252);
  });

  it('digs level routes and downward routes as aimed', () => {
    const level = getTunnelPlan(400, 300, 0, 1280);
    const down = getTunnelPlan(400, 300, 35, 1280);
    expect(level.endY).toBe(level.startY);
    expect(down.endY).toBeGreaterThan(down.startY);
  });

  it('resolves uncontested and contested relay control', () => {
    expect(resolveRelayControl([RELAY_CAPTURE_RADIUS - 1], [RELAY_CAPTURE_RADIUS + 1])).toBe('red');
    expect(resolveRelayControl([RELAY_CAPTURE_RADIUS + 1], [RELAY_CAPTURE_RADIUS - 1])).toBe('blue');
    expect(resolveRelayControl([40], [60])).toBe('contested');
    expect(resolveRelayControl([120], [160])).toBe('neutral');
  });
});
