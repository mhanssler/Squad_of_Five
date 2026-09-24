import Phaser from 'phaser';
import { moveCharacter } from './CharacterPhysics';
import { traceBlastExposure } from './Cover';
import {
  findWalkableSurfaceY,
  smoothTerrainProfile,
} from './Locomotion';

type CavePoint = {
  x: number;
  y: number;
  radius: number;
};

type CaveNetwork = {
  paths: CavePoint[][];
};

export class Terrain {
  private scene: Phaser.Scene;
  private width: number;
  private height: number;
  private terrainImage!: Phaser.GameObjects.Image;
  private caveImage!: Phaser.GameObjects.Image;
  private collisionData!: Uint8ClampedArray;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private solidCanvas: HTMLCanvasElement;
  private solidCtx: CanvasRenderingContext2D;
  private caveCanvas: HTMLCanvasElement;
  private caveCtx: CanvasRenderingContext2D;
  private heightMap: number[] = [];
  private seed: number;
  private textureKey: string;
  private caveTextureKey: string;
  private preset: 'standard' | 'plains' | 'hills' | 'caves';
  private collisionState = new WeakMap<Phaser.Physics.Arcade.Sprite, {
    x: number;
    y: number;
    grounded: boolean;
  }>();

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    seed?: number,
    options?: { preset?: 'standard' | 'plains' | 'hills' | 'caves' }
  ) {
    this.scene = scene;
    this.width = width;
    this.height = height;
    this.seed = seed ?? Math.floor(Math.random() * 1000000);
    this.textureKey = 'terrain-texture-' + this.seed;
    this.caveTextureKey = 'terrain-caves-' + this.seed;
    this.preset = options?.preset ?? 'standard';

    // Create offscreen canvas for collision detection
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.solidCanvas = document.createElement('canvas');
    this.solidCanvas.width = width;
    this.solidCanvas.height = height;
    this.solidCtx = this.solidCanvas.getContext('2d')!;

    // Cave interiors use their own raster layer so they can be clipped to the
    // original ground silhouette without becoming collision geometry.
    this.caveCanvas = document.createElement('canvas');
    this.caveCanvas.width = width;
    this.caveCanvas.height = height;
    this.caveCtx = this.caveCanvas.getContext('2d')!;

    // Generate initial terrain with seed
    this.generateTerrain();

    // Create texture immediately and add image
    this.createTerrainTexture();
  }

  private createTerrainTexture(): void {
    if (this.scene.textures.exists(this.caveTextureKey)) {
      this.scene.textures.remove(this.caveTextureKey);
    }
    this.scene.textures.addCanvas(this.caveTextureKey, this.caveCanvas);

    if (this.caveImage) {
      this.caveImage.setTexture(this.caveTextureKey);
    } else {
      this.caveImage = this.scene.add.image(0, 0, this.caveTextureKey);
      this.caveImage.setOrigin(0, 0);
      this.caveImage.setDepth(-2);
    }

    // Remove old texture if it exists
    if (this.scene.textures.exists(this.textureKey)) {
      this.scene.textures.remove(this.textureKey);
    }

    // Create texture directly from canvas
    this.scene.textures.addCanvas(this.textureKey, this.canvas);
    
    // Create or update image
    if (this.terrainImage) {
      this.terrainImage.setTexture(this.textureKey);
    } else {
      this.terrainImage = this.scene.add.image(0, 0, this.textureKey);
      this.terrainImage.setOrigin(0, 0);
      this.terrainImage.setDepth(-1);
    }
  }

  public getSeed(): number {
    return this.seed;
  }

  public regenerate(newSeed?: number): void {
    this.seed = newSeed ?? Math.floor(Math.random() * 1000000);
    this.textureKey = 'terrain-texture-' + this.seed;
    this.caveTextureKey = 'terrain-caves-' + this.seed;
    this.generateTerrain();
    this.createTerrainTexture();
  }

  /**
   * Get the surface Y position at a given X coordinate
   */
  public getSurfaceY(x: number): number {
    const clampedX = Math.max(0, Math.min(this.width - 1, Math.floor(x)));
    return this.heightMap[clampedX] || this.height * 0.65;
  }

  /**
   * Find the surface Y (top-most solid pixel) for the first solid segment at/under `referenceY`.
   * This is more reliable than `getSurfaceY()` in caves/overhangs where the heightmap returns the ceiling.
   */
  public findSurfaceYAtOrBelow(x: number, referenceY: number, maxDown: number = 260): number | null {
    const px = Math.max(0, Math.min(this.width - 1, Math.floor(x)));
    const startY = Math.max(0, Math.min(this.height - 1, Math.floor(referenceY)));
    const endY = Math.min(this.height - 1, startY + Math.max(0, Math.floor(maxDown)));

    for (let y = startY; y <= endY; y++) {
      if (this.isPointSolid(px, y)) {
        // Walk upward to the first non-solid pixel to find the local surface.
        let top = y;
        while (top > 0 && this.isPointSolid(px, top - 1)) top--;
        return top;
      }
    }

    return null;
  }

  public findWalkableSurfaceNear(
    x: number,
    referenceFootY: number,
    maxUp: number = 6,
    maxDown: number = 11,
  ): number | null {
    const px = Math.max(0, Math.min(this.width - 1, Math.floor(x)));
    return findWalkableSurfaceY(
      referenceFootY,
      maxUp,
      maxDown,
      this.height,
      y => this.isPointSolid(px, y),
    );
  }

  // Seeded random number generator
  private seededRandom(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  private generateTerrain(): void {
    // Reset seed for consistent generation
    const originalSeed = this.seed;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.caveCtx.clearRect(0, 0, this.width, this.height);

    // Generate more extreme terrain with caves, overhangs, and dramatic features
    const baseLevel =
      this.preset === 'plains' ? this.height * 0.56 :
      this.preset === 'hills' ? this.height * 0.48 :
      this.height * 0.50;
    
    // More extreme terrain variation based on seed
    const baseHillAmp =
      this.preset === 'plains' ? 28 :
      this.preset === 'hills' ? 140 :
      this.preset === 'caves' ? 90 :
      100;
    const hillAmplitude = baseHillAmp + this.seededRandom() * 60;

    const baseValley =
      this.preset === 'plains' ? 18 :
      this.preset === 'hills' ? 55 :
      this.preset === 'caves' ? 65 :
      50;
    const valleyDepth = baseValley + this.seededRandom() * 40;

    const waveFreq1 = (this.preset === 'plains' ? 0.0016 : 0.002) + this.seededRandom() * 0.002;
    const waveFreq2 = (this.preset === 'plains' ? 0.004 : 0.005) + this.seededRandom() * 0.004;
    const phaseShift = this.seededRandom() * Math.PI * 2;
    
    // Generate heightmap with multiple features
    this.heightMap = [];
    
    for (let x = 0; x <= this.width; x++) {
      let y = baseLevel;
      
      // Large dramatic hills (low frequency, HIGH amplitude)
      y += Math.sin(x * waveFreq1 * 1.5 + phaseShift) * hillAmplitude;
      y += Math.sin(x * waveFreq2 + phaseShift * 0.7) * (hillAmplitude * 0.7);
      
      // Medium terrain features - more pronounced
      y += Math.sin(x * 0.012 + phaseShift * 0.5) * 45;
      y += Math.cos(x * 0.018 + phaseShift) * 35;
      
      // Sharp ridges and cliffs
      const ridgeFactor = Math.sin(x * 0.008 + phaseShift * 1.3);
      if (this.preset !== 'plains' && ridgeFactor > 0.6) {
        y -= (ridgeFactor - 0.6) * 80; // Sharp upward ridges
      } else if (this.preset !== 'plains' && ridgeFactor < -0.6) {
        y += (-ridgeFactor - 0.6) * 60; // Deep cuts
      }
      
      // Rocky character comes mostly from the painted surface detail. Keep collision
      // broad enough that a soldier's feet can follow it without pixel-scale hopping.
      y += Math.sin(x * 0.03 + phaseShift * 1.5) * 10;
      y += Math.cos(x * 0.045 + phaseShift * 0.8) * 8;
      
      // Small bumps and texture (increased density)
      y += Math.sin(x * 0.05 + phaseShift * 2) * 5;
      y += Math.sin(x * 0.08 + phaseShift) * 3;
      y += Math.cos(x * 0.12 + phaseShift * 1.2) * 2;
      
      // Fine rocky detail - high frequency for jagged look
      y += Math.sin(x * 0.15 + phaseShift * 2.5) * 1.5;
      y += Math.cos(x * 0.22 + phaseShift * 0.3) * 1;
      y += Math.sin(x * 0.35 + phaseShift * 1.8) * 0.75;
      
      // Micro-texture for rough appearance
      y += Math.sin(x * 0.5 + phaseShift) * 0.5;
      y += Math.cos(x * 0.7 + phaseShift * 2) * 0.35;
      
      // Random small rocks/pebbles effect using pseudo-random from position
      const rockNoise = Math.sin(x * 1.3 + phaseShift * 3.7) * Math.cos(x * 0.9 + phaseShift);
      y += rockNoise * 0.6;
      
      // Create distinct elevated positions on each side for team positions
      // Left side elevated position for red team
      const leftHillCenter = Math.floor(this.width * 0.14) + (originalSeed % 100);
      const leftBandMin = Math.floor(this.width * 0.04);
      const leftBandMax = Math.floor(this.width * 0.27);
      if (x > leftBandMin && x < leftBandMax) {
        const distFromCenter = Math.abs(x - leftHillCenter);
        const hillHeight = Math.max(0, 70 - distFromCenter * 0.2);
        y -= hillHeight;
      }
      
      // Right side elevated position for blue team  
      const rightHillCenter = Math.floor(this.width * 0.82) + (originalSeed % 80);
      const rightBandMin = Math.floor(this.width * 0.73);
      const rightBandMax = Math.floor(this.width * 0.96);
      if (x > rightBandMin && x < rightBandMax) {
        const distFromCenter = Math.abs(x - rightHillCenter);
        const hillHeight = Math.max(0, 70 - distFromCenter * 0.2);
        y -= hillHeight;
      }
      
      // Central deep valley/canyon
      const valleyCenter = Math.floor(this.width * 0.47) + (originalSeed % 160);
      const valleyHalfWidth = Math.floor(Math.min(420, this.width * 0.14));
      if (x > valleyCenter - valleyHalfWidth && x < valleyCenter + valleyHalfWidth) {
        const distFromCenter = Math.abs(x - valleyCenter);
        const depth = Math.max(0, (valleyDepth + 30) - distFromCenter * 0.12);
        y += depth;
      }
      
      // Clamp to reasonable bounds
      y = Math.max(this.height * 0.18, Math.min(this.height * 0.88, y));
      
      this.heightMap.push(y);
    }

    const smoothingRadius = this.preset === 'hills' ? 3 : 4;
    this.heightMap = smoothTerrainProfile(this.heightMap, smoothingRadius, 2);

    // Draw dirt layer (brown) - main terrain body with gradient
    const dirtGradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    dirtGradient.addColorStop(0, '#6b4423');
    dirtGradient.addColorStop(0.5, '#5c4033');
    dirtGradient.addColorStop(1, '#3d2817');
    
    this.ctx.fillStyle = dirtGradient;
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.height);
    for (let x = 0; x <= this.width; x++) {
      this.ctx.lineTo(x, this.heightMap[x]);
    }
    this.ctx.lineTo(this.width, this.height);
    this.ctx.closePath();
    this.ctx.fill();

    // Carve connected cave networks with open mouths, descending passages, and
    // branches. The old isolated ellipses read as blast craters rather than caves.
    const cavesEnabled = this.preset === 'standard' || this.preset === 'caves';
    if (cavesEnabled) {
      const networks = this.createCaveNetworks();
      for (const network of networks) {
        this.carveCaveNetwork(network);
        this.drawCaveBackdrop(network);
      }
      this.clipCaveBackdropToGround();
    }

    this.ctx.globalCompositeOperation = 'destination-out';
    
    // Create dramatic overhangs by carving under steep terrain
    const overhangsEnabled = this.preset === 'standard' || this.preset === 'hills';
    if (overhangsEnabled) {
      for (let x = 100; x < this.width - 100; x += 200 + Math.floor(this.seededRandom() * 150)) {
        // Check if this is a steep slope area
        const slopeCheck = 30;
        if (x + slopeCheck < this.width) {
          const slope = Math.abs(this.heightMap[x + slopeCheck] - this.heightMap[x]);
          
          if (slope > 25) { // Steep enough for an overhang
            const overhangX = x + slopeCheck / 2;
            const overhangY = Math.max(this.heightMap[x], this.heightMap[x + slopeCheck]) + 25;
            const overhangWidth = 40 + this.seededRandom() * 60;
            const overhangHeight = 20 + this.seededRandom() * 30;
            
            if (overhangY < this.height - 40) {
              this.ctx.beginPath();
              this.ctx.ellipse(
                overhangX,
                overhangY,
                overhangWidth,
                overhangHeight, 
                this.heightMap[x] > this.heightMap[x + slopeCheck] ? -0.3 : 0.3,
                0,
                Math.PI * 2
              );
              this.ctx.fill();
            }
          }
        }
      }
    }
    
    this.ctx.globalCompositeOperation = 'source-over';

    // Get collision data AFTER caves are carved so we know actual solid terrain
    const imageData = this.ctx.getImageData(0, 0, this.width, this.height);
    const tempCollisionData = imageData.data;
    this.solidCtx.clearRect(0, 0, this.width, this.height);
    this.solidCtx.drawImage(this.canvas, 0, 0);
    this.rebuildHeightMapFromPixels(tempCollisionData, 0, this.width - 1);
    
    // Now draw grass only where there's actual solid terrain with sky above
    this.drawGrassOnSolidTerrain(tempCollisionData);

    // Add enhanced dirt texture/rocks - MUCH MORE DENSE
    // Large rocks
    for (let i = 0; i < 150; i++) {
      const x = this.seededRandom() * this.width;
      const surfaceY = this.heightMap[Math.floor(x)] || baseLevel;
      const y = surfaceY + 15 + this.seededRandom() * (this.height - surfaceY - 40);
      
      if (y < this.height - 10) {
        const idx = (Math.floor(y) * this.width + Math.floor(x)) * 4;
        if (tempCollisionData[idx + 3] > 128) {
          const size = 4 + this.seededRandom() * 8;
          const shade = 50 + this.seededRandom() * 40;
          this.ctx.fillStyle = `rgba(${shade + 20}, ${shade}, ${shade - 20}, 0.6)`;
          this.ctx.beginPath();
          this.ctx.ellipse(x, y, size, size * 0.7, this.seededRandom() * Math.PI, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
    }
    
    // Medium rocks/pebbles
    for (let i = 0; i < 400; i++) {
      const x = this.seededRandom() * this.width;
      const surfaceY = this.heightMap[Math.floor(x)] || baseLevel;
      const y = surfaceY + 10 + this.seededRandom() * (this.height - surfaceY - 30);
      
      if (y < this.height - 10) {
        const idx = (Math.floor(y) * this.width + Math.floor(x)) * 4;
        if (tempCollisionData[idx + 3] > 128) {
          const size = 2 + this.seededRandom() * 4;
          this.ctx.fillStyle = `rgba(${60 + this.seededRandom() * 50}, ${45 + this.seededRandom() * 35}, ${25 + this.seededRandom() * 25}, 0.5)`;
          this.ctx.fillRect(x, y, size, size);
        }
      }
    }
    
    // Fine gravel/dirt specks
    for (let i = 0; i < 800; i++) {
      const x = this.seededRandom() * this.width;
      const surfaceY = this.heightMap[Math.floor(x)] || baseLevel;
      const y = surfaceY + 8 + this.seededRandom() * (this.height - surfaceY - 25);
      
      if (y < this.height - 10) {
        const idx = (Math.floor(y) * this.width + Math.floor(x)) * 4;
        if (tempCollisionData[idx + 3] > 128) {
          const size = 1 + this.seededRandom() * 2;
          this.ctx.fillStyle = `rgba(${70 + this.seededRandom() * 40}, ${50 + this.seededRandom() * 30}, ${30 + this.seededRandom() * 20}, 0.4)`;
          this.ctx.fillRect(x, y, size, size);
        }
      }
    }
    
    // Rock striations/layers (horizontal lines for sediment effect)
    for (let i = 0; i < 60; i++) {
      const y = this.height * 0.35 + this.seededRandom() * (this.height * 0.55);
      const startX = this.seededRandom() * this.width * 0.8;
      const length = 50 + this.seededRandom() * 150;
      const shade = 40 + this.seededRandom() * 30;
      
      this.ctx.strokeStyle = `rgba(${shade + 30}, ${shade + 10}, ${shade}, 0.3)`;
      this.ctx.lineWidth = 1 + this.seededRandom() * 2;
      this.ctx.beginPath();
      this.ctx.moveTo(startX, y);
      this.ctx.lineTo(startX + length, y + (this.seededRandom() - 0.5) * 10);
      this.ctx.stroke();
    }

    // Decorative grass, gravel, and rocks must never become collision geometry.
    this.collisionData = new Uint8ClampedArray(tempCollisionData);
    this.drawRockMaterial();
  }

  private drawRockMaterial(): void {
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-atop';
    // Broken strata and angular facets give the cutaway readable material scale.
    for (let y = 160; y < this.height; y += 28) {
      for (let x = -30; x < this.width; x += 48) {
        const jitter = this.seededRandom();
        const px = x + jitter * 22;
        const py = y + this.seededRandom() * 14;
        this.ctx.fillStyle = jitter > 0.5 ? 'rgba(137,151,139,0.045)' : 'rgba(12,22,25,0.065)';
        this.ctx.beginPath();
        this.ctx.moveTo(px, py);
        this.ctx.lineTo(px + 31, py - 5);
        this.ctx.lineTo(px + 48, py + 5);
        this.ctx.lineTo(px + 37, py + 19);
        this.ctx.lineTo(px + 7, py + 22);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(13,22,25,0.10)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(px + 7, py + 22);
        this.ctx.lineTo(px + 37, py + 19);
        this.ctx.lineTo(px + 48, py + 5);
        this.ctx.stroke();
      }
    }
    this.ctx.restore();
  }

  private createCaveNetworks(): CaveNetwork[] {
    const networkCount = this.preset === 'caves'
      ? Math.max(3, Math.round(this.width / 720))
      : Math.max(2, Math.round(this.width / 1400));
    const networks: CaveNetwork[] = [];
    const usableStart = this.width * 0.12;
    const usableWidth = this.width * 0.76;
    const slotWidth = usableWidth / networkCount;

    for (let i = 0; i < networkCount; i++) {
      const slotStart = usableStart + slotWidth * i;
      const entranceX = this.findCaveEntranceX(slotStart, slotWidth);
      const surfaceY = this.heightMap[Math.floor(entranceX)] ?? this.height * 0.5;
      const direction: -1 | 1 = i % 2 === 0 ? 1 : -1;
      const mainPath: CavePoint[] = [
        { x: entranceX, y: surfaceY + 2, radius: 20 },
        {
          x: entranceX + direction * (14 + this.seededRandom() * 18),
          y: surfaceY + 34,
          radius: 24,
        },
      ];

      const chamberCount = this.preset === 'caves' ? 4 : 3;
      for (let chamber = 0; chamber < chamberCount; chamber++) {
        const previous = mainPath[mainPath.length - 1];
        const nextX = Phaser.Math.Clamp(
          previous.x + direction * (44 + this.seededRandom() * 46),
          55,
          this.width - 55,
        );
        const nextY = Phaser.Math.Clamp(
          previous.y + 10 + (this.seededRandom() - 0.25) * 32,
          surfaceY + 48,
          this.height - 58,
        );
        mainPath.push({
          x: nextX,
          y: nextY,
          radius: 24 + this.seededRandom() * (this.preset === 'caves' ? 13 : 9),
        });
      }

      const buriedMainPath = this.constrainCavePathToGround(mainPath, true);
      if (buriedMainPath.length < 3) continue;

      const paths: CavePoint[][] = [buriedMainPath];
      if (this.preset === 'caves') {
        const branchOrigin = buriedMainPath[Math.min(3, buriedMainPath.length - 2)];
        const branch = this.constrainCavePathToGround([
          branchOrigin,
          {
            x: Phaser.Math.Clamp(branchOrigin.x - direction * (34 + this.seededRandom() * 35), 55, this.width - 55),
            y: Phaser.Math.Clamp(branchOrigin.y + 24 + this.seededRandom() * 24, surfaceY + 55, this.height - 55),
            radius: 22 + this.seededRandom() * 9,
          },
          {
            x: Phaser.Math.Clamp(branchOrigin.x - direction * (76 + this.seededRandom() * 42), 55, this.width - 55),
            y: Phaser.Math.Clamp(branchOrigin.y + 12 + this.seededRandom() * 52, surfaceY + 55, this.height - 55),
            radius: 27 + this.seededRandom() * 11,
          },
        ], false);
        if (branch.length >= 2) {
          branch[0] = { ...branchOrigin };
          paths.push(branch);
        }
      }

      networks.push({ paths });
    }

    return networks;
  }

  private findCaveEntranceX(slotStart: number, slotWidth: number): number {
    let bestX = Phaser.Math.Clamp(slotStart + slotWidth * 0.5, 70, this.width - 70);
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 1; i <= 11; i++) {
      const x = Phaser.Math.Clamp(slotStart + slotWidth * (i / 12), 70, this.width - 70);
      const surface = this.heightMap[Math.floor(x)] ?? this.height;
      const left = this.heightMap[Math.max(0, Math.floor(x - 18))] ?? surface;
      const right = this.heightMap[Math.min(this.width - 1, Math.floor(x + 18))] ?? surface;
      const undergroundDepth = this.height - surface;
      if (undergroundDepth < 145) continue;

      const score = surface + Math.abs(left - right) * 2 + this.seededRandom() * 16;
      if (score < bestScore) {
        bestScore = score;
        bestX = x;
      }
    }

    return bestX;
  }

  private constrainCavePathToGround(path: CavePoint[], keepSurfaceMouth: boolean): CavePoint[] {
    const clearance = 10;
    const bottomPadding = 16;
    const constrained = path.map(point => ({ ...point }));

    for (let i = keepSurfaceMouth ? 1 : 0; i < constrained.length; i++) {
      const point = constrained[i];
      const surface = this.heightMap[Math.floor(point.x)] ?? this.height;
      point.y = Phaser.Math.Clamp(
        Math.max(point.y, surface + point.radius + clearance),
        point.radius + clearance,
        this.height - point.radius - bottomPadding,
      );
    }

    const firstBuriedSegment = keepSurfaceMouth ? 2 : 1;
    for (let i = firstBuriedSegment; i < constrained.length; i++) {
      const from = constrained[i - 1];
      const to = constrained[i];
      const distance = Math.abs(to.x - from.x);
      const samples = Math.max(4, Math.ceil(distance / 10));
      let deepestSurface = 0;
      for (let sample = 0; sample <= samples; sample++) {
        const t = sample / samples;
        const x = from.x + (to.x - from.x) * t;
        deepestSurface = Math.max(deepestSurface, this.heightMap[Math.floor(x)] ?? this.height);
      }

      const maximumRadius = Math.floor((this.height - deepestSurface - clearance - bottomPadding) / 2);
      if (maximumRadius < 16) {
        constrained.splice(i);
        break;
      }

      from.radius = Math.min(from.radius, maximumRadius);
      to.radius = Math.min(to.radius, maximumRadius);
      const requiredY = deepestSurface + Math.max(from.radius, to.radius) + clearance;
      from.y = Math.min(this.height - from.radius - bottomPadding, Math.max(from.y, requiredY));
      to.y = Math.min(this.height - to.radius - bottomPadding, Math.max(to.y, requiredY));
    }

    return constrained;
  }

  private carveCaveNetwork(network: CaveNetwork): void {
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.strokeStyle = '#000000';
    this.ctx.fillStyle = '#000000';
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    for (const path of network.paths) {
      for (let i = 1; i < path.length; i++) {
        const from = path[i - 1];
        const to = path[i];
        this.ctx.lineWidth = from.radius + to.radius;
        this.ctx.beginPath();
        this.ctx.moveTo(from.x, from.y);
        this.ctx.lineTo(to.x, to.y);
        this.ctx.stroke();
      }

      for (const point of path) {
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    this.ctx.restore();
  }

  private drawCaveBackdrop(network: CaveNetwork): void {
    const ctx = this.caveCtx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#070a0b';
    ctx.fillStyle = '#070a0b';

    for (const path of network.paths) {
      for (let i = 1; i < path.length; i++) {
        const from = path[i - 1];
        const to = path[i];
        const width = from.radius + to.radius;
        ctx.lineWidth = width + 4;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }

      for (const point of path) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.radius + 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sparse, dark rock teeth add cave texture without exposing node geometry.
      ctx.fillStyle = '#151b1c';
      for (let i = 1; i < path.length; i += 2) {
        const point = path[i];
        const tooth = Math.min(12, point.radius * 0.38);
        ctx.beginPath();
        ctx.moveTo(point.x - 7, point.y - point.radius + 2);
        ctx.lineTo(point.x + 5, point.y - point.radius + 3);
        ctx.lineTo(point.x - 1, point.y - point.radius + tooth);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#070a0b';
    }

    ctx.globalCompositeOperation = 'source-atop';
    for (const path of network.paths) {
      for (const point of path) {
        ctx.strokeStyle = '#253033';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(point.x - 23, point.y - 10);
        ctx.lineTo(point.x - 8, point.y - 17);
        ctx.lineTo(point.x + 16, point.y - 12);
        ctx.lineTo(point.x + 23, point.y + 8);
        ctx.stroke();
        ctx.strokeStyle = '#11191c';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(point.x - 24, point.y + 17);
        ctx.lineTo(point.x + 4, point.y + 23);
        ctx.lineTo(point.x + 30, point.y + 15);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private clipCaveBackdropToGround(): void {
    const ctx = this.caveCtx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, this.height);
    for (let x = 0; x <= this.width; x++) {
      ctx.lineTo(x, this.heightMap[x] ?? this.height);
    }
    ctx.lineTo(this.width, this.height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private rebuildHeightMapFromPixels(source: Uint8ClampedArray, startX: number, endX: number): void {
    const sx = Math.max(0, Math.floor(startX));
    const ex = Math.min(this.width - 1, Math.ceil(endX));
    for (let x = sx; x <= ex; x++) {
      this.heightMap[x] = this.height;
      for (let y = 0; y < this.height; y++) {
        const index = (y * this.width + x) * 4;
        if (source[index + 3] > 128) {
          this.heightMap[x] = y;
          break;
        }
      }
    }
  }

  private drawGrassOnSolidTerrain(collisionData: Uint8ClampedArray): void {
    const grassThickness = 10;
    
    // For each column, find the actual top surface (first solid pixel from top)
    // This accounts for caves and carved terrain
    const actualSurface: number[] = [];
    
    for (let x = 0; x < this.width; x++) {
      let surfaceY = this.height; // Default to bottom if no solid found
      for (let y = 0; y < this.height; y++) {
        const idx = (y * this.width + x) * 4;
        if (collisionData[idx + 3] > 128) {
          surfaceY = y;
          break;
        }
      }
      actualSurface.push(surfaceY);
    }
    
    // Draw grass segments only where there's solid terrain
    for (let x = 0; x < this.width - 1; x++) {
      const y1 = actualSurface[x];
      const y2 = actualSurface[x + 1];
      
      // Skip if no solid terrain in this column or next
      if (y1 >= this.height - 5 || y2 >= this.height - 5) continue;
      
      // Skip if there's a big gap (cave opening)
      if (Math.abs(y2 - y1) > 30) continue;
      
      // Calculate slope angle for this segment
      const slopeAngle = Math.atan2(y2 - y1, 1);
      
      // Calculate perpendicular offset for grass thickness
      const perpX = Math.sin(slopeAngle) * grassThickness;
      const perpY = Math.cos(slopeAngle) * grassThickness;
      
      // Grass color with slight variation
      const greenVariation = Math.floor((y1 + x) % 20);
      this.ctx.fillStyle = `rgb(${55 + greenVariation}, ${120 + greenVariation}, ${45 + greenVariation})`;
      
      // Draw a quad that follows the terrain slope
      this.ctx.beginPath();
      this.ctx.moveTo(x, y1);
      this.ctx.lineTo(x + 1, y2);
      this.ctx.lineTo(x + 1 - perpX, y2 + perpY);
      this.ctx.lineTo(x - perpX, y1 + perpY);
      this.ctx.closePath();
      this.ctx.fill();
    }
    
    // Add darker grass edge line on top for definition - only on solid sections
    this.ctx.strokeStyle = '#2d6b27';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    let drawing = false;
    
    for (let x = 0; x < this.width; x++) {
      const y = actualSurface[x];
      const nextY = actualSurface[x + 1] || y;
      
      // Skip gaps
      if (y >= this.height - 5 || Math.abs(nextY - y) > 30) {
        if (drawing) {
          this.ctx.stroke();
          this.ctx.beginPath();
          drawing = false;
        }
        continue;
      }
      
      if (!drawing) {
        this.ctx.moveTo(x, y);
        drawing = true;
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    if (drawing) this.ctx.stroke();

    // Add grass blades on solid terrain
    for (let x = 0; x < this.width - 2; x += 4) {
      const y = actualSurface[x];
      const nextY = actualSurface[x + 2] || y;
      
      // Skip if no terrain or big gap
      if (y >= this.height - 5 || Math.abs(nextY - y) > 20) continue;
      
      const slopeAngle = Math.atan2(nextY - y, 2);
      const bladeHeight = 3 + this.seededRandom() * 5;
      const lean = (this.seededRandom() - 0.5) * 2;
      
      // Blade grows perpendicular to slope
      const bladeEndX = x + lean - Math.sin(slopeAngle) * bladeHeight;
      const bladeEndY = y - Math.cos(slopeAngle) * bladeHeight;
      
      this.ctx.strokeStyle = `rgb(${45 + Math.floor(this.seededRandom() * 30)}, ${95 + Math.floor(this.seededRandom() * 45)}, ${35 + Math.floor(this.seededRandom() * 25)})`;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(bladeEndX, bladeEndY);
      this.ctx.stroke();
    }
  }

  private updateDisplay(): void {
    // Update the canvas texture - recreate from canvas
    if (this.scene.textures.exists(this.textureKey)) {
      this.scene.textures.remove(this.textureKey);
    }
    this.scene.textures.addCanvas(this.textureKey, this.canvas);
    if (this.terrainImage) {
      this.terrainImage.setTexture(this.textureKey);
    }
  }

  private refreshCollisionAndHeightMap(startX: number, endX: number): void {
    const sx = Math.max(0, Math.floor(startX));
    const ex = Math.min(this.width - 1, Math.ceil(endX));

    const imageData = this.solidCtx.getImageData(0, 0, this.width, this.height);
    this.collisionData = imageData.data;
    this.rebuildHeightMapFromPixels(this.collisionData, sx, ex);
  }

  private addSolidEllipse(cx: number, cy: number, rx: number, ry: number, rotation: number = 0): void {
    this.solidCtx.fillStyle = '#ffffff';
    this.solidCtx.beginPath();
    this.solidCtx.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2);
    this.solidCtx.fill();
    // Add solid terrain (used for crude barriers / berms)
    this.ctx.globalCompositeOperation = 'source-over';

    const grad = this.ctx.createRadialGradient(cx, cy - ry * 0.5, 2, cx, cy, Math.max(rx, ry));
    grad.addColorStop(0, 'rgba(110, 75, 45, 0.98)');
    grad.addColorStop(1, 'rgba(60, 40, 25, 0.98)');
    this.ctx.fillStyle = grad;

    this.ctx.beginPath();
    this.ctx.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2);
    this.ctx.fill();
  }

  public buildCrudeBarrier(centerX: number, groundY: number, facing: -1 | 1): void {
    // A two-row sandbag wall leaves a small movement gap and reaches high enough
    // to interrupt a blast ray aimed at the soldier's torso.
    const cx = centerX + facing * 40;
    const cy = groundY - 11;
    const rx = 29;
    const ry = 18;

    this.addSolidEllipse(cx, cy + 2, rx, ry - 2, facing * 0.08);

    this.ctx.globalCompositeOperation = 'source-over';
    const bags = [
      { x: -18, y: 2, w: 22, h: 10 },
      { x: 0, y: 3, w: 22, h: 10 },
      { x: 18, y: 2, w: 22, h: 10 },
      { x: -10, y: -8, w: 23, h: 10 },
      { x: 11, y: -8, w: 23, h: 10 },
    ];
    for (const bag of bags) {
      this.solidCtx.beginPath();
      this.solidCtx.ellipse(cx + bag.x, cy + bag.y, bag.w / 2, bag.h / 2, facing * 0.04, 0, Math.PI * 2);
      this.solidCtx.fill();
      this.ctx.fillStyle = bag.y < 0 ? '#a9895b' : '#8f7049';
      this.ctx.strokeStyle = '#4a3825';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.ellipse(cx + bag.x, cy + bag.y, bag.w / 2, bag.h / 2, facing * 0.04, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    }

    const startX = cx - rx - 6;
    const endX = cx + rx + 6;
    this.refreshCollisionAndHeightMap(startX, endX);
    this.redrawGrassInArea(Math.floor(startX), Math.floor(endX));
    this.updateDisplay();
  }

  public getBlastExposure(startX: number, startY: number, targetX: number, targetY: number): number {
    return traceBlastExposure(startX, startY, targetX, targetY, (x, y) => this.isPointSolid(x, y));
  }

  public digTunnel(startX: number, startY: number, endX: number, endY: number, radius: number): boolean {
    const steps = Math.max(4, Math.ceil(Math.hypot(endX - startX, endY - startY) / 8));
    let solidSamples = 0;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;
      if (
        this.isPointSolid(x, y) ||
        this.isPointSolid(x, y + radius * 0.55) ||
        this.isPointSolid(x, y - radius * 0.55)
      ) {
        solidSamples++;
      }
    }

    if (solidSamples < Math.max(2, Math.floor(steps * 0.25))) return false;

    for (const context of [this.ctx, this.solidCtx]) {
      context.save();
      context.globalCompositeOperation = 'destination-out';
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = radius * 2;
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
      context.stroke();
      context.beginPath();
      context.arc(endX, endY, radius * 1.08, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    const start = Math.min(startX, endX) - radius - 8;
    const end = Math.max(startX, endX) + radius + 8;
    this.refreshCollisionAndHeightMap(start, end);
    this.redrawGrassInArea(Math.floor(start), Math.ceil(end));
    this.updateDisplay();
    return true;
  }

  public destroyCircle(centerX: number, centerY: number, radius: number): void {
    // Create explosion crater - completely remove terrain
    // Clear with a circular mask (avoid square clearRect so craters stay round).
    for (const context of [this.ctx, this.solidCtx]) {
      context.save();
      context.globalCompositeOperation = 'destination-out';
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-atop';
    this.ctx.strokeStyle = 'rgba(15,19,22,0.68)';
    this.ctx.lineWidth = 9;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius + 3, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();

    // Update heightMap in the affected area by scanning for new surface
    const startX = Math.max(0, Math.floor(centerX - radius - 5));
    const endX = Math.min(this.width - 1, Math.ceil(centerX + radius + 5));
    
    this.refreshCollisionAndHeightMap(startX, endX);
    
    // Redraw grass around the crater edges
    this.redrawGrassInArea(startX, endX);

    // Update display
    this.updateDisplay();
  }

  private redrawGrassInArea(startX: number, endX: number): void {
    const grassThickness = 10;
    const xStart = Math.max(0, startX - 5);
    const xEnd = Math.min(this.width - 1, endX + 5);
    
    // Scan for actual surface in the affected area
    const actualSurface: number[] = [];
    for (let x = xStart; x <= xEnd; x++) {
      let surfaceY = this.height;
      for (let y = 0; y < this.height; y++) {
        const idx = (y * this.width + x) * 4;
        if (this.collisionData[idx + 3] > 128) {
          surfaceY = y;
          break;
        }
      }
      actualSurface.push(surfaceY);
    }
    
    // Draw grass segments only where there's solid terrain
    for (let i = 0; i < actualSurface.length - 1; i++) {
      const x = xStart + i;
      const y1 = actualSurface[i];
      const y2 = actualSurface[i + 1];
      
      // Skip if no solid terrain or big gap
      if (y1 >= this.height - 5 || y2 >= this.height - 5) continue;
      if (Math.abs(y2 - y1) > 30) continue;
      
      // Calculate slope angle for this segment
      const slopeAngle = Math.atan2(y2 - y1, 1);
      
      // Calculate perpendicular offset for grass thickness
      const perpX = Math.sin(slopeAngle) * grassThickness;
      const perpY = Math.cos(slopeAngle) * grassThickness;
      
      // Grass color with slight variation
      const greenVariation = Math.floor((y1 + x) % 20);
      this.ctx.fillStyle = `rgb(${55 + greenVariation}, ${120 + greenVariation}, ${45 + greenVariation})`;
      
      // Draw a quad that follows the terrain slope
      this.ctx.beginPath();
      this.ctx.moveTo(x, y1);
      this.ctx.lineTo(x + 1, y2);
      this.ctx.lineTo(x + 1 - perpX, y2 + perpY);
      this.ctx.lineTo(x - perpX, y1 + perpY);
      this.ctx.closePath();
      this.ctx.fill();
    }
    
    // Add darker grass edge line on top for definition
    this.ctx.strokeStyle = '#2d6b27';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    let drawing = false;
    
    for (let i = 0; i < actualSurface.length; i++) {
      const x = xStart + i;
      const y = actualSurface[i];
      const nextY = actualSurface[i + 1] || y;
      
      if (y >= this.height - 5 || Math.abs(nextY - y) > 30) {
        if (drawing) {
          this.ctx.stroke();
          this.ctx.beginPath();
          drawing = false;
        }
        continue;
      }
      
      if (!drawing) {
        this.ctx.moveTo(x, y);
        drawing = true;
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    if (drawing) this.ctx.stroke();
  }

  public forgetCollision(sprite: Phaser.Physics.Arcade.Sprite): void {
    this.collisionState.delete(sprite);
  }

  public isPointSolid(x: number, y: number): boolean {
    const px = Math.floor(x), py = Math.floor(y);
    if (px < 0 || px >= this.width || py < 0 || py >= this.height) return false;
    return this.collisionData[(py * this.width + px) * 4 + 3] > 128;
  }

  /** Forget a body's tracked position (after teleporting it), so collision doesn't sweep from the old spot. */
  public resetCollisionState(sprite: Phaser.Physics.Arcade.Sprite): void {
    this.collisionState.delete(sprite);
  }

  public checkCollision(sprite: Phaser.Physics.Arcade.Sprite): boolean {
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    const prior = this.collisionState.get(sprite) ?? { x: sprite.x, y: sprite.y, grounded: false };
    const result = moveCharacter(prior, Math.max(8, Math.min(this.width - 9, sprite.x)), sprite.y,
      (x, y) => y >= this.height - 5 || this.isPointSolid(x, y), this.height, body.velocity.y < 0);
    sprite.setPosition(result.x, result.y);
    if (result.blockedX) body.setVelocityX(0);
    if (result.blockedY || result.grounded) body.setVelocityY(0);
    body.setAllowGravity(!result.grounded);
    this.collisionState.set(sprite, result);
    return result.grounded;
  }
}
