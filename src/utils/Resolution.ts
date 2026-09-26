import Phaser from 'phaser';

// Crisp rendering on any screen.
//
// All game code is laid out for a 1280x720 "logical" screen. Rendering that into a 1280x720 canvas
// and letting the browser stretch it to a big or high-DPI display made everything soft. Instead the
// canvas is created at the display's real pixel size (DISPLAY_SCALE x 1280x720) and every camera
// zooms by DISPLAY_SCALE, so logical coordinates stay the same while pixels are drawn natively.

export const LOGICAL_WIDTH = 1280;
export const LOGICAL_HEIGHT = 720;

function computeDisplayScale(): number {
  try {
    const params = new URLSearchParams(window.location.search).get('scale');
    if (params && !Number.isNaN(Number(params))) return Math.min(4, Math.max(1, Number(params)));
    const fit = Math.min(window.innerWidth / LOGICAL_WIDTH, window.innerHeight / LOGICAL_HEIGHT);
    const devicePixels = fit * (window.devicePixelRatio || 1);
    // Phones get a lower ceiling to keep the frame rate up.
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const max = coarse ? 2 : 3;
    // Round up to the next half step so the browser never has to stretch the canvas.
    return Math.min(max, Math.max(1, Math.ceil(devicePixels * 2) / 2));
  } catch {
    return 1;
  }
}

/** Canvas pixels per logical pixel. */
export const DISPLAY_SCALE = typeof window === 'undefined' ? 1 : computeDisplayScale();

/**
 * Text is rasterised into its own texture; render it at the display resolution (with headroom for
 * the battlefield camera zooming in) so it isn't blurry.
 */
export const TEXT_RESOLUTION = Math.min(4, Math.ceil(DISPLAY_SCALE * 1.5 * 2) / 2);

/** For screen-space scenes (menus, HUD, touch buttons): show the 1280x720 logical layout at full resolution. */
export function fitScreenCamera(scene: Phaser.Scene): void {
  const cam = scene.cameras.main;
  cam.setOrigin(0, 0);
  cam.setZoom(DISPLAY_SCALE);
  cam.setScroll(0, 0);
}

/** Make every Text object render at TEXT_RESOLUTION (call once, before the game starts). */
export function installCrispText(): void {
  const factory = Phaser.GameObjects.GameObjectFactory.prototype as unknown as {
    text: (...args: unknown[]) => Phaser.GameObjects.Text;
  };
  const original = factory.text;
  factory.text = function (this: unknown, ...args: unknown[]) {
    const text = original.apply(this, args);
    text.setResolution(TEXT_RESOLUTION);
    return text;
  };
}
