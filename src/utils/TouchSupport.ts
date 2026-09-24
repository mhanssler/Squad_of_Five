// Whether to show the on-screen touch controls.
// `?touch=1` / `?touch=0` in the URL forces them on/off (handy for testing on a desktop).
export function isTouchUI(): boolean {
  try {
    const forced = new URLSearchParams(window.location.search).get('touch');
    if (forced === '1') return true;
    if (forced === '0') return false;
    // A coarse primary pointer means a finger, not a mouse (touch laptops with a mouse stay desktop-style).
    return window.matchMedia?.('(pointer: coarse)').matches ?? false;
  } catch {
    return false;
  }
}
