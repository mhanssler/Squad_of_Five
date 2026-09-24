import { describe, expect, it } from 'vitest';
import {
  chooseAIAreaStrikeTargetX,
  chooseAIGrappleDestination,
  chooseAIRecoveryAction,
  chooseSpacedDestinationX,
} from '../src/systems/AITactics';

describe('AI tactical movement', () => {
  it('chooses an open formation lane instead of bunching at the preferred point', () => {
    const destination = chooseSpacedDestinationX({
      originX: 900,
      goalX: 200,
      preferredX: 600,
      worldWidth: 1200,
      squadIndex: 0,
      allyXs: [596, 610],
      minimumSpacing: 76,
    });

    expect(Math.abs(destination - 600)).toBeGreaterThan(50);
    expect(Math.min(...[596, 610].map(x => Math.abs(destination - x)))).toBeGreaterThan(60);
    expect(destination).toBeLessThan(900);
  });

  it('digs through a true obstruction before spending a grapple', () => {
    expect(chooseAIRecoveryAction({
      reason: 'blocked',
      distanceMoved: 12,
      requestedDistance: 180,
      expandedMode: true,
      movementRemaining: 140,
      tunnelMovementCost: 72,
      tunnelsRemaining: 2,
      canTunnel: true,
      grapplesRemaining: 1,
      hasGrappleDestination: true,
    })).toBe('tunnel');
  });

  it('uses a grapple for cliffs and falls back cleanly when no landing exists', () => {
    const base = {
      distanceMoved: 55,
      requestedDistance: 180,
      expandedMode: true,
      movementRemaining: 140,
      tunnelMovementCost: 72,
      tunnelsRemaining: 2,
      canTunnel: false,
      grapplesRemaining: 1,
    };

    expect(chooseAIRecoveryAction({
      ...base,
      reason: 'cliff',
      hasGrappleDestination: true,
    })).toBe('grapple');
    expect(chooseAIRecoveryAction({
      ...base,
      reason: 'cliff',
      hasGrappleDestination: false,
    })).toBe('none');
  });

  it('selects a clear, forward grapple landing with useful separation', () => {
    const destination = chooseAIGrappleDestination({
      originX: 800,
      originY: 400,
      goalX: 200,
      worldWidth: 1200,
      allyXs: [590],
      candidates: [
        { x: 720, y: 360, pathClear: false, bodyClear: true, stableLanding: true },
        { x: 600, y: 390, pathClear: true, bodyClear: true, stableLanding: true },
        { x: 500, y: 330, pathClear: true, bodyClear: true, stableLanding: true },
        { x: 470, y: 370, pathClear: true, bodyClear: false, stableLanding: true },
      ],
    });

    expect(destination?.x).toBe(500);
  });

  it('calls area fire on an enemy cluster but rejects a friendly-contested cluster', () => {
    const clearPlan = chooseAIAreaStrikeTargetX([
      { x: 420, allegiance: 'enemy' },
      { x: 500, allegiance: 'enemy' },
      { x: 900, allegiance: 'friendly' },
    ], 1200);
    const contestedPlan = chooseAIAreaStrikeTargetX([
      { x: 420, allegiance: 'enemy' },
      { x: 500, allegiance: 'enemy' },
      { x: 455, allegiance: 'friendly' },
    ], 1200);

    expect(clearPlan?.enemyHits).toBe(2);
    expect(clearPlan?.friendlyHits).toBe(0);
    expect(clearPlan?.score).toBeGreaterThan(0);
    expect(contestedPlan?.score).toBeLessThan(0);
  });
});
