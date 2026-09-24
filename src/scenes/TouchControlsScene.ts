import Phaser from 'phaser';
import { getTouchButtons, type TouchButton, type TouchContext, type TouchKey } from '../systems/TouchLayout';
import { isTouchUI } from '../utils/TouchSupport';

interface GameSceneTouchApi {
  getTouchContext(): TouchContext;
}

interface ButtonView {
  def: TouchButton;
  container: Phaser.GameObjects.Container;
  circle: Phaser.GameObjects.Arc;
  pointerIds: Set<number>;
}

const TONE_COLORS: Record<TouchButton['tone'], { fill: number; stroke: number }> = {
  primary: { fill: 0x2f6d4f, stroke: 0x9dffc8 },
  normal: { fill: 0x1c2a33, stroke: 0xaecbd8 },
  subtle: { fill: 0x141c22, stroke: 0x6f8793 },
  danger: { fill: 0x5a2222, stroke: 0xff9a8a },
};

/**
 * On-screen buttons for phones. Runs above every other scene. Pressing a button holds the matching
 * keyboard key(s) on GameScene, so all game logic is shared with keyboard play.
 */
export class TouchControlsScene extends Phaser.Scene {
  private views = new Map<string, ButtonView>();
  private layoutKey = '';
  private heldKeys = new Map<TouchKey, number>(); // key -> number of buttons holding it

  constructor() {
    // Starts with the game and stays on top of every other scene.
    super({ key: 'TouchControls', active: true });
  }

  create(): void {
    if (!isTouchUI()) {
      this.scene.sleep();
      return;
    }
    // Room for two fingers on buttons plus one on the battlefield.
    this.input.addPointer(3);
    this.createFullscreenButton();

    // A finger lifting anywhere releases whatever it was holding (e.g. it slid off a button).
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.releasePointer(pointer.id));
    this.game.events.on(Phaser.Core.Events.BLUR, () => this.releaseAll());
  }

  update(): void {
    const gameScene = this.scene.get('GameScene') as unknown as GameSceneTouchApi & Phaser.Scene;
    const ctx: TouchContext = this.scene.isActive('GameScene')
      ? gameScene.getTouchContext()
      : { phase: 'menu', isOperations: false, isMedic: false, hasCrateWeapon: false, crateWeaponArmed: false, airstrikeCharges: 0, artilleryCharges: 0, canDetonate: false };

    const defs = getTouchButtons(ctx);
    const key = defs.map(d => `${d.id}:${d.label}`).join('|');
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.rebuild(defs);
    }
  }

  private rebuild(defs: TouchButton[]): void {
    const wanted = new Set(defs.map(d => d.id));
    for (const [id, view] of this.views) {
      const def = defs.find(d => d.id === id);
      if (!def || def.label !== view.def.label || def.keys.join() !== view.def.keys.join()) {
        this.releaseView(view);
        view.container.destroy();
        this.views.delete(id);
      }
    }
    for (const def of defs) {
      if (!wanted.has(def.id) || this.views.has(def.id)) continue;
      this.views.set(def.id, this.createButton(def));
    }
  }

  private createButton(def: TouchButton): ButtonView {
    const colors = TONE_COLORS[def.tone];
    const container = this.add.container(def.x, def.y).setDepth(1000);
    const circle = this.add.circle(0, 0, def.radius, colors.fill, 0.55);
    circle.setStrokeStyle(3, colors.stroke, 0.85);
    const fontSize = def.label.length <= 2 ? Math.round(def.radius * 0.8) : Math.max(11, Math.round(def.radius * 0.36));
    const label = this.add.text(0, 0, def.label, {
      font: `bold ${fontSize}px Arial`,
      color: '#f4f7f8',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5);
    container.add([circle, label]);

    // Generous hit area: a bit bigger than the drawn circle.
    circle.setInteractive(new Phaser.Geom.Circle(def.radius, def.radius, def.radius + 8), Phaser.Geom.Circle.Contains);
    const view: ButtonView = { def, container, circle, pointerIds: new Set() };

    circle.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (view.pointerIds.size === 0) this.pressKeys(def.keys);
      view.pointerIds.add(pointer.id);
      circle.setFillStyle(colors.fill, 0.95);
      container.setScale(0.94);
    });
    const release = (pointer: Phaser.Input.Pointer): void => {
      if (!view.pointerIds.delete(pointer.id)) return;
      if (view.pointerIds.size === 0) this.releaseView(view, false);
    };
    circle.on('pointerup', release);
    circle.on('pointerout', release);
    return view;
  }

  private releaseView(view: ButtonView, clearPointers = true): void {
    if (clearPointers && view.pointerIds.size === 0) return;
    if (clearPointers) view.pointerIds.clear();
    this.releaseKeys(view.def.keys);
    const colors = TONE_COLORS[view.def.tone];
    if (view.circle.active) view.circle.setFillStyle(colors.fill, 0.55);
    if (view.container.active) view.container.setScale(1);
  }

  private releasePointer(pointerId: number): void {
    for (const view of this.views.values()) {
      if (view.pointerIds.delete(pointerId) && view.pointerIds.size === 0) this.releaseView(view, false);
    }
  }

  private releaseAll(): void {
    for (const view of this.views.values()) this.releaseView(view);
  }

  private getKey(name: TouchKey): Phaser.Input.Keyboard.Key | null {
    const keyboard = this.scene.get('GameScene')?.input?.keyboard;
    if (!keyboard) return null;
    return keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[name]);
  }

  private fakeEvent(): KeyboardEvent {
    return {
      timeStamp: performance.now(),
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      location: 0,
    } as unknown as KeyboardEvent;
  }

  private pressKeys(keys: TouchKey[]): void {
    for (const name of keys) {
      const count = this.heldKeys.get(name) ?? 0;
      this.heldKeys.set(name, count + 1);
      if (count === 0) this.getKey(name)?.onDown(this.fakeEvent());
    }
  }

  private releaseKeys(keys: TouchKey[]): void {
    for (const name of keys) {
      const count = this.heldKeys.get(name) ?? 0;
      if (count <= 0) continue;
      this.heldKeys.set(name, count - 1);
      if (count === 1) this.getKey(name)?.onUp(this.fakeEvent());
    }
  }

  private createFullscreenButton(): void {
    const button = this.add.container(30, 84).setDepth(1000);
    const bg = this.add.rectangle(0, 0, 40, 40, 0x141c22, 0.6).setStrokeStyle(2, 0x6f8793, 0.8);
    const icon = this.add.text(0, 0, '⛶', { font: 'bold 24px Arial', color: '#dfe8ec' }).setOrigin(0.5);
    button.add([bg, icon]);
    bg.setInteractive();
    bg.on('pointerup', () => {
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
        return;
      }
      this.scale.startFullscreen();
      // Android Chrome allows locking orientation once fullscreen.
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      orientation?.lock?.('landscape').catch(() => { /* not supported - fine */ });
    });
  }
}
