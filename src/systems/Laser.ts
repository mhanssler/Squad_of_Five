// Laser beam tracing. The laser is instant and perfectly straight (no gravity, no wind),
// pierces every soldier along its line, and burns through a limited depth of terrain.
// Phaser-free so the game, the aim preview and the AI all share (and tests pin) one model.

export const LASER_RANGE = 1100;
/** Solid terrain the beam can burn through before it is spent. */
export const LASER_BURN_DEPTH = 80;
export const LASER_DAMAGE = 45;
/** Half-width of the beam for hitting soldiers. */
export const LASER_HIT_RADIUS = 14;
/** Radius of the channel the beam cuts through terrain. */
export const LASER_CHANNEL_RADIUS = 4;

export interface LaserTarget {
  x: number;
  y: number;
}

export interface LaserTraceOptions {
  x: number;
  y: number;
  /** Degrees, 0 = right, positive = down (screen coordinates). */
  angle: number;
  isSolid: (x: number, y: number) => boolean;
  targets?: readonly LaserTarget[];
  /** Beam stops here (e.g. world edges). */
  inBounds?: (x: number, y: number) => boolean;
  range?: number;
  burnDepth?: number;
  hitRadius?: number;
  step?: number;
}

export interface LaserTrace {
  endX: number;
  endY: number;
  /** Indexes into `targets`, in the order the beam reaches them. */
  hits: number[];
  /** Solid stretches the beam burned through, as segments to carve. */
  burns: { x0: number; y0: number; x1: number; y1: number }[];
  /** Solid pixels burned in total. */
  burned: number;
  /** True if the beam ran out of burn depth inside terrain. */
  stoppedInTerrain: boolean;
}

export function traceLaser(options: LaserTraceOptions): LaserTrace {
  const range = options.range ?? LASER_RANGE;
  const burnDepth = options.burnDepth ?? LASER_BURN_DEPTH;
  const hitRadius = options.hitRadius ?? LASER_HIT_RADIUS;
  const step = options.step ?? 2;
  const targets = options.targets ?? [];
  const rad = (options.angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  const hits: number[] = [];
  const burns: LaserTrace['burns'] = [];
  let burned = 0;
  let burnStart: { x: number; y: number } | null = null;
  let x = options.x;
  let y = options.y;
  let stoppedInTerrain = false;

  for (let travelled = 0; travelled <= range; travelled += step) {
    const nx = options.x + dx * travelled;
    const ny = options.y + dy * travelled;
    if (options.inBounds && !options.inBounds(nx, ny)) break;
    x = nx;
    y = ny;

    for (let i = 0; i < targets.length; i++) {
      if (hits.includes(i)) continue;
      if (Math.hypot(targets[i].x - x, targets[i].y - y) <= hitRadius) hits.push(i);
    }

    if (options.isSolid(x, y)) {
      if (!burnStart) burnStart = { x, y };
      burned += step;
      if (burned > burnDepth) {
        stoppedInTerrain = true;
        break;
      }
    } else if (burnStart) {
      burns.push({ x0: burnStart.x, y0: burnStart.y, x1: x, y1: y });
      burnStart = null;
    }
  }

  if (burnStart) burns.push({ x0: burnStart.x, y0: burnStart.y, x1: x, y1: y });
  return { endX: x, endY: y, hits, burns, burned: Math.min(burned, burnDepth), stoppedInTerrain };
}
