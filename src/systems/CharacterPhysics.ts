import { findWalkableSurfaceY } from './Locomotion';
import type { SolidQuery } from './Ballistics';

export interface CharacterPosition { x: number; y: number; grounded: boolean }

export function bodyClear(x: number, y: number, solid: SolidQuery): boolean {
  for (let ox = -8; ox <= 8; ox += 2) {
    for (let oy = -18; oy <= 14; oy += 2) {
      // Rounded feet clear a slope while the torso still collides with walls.
      if (oy > 6 && Math.abs(ox) > (16 - oy) * 0.7) continue;
      if (solid(x + ox, y + oy)) return false;
    }
  }
  return true;
}

export function moveCharacter(previous: CharacterPosition, targetX: number, targetY: number, solid: SolidQuery, height: number, rising = false) {
  let { x, y, grounded } = previous;
  // Resolve shallow contact from landings/terrain edits, never search for a distant surface.
  if (!bodyClear(x, y, solid)) {
    for (let lift = 1; lift <= 4; lift++) {
      if (bodyClear(x, y - lift, solid)) { y -= lift; break; }
    }
  }
  let blockedX = false, blockedY = false;
  const dx = targetX - x, dy = targetY - y;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  grounded = grounded && !rising;
  for (let i = 0; i < steps; i++) {
    const nextX = x + dx / steps;
    let nextY = y;
    let supported = false;
    if (grounded) {
      const floors = [-2, 0, 2].map(offset =>
        findWalkableSurfaceY(y + 16, 4, 3, height, py => solid(nextX + offset, py)))
        .filter((floor): floor is number => floor !== null).sort((a, b) => a - b);
      for (const floor of floors) {
        if (floor - (y + 16) < -4 || floor - (y + 16) > 3) continue;
        if (bodyClear(nextX, floor - 16, solid)) {
          nextY = floor - 16;
          supported = true;
          break;
        }
      }
    }
    if (bodyClear(nextX, nextY, solid)) { x = nextX; y = nextY; }
    else { blockedX = true; supported = grounded; }
    grounded = supported;
    if (!grounded) {
      const stepY = dy / steps;
      if (bodyClear(x, y + stepY, solid) && !(!rising && stepY >= 0 && solid(x, y + stepY + 16))) y += stepY;
      else { blockedY = true; grounded = !rising && stepY >= 0; }
      if (!rising && !grounded && solid(x, y + 17)) grounded = true;
    }
  }
  return { x, y, grounded, blockedX, blockedY };
}
