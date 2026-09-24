import Phaser from 'phaser';

export class Terrain {
  private scene: Phaser.Scene;
  private width: number;
  private height: number;
  private terrainImage!: Phaser.GameObjects.Image;
  private collisionData!: Uint8ClampedArray;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private heightMap: number[] = [];
  private seed: number;
  private textureKey: string;
  private preset: 'standard' | 'plains' | 'hills' | 'caves';

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
    this.preset = options?.preset ?? 'standard';

    // Create offscreen canvas for collision detection
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;

    // Generate initial terrain with seed
    this.generateTerrain();

    // Create texture immediately and add image
    this.createTerrainTexture();
  }

  private createTerrainTexture(): void {
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
      
      // === ENHANCED ROCKY DETAIL ===
      // Medium rocky bumps
      y += Math.sin(x * 0.03 + phaseShift * 1.5) * 18;
      y += Math.cos(x * 0.045 + phaseShift * 0.8) * 14;
      
      // Small bumps and texture (increased density)
      y += Math.sin(x * 0.05 + phaseShift * 2) * 12;
      y += Math.sin(x * 0.08 + phaseShift) * 8;
      y += Math.cos(x * 0.12 + phaseShift * 1.2) * 6;
      
      // Fine rocky detail - high frequency for jagged look
      y += Math.sin(x * 0.15 + phaseShift * 2.5) * 5;
      y += Math.cos(x * 0.22 + phaseShift * 0.3) * 4;
      y += Math.sin(x * 0.35 + phaseShift * 1.8) * 3;
      
      // Micro-texture for rough appearance
      y += Math.sin(x * 0.5 + phaseShift) * 2;
      y += Math.cos(x * 0.7 + phaseShift * 2) * 1.5;
      
      // Random small rocks/pebbles effect using pseudo-random from position
      const rockNoise = Math.sin(x * 1.3 + phaseShift * 3.7) * Math.cos(x * 0.9 + phaseShift);
      y += rockNoise * 3;
      
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

    // Create caves and overhangs by carving out areas
    this.ctx.globalCompositeOperation = 'destination-out';
    
    // Generate several cave systems based on seed
    const cavesEnabled = this.preset === 'standard' || this.preset === 'caves';
    if (cavesEnabled) {
      const numCavesBase = this.preset === 'caves' ? 6 : 3;
      const numCaves = numCavesBase + Math.floor(this.seededRandom() * 5);
      for (let i = 0; i < numCaves; i++) {
        const caveX = 300 + this.seededRandom() * (this.width - 600);
        const surfaceY = this.heightMap[Math.floor(caveX)] || baseLevel;
        const caveY = surfaceY + 45 + this.seededRandom() * (this.preset === 'caves' ? 110 : 80); // Below surface
        const caveWidth = (this.preset === 'caves' ? 90 : 60) + this.seededRandom() * 110;
        const caveHeight = (this.preset === 'caves' ? 40 : 30) + this.seededRandom() * 60;
        
        // Only create cave if it's below the surface
        if (caveY > surfaceY + 20 && caveY < this.height - 50) {
          // Draw elliptical cave
          this.ctx.beginPath();
          this.ctx.ellipse(caveX, caveY, caveWidth, caveHeight, 0, 0, Math.PI * 2);
          this.ctx.fill();
          
          // Add connecting tunnels sometimes
          const tunnelChance = this.preset === 'caves' ? 0.75 : 0.5;
          if (this.seededRandom() > (1 - tunnelChance) && i < numCaves - 1) {
            const tunnelEndX = caveX + 80 + this.seededRandom() * 170;
            const tunnelEndY = caveY + (this.seededRandom() - 0.5) * (this.preset === 'caves' ? 90 : 60);
            this.ctx.beginPath();
            this.ctx.ellipse(
              (caveX + tunnelEndX) / 2,
              (caveY + tunnelEndY) / 2, 
              Math.abs(tunnelEndX - caveX) / 2 + 26,
              this.preset === 'caves' ? 34 : 25, 
              Math.atan2(tunnelEndY - caveY, tunnelEndX - caveX),
              0,
              Math.PI * 2
            );
            this.ctx.fill();
          }
        }
      }
    }
    
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
    let imageData = this.ctx.getImageData(0, 0, this.width, this.height);
    let tempCollisionData = imageData.data;
    
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

    // Store final collision data
    imageData = this.ctx.getImageData(0, 0, this.width, this.height);
    this.collisionData = imageData.data;
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

    const imageData = this.ctx.getImageData(0, 0, this.width, this.height);
    this.collisionData = imageData.data;

    for (let x = sx; x <= ex; x++) {
      let foundSurface = false;
      for (let y = 0; y < this.height; y++) {
        const index = (y * this.width + x) * 4;
        if (this.collisionData[index + 3] > 128) {
          this.heightMap[x] = y;
          foundSurface = true;
          break;
        }
      }
      if (!foundSurface) this.heightMap[x] = this.height;
    }
  }

  private addSolidEllipse(cx: number, cy: number, rx: number, ry: number, rotation: number = 0): void {
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
    // Build a small berm in front of the soldier. This is real terrain (solid).
    const cx = centerX + facing * 26;
    const cy = groundY - 10;
    const rx = 22;
    const ry = 16;

    this.addSolidEllipse(cx, cy, rx, ry, facing * 0.15);

    // A couple of dark "sandbag" stripes for definition (kept solid).
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.strokeStyle = 'rgba(40, 28, 18, 0.75)';
    this.ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const y = cy - 6 + i * 6;
      this.ctx.beginPath();
      this.ctx.moveTo(cx - rx + 4, y);
      this.ctx.lineTo(cx + rx - 4, y + facing * 1);
      this.ctx.stroke();
    }

    const startX = cx - rx - 6;
    const endX = cx + rx + 6;
    this.refreshCollisionAndHeightMap(startX, endX);
    this.redrawGrassInArea(Math.floor(startX), Math.floor(endX));
    this.updateDisplay();
  }

  public destroyCircle(centerX: number, centerY: number, radius: number): void {
    // Create explosion crater - completely remove terrain
    // Clear with a circular mask (avoid square clearRect so craters stay round).
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.globalCompositeOperation = 'source-over';

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

  public checkCollision(sprite: Phaser.Physics.Arcade.Sprite): boolean {
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    const footOffsetY = 14;
    const halfFootWidth = 7;
    const maxStepUp = 18;
    const maxStepDown = 32;
    const maxContactSpread = 24;
    const maxSweep = 160;

    let footY = Math.floor(sprite.y + footOffsetY);

    // Prevent falling below world.
    if (footY >= this.height - 5) {
      sprite.y = this.height - footOffsetY - 5;
      body.setVelocityY(0);
      body.setAllowGravity(false);
      return true;
    }

    if (sprite.x < 0 || sprite.x >= this.width || footY < 0) {
      body.setAllowGravity(true);
      return false;
    }

    const isSolidAt = (px: number, py: number): boolean => {
      const ix = Math.floor(px);
      const iy = Math.floor(py);
      if (ix < 0 || ix >= this.width || iy < 0 || iy >= this.height) return false;
      const index = (iy * this.width + ix) * 4;
      return this.collisionData[index + 3] > 128;
    };

    const anySolid = (pts: { x: number; y: number }[]): boolean => {
      for (const p of pts) {
        if (isSolidAt(p.x, p.y)) return true;
      }
      return false;
    };

    // Physics can move a falling body many pixels between checks (fixed-step catch-up on slow frames),
    // enough to pass straight through a thin ledge. Sweep from last check's foot position so a surface
    // crossed in between still catches the soldier.
    const lastFootY = sprite.getData('terrainLastFootY') as number | undefined;
    const fallSweep = lastFootY !== undefined && body.velocity.y > 0 ? footY - Math.floor(lastFootY) : 0;
    const maxRise = fallSweep > maxStepUp && fallSweep <= maxSweep ? fallSweep : maxStepUp;

    const findLocalSurface = (sampleX: number): number | null => {
      return this.findSurfaceYAtOrBelow(
        sampleX,
        footY - maxRise,
        maxRise + maxStepDown
      );
    };

    const footSamples = [
      sprite.x - halfFootWidth,
      sprite.x,
      sprite.x + halfFootWidth,
    ];
    const surfaces = footSamples
      .map(findLocalSurface)
      .filter((y): y is number => y !== null);

    let onGround = false;

    if (surfaces.length > 0 && body.velocity.y >= -30) {
      const highestSurface = Math.min(...surfaces);
      const lowestSurface = Math.max(...surfaces);
      const contactSpread = lowestSurface - highestSurface;
      const targetY = highestSurface - footOffsetY;
      const snapDelta = targetY - sprite.y;

      if (contactSpread <= maxContactSpread && snapDelta >= -maxRise && snapDelta <= maxStepDown) {
        sprite.y = targetY;
        body.setVelocityY(0);
        body.setAllowGravity(false);
        onGround = true;
      } else if (snapDelta < -maxStepUp && Math.abs(body.velocity.x) > 1) {
        // A sudden rise is a wall/cliff face, not a walkable slope.
        body.setVelocityX(0);
      }
    }

    if (!onGround) {
      body.setAllowGravity(true);
    }

    // If knockback or terrain edits leave the body embedded, nudge upward until clear.
    const bodyPts = (): { x: number; y: number }[] => [
      { x: sprite.x, y: sprite.y - 10 },
      { x: sprite.x - 8, y: sprite.y },
      { x: sprite.x + 8, y: sprite.y },
      { x: sprite.x, y: sprite.y + 8 },
      { x: sprite.x - 6, y: sprite.y + footOffsetY - 1 },
      { x: sprite.x + 6, y: sprite.y + footOffsetY - 1 },
    ];

    for (let i = 0; i < 72; i++) {
      if (!anySolid(bodyPts())) break;
      sprite.y -= 1;
      footY = Math.floor(sprite.y + footOffsetY);
      if (body.velocity.y > 0) body.setVelocityY(0);
    }

    sprite.setData('terrainLastFootY', sprite.y + footOffsetY);
    return onGround;
  }

  public isPointSolid(x: number, y: number): boolean {
    const px = Math.floor(x);
    const py = Math.floor(y);

    if (px < 0 || px >= this.width || py < 0 || py >= this.height) {
      return false;
    }

    const index = (py * this.width + px) * 4;
    return this.collisionData[index + 3] > 128;
  }
}
