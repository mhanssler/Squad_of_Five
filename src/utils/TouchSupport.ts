// Whether to show the on-screen touch controls (and the bigger phone HUD).
//
// It follows what the player actually uses: phones start in touch mode, anything with a mouse or
// trackpad starts in desktop mode, and it flips on the fly - touching the screen switches to touch
// controls, a key press or mouse click switches back. (Touchscreen laptops report a "coarse" main
// pointer, so the device type alone isn't a reliable signal.)
// `?touch=1` / `?touch=0` in the URL pins it on/off (handy for testing).

type Listener = (touch: boolean) => void;

const listeners = new Set<Listener>();
let forced: boolean | null = null;
let touchMode = false;

function detectInitial(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get('touch');
    if (param === '1' || param === '0') {
      forced = param === '1';
      return forced;
    }
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const hasFinePointer = window.matchMedia?.('(any-pointer: fine)').matches ?? false;
    return coarse && !hasFinePointer;
  } catch {
    return false;
  }
}

function setTouchMode(on: boolean): void {
  if (forced !== null || on === touchMode) return;
  touchMode = on;
  listeners.forEach(fn => fn(on));
}

if (typeof window !== 'undefined') {
  touchMode = detectInitial();
  window.addEventListener('pointerdown', e => setTouchMode(e.pointerType === 'touch' || e.pointerType === 'pen' ? true : false), { capture: true, passive: true });
  window.addEventListener('keydown', () => setTouchMode(false), { capture: true, passive: true });
}

export function isTouchUI(): boolean {
  return touchMode;
}

/** Called whenever touch mode turns on or off. Returns an unsubscribe function. */
export function onTouchModeChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
