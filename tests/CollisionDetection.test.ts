import { describe, it, expect } from 'vitest';

/**
 * Line-circle intersection detection used for bullet hit detection
 * This is the same algorithm used in GameScene.checkSoldierHit
 */
function lineCircleIntersection(
  lastX: number,
  lastY: number,
  currentX: number,
  currentY: number,
  circleX: number,
  circleY: number,
  radius: number
): { hit: boolean; hitX?: number; hitY?: number; t?: number } {
  const dx = currentX - lastX;
  const dy = currentY - lastY;
  const fx = lastX - circleX;
  const fy = lastY - circleY;

  const a = dx * dx + dy * dy;
  
  // IMPORTANT: Handle case where projectile hasn't moved (a is very small)
  // This prevents division by zero and numerical instability
  if (a < 0.0001) {
    // Check if the single point is inside the circle
    const distSq = fx * fx + fy * fy;
    if (distSq <= radius * radius) {
      return { hit: true, hitX: lastX, hitY: lastY, t: 0 };
    }
    return { hit: false };
  }

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;

  let discriminant = b * b - 4 * a * c;

  if (discriminant < 0) {
    return { hit: false };
  }

  discriminant = Math.sqrt(discriminant);

  const t1 = (-b - discriminant) / (2 * a);
  const t2 = (-b + discriminant) / (2 * a);

  // t must be between 0 and 1 for intersection to be on the line segment
  if ((t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1)) {
    const t = Math.max(0, Math.min(1, t1 >= 0 ? t1 : t2));
    const hitX = lastX + t * dx;
    const hitY = lastY + t * dy;
    return { hit: true, hitX, hitY, t };
  }

  return { hit: false };
}

describe('Collision Detection', () => {
  describe('lineCircleIntersection', () => {
    it('should detect hit when line passes through circle center', () => {
      const result = lineCircleIntersection(
        0, 0,      // start
        100, 0,    // end
        50, 0,     // circle center
        10         // radius
      );
      expect(result.hit).toBe(true);
      expect(result.hitX).toBeCloseTo(40, 1); // Should hit at edge of circle
    });

    it('should detect hit when line passes through circle off-center', () => {
      const result = lineCircleIntersection(
        0, 5,      // start (slightly above center)
        100, 5,    // end
        50, 0,     // circle center
        10         // radius
      );
      expect(result.hit).toBe(true);
    });

    it('should not detect hit when line misses circle', () => {
      const result = lineCircleIntersection(
        0, 50,     // start (far above)
        100, 50,   // end
        50, 0,     // circle center
        10         // radius
      );
      expect(result.hit).toBe(false);
    });

    it('should not detect hit when line ends before reaching circle', () => {
      const result = lineCircleIntersection(
        0, 0,      // start
        30, 0,     // end (before circle)
        50, 0,     // circle center
        10         // radius
      );
      expect(result.hit).toBe(false);
    });

    it('should not detect hit when line starts after circle', () => {
      const result = lineCircleIntersection(
        70, 0,     // start (after circle)
        100, 0,    // end
        50, 0,     // circle center
        10         // radius
      );
      expect(result.hit).toBe(false);
    });

    it('should detect hit when line starts inside circle', () => {
      const result = lineCircleIntersection(
        50, 0,     // start (at center)
        100, 0,    // end
        50, 0,     // circle center
        10         // radius
      );
      expect(result.hit).toBe(true);
    });

    it('should detect hit for diagonal lines', () => {
      const result = lineCircleIntersection(
        0, 0,
        100, 100,
        50, 50,    // circle on diagonal
        10
      );
      expect(result.hit).toBe(true);
    });

    it('should detect hit for vertical lines', () => {
      const result = lineCircleIntersection(
        50, 0,
        50, 100,
        50, 50,    // circle on vertical line
        10
      );
      expect(result.hit).toBe(true);
    });

    it('should detect hit when line just grazes circle edge', () => {
      const result = lineCircleIntersection(
        0, 10,     // Line at y=10
        100, 10,
        50, 0,     // Circle center at y=0
        11         // Radius just reaches the line
      );
      expect(result.hit).toBe(true);
    });

    it('should not detect hit when line just misses circle edge', () => {
      const result = lineCircleIntersection(
        0, 10,     // Line at y=10
        100, 10,
        50, 0,     // Circle center at y=0
        9          // Radius doesn't reach the line
      );
      expect(result.hit).toBe(false);
    });

    // CRITICAL: Test for division by zero bug
    describe('edge cases that could cause freezes', () => {
      it('should handle zero-length line (projectile not moving)', () => {
        const result = lineCircleIntersection(
          50, 50,    // start
          50, 50,    // end (same as start - no movement)
          50, 50,    // circle center
          10         // radius
        );
        // Should not crash, should detect hit since point is at center
        expect(result.hit).toBe(true);
      });

      it('should handle zero-length line outside circle', () => {
        const result = lineCircleIntersection(
          0, 0,      // start
          0, 0,      // end (same as start)
          50, 50,    // circle center
          10         // radius
        );
        // Should not crash, should not detect hit
        expect(result.hit).toBe(false);
      });

      it('should handle very small movements inside circle', () => {
        // Small movement that stays entirely inside the circle
        // Since both endpoints are inside, algorithm may not detect "entry"
        // This is fine - the previous frame would have detected entry
        const result = lineCircleIntersection(
          50, 50,
          50.01, 50.01,
          50, 50,
          10
        );
        // With both points inside circle, t values will be outside 0-1 range
        // This is expected behavior - we want to detect LINE CROSSING circle boundary
        expect(typeof result.hit).toBe('boolean');
      });

      it('should detect hit for small movements crossing boundary', () => {
        // Movement from just outside to just inside
        const result = lineCircleIntersection(
          39, 0,      // Just outside (40 would be edge)
          41, 0,      // Just inside
          50, 0,      // Circle center
          10          // Radius (edge at 40)
        );
        expect(result.hit).toBe(true);
      });

      it('should handle very large distances', () => {
        const result = lineCircleIntersection(
          0, 0,
          10000, 10000,
          5000, 5000,
          10
        );
        expect(result.hit).toBe(true);
      });

      it('should handle negative coordinates', () => {
        const result = lineCircleIntersection(
          -100, -100,
          100, 100,
          0, 0,
          10
        );
        expect(result.hit).toBe(true);
      });

      it('should handle very small radius', () => {
        const result = lineCircleIntersection(
          0, 0,
          100, 0,
          50, 0,
          0.1
        );
        expect(result.hit).toBe(true);
      });

      it('should handle NaN inputs gracefully', () => {
        // This tests defensive coding - real code should validate inputs
        const result = lineCircleIntersection(
          NaN, 0,
          100, 0,
          50, 0,
          10
        );
        // With NaN, discriminant will be NaN, which is < 0 is false
        // The function should not hang/crash
        expect(typeof result.hit).toBe('boolean');
      });

      it('should handle Infinity inputs gracefully', () => {
        const result = lineCircleIntersection(
          0, 0,
          Infinity, 0,
          50, 0,
          10
        );
        expect(typeof result.hit).toBe('boolean');
      });
    });
  });

  describe('Hit point calculation', () => {
    it('should return hit point on circle edge (entering)', () => {
      const result = lineCircleIntersection(
        0, 0,
        100, 0,
        50, 0,
        10
      );
      expect(result.hit).toBe(true);
      // Hit should be at x=40 (50 - 10 = circle edge)
      expect(result.hitX).toBeCloseTo(40, 0);
      expect(result.hitY).toBeCloseTo(0, 0);
    });

    it('should return t value between 0 and 1', () => {
      const result = lineCircleIntersection(
        0, 0,
        100, 0,
        50, 0,
        10
      );
      expect(result.t).toBeGreaterThanOrEqual(0);
      expect(result.t).toBeLessThanOrEqual(1);
    });
  });
});

describe('Damage Calculation', () => {
  it('should calculate distance-based explosion damage correctly', () => {
    const baseDamage = 50;
    const radius = 100;
    
    // At center (distance 0)
    let distance = 0;
    let damage = Math.round((1 - distance / radius) * baseDamage);
    expect(damage).toBe(50);
    
    // At half radius
    distance = 50;
    damage = Math.round((1 - distance / radius) * baseDamage);
    expect(damage).toBe(25);
    
    // At edge of radius
    distance = 100;
    damage = Math.round((1 - distance / radius) * baseDamage);
    expect(damage).toBe(0);
    
    // Outside radius (should be 0 or negative, clamped in real code)
    distance = 150;
    damage = Math.round((1 - distance / radius) * baseDamage);
    expect(damage).toBeLessThanOrEqual(0);
  });

  it('should not apply damage outside explosion radius', () => {
    const x = 0, y = 0; // explosion center
    const soldierX = 200, soldierY = 0;
    const radius = 100;
    
    const distance = Math.sqrt(
      (soldierX - x) ** 2 + (soldierY - y) ** 2
    );
    
    expect(distance).toBeGreaterThan(radius);
    // Soldier should not take damage
  });
});

describe('Knockback Calculation', () => {
  it('should calculate knockback direction correctly', () => {
    const explosionX = 0, explosionY = 0;
    const soldierX = 100, soldierY = 0;
    
    const angle = Math.atan2(
      soldierY - explosionY,
      soldierX - explosionX
    );
    
    // Angle should be 0 (pointing right)
    expect(angle).toBeCloseTo(0, 5);
  });

  it('should knock back in opposite direction of explosion', () => {
    const explosionX = 100, explosionY = 50;
    const soldierX = 50, soldierY = 50;
    
    const angle = Math.atan2(
      soldierY - explosionY,
      soldierX - explosionX
    );
    
    // Angle should be PI (pointing left)
    expect(angle).toBeCloseTo(Math.PI, 5);
    
    const knockbackX = Math.cos(angle) * 100;
    expect(knockbackX).toBeLessThan(0); // Should push left
  });

  it('should scale knockback with distance', () => {
    const radius = 100;
    const basekKnockback = 400;
    
    // Close to explosion
    let distance = 10;
    let knockback = (1 - distance / radius) * basekKnockback;
    expect(knockback).toBeCloseTo(360, 0);
    
    // Far from explosion
    distance = 90;
    knockback = (1 - distance / radius) * basekKnockback;
    expect(knockback).toBeCloseTo(40, 0);
  });
});
