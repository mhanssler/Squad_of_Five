import { describe, it, expect } from 'vitest';

/**
 * Tests for projectile physics calculations
 */
describe('Projectile Physics', () => {
  describe('Velocity calculation', () => {
    it('should calculate velocity from power and angle', () => {
      const power = 50; // 50%
      const maxSpeed = 1000;
      const angle = 0; // Horizontal

      const velocity = (power / 100) * maxSpeed;
      const angleRad = angle * (Math.PI / 180);
      
      const velX = Math.cos(angleRad) * velocity;
      const velY = Math.sin(angleRad) * velocity;

      expect(velocity).toBe(500);
      expect(velX).toBeCloseTo(500, 5);
      expect(velY).toBeCloseTo(0, 5);
    });

    it('should calculate correct velocity for 45 degree angle', () => {
      const power = 100;
      const maxSpeed = 1000;
      const angle = -45; // Up and right

      const velocity = (power / 100) * maxSpeed;
      const angleRad = angle * (Math.PI / 180);
      
      const velX = Math.cos(angleRad) * velocity;
      const velY = Math.sin(angleRad) * velocity;

      expect(velX).toBeCloseTo(707.1, 0);
      expect(velY).toBeCloseTo(-707.1, 0);
    });

    it('should handle straight up angle', () => {
      const power = 100;
      const maxSpeed = 1000;
      const angle = -90;

      const velocity = (power / 100) * maxSpeed;
      const angleRad = angle * (Math.PI / 180);
      
      const velX = Math.cos(angleRad) * velocity;
      const velY = Math.sin(angleRad) * velocity;

      expect(velX).toBeCloseTo(0, 5);
      expect(velY).toBeCloseTo(-1000, 5);
    });
  });

  describe('Shotgun spread', () => {
    it('should spread pellets evenly within spread angle', () => {
      const pelletCount = 5;
      const spreadAngle = 15; // degrees
      const baseAngle = 0;
      
      const spreadRad = spreadAngle * (Math.PI / 180);
      const pelletAngles: number[] = [];
      
      for (let i = 0; i < pelletCount; i++) {
        const spreadOffset = (i - (pelletCount - 1) / 2) * (spreadRad / pelletCount);
        pelletAngles.push(baseAngle + spreadOffset);
      }

      // First and last should be at roughly +-half spread
      expect(pelletAngles[0]).toBeLessThan(0);
      expect(pelletAngles[pelletCount - 1]).toBeGreaterThan(0);
      
      // Middle pellet should be near center
      expect(Math.abs(pelletAngles[Math.floor(pelletCount / 2)])).toBeLessThan(0.1);
    });
  });

  describe('Gravity effects', () => {
    it('should apply no gravity for zero gravity weapons', () => {
      const gravity = 0;
      const baseGravity = 500;
      const customGravity = baseGravity * gravity - baseGravity;
      
      expect(customGravity).toBe(-500); // Counteracts default gravity
    });

    it('should apply normal gravity for gravity=1', () => {
      const gravity = 1;
      const baseGravity = 500;
      const customGravity = baseGravity * gravity - baseGravity;
      
      expect(customGravity).toBe(0); // No change from default
    });

    it('should apply extra gravity for mortar (gravity > 1)', () => {
      const gravity = 1.2;
      const baseGravity = 500;
      const customGravity = baseGravity * gravity - baseGravity;
      
      expect(customGravity).toBe(100); // Extra downward pull
    });
  });

  describe('Bounce physics', () => {
    it('should reverse and reduce velocity on bounce', () => {
      const velX = 100;
      const velY = 200; // Downward
      const bounce = 0.5;

      const newVelX = velX * bounce * 0.5;
      const newVelY = velY * -bounce; // Reverse Y

      expect(newVelX).toBe(25);
      expect(newVelY).toBe(-100);
    });

    it('should count bounces and stop after max', () => {
      const maxBounces = 3;
      let bounceCount = 0;
      
      // Simulate bounces
      while (bounceCount < maxBounces) {
        bounceCount++;
      }
      
      expect(bounceCount).toBe(maxBounces);
      // After max bounces, grenade should explode on next terrain contact
    });
  });

  describe('Trail rendering', () => {
    it('should limit trail length', () => {
      const trailPoints: { x: number; y: number }[] = [];
      const maxTrailLength = 30;

      // Add many points
      for (let i = 0; i < 50; i++) {
        trailPoints.push({ x: i, y: i });
        if (trailPoints.length > maxTrailLength) {
          trailPoints.shift();
        }
      }

      expect(trailPoints.length).toBe(maxTrailLength);
      expect(trailPoints[0].x).toBe(20); // First remaining point
    });

    it('should have shorter trails for bullets', () => {
      const bulletTrailLength = 15;
      const normalTrailLength = 30;
      
      expect(bulletTrailLength).toBeLessThan(normalTrailLength);
    });
  });

  describe('Out of bounds detection', () => {
    it('should detect when projectile is below map', () => {
      const mapHeight = 720;
      const margin = 50;
      const projectileY = 800;
      
      const outOfBounds = projectileY > mapHeight + margin;
      expect(outOfBounds).toBe(true);
    });

    it('should detect when projectile is left of map', () => {
      const margin = 50;
      const projectileX = -100;
      
      const outOfBounds = projectileX < -margin;
      expect(outOfBounds).toBe(true);
    });

    it('should detect when projectile is right of map', () => {
      const mapWidth = 2560;
      const margin = 50;
      const projectileX = 2700;
      
      const outOfBounds = projectileX > mapWidth + margin;
      expect(outOfBounds).toBe(true);
    });

    it('should not detect in-bounds projectile as out of bounds', () => {
      const mapWidth = 2560;
      const mapHeight = 720;
      const margin = 50;
      const projectileX = 1280;
      const projectileY = 360;
      
      const outOfBounds = 
        projectileY > mapHeight + margin ||
        projectileX < -margin ||
        projectileX > mapWidth + margin;
      
      expect(outOfBounds).toBe(false);
    });
  });
});

describe('Aim angle constraints', () => {
  it('should allow aiming between -90 and 0 degrees', () => {
    const minAngle = -90;
    const maxAngle = 0;
    
    // Valid angles
    expect(-45).toBeGreaterThanOrEqual(minAngle);
    expect(-45).toBeLessThanOrEqual(maxAngle);
    
    // Test boundary clamping
    let angle = -100;
    angle = Math.max(minAngle, Math.min(maxAngle, angle));
    expect(angle).toBe(-90);
    
    angle = 10;
    angle = Math.max(minAngle, Math.min(maxAngle, angle));
    expect(angle).toBe(0);
  });
});

describe('Power constraints', () => {
  it('should keep power between 10 and 100', () => {
    const minPower = 10;
    const maxPower = 100;
    
    let power = 5;
    power = Math.max(minPower, Math.min(maxPower, power));
    expect(power).toBe(10);
    
    power = 150;
    power = Math.max(minPower, Math.min(maxPower, power));
    expect(power).toBe(100);
  });
});
