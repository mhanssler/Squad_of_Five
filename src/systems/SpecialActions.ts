export type SpecialTool = 'grapple' | 'jetpack' | 'dig' | 'cover';

export function getHookCastPose(elapsed: number, handX: number, handY: number, anchorX: number, anchorY: number) {
  const windup = 0.32;
  const castTime = 0.24 + Math.min(400, Math.hypot(anchorX - handX, anchorY - handY)) / 1400;
  if (elapsed < windup) {
    const angle = elapsed * Math.PI * 8 / windup;
    return { x: handX + Math.cos(angle) * 17, y: handY + Math.sin(angle) * 17 - 12, attached: false, phase: 'windup' as const };
  }
  const t = Math.min(1, Math.max(0, (elapsed - windup) / castTime));
  if (t >= 1) return { x: anchorX, y: anchorY, attached: true, phase: 'attached' as const };
  return {
    x: handX + (anchorX - handX) * t,
    y: handY + (anchorY - handY) * t - Math.sin(t * Math.PI) * 28,
    attached: false, phase: 'cast' as const,
  };
}
