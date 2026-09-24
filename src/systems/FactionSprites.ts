import Phaser from 'phaser';
import {
  FACTIONS,
  FACTION_BASE_SPRITES,
  FactionDefinition,
  FactionId,
  getFactionSpriteTextureKey,
} from './Factions';

const SPRITE_SIZE = 64;
const EMBLEM_SIZE = 40;

const SOURCE_COLORS = {
  uniform: 0x2d5016,
  uniformLight: 0x4a7c23,
  uniformDark: 0x1e3a0f,
  helmet: 0x3d3d3d,
  helmetLight: 0x5a5a5a,
  helmetDark: 0x2a2a2a,
  skin: 0xe0b89a,
  skinShadow: 0xc49a7a,
  skinHighlight: 0xf0c8aa,
  boots: 0x2a1810,
  bootsLight: 0x3d2820,
  webbing: 0x4a5a3a,
  webbingDark: 0x3a4a2a,
  pouch: 0x5a6a4a,
} as const;

const HELMET_SOURCE_COLORS = new Set([
  SOURCE_COLORS.helmet,
  SOURCE_COLORS.helmetLight,
  SOURCE_COLORS.helmetDark,
  0x556b2f,
]);

export function getFactionWalkTextureKey(
  factionId: FactionId,
  weaponId: string,
  phase: number,
): string {
  return `${getFactionSpriteTextureKey(factionId, weaponId)}-walk-${phase}`;
}

function colorCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function readRgb(data: Uint8ClampedArray, offset: number): number {
  return (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
}

function writeRgb(data: Uint8ClampedArray, offset: number, color: number): void {
  data[offset] = (color >> 16) & 0xff;
  data[offset + 1] = (color >> 8) & 0xff;
  data[offset + 2] = color & 0xff;
}

function recolorSprite(
  context: CanvasRenderingContext2D,
  faction: FactionDefinition,
  variantIndex: number,
): void {
  const image = context.getImageData(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  const skin = faction.skinPalettes[variantIndex % faction.skinPalettes.length];
  const palette = faction.palette;
  const replacements = new Map<number, number>([
    [SOURCE_COLORS.uniform, palette.uniform],
    [SOURCE_COLORS.uniformLight, palette.uniformLight],
    [SOURCE_COLORS.uniformDark, palette.uniformDark],
    [SOURCE_COLORS.skin, skin.base],
    [SOURCE_COLORS.skinShadow, skin.shadow],
    [SOURCE_COLORS.skinHighlight, skin.highlight],
    [SOURCE_COLORS.webbing, palette.webbing],
    [SOURCE_COLORS.webbingDark, palette.webbingDark],
    [SOURCE_COLORS.pouch, palette.pouch],
    [0x4a6a4a, palette.pouch],
    [0x3d4a3d, palette.pouch],
    [0x4a5a4a, palette.pouch],
  ]);

  for (let y = 0; y < SPRITE_SIZE; y++) {
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const offset = (y * SPRITE_SIZE + x) * 4;
      if (image.data[offset + 3] === 0) continue;

      const source = readRgb(image.data, offset);
      const inHeadgearZone = y <= 14 && x >= 18 && x <= 46;
      if (inHeadgearZone && HELMET_SOURCE_COLORS.has(source)) {
        image.data[offset + 3] = 0;
        continue;
      }

      if (y >= 48 && source === SOURCE_COLORS.boots) {
        writeRgb(image.data, offset, palette.boots);
        continue;
      }
      if (y >= 48 && source === SOURCE_COLORS.bootsLight) {
        writeRgb(image.data, offset, palette.bootsLight);
        continue;
      }

      const replacement = replacements.get(source);
      if (replacement !== undefined) {
        writeRgb(image.data, offset, replacement);
      }
    }
  }

  context.putImageData(image, 0, 0);
}

function fillEllipse(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
): void {
  context.fillStyle = colorCss(color);
  context.beginPath();
  context.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
  context.fill();
}

function fillPolygon(
  context: CanvasRenderingContext2D,
  points: ReadonlyArray<readonly [number, number]>,
  color: number,
): void {
  context.fillStyle = colorCss(color);
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    context.lineTo(points[i][0], points[i][1]);
  }
  context.closePath();
  context.fill();
}

function drawStar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  outerRadius: number,
  innerRadius: number,
  color: number,
): void {
  context.fillStyle = colorCss(color);
  context.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
  context.fill();
}

function drawHeadgear(context: CanvasRenderingContext2D, faction: FactionDefinition): void {
  const { helmet, helmetLight, helmetDark, accent } = faction.palette;

  switch (faction.headgear) {
    case 'm1':
      fillEllipse(context, 32, 8, 26, 17, helmetDark);
      fillEllipse(context, 31, 7, 23, 14, helmet);
      fillEllipse(context, 28, 5, 10, 5, helmetLight);
      context.fillStyle = colorCss(helmetDark);
      context.fillRect(18, 10, 28, 4);
      context.fillStyle = colorCss(helmet);
      context.fillRect(20, 10, 24, 2);
      drawStar(context, 32, 8, 2.8, 1.2, accent);
      break;

    case 'brodie':
      fillEllipse(context, 32, 10, 34, 9, helmetDark);
      fillEllipse(context, 32, 9, 31, 6, helmet);
      fillEllipse(context, 32, 6, 18, 12, helmetDark);
      fillEllipse(context, 31, 5, 16, 10, helmet);
      fillEllipse(context, 28, 3, 7, 3, helmetLight);
      fillEllipse(context, 32, 8, 4, 4, 0x294f86);
      fillEllipse(context, 32, 8, 2.5, 2.5, 0xcf463f);
      break;

    case 'pilotka':
      fillPolygon(context, [[20, 7], [25, 2], [40, 3], [45, 8], [40, 13], [23, 13]], helmetDark);
      fillPolygon(context, [[22, 7], [27, 3], [39, 4], [43, 8], [39, 11], [24, 11]], helmet);
      context.strokeStyle = colorCss(helmetLight);
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(27, 4);
      context.lineTo(34, 10);
      context.lineTo(40, 4);
      context.stroke();
      drawStar(context, 33, 7, 3.2, 1.35, accent);
      break;

    case 'adrian':
      fillEllipse(context, 32, 8, 25, 17, helmetDark);
      fillEllipse(context, 32, 7, 22, 14, helmet);
      context.fillStyle = colorCss(helmetDark);
      context.fillRect(19, 10, 27, 3);
      context.fillStyle = colorCss(helmetLight);
      context.fillRect(31, 0, 3, 10);
      context.fillRect(30, 1, 5, 2);
      context.fillStyle = '#315b9b';
      context.fillRect(29, 7, 2, 3);
      context.fillStyle = '#f0ead8';
      context.fillRect(31, 7, 2, 3);
      context.fillStyle = '#c7433b';
      context.fillRect(33, 7, 2, 3);
      break;

    case 'stahlhelm':
      fillPolygon(context, [[20, 8], [23, 2], [29, 0], [39, 1], [44, 5], [45, 11], [42, 15], [37, 14], [36, 11], [25, 11], [24, 15], [19, 13]], helmetDark);
      fillPolygon(context, [[22, 8], [25, 3], [30, 1], [38, 2], [42, 5], [43, 10], [39, 12], [37, 9], [25, 9], [23, 12], [21, 11]], helmet);
      context.fillStyle = colorCss(helmetLight);
      context.fillRect(26, 3, 9, 2);
      context.fillStyle = colorCss(accent);
      context.fillRect(39, 7, 3, 4);
      context.fillStyle = colorCss(helmetDark);
      context.fillRect(40, 7, 1, 4);
      break;

    case 'type90':
      context.fillStyle = colorCss(helmetDark);
      context.fillRect(20, 9, 5, 12);
      context.fillRect(39, 9, 5, 12);
      context.fillStyle = colorCss(helmet);
      context.fillRect(22, 9, 3, 10);
      context.fillRect(39, 9, 3, 10);
      fillEllipse(context, 32, 8, 25, 17, helmetDark);
      fillEllipse(context, 32, 7, 22, 14, helmet);
      fillEllipse(context, 28, 4, 8, 4, helmetLight);
      context.fillStyle = colorCss(helmetDark);
      context.fillRect(19, 10, 27, 3);
      drawStar(context, 32, 8, 3.2, 1.35, 0xe2c15b);
      break;

    case 'm33':
      context.strokeStyle = '#252923';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(40, 6);
      context.quadraticCurveTo(48, 1, 58, 1);
      context.moveTo(40, 7);
      context.quadraticCurveTo(49, 4, 57, 5);
      context.moveTo(39, 8);
      context.quadraticCurveTo(48, 7, 55, 10);
      context.stroke();
      fillEllipse(context, 32, 8, 25, 17, helmetDark);
      fillEllipse(context, 32, 7, 22, 14, helmet);
      fillEllipse(context, 28, 4, 8, 4, helmetLight);
      context.fillStyle = colorCss(helmetDark);
      context.fillRect(20, 10, 25, 3);
      context.fillStyle = '#2f7c4c';
      context.fillRect(29, 7, 2, 4);
      context.fillStyle = '#e8e1cd';
      context.fillRect(31, 7, 2, 4);
      context.fillStyle = '#bd3f39';
      context.fillRect(33, 7, 2, 4);
      break;
  }
}

function drawFactionDetails(context: CanvasRenderingContext2D, faction: FactionDefinition): void {
  const { webbing, webbingDark, accent } = faction.palette;

  context.lineCap = 'square';
  context.lineWidth = 2;
  context.strokeStyle = colorCss(webbingDark);
  context.beginPath();
  context.moveTo(26, 23);
  context.lineTo(37, 40);
  context.stroke();
  context.lineWidth = 1;
  context.strokeStyle = colorCss(webbing);
  context.beginPath();
  context.moveTo(26, 23);
  context.lineTo(37, 40);
  context.stroke();

  context.fillStyle = colorCss(accent);
  context.fillRect(23, 26, 3, 4);
  context.fillStyle = colorCss(faction.palette.uniformDark);
  context.fillRect(24, 27, 1, 2);

  if (faction.id === 'soviet-union') {
    context.fillStyle = colorCss(accent);
    context.fillRect(29, 22, 2, 3);
    context.fillRect(34, 22, 2, 3);
  } else if (faction.id === 'free-france') {
    context.fillStyle = '#315b9b';
    context.fillRect(23, 26, 1, 4);
    context.fillStyle = '#f0ead8';
    context.fillRect(24, 26, 1, 4);
    context.fillStyle = '#c7433b';
    context.fillRect(25, 26, 1, 4);
  } else if (faction.id === 'japan') {
    context.strokeStyle = colorCss(webbing);
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(24, 39);
    context.lineTo(40, 39);
    context.stroke();
  }
}

function drawWalkingLeg(
  context: CanvasRenderingContext2D,
  faction: FactionDefinition,
  hipX: number,
  kneeX: number,
  ankleX: number,
  front: boolean,
  lift: number,
): void {
  const { uniform, uniformLight, uniformDark, boots, bootsLight } = faction.palette;
  const legColor = front ? uniform : uniformDark;
  const shadowColor = uniformDark;

  fillPolygon(context, [
    [hipX - 4, 40],
    [hipX + 3, 40],
    [kneeX + 3, 50],
    [ankleX + 3, 58 - lift],
    [ankleX - 3, 59 - lift],
    [kneeX - 3, 51],
  ], shadowColor);
  fillPolygon(context, [
    [hipX - 2, 41],
    [hipX + 2, 41],
    [kneeX + 1, 49],
    [ankleX + 2, 57 - lift],
    [ankleX - 2, 57 - lift],
    [kneeX - 2, 50],
  ], legColor);

  if (front) {
    context.strokeStyle = colorCss(uniformLight);
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(hipX - 1, 42);
    context.lineTo(kneeX - 1, 49);
    context.lineTo(ankleX, 55 - lift);
    context.stroke();
  }

  const facing = 1;
  context.save();
  context.translate(0, -lift);
  fillPolygon(context, [
    [ankleX - 3, 55],
    [ankleX + 3, 55],
    [ankleX + facing * 7, 59],
    [ankleX + facing * 7, 62],
    [ankleX - facing * 3, 62],
    [ankleX - facing * 4, 59],
  ], boots);
  context.fillStyle = colorCss(bootsLight);
  context.fillRect(
    facing > 0 ? ankleX : ankleX - 2,
    57,
    3,
    2,
  );
  context.fillStyle = '#160c09';
  context.fillRect(
    facing > 0 ? ankleX - 3 : ankleX - 7,
    61,
    10,
    2,
  );
  context.restore();
}

function redrawWalkingLegs(
  context: CanvasRenderingContext2D,
  faction: FactionDefinition,
  phase: number,
): void {
  const original = context.getImageData(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  const legColors = new Set<number>([
    faction.palette.uniform,
    faction.palette.uniformLight,
    faction.palette.uniformDark,
    faction.palette.boots,
    faction.palette.bootsLight,
    SOURCE_COLORS.uniform,
    SOURCE_COLORS.uniformLight,
    SOURCE_COLORS.uniformDark,
    SOURCE_COLORS.boots,
    SOURCE_COLORS.bootsLight,
    0x1a0a08,
    0x160c09,
  ]);

  const cleared = new ImageData(
    new Uint8ClampedArray(original.data),
    original.width,
    original.height,
  );
  for (let y = 40; y < SPRITE_SIZE; y++) {
    for (let x = 14; x <= 50; x++) {
      const offset = (y * SPRITE_SIZE + x) * 4;
      if (
        cleared.data[offset + 3] > 0 &&
        legColors.has(readRgb(cleared.data, offset))
      ) {
        cleared.data[offset + 3] = 0;
      }
    }
  }
  context.putImageData(cleared, 0, 0);

  // The back leg is painted first so the crossing stride has believable depth.
  const stride = Math.cos(phase * Math.PI / 4);
  const swing = Math.sin(phase * Math.PI / 4);
  drawWalkingLeg(context, faction, 35, 34 - stride * 3, 33 - stride * 8, false, Math.max(0, -swing) * 5);
  drawWalkingLeg(context, faction, 29, 31 + stride * 3, 33 + stride * 8, true, Math.max(0, swing) * 5);

  // Restore weapons, hands, pouches, and class-specific gear that overlap the legs.
  const composed = context.getImageData(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  for (let y = 40; y < SPRITE_SIZE; y++) {
    for (let x = 14; x <= 50; x++) {
      const offset = (y * SPRITE_SIZE + x) * 4;
      if (
        original.data[offset + 3] > 0 &&
        !legColors.has(readRgb(original.data, offset))
      ) {
        composed.data[offset] = original.data[offset];
        composed.data[offset + 1] = original.data[offset + 1];
        composed.data[offset + 2] = original.data[offset + 2];
        composed.data[offset + 3] = original.data[offset + 3];
      }
    }
  }
  context.putImageData(composed, 0, 0);
}

function createWalkTexture(
  scene: Phaser.Scene,
  faction: FactionDefinition,
  weaponId: string,
  phase: number,
): void {
  const textureKey = getFactionWalkTextureKey(faction.id, weaponId, phase);
  if (scene.textures.exists(textureKey)) return;

  const standingKey = getFactionSpriteTextureKey(faction.id, weaponId);
  const source = scene.textures.get(standingKey).getSourceImage() as CanvasImageSource;
  const texture = scene.textures.createCanvas(textureKey, SPRITE_SIZE, SPRITE_SIZE);
  if (!texture) return;

  texture.context.imageSmoothingEnabled = false;
  texture.context.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  texture.context.drawImage(source, 0, 0, SPRITE_SIZE, SPRITE_SIZE);
  redrawWalkingLegs(texture.context, faction, phase);
  texture.refresh();
}

function drawEmblem(context: CanvasRenderingContext2D, factionId: FactionId): void {
  context.clearRect(0, 0, EMBLEM_SIZE, EMBLEM_SIZE);
  context.fillStyle = '#091017';
  context.beginPath();
  context.arc(20, 20, 18, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#d7c98b';
  context.lineWidth = 2;
  context.stroke();

  switch (factionId) {
    case 'united-states':
      context.strokeStyle = '#f1ead7';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(20, 20, 12, 0, Math.PI * 2);
      context.stroke();
      drawStar(context, 20, 20, 10, 4.3, 0xf1ead7);
      break;
    case 'british-commonwealth':
      fillEllipse(context, 20, 20, 25, 25, 0x2d548c);
      fillEllipse(context, 20, 20, 17, 17, 0xe4e0d3);
      fillEllipse(context, 20, 20, 9, 9, 0xc8433d);
      break;
    case 'soviet-union':
      drawStar(context, 20, 20, 12, 5, 0xd33c32);
      context.strokeStyle = '#e2c15b';
      context.lineWidth = 1;
      context.stroke();
      break;
    case 'free-france':
      context.fillStyle = '#e8e2cf';
      context.fillRect(18, 8, 5, 25);
      context.fillRect(10, 14, 21, 5);
      context.fillRect(13, 23, 15, 4);
      context.fillStyle = '#4e8ed0';
      context.fillRect(19, 9, 2, 23);
      break;
    case 'germany':
      context.fillStyle = '#e5e2d8';
      context.fillRect(7, 15, 26, 10);
      context.fillRect(15, 7, 10, 26);
      context.fillStyle = '#252b28';
      context.fillRect(9, 17, 22, 6);
      context.fillRect(17, 9, 6, 22);
      break;
    case 'japan':
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        context.strokeStyle = '#c83b32';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(20 + Math.cos(angle) * 7, 20 + Math.sin(angle) * 7);
        context.lineTo(20 + Math.cos(angle) * 14, 20 + Math.sin(angle) * 14);
        context.stroke();
      }
      fillEllipse(context, 20, 20, 14, 14, 0xc83b32);
      break;
    case 'italy':
      fillPolygon(context, [[9, 8], [31, 8], [29, 29], [20, 35], [11, 29]], 0xe7e0ce);
      context.save();
      context.beginPath();
      context.moveTo(9, 8);
      context.lineTo(31, 8);
      context.lineTo(29, 29);
      context.lineTo(20, 35);
      context.lineTo(11, 29);
      context.closePath();
      context.clip();
      context.fillStyle = '#2f7c4c';
      context.fillRect(8, 7, 9, 29);
      context.fillStyle = '#bd3f39';
      context.fillRect(24, 7, 9, 29);
      context.restore();
      break;
  }
}

export function createFactionTextures(scene: Phaser.Scene): void {
  FACTIONS.forEach(faction => {
    FACTION_BASE_SPRITES.forEach((weaponId, variantIndex) => {
      const textureKey = getFactionSpriteTextureKey(faction.id, weaponId);
      if (!scene.textures.exists(textureKey)) {
        const sourceTextureKey = `worm-${weaponId}`;
        const source = scene.textures.get(sourceTextureKey).getSourceImage() as CanvasImageSource;
        const texture = scene.textures.createCanvas(textureKey, SPRITE_SIZE, SPRITE_SIZE);
        if (!texture) return;
        const context = texture.context;
        context.imageSmoothingEnabled = true;
        context.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
        context.drawImage(source, 0, 0, SPRITE_SIZE, SPRITE_SIZE);
        recolorSprite(context, faction, variantIndex);
        drawFactionDetails(context, faction);
        drawHeadgear(context, faction);
        texture.refresh();
      }

      for (let frame = 0; frame < 8; frame++) {
        createWalkTexture(scene, faction, weaponId, frame);
      }
    });

    const emblemKey = `faction-emblem-${faction.id}`;
    if (!scene.textures.exists(emblemKey)) {
      const emblem = scene.textures.createCanvas(emblemKey, EMBLEM_SIZE, EMBLEM_SIZE);
      if (!emblem) return;
      drawEmblem(emblem.context, faction.id);
      emblem.refresh();
    }
  });
}
