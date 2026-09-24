export function shouldDeformTerrainOnImpact(radius: number, isBulletImpact: boolean): boolean {
  return !isBulletImpact && radius > 5;
}
