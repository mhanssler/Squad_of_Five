// On-screen touch buttons for phones/tablets. Each button presses one or more of the game's
// existing keyboard keys, so every rule and ability keeps working exactly as it does on desktop.
// This module only decides WHICH buttons show and WHERE (in the 1280x720 game space).

export type TouchPhase =
  | 'menu'
  | 'intro'
  | 'selecting'
  | 'turn'
  | 'preview' // grapple / tunnel / cover preview waiting for confirm
  | 'airstrike'
  | 'howitzer'
  | 'afterShot' // a Kamikaze Goat is walking
  | 'waiting' // AI turn or shot in flight
  | 'gameover';

export interface TouchContext {
  phase: TouchPhase;
  isOperations: boolean;
  isMedic: boolean;
  hasCrateWeapon: boolean;
  crateWeaponArmed: boolean;
  airstrikeCharges: number;
  artilleryCharges: number;
  /** A Kamikaze Goat is walking and can be detonated. */
  canDetonate: boolean;
}

/** Key names understood by the TouchControls scene (Phaser KeyCodes names). */
export type TouchKey =
  | 'LEFT' | 'RIGHT' | 'UP' | 'W' | 'S' | 'SPACE' | 'ENTER' | 'ESC' | 'TAB'
  | 'G' | 'B' | 'SHIFT' | 'H' | 'Q' | 'X' | 'C' | 'N';

export interface TouchButton {
  id: string;
  label: string;
  /** Keys held down while the button is pressed. */
  keys: TouchKey[];
  x: number;
  y: number;
  radius: number;
  /** Visual emphasis: primary (fire / confirm), normal, or subtle. */
  tone: 'primary' | 'normal' | 'subtle' | 'danger';
}

const MOVE_Y = 560;
// Abilities sit in a two-column grid down the right edge, above the fire button.
const ACTION_COLUMNS = [1216, 1148];
const ACTION_TOP = 150;
const ACTION_ROW_GAP = 66;
const ACTION_RADIUS = 29;

function actionGrid(buttons: Omit<TouchButton, 'x' | 'y' | 'radius'>[]): TouchButton[] {
  return buttons.map((b, i) => ({
    ...b,
    x: ACTION_COLUMNS[i % ACTION_COLUMNS.length],
    y: ACTION_TOP + Math.floor(i / ACTION_COLUMNS.length) * ACTION_ROW_GAP,
    radius: ACTION_RADIUS,
  }));
}

export function getTouchButtons(ctx: TouchContext): TouchButton[] {
  switch (ctx.phase) {
    case 'menu':
    case 'intro':
    case 'waiting':
      return [];

    case 'gameover':
      return [{ id: 'newGame', label: 'NEW GAME', keys: ['N'], x: 640, y: 480, radius: 60, tone: 'primary' }];

    case 'selecting':
      return [
        { id: 'prev', label: '◀', keys: ['LEFT'], x: 80, y: MOVE_Y, radius: 44, tone: 'normal' },
        { id: 'next', label: '▶', keys: ['RIGHT'], x: 190, y: MOVE_Y, radius: 44, tone: 'normal' },
        { id: 'select', label: 'SELECT', keys: ['ENTER'], x: 1170, y: MOVE_Y, radius: 56, tone: 'primary' },
      ];

    case 'preview':
      return [
        { id: 'aimUp', label: '▲', keys: ['W'], x: 1060, y: 500, radius: 34, tone: 'normal' },
        { id: 'aimDown', label: '▼', keys: ['S'], x: 1060, y: 600, radius: 34, tone: 'normal' },
        { id: 'confirm', label: 'GO', keys: ['ENTER'], x: 1170, y: MOVE_Y, radius: 56, tone: 'primary' },
        { id: 'cancel', label: 'CANCEL', keys: ['ESC'], x: 80, y: MOVE_Y, radius: 44, tone: 'danger' },
      ];

    case 'airstrike':
      // Tap the map to call it in.
      return [{ id: 'cancel', label: 'CANCEL', keys: ['ESC'], x: 80, y: MOVE_Y, radius: 44, tone: 'danger' }];

    case 'afterShot':
      return ctx.canDetonate
        ? [{ id: 'detonate', label: 'BOOM', keys: ['SPACE'], x: 1170, y: MOVE_Y, radius: 56, tone: 'danger' }]
        : [];

    case 'howitzer':
    case 'turn': {
      const buttons: TouchButton[] = [
        { id: 'left', label: '◀', keys: ['LEFT'], x: 80, y: MOVE_Y, radius: 44, tone: 'normal' },
        { id: 'right', label: '▶', keys: ['RIGHT'], x: 190, y: MOVE_Y, radius: 44, tone: 'normal' },
        { id: 'jump', label: 'JUMP', keys: ['UP'], x: 135, y: MOVE_Y - 100, radius: 38, tone: 'subtle' },
        { id: 'aimUp', label: '▲', keys: ['W'], x: 1060, y: 500, radius: 34, tone: 'normal' },
        { id: 'aimDown', label: '▼', keys: ['S'], x: 1060, y: 600, radius: 34, tone: 'normal' },
        { id: 'fire', label: 'FIRE', keys: ['SPACE'], x: 1170, y: MOVE_Y, radius: 60, tone: 'primary' },
      ];
      if (ctx.phase === 'howitzer') {
        buttons.push({ id: 'cancel', label: 'BACK', keys: ['ESC'], x: 80, y: MOVE_Y - 200, radius: 34, tone: 'danger' });
        return buttons;
      }

      const actions: Omit<TouchButton, 'x' | 'y' | 'radius'>[] = [
        { id: 'grapple', label: 'HOOK', keys: ['G'], tone: 'normal' },
      ];
      if (ctx.isOperations) {
        actions.push({ id: 'tunnel', label: 'DIG', keys: ['B'], tone: 'normal' });
        actions.push({ id: 'cover', label: 'COVER', keys: ['SHIFT', 'B'], tone: 'normal' });
      } else {
        actions.push({ id: 'cover', label: 'COVER', keys: ['B'], tone: 'normal' });
      }
      if (ctx.isMedic) actions.push({ id: 'heal', label: 'HEAL', keys: ['H'], tone: 'normal' });
      if (ctx.hasCrateWeapon) {
        actions.push({ id: 'special', label: ctx.crateWeaponArmed ? 'PUT AWAY' : 'SPECIAL', keys: ['Q'], tone: 'primary' });
      }
      if (ctx.airstrikeCharges > 0) actions.push({ id: 'airstrike', label: 'AIR', keys: ['X'], tone: 'normal' });
      if (ctx.artilleryCharges > 0) actions.push({ id: 'howitzer', label: 'GUN', keys: ['C'], tone: 'normal' });

      buttons.push(...actionGrid(actions));
      // Back to soldier selection (only before acting).
      buttons.push({ id: 'back', label: 'BACK', keys: ['ESC'], x: 80, y: MOVE_Y - 200, radius: 30, tone: 'subtle' });
      return buttons;
    }
  }
}

/** Buttons must not overlap each other (keeps fat-finger presses unambiguous). */
export function findOverlaps(buttons: TouchButton[], gap = 4): [string, string][] {
  const overlaps: [string, string][] = [];
  for (let i = 0; i < buttons.length; i++) {
    for (let j = i + 1; j < buttons.length; j++) {
      const a = buttons[i], b = buttons[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius + gap) overlaps.push([a.id, b.id]);
    }
  }
  return overlaps;
}
