export const BALLISTIC_STEP = 1 / 120;
export const GRENADE_FUSE = 2.5;
export type SolidQuery = (x: number, y: number) => boolean;
export interface FlightState { x: number; y: number; vx: number; vy: number; age: number }
export interface FlightConfig { gravity: number; drag: number; bounce: number; projectileSize: number }
export interface TerrainHit { x: number; y: number; t: number; nx: number; ny: number }

export function sweepTerrain(x0: number, y0: number, x1: number, y1: number, solid: SolidQuery, radius = 0): TerrainHit | null {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 2));
  const offsets = radius > 0 ? [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]] : [[0, 0]];
  const blocked = (x: number, y: number): boolean => offsets.some(([ox, oy]) => solid(x + ox, y + oy));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + dx * t, y = y0 + dy * t;
    if (!blocked(x, y)) continue;
    let nx = 0, ny = 0;
    for (let a = 0; a < 16; a++) {
      const angle = a * Math.PI / 8;
      const sx = Math.cos(angle), sy = Math.sin(angle);
      if (blocked(x + sx * 3, y + sy * 3)) { nx -= sx; ny -= sy; }
    }
    const length = Math.hypot(nx, ny);
    if (length > 0.01) { nx /= length; ny /= length; }
    else { const travel = Math.hypot(dx, dy) || 1; nx = -dx / travel; ny = -dy / travel; }
    return { x, y, t, nx, ny };
  }
  return null;
}

export function advanceFlight(state: FlightState, config: FlightConfig, solid: SolidQuery, dt = BALLISTIC_STEP, radius = 0) {
  const drag = config.drag * 100;
  const damp = (v: number): number => Math.sign(v) * Math.max(0, Math.abs(v) - drag * dt);
  let vx = damp(state.vx), vy = damp(state.vy) + 500 * config.gravity * dt;
  let x = state.x + vx * dt, y = state.y + vy * dt;
  const hit = sweepTerrain(state.x, state.y, x, y, solid, radius);
  if (hit) {
    // Leave the body just outside the contact surface, including at rest.
    const safeT = Math.max(0, hit.t - 0.6 / Math.max(0.6, Math.hypot(x - state.x, y - state.y)));
    x = state.x + (x - state.x) * safeT;
    y = state.y + (y - state.y) * safeT;
    if (config.bounce > 0) {
      const normalSpeed = vx * hit.nx + vy * hit.ny;
      const tangentX = vx - normalSpeed * hit.nx, tangentY = vy - normalSpeed * hit.ny;
      const rebound = normalSpeed < -25 ? -normalSpeed * config.bounce : 0;
      vx = tangentX * 0.8 + rebound * hit.nx;
      vy = tangentY * 0.8 + rebound * hit.ny;
    }
  }
  return { state: { x, y, vx, vy, age: state.age + dt }, hit, ended: (hit !== null && config.bounce <= 0) || (config.bounce > 0 && state.age + dt >= GRENADE_FUSE) };
}

export function getMuzzle(x: number, y: number, angle: number, offsetX = 20, offsetY = 10) {
  const radians = angle * Math.PI / 180;
  return { x: x + Math.cos(radians) * offsetX, y: y + Math.sin(radians) * offsetY };
}

export function createFlight(x: number, y: number, angle: number, power: number, speed: number): FlightState {
  const radians = angle * Math.PI / 180;
  return { x, y, vx: Math.cos(radians) * speed * power / 100, vy: Math.sin(radians) * speed * power / 100, age: 0 };
}
