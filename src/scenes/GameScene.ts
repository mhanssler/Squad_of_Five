import Phaser from 'phaser';
import { Soldier } from '../entities/Soldier';
import { Terrain } from '../systems/Terrain';
import { TurnManager, Team } from '../systems/TurnManager';
import { Projectile, createProjectile } from '../entities/Projectile';
import { WeaponConfig, WeaponType, WEAPONS } from '../systems/WeaponTypes';
import { SoundManager } from '../utils/SoundManager';
import { AbilityStatus, TurnActionState, getDigInStatus, getHealStatus } from '../systems/Abilities';

// Base movement distance (modified by weapon weight)
const BASE_MOVEMENT_DISTANCE = 320;
const POWER_MIN = 10;
// Power now cycles while held, making release timing matter instead of always settling at max.
// ~2.6s to full charge: fast charge made overshooting the intended power too easy.
const POWER_CHARGE_UP_PER_SECOND = 35;
const POWER_CHARGE_DOWN_PER_SECOND = 45;

// Mouse aim is smoothed toward the pointer direction instead of snapping, and ignores
// pointer positions right on top of the soldier where the angle flips wildly.
const MOUSE_AIM_TURN_SPEED_DEG_PER_SEC = 240;
const MOUSE_AIM_DEADZONE_PX = 26;

// Normalize an angle in degrees to [-180, 180].
function wrapDeg(angle: number): number {
  return ((angle + 180) % 360 + 360) % 360 - 180;
}
const DEFAULT_MOVE_SPEED = 180;

type SupplyDropType = 'medkit' | 'airstrike' | 'artillery' | 'armor' | 'munitions';

const SUPPLY_DROP_HP = 50;
const SUPPLY_DROP_RADIUS = 26; // Approx collision radius for damage checks

const AIRSTRIKE_BOMB_COUNT = 5;
const AIRSTRIKE_BOMB_DAMAGE = 60;
const AIRSTRIKE_BOMB_RADIUS = 70;

// WeaponConfig used for shot bookkeeping only (pelletCount = number of bombs we will spawn).
const AIRSTRIKE_SHOT_CONFIG: WeaponConfig = {
  name: 'Airstrike',
  type: WeaponType.GRENADE,
  damage: AIRSTRIKE_BOMB_DAMAGE,
  explosionRadius: AIRSTRIKE_BOMB_RADIUS,
  projectileSpeed: 700,
  gravity: 1.0,
  drag: 0.01,
  bounce: 0,
  spreadAngle: 0,
  pelletCount: AIRSTRIKE_BOMB_COUNT,
  trailColor: 0x66ffff,
  projectileSize: 10,
  description: 'Airstrike bombs',
  weight: 0,
  mobilityBonus: 0,
};

// Actual bomb projectile config. We avoid grenade/mortar/rocket types so we don't stack multiple flight loops.
const AIRSTRIKE_BOMB_CONFIG: WeaponConfig = {
  name: 'Airstrike Bomb',
  type: WeaponType.FLAMER,
  damage: AIRSTRIKE_BOMB_DAMAGE,
  explosionRadius: AIRSTRIKE_BOMB_RADIUS,
  projectileSpeed: 700,
  gravity: 1.2,
  drag: 0.002,
  bounce: 0,
  spreadAngle: 0,
  pelletCount: 1,
  trailColor: 0x66ffff,
  projectileSize: 10,
  description: 'Airstrike bomb',
  weight: 0,
  mobilityBonus: 0,
};

const HOWITZER_CONFIG: WeaponConfig = {
  name: 'Howitzer',
  type: WeaponType.MORTAR,
  damage: 115,
  explosionRadius: 120,
  projectileSpeed: 1250,
  gravity: 0.75,
  drag: 0.004,
  bounce: 0,
  spreadAngle: 0,
  pelletCount: 1,
  trailColor: 0xffaa00,
  projectileSize: 14,
  description: 'One-shot heavy artillery shell',
  weight: 0,
  mobilityBonus: 0,
};

type SupplyDrop = {
  type: SupplyDropType;
  crate: Phaser.GameObjects.Container;
  parachute: Phaser.GameObjects.Container | null;
  landed: boolean;
  collected: boolean;
  hp: number;
};

type AIShotPlan = {
  target: Soldier;
  angle: number;
  power: number;
  score: number;
};

export class GameScene extends Phaser.Scene {
  // Battlefield dimensions (wider than viewport). Configurable via MenuScene.
  private worldWidth: number = 2560;
  private worldHeight: number = 720;
  private terrainPreset: 'standard' | 'plains' | 'hills' | 'caves' = 'standard';
  private vsAI: boolean = true;
  private aiTurnToken: number = 0;
  // Increments each time a soldier's turn starts; used to guard delayed callbacks from previous turns.
  private turnId: number = 0;
  // Increments each time we enter character selection; used to avoid overlapping selection timers.
  private selectionToken: number = 0;

  // Charge context to prevent "release-to-fire" from triggering on a different soldier/turn.
  private mouseChargeTurnId: number = 0;
  private mouseChargeSoldier: Soldier | null = null;
  private keyboardChargeTurnId: number = 0;
  private keyboardChargeSoldier: Soldier | null = null;

  private terrain!: Terrain;
  private soldiers: Soldier[] = [];
  private turnManager!: TurnManager;
  private currentSoldier: Soldier | null = null;
  private backgroundGraphics!: Phaser.GameObjects.Graphics;

  // Squad selections from menu
  private redSquad: string[] = [];
  private blueSquad: string[] = [];

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private wKey!: Phaser.Input.Keyboard.Key;
  private sKey!: Phaser.Input.Keyboard.Key;
  private aKey!: Phaser.Input.Keyboard.Key;
  private dKey!: Phaser.Input.Keyboard.Key;
  private qKey!: Phaser.Input.Keyboard.Key;
  private eKey!: Phaser.Input.Keyboard.Key;
  private tabKey!: Phaser.Input.Keyboard.Key;
  private nKey!: Phaser.Input.Keyboard.Key;
private gKey!: Phaser.Input.Keyboard.Key;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private bKey!: Phaser.Input.Keyboard.Key;
  private hKey!: Phaser.Input.Keyboard.Key;
  private xKey!: Phaser.Input.Keyboard.Key;
  private cKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;
  private zoomInKey!: Phaser.Input.Keyboard.Key;
  private zoomOutKey!: Phaser.Input.Keyboard.Key;
  private numberKeys!: Phaser.Input.Keyboard.Key[];

  // Aiming (completely separate from movement)
  private aimAngle: number = -45; // Degrees, -90 is straight up
  private power: number = 50; // 0-100
  private powerChargeDirection: 1 | -1 = 1;
  private lastAimInput: 'mouse' | 'keys' = 'keys';
  private mouseAimTargetAngle: number | null = null; // Smoothed toward, never snapped
  private isCharging: boolean = false;
  private aimLine!: Phaser.GameObjects.Graphics;
  private aimPowerText!: Phaser.GameObjects.Text;
  private hasFired: boolean = false;
  private lastAbilityStatusKey = '';
  private isTurnEnding: boolean = false; // Prevent double endTurn calls

  // Shot resolution tracking (prevents turns advancing while projectiles are still in flight).
  private shotPendingSpawns: number = 0;
  private shotActiveProjectiles: number = 0;
  private shotTurnId: number = 0;
  private shotShooter: Soldier | null = null;
  private shotEndScheduled: boolean = false;
  private shotSafetyTimer: Phaser.Time.TimerEvent | null = null;

  // Movement tracking
  private movementUsed: number = 0;
  private maxMovement: number = BASE_MOVEMENT_DISTANCE;
  private startX: number = 0;

  // Character selection
  private isSelectingCharacter: boolean = false;
  private selectableSoldiers: Soldier[] = [];
  private selectionIndex: number = 0;
  private selectionIndicator!: Phaser.GameObjects.Graphics;
  private selectionText!: Phaser.GameObjects.Text;

  // Camera panning
  private isPanningCamera: boolean = false;
  
  // Mouse controls
  private isDraggingCamera: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private cameraStartX: number = 0;
  private cameraStartY: number = 0;
  private isMouseCharging: boolean = false;

  // State flags
  private isResetting: boolean = false;

  // Intro sequence (bombardment + paradrop) — skippable so restarts aren't a 15s wait.
  private introToken: number = 0;
  private introDone: boolean = true;
  private introSkipped: boolean = false;
  private introHintText: Phaser.GameObjects.Text | null = null;
  private introOverlayObjects: Phaser.GameObjects.GameObject[] = [];
  private paraDropPlans: Array<{ x: number; team: Team; name: string; index: number; weaponId: string; spawned: boolean }> = [];
  private activeDescents: Array<{ soldier: Soldier; parachute: Phaser.GameObjects.Container; landingY: number }> = [];
  private soldiersExpected: number = 10;
  private soldiersLanded: number = 0;

  // Balance events / airdrops
  private supplyDrops: SupplyDrop[] = [];
  private nextBalanceEventTurn: number = 4;

  // Call-in / special weapon modes
  private isAirstrikeTargeting: boolean = false;
  private airstrikeMarker: Phaser.GameObjects.Graphics | null = null;
  private airstrikeHelpText: Phaser.GameObjects.Text | null = null;

  private isHowitzerMode: boolean = false;
  private howitzer: Phaser.GameObjects.Container | null = null;
  private howitzerBarrel: Phaser.GameObjects.Rectangle | null = null;
  private howitzerHelpText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: { redSquad?: string[], blueSquad?: string[], mapSize?: 'small' | 'medium' | 'large', terrainPreset?: 'standard' | 'plains' | 'hills' | 'caves', vsAI?: boolean }): void {
    // Receive squad selections from menu
    this.redSquad = data.redSquad || ['rifle', 'grenade', 'rocket', 'shotgun', 'sniper'];
    this.blueSquad = data.blueSquad || ['rifle', 'grenade', 'rocket', 'shotgun', 'sniper'];

    const size = data.mapSize ?? 'medium';
    if (size === 'small') this.worldWidth = 1920;
    else if (size === 'large') this.worldWidth = 3200;
    else this.worldWidth = 2560;
    this.worldHeight = 720;

    this.terrainPreset = data.terrainPreset ?? 'standard';
    this.vsAI = data.vsAI ?? true;
  }

  create(): void {
    // Set up world bounds (larger than camera)
    this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
    
    // Set up camera bounds
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    
    // Create starry night background (covers entire world)
    this.createStarryBackground();
    
    // Create terrain (wider battlefield) with random seed
    this.terrain = new Terrain(this, this.worldWidth, this.worldHeight, undefined, { preset: this.terrainPreset });

    // Create aim line graphics
    this.aimLine = this.add.graphics();
    this.aimLine.setDepth(100);

    // Numeric power readout shown while charging (precision was hard with just the bar)
    this.aimPowerText = this.add.text(0, 0, '', {
      font: 'bold 13px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.aimPowerText.setOrigin(0.5, 1);
    this.aimPowerText.setDepth(150);
    this.aimPowerText.setVisible(false);

    // Create selection indicator
    this.selectionIndicator = this.add.graphics();
    this.selectionIndicator.setDepth(101);
    
    // Create selection text prompt
    this.selectionText = this.add.text(0, 0, '', {
      font: 'bold 12px Arial',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 3,
      backgroundColor: '#000000aa',
      padding: { x: 8, y: 4 },
    });
    this.selectionText.setOrigin(0.5, 0);
    this.selectionText.setDepth(102);
    this.selectionText.setVisible(false);

    // Initialize teams and soldiers (5 per team)
    this.initializeTeams();

    // Initialize turn manager
    this.turnManager = new TurnManager(this.soldiers);
    
    // Show battlefield overview first, then start turn
    this.showBattlefieldOverview();

    // Setup input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.wKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.sKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.aKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.dKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.qKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.tabKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    this.nKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.N);
this.gKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.G);
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.bKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.hKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.H);
    this.xKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.cKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.zoomInKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS);
    this.zoomOutKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS);
    
    // Number keys for direct soldier selection
    this.numberKeys = [];
    for (let i = 0; i < 5; i++) {
      this.numberKeys.push(this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE + i));
    }

    // Launch UI scene
    this.scene.launch('UIScene', { gameScene: this });

    // Listen for projectile explosions (now includes damage parameter)
    this.events.on('projectile-explode', this.handleExplosion, this);
    
    // Listen for flame damage (flamethrower)
    this.events.on('flame-wave', this.handleFlameWave, this);
    
    // Listen for flame jet ending
    this.events.on('flame-jet-ended', this.handleFlameJetEnded, this);
    
    // Listen for projectile created (for camera tracking)
    this.events.on('projectile-created', this.trackProjectile, this);

    // Shot resolution bookkeeping (used to delay endTurn until all fired projectiles are resolved).
    this.events.on('projectile-spawned', this.onProjectileSpawned, this);
    this.events.on('projectile-ended', this.onProjectileEnded, this);
    
    // Listen for flame jet created (stay on soldier for flamethrower)
    this.events.on('flame-jet-created', this.trackFlameJet, this);
    
    // Listen for soldier hit checks (raycast collision for bullets)
    this.events.on('check-soldier-hit', this.checkSoldierHit, this);
    
    // Setup mouse controls
    this.setupMouseControls();

    // In-game music. Menu music is stopped when GameScene starts.
    SoundManager.init();
    SoundManager.startCelloMusic();

    // Ensure music stops if this scene is ever shut down.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      SoundManager.stopMusic();
    });
  }
  
  private setupMouseControls(): void {
    // Right-click or middle-click drag to pan camera
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Any click during the intro skips it.
      if (!this.introDone && pointer.leftButtonDown()) {
        this.skipIntro();
        return;
      }

      if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
        // While a shot is in flight, keep the camera tracking the projectile.
        if (this.isShotResolving()) return;
        this.isDraggingCamera = true;
        this.dragStartX = pointer.x;
        this.dragStartY = pointer.y;
        this.cameraStartX = this.cameras.main.scrollX;
        this.cameraStartY = this.cameras.main.scrollY;
        this.cameras.main.stopFollow();
      }
      
      // Left click during character selection - check if clicking on a soldier
      if (pointer.leftButtonDown() && this.isSelectingCharacter) {
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        for (let i = 0; i < this.selectableSoldiers.length; i++) {
          const soldier = this.selectableSoldiers[i];
          const dist = Phaser.Math.Distance.Between(worldPoint.x, worldPoint.y, soldier.x, soldier.y);
          if (dist < 30) {
            this.selectionText.setVisible(false);
            this.selectSoldier(soldier);
            return;
          }
        }
      }

      // Left click while targeting an airstrike - designate target instead of charging a shot.
      if (pointer.leftButtonDown() && this.isAirstrikeTargeting && !this.isSelectingCharacter && this.currentSoldier && !this.hasFired) {
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.confirmAirstrikeTarget(worldPoint.x);
        return;
      }
      
      // Left click during gameplay - start charging (mouse aim mode)
      if (pointer.leftButtonDown() && !this.isSelectingCharacter && this.currentSoldier && !this.hasFired) {
        this.isMouseCharging = true;
        this.power = POWER_MIN;
        this.powerChargeDirection = 1;
        this.lastAimInput = 'mouse';
        this.mouseChargeTurnId = this.turnId;
        this.mouseChargeSoldier = this.currentSoldier;
      }
    });
    
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      // Handle camera drag
      if (this.isDraggingCamera) {
        const dx = this.dragStartX - pointer.x;
        const dy = this.dragStartY - pointer.y;
        this.cameras.main.scrollX = Phaser.Math.Clamp(
          this.cameraStartX + dx,
          0,
          this.worldWidth - this.cameras.main.width
        );
        this.cameras.main.scrollY = Phaser.Math.Clamp(
          this.cameraStartY + dy,
          0,
          Math.max(0, this.worldHeight - this.cameras.main.height)
        );
      }
      
      // Mouse aiming - set the smoothed aim target from the pointer direction.
      // Pointer positions right on top of the soldier are ignored (angle flips wildly there).
      if (this.currentSoldier && !this.isSelectingCharacter && !this.isDraggingCamera && !this.isAirstrikeTargeting) {
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const origin = this.getAimOrigin();
        if (!origin) return;
        const dx = worldPoint.x - origin.x;
        const dy = worldPoint.y - origin.y;
        if (Math.hypot(dx, dy) >= MOUSE_AIM_DEADZONE_PX) {
          this.lastAimInput = 'mouse';
          this.mouseAimTargetAngle = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
        }
      }
    });
    
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // Stop camera drag - camera stays where user left it
      if (!pointer.rightButtonDown() && !pointer.middleButtonDown()) {
        if (this.isDraggingCamera) {
          this.isDraggingCamera = false;
          // Camera stays where user panned it - no auto-return
        }
      }
      
      // Left click release - fire if charging (and not grappling)
      if (!pointer.leftButtonDown() && this.isMouseCharging && !this.hasFired) {
        const sameTurn = this.mouseChargeTurnId === this.turnId;
        const sameSoldier = this.mouseChargeSoldier === this.currentSoldier;

        // Check soldier is not grappling before firing (and that turn/soldier didn't change mid-charge)
        if (!this.isSelectingCharacter && sameTurn && sameSoldier && this.currentSoldier && !this.currentSoldier.isCurrentlyGrappling()) {
          this.fireProjectile();
        }
        this.isMouseCharging = false;
        this.mouseChargeTurnId = 0;
        this.mouseChargeSoldier = null;
      }
    });
    
    // Mouse wheel zoom
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: any[], _deltaX: number, deltaY: number) => {
      const zoomDelta = deltaY > 0 ? -0.1 : 0.1;
      this.adjustZoom(zoomDelta);
    });
    
    // Disable context menu on right click
    this.input.mouse!.disableContextMenu();
  }

  private adjustZoom(delta: number): void {
    const currentZoom = this.cameras.main.zoom;
    const newZoom = Phaser.Math.Clamp(currentZoom + delta, 0.3, 2.0);
    
    // Smooth zoom transition
    this.tweens.add({
      targets: this.cameras.main,
      zoom: newZoom,
      duration: 150,
      ease: 'Quad.easeOut'
    });
  }

  public newGame(): void {
    // Prevent multiple calls
    if (this.isResetting) return;
    this.isResetting = true;
    
    // Cancel any pending timers
    this.time.removeAllEvents();
    this.clearShotResolution();
    this.clearChargeState();

    // Clean up any intro-sequence leftovers (quote overlay, descending paratroopers).
    SoundManager.stopSpeech();
    this.introOverlayObjects.forEach(o => {
      try { o.destroy(); } catch (e) { /* ignored */ }
    });
    this.introOverlayObjects = [];
    this.activeDescents.forEach(d => {
      this.tweens.killTweensOf(d.soldier.sprite);
      this.tweens.killTweensOf(d.parachute);
      try { d.parachute.destroy(); } catch (e) { /* ignored */ }
    });
    this.activeDescents = [];
    if (this.introHintText) {
      this.introHintText.destroy();
      this.introHintText = null;
    }

    // Clear any active supply drops
    this.supplyDrops.forEach(d => {
      try { d.crate.destroy(); } catch (e) { /* ignored */ }
      if (d.parachute) {
        try { d.parachute.destroy(); } catch (e) { /* ignored */ }
      }
    });
    this.supplyDrops = [];
    this.nextBalanceEventTurn = 4;
    
    // Stop camera follow
    this.cameras.main.stopFollow();
    
    // Clear selection state
    this.isSelectingCharacter = false;
    this.selectionIndicator.clear();
    this.currentSoldier = null;
    
    // Regenerate terrain with new seed
    this.terrain.regenerate();
    
    // Reset game state - destroy all soldiers
    this.soldiers.forEach(soldier => soldier.destroy());
    this.soldiers = [];
    
    // Reinitialize teams
    this.initializeTeams();
    
    // Reset turn manager
    this.turnManager = new TurnManager(this.soldiers);
    
    // Reset UI
    this.events.emit('new-game');
    
    // Reset flags
    this.hasFired = false;
    this.movementUsed = 0;
    
    // Allow new game again
    this.isResetting = false;
    
    // Show battlefield overview (will start character selection after delay)
    this.showBattlefieldOverview();
  }

  private initializeTeams(): void {
    // First, run artillery bombardment to "create" the battlefield
    // Then drop paratroopers after bombardment completes
    this.introToken++;
    this.introDone = false;
    this.introSkipped = false;
    this.soldiersLanded = 0;
    this.activeDescents = [];
    this.buildParaDropPlans();
    this.soldiersExpected = this.paraDropPlans.length;
    this.showIntroSkipHint();
    this.startArtilleryBombardment();
  }

  // Decide where every paratrooper will land up front, so a skipped intro can
  // place them instantly instead of waiting for the planes.
  private buildParaDropPlans(): void {
    this.paraDropPlans = [];

    const zoneMargin = 80;
    const zoneWidth = Math.min(550, Math.floor(this.worldWidth * 0.28));
    const redDropZone = { minX: zoneMargin, maxX: Math.min(this.worldWidth - zoneMargin, zoneMargin + zoneWidth) };
    const blueDropZone = { minX: Math.max(zoneMargin, this.worldWidth - zoneMargin - zoneWidth), maxX: this.worldWidth - zoneMargin };

    const redNames = ['Sarge', 'Gunner', 'Boom', 'Buck', 'Ghost'];
    const blueNames = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];

    redNames.forEach((name, index) => {
      this.paraDropPlans.push({
        x: Phaser.Math.Between(redDropZone.minX, redDropZone.maxX),
        team: Team.RED,
        name,
        index,
        weaponId: this.redSquad[index] || 'rifle',
        spawned: false,
      });
    });

    blueNames.forEach((name, index) => {
      this.paraDropPlans.push({
        x: Phaser.Math.Between(blueDropZone.minX, blueDropZone.maxX),
        team: Team.BLUE,
        name,
        index,
        weaponId: this.blueSquad[index] || 'rifle',
        spawned: false,
      });
    });
  }

  private showIntroSkipHint(): void {
    if (this.introHintText) this.introHintText.destroy();

    this.introHintText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height - 36, 'SPACE or CLICK to skip intro', {
      font: 'bold 15px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      backgroundColor: '#00000066',
      padding: { x: 10, y: 5 },
    });
    this.introHintText.setOrigin(0.5);
    this.introHintText.setScrollFactor(0);
    this.introHintText.setDepth(1001);

    this.tweens.add({
      targets: this.introHintText,
      alpha: 0.45,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private skipIntro(): void {
    if (this.introDone || this.introSkipped) return;
    this.introSkipped = true;

    SoundManager.stopSpeech();

    // Clear the quote overlay immediately.
    this.introOverlayObjects.forEach(o => {
      try { o.destroy(); } catch (e) { /* ignored */ }
    });
    this.introOverlayObjects = [];

    // Snap any soldier mid-descent straight onto the ground.
    [...this.activeDescents].forEach(entry => {
      this.tweens.killTweensOf(entry.soldier.sprite);
      this.finishLanding(entry, true);
    });

    // Spawn everyone who hasn't even left the plane yet.
    this.paraDropPlans.forEach(plan => {
      if (plan.spawned) return;
      plan.spawned = true;
      this.spawnSoldierOnGround(plan);
    });

    this.transitionFromIntro();
  }

  private spawnSoldierOnGround(plan: { x: number; team: Team; name: string; index: number; weaponId: string }): void {
    const landingY = this.terrain.getSurfaceY(plan.x) - 15;
    const soldier = new Soldier(this, plan.x, landingY, plan.team, plan.name, plan.index, true, plan.weaponId as WeaponType);
    this.soldiers.push(soldier);

    const body = soldier.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAllowGravity(false);

    this.soldiersLanded++;
    this.maybeFinishIntro();
  }

  private maybeFinishIntro(): void {
    if (this.introDone) return;
    if (this.soldiersLanded < this.soldiersExpected) return;

    if (this.introSkipped) {
      this.transitionFromIntro();
      return;
    }

    // Everyone landed naturally — give it a beat, then hand over control.
    const token = this.introToken;
    this.time.delayedCall(900, () => {
      if (token !== this.introToken) return;
      this.transitionFromIntro();
    });
  }

  private transitionFromIntro(): void {
    if (this.introDone) return;
    this.introDone = true;

    if (this.introHintText) {
      this.introHintText.destroy();
      this.introHintText = null;
    }

    this.startCharacterSelection();
  }

  private startArtilleryBombardment(): void {
    const token = this.introToken;

    // Display epic WWI quote during bombardment
    this.displayBombardmentQuote();

    // Create several artillery impacts across the battlefield
    // This makes it look like artillery shaped the battlefield before troops arrive
    const impactLocations: { x: number; delay: number; radius: number }[] = [];

    // Generate 6-9 random impact points across the middle of the battlefield
    const numImpacts = 6 + Math.floor(Math.random() * 4);

    for (let i = 0; i < numImpacts; i++) {
      // Spread impacts across the battlefield, avoiding team spawn areas
      const x = 600 + Math.random() * (this.worldWidth - 1200);
      const delay = 200 + i * 300 + Math.random() * 150; // Stagger impacts
      const radius = 35 + Math.random() * 30; // Varied crater sizes
      impactLocations.push({ x, delay, radius });
    }

    // Add a few impacts near team positions (but not too close)
    impactLocations.push({ x: 750 + Math.random() * 150, delay: numImpacts * 300 + 200, radius: 40 });
    impactLocations.push({ x: 1700 + Math.random() * 150, delay: numImpacts * 300 + 500, radius: 45 });

    // Sort by delay for proper sequencing
    impactLocations.sort((a, b) => a.delay - b.delay);

    // Create each artillery impact
    impactLocations.forEach((impact) => {
      this.time.delayedCall(impact.delay, () => {
        if (token !== this.introToken || this.introSkipped) return;
        this.createArtilleryImpact(impact.x, impact.radius);
      });
    });

    // After all bombardment is done, start paratrooper drop
    const totalBombardmentTime = impactLocations[impactLocations.length - 1].delay + 600;
    this.time.delayedCall(totalBombardmentTime, () => {
      if (token !== this.introToken || this.introSkipped) return;
      this.startParatrooperDrop();
    });
  }

  private displayBombardmentQuote(): void {
    // Epic WWI/WWII quotes (Churchill-style dramatic)
    const quotes = [
      { text: "We shall fight on the beaches, we shall fight on the landing grounds, we shall fight in the fields and in the streets, we shall never surrender.", author: "— Winston Churchill, 1940" },
      { text: "The lamps are going out all over Europe.", author: "— Sir Edward Grey, 1914" },
      { text: "They shall not pass!", author: "— General Pétain, Verdun 1916" },
      { text: "In Flanders fields the poppies blow, between the crosses, row on row.", author: "— John McCrae, 1915" },
      { text: "Never in the field of human conflict was so much owed by so many to so few.", author: "— Winston Churchill, 1940" },
      { text: "We shall defend our island, whatever the cost may be.", author: "— Winston Churchill, 1940" },
      { text: "The only thing we have to fear is fear itself.", author: "— Franklin D. Roosevelt, 1933" },
      { text: "War is hell.", author: "— General William T. Sherman" },
      { text: "The artillery conquers, the infantry occupies.", author: "— French Military Doctrine" },
      { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "— Winston Churchill" },
    ];
    
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    
    // Create dark overlay behind quote for better visibility
    const cx = this.cameras.main.width / 2;
    const overlay = this.add.rectangle(cx, 120, 1000, 180, 0x000000, 0.7);
    overlay.setDepth(499);
    overlay.setScrollFactor(0); // Fixed to camera
    overlay.setAlpha(0);
    
    // Create dramatic text in center of screen (fixed to camera)
    const quoteText = this.add.text(cx, 90, `"${quote.text}"`, {
      font: 'bold 28px Georgia',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6,
      align: 'center',
      wordWrap: { width: 900 }
    });
    quoteText.setOrigin(0.5);
    quoteText.setDepth(500);
    quoteText.setScrollFactor(0); // Fixed to camera
    quoteText.setAlpha(0);
    
    const authorText = this.add.text(cx, 170, quote.author, {
      font: 'italic 20px Georgia',
      color: '#ffdd88',
      stroke: '#000000',
      strokeThickness: 3,
    });
    authorText.setOrigin(0.5);
    authorText.setDepth(500);
    authorText.setScrollFactor(0); // Fixed to camera
    authorText.setAlpha(0);

    // Track for instant cleanup if the intro is skipped.
    this.introOverlayObjects.push(overlay, quoteText, authorText);

    const token = this.introToken;

    // Fade in quote
    this.tweens.add({
      targets: [overlay, quoteText, authorText],
      alpha: 1,
      duration: 1000,
      ease: 'Power2',
    });

    // Speak the quote in Churchill-style voice
    this.time.delayedCall(500, () => {
      if (token !== this.introToken || this.introSkipped) return;
      SoundManager.speakQuote(quote.text, quote.author);
    });

    // Fade out after bombardment
    this.time.delayedCall(6000, () => {
      if (!overlay.active) return;
      this.tweens.add({
        targets: [overlay, quoteText, authorText],
        alpha: 0,
        duration: 1500,
        onComplete: () => {
          if (overlay.active) overlay.destroy();
          if (quoteText.active) quoteText.destroy();
          if (authorText.active) authorText.destroy();
        }
      });
    });
  }

  private createArtilleryImpact(x: number, radius: number): void {
    // Play bomb whistle sound
    SoundManager.playBombWhistle(0.3);
    
    // Get terrain surface at impact point
    const surfaceY = this.terrain.getSurfaceY(x);
    const impactY = surfaceY + 5; // Slightly into the ground
    
    // Create falling shell graphic (brief animation)
    const shell = this.add.graphics();
    shell.setDepth(150);
    shell.fillStyle(0x333333, 1);
    shell.fillEllipse(0, 0, 6, 16);
    shell.fillStyle(0x996633, 1);
    shell.fillRect(-3, -4, 6, 8);
    shell.setPosition(x, -50);
    shell.setRotation(Math.PI / 2 + (Math.random() - 0.5) * 0.3);
    
    // Animate shell falling
    this.tweens.add({
      targets: shell,
      y: impactY,
      duration: 300,
      ease: 'Quad.easeIn',
      onComplete: () => {
        shell.destroy();
        
        // Create explosion effect
        this.createArtilleryExplosion(x, impactY, radius);
        
        // Destroy terrain
        this.terrain.destroyCircle(x, impactY, radius);
        
        // Screen shake
        this.cameras.main.shake(200, 0.01);
      }
    });
  }

  private createArtilleryExplosion(x: number, y: number, radius: number): void {
    // Play explosion sound
    SoundManager.playExplosion(radius > 40 ? 'large' : 'medium');
    
    // Flash
    const flash = this.add.circle(x, y, radius * 1.5, 0xffff00, 0.8);
    flash.setDepth(200);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.5,
      duration: 150,
      onComplete: () => flash.destroy()
    });
    
    // Explosion particles (dirt/debris)
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 150;
      const particle = this.add.circle(x, y, 2 + Math.random() * 4, 0x5c4033, 1);
      particle.setDepth(151);
      
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - 100; // Upward bias
      
      this.tweens.add({
        targets: particle,
        x: x + vx * 0.5,
        y: y + vy * 0.5 + 50, // Gravity effect
        alpha: 0,
        duration: 400 + Math.random() * 300,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy()
      });
    }
    
    // Smoke cloud
    const smoke = this.add.circle(x, y, radius * 0.8, 0x666666, 0.6);
    smoke.setDepth(149);
    this.tweens.add({
      targets: smoke,
      alpha: 0,
      scale: 2,
      y: y - 30,
      duration: 800,
      ease: 'Quad.easeOut',
      onComplete: () => smoke.destroy()
    });
  }

private startParatrooperDrop(): void {
    const token = this.introToken;

    // Play plane engine sounds
    SoundManager.playPlaneEngine(5);
    this.time.delayedCall(500, () => {
      if (token !== this.introToken || this.introSkipped) return;
      SoundManager.playPlaneEngine(5);
    });

    // Create planes
    const redPlane = this.createPlane(-100, 80, true); // Flying right
    const bluePlane = this.createPlane(this.worldWidth + 100, 120, false); // Flying left

    // Calculate drop timing based on plane speed and target positions
    const planeDuration = 5000;
    const redPlaneStart = -100;
    const redPlaneEnd = this.worldWidth + 200;
    const redPlaneSpeed = (redPlaneEnd - redPlaneStart) / planeDuration;

    const bluePlaneStart = this.worldWidth + 100;
    const bluePlaneEnd = -200;
    const bluePlaneSpeed = (bluePlaneEnd - bluePlaneStart) / planeDuration;

    // Fly planes across
    this.tweens.add({
      targets: redPlane,
      x: redPlaneEnd,
      duration: planeDuration,
      ease: 'Linear',
      onComplete: () => redPlane.destroy(),
    });

    this.tweens.add({
      targets: bluePlane,
      x: bluePlaneEnd,
      duration: planeDuration,
      ease: 'Linear',
      onComplete: () => bluePlane.destroy(),
    });

    // Drop each planned soldier when their plane's tail passes the drop position
    // (plane tail is about 55 pixels behind center).
    const planeBackOffset = 55;

    this.paraDropPlans.forEach(plan => {
      const isRed = plan.team === Team.RED;
      const timeToReachDrop = isRed
        ? (plan.x + planeBackOffset - redPlaneStart) / redPlaneSpeed
        : Math.abs((plan.x - planeBackOffset - bluePlaneStart) / bluePlaneSpeed);
      const dropDelay = Math.max(200, timeToReachDrop + plan.index * 100); // Small stagger between soldiers

      this.time.delayedCall(dropDelay, () => {
        if (token !== this.introToken) return;
        if (plan.spawned) return; // Already placed by a skip
        plan.spawned = true;
        const planeY = isRed ? redPlane.y : bluePlane.y;
        this.dropParatrooper(plan.x, planeY + 20, plan.team, plan.name, plan.index, plan.weaponId);
      });
    });
  }

  private createPlane(x: number, y: number, facingRight: boolean): Phaser.GameObjects.Container {
    const plane = this.add.container(x, y);
    plane.setDepth(100);
    
    const graphics = this.add.graphics();
    
    // Plane body (simple silhouette)
    graphics.fillStyle(0x333333, 1);
    
    if (facingRight) {
      // Fuselage
      graphics.fillRect(-40, -8, 80, 16);
      // Nose
      graphics.fillTriangle(40, -8, 40, 8, 55, 0);
      // Tail
      graphics.fillTriangle(-40, -8, -40, 8, -55, -20);
      // Wings
      graphics.fillRect(-15, -4, 30, 35);
      // Cockpit
      graphics.fillStyle(0x6699cc, 1);
      graphics.fillRect(20, -6, 15, 12);
    } else {
      // Mirrored for left-facing
      graphics.fillRect(-40, -8, 80, 16);
      graphics.fillTriangle(-40, -8, -40, 8, -55, 0);
      graphics.fillTriangle(40, -8, 40, 8, 55, -20);
      graphics.fillRect(-15, -4, 30, 35);
      graphics.fillStyle(0x6699cc, 1);
      graphics.fillRect(-35, -6, 15, 12);
    }
    
    plane.add(graphics);
    return plane;
  }

  private dropParatrooper(dropX: number, startY: number, team: Team, name: string, squadIndex: number, weaponTypeId: string): void {
    // Calculate landing position FIRST (where the terrain surface is)
    const landingY = this.terrain.getSurfaceY(dropX) - 15;
    
    // Convert weapon type string to WeaponType enum
    const weaponType = weaponTypeId as WeaponType;
    
    // Create the soldier with gravity DISABLED from the start
    const soldier = new Soldier(this, dropX, startY, team, name, squadIndex, true, weaponType);
    this.soldiers.push(soldier);
    
    // Get body reference (gravity already disabled in constructor)
    const body = soldier.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setImmovable(true);
    
    // Create parachute attached to soldier
    const parachute = this.add.container(dropX, startY - 30);
    parachute.setDepth(99);
    
    const chuteGraphics = this.add.graphics();
    
    // Parachute canopy (semi-circle)
    const chuteColor = team === Team.RED ? 0xff6666 : 0x6699ff;
    chuteGraphics.fillStyle(chuteColor, 0.8);
    chuteGraphics.beginPath();
    chuteGraphics.arc(0, 0, 25, Math.PI, 0, false);
    chuteGraphics.closePath();
    chuteGraphics.fillPath();
    
    // Parachute lines
    chuteGraphics.lineStyle(1, 0x444444, 1);
    chuteGraphics.lineBetween(-20, 0, -5, 30);
    chuteGraphics.lineBetween(0, 2, 0, 30);
    chuteGraphics.lineBetween(20, 0, 5, 30);
    
    parachute.add(chuteGraphics);
    
    // Swing animation for parachute
    this.tweens.add({
      targets: parachute,
      angle: { from: -8, to: 8 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    
    // Calculate descent time based on distance (slower = more realistic)
    const fallDistance = landingY - startY;
    const descentDuration = Math.max(1200, fallDistance * 3.2);

    const descent = { soldier, parachute, landingY };
    this.activeDescents.push(descent);

    // Animate soldier descent with tween (no physics!)
    this.tweens.add({
      targets: soldier.sprite,
      y: landingY,
      duration: descentDuration,
      ease: 'Linear',
      onUpdate: () => {
        // Keep parachute following soldier
        parachute.setPosition(soldier.sprite.x, soldier.sprite.y - 30);
      },
      onComplete: () => {
        this.finishLanding(descent, false);
      },
    });
  }

  private finishLanding(
    descent: { soldier: Soldier; parachute: Phaser.GameObjects.Container; landingY: number },
    instant: boolean
  ): void {
    const idx = this.activeDescents.indexOf(descent);
    if (idx === -1) return; // Already finished
    this.activeDescents.splice(idx, 1);

    const { soldier, parachute, landingY } = descent;

    // Detach parachute
    this.tweens.killTweensOf(parachute);
    if (instant) {
      parachute.destroy();
    } else {
      this.tweens.add({
        targets: parachute,
        y: parachute.y - 50,
        alpha: 0,
        duration: 500,
        onComplete: () => parachute.destroy(),
      });
    }

    // Keep gravity OFF - soldiers stay grounded via terrain collision only
    const body = soldier.sprite.body as Phaser.Physics.Arcade.Body;
    body.setImmovable(false);
    body.setAllowGravity(false); // GRAVITY STAYS OFF
    body.setVelocity(0, 0);

    // Ensure soldier is exactly on terrain surface
    soldier.sprite.y = landingY;

    this.soldiersLanded++;
    this.maybeFinishIntro();
  }

  private createStarryBackground(): void {
    this.backgroundGraphics = this.add.graphics();
    this.backgroundGraphics.setDepth(-10);
    
    // Draw stars across entire world width
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * this.worldWidth;
      const y = Math.random() * 500;
      const size = Math.random() * 2 + 0.5;
      const alpha = Math.random() * 0.5 + 0.5;
      
      this.backgroundGraphics.fillStyle(0xffffff, alpha);
      this.backgroundGraphics.fillCircle(x, y, size);
    }
    
    // Add brighter stars
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * this.worldWidth;
      const y = Math.random() * 400;
      
      this.backgroundGraphics.fillStyle(0xffffcc, 0.9);
      this.backgroundGraphics.fillCircle(x, y, 1.5);
      
      // Small glow effect
      this.backgroundGraphics.fillStyle(0xffffcc, 0.2);
      this.backgroundGraphics.fillCircle(x, y, 3);
    }
  }

  private showBattlefieldOverview(): void {
    // Zoom out to show entire battlefield and bombardment + paratrooper drop
    const viewW = this.cameras.main.width || 1280;
    const zoomToFitWidth = viewW / this.worldWidth;
    this.cameras.main.setZoom(Math.min(0.6, Math.max(0.35, zoomToFitWidth)));
    this.cameras.main.centerOn(this.worldWidth / 2, this.worldHeight / 2);
    this.cameras.main.stopFollow();

    // Normally the intro hands over control as soon as everyone has landed
    // (see maybeFinishIntro). This is only a safety net so a lost callback
    // can never leave the player stuck watching the sky.
    const token = this.introToken;
    this.time.delayedCall(16000, () => {
      if (token !== this.introToken) return;
      this.transitionFromIntro();
    });
  }

  private startCharacterSelection(): void {
    // New selection phase: clear any in-progress firing input so a release can't fire as the turn changes.
    this.clearChargeState();
    const selectionToken = ++this.selectionToken;

    // Update turn manager with dropped soldiers (they were added asynchronously)
    this.turnManager.setSoldiers(this.soldiers);
    
    // Wait for soldiers to be dropped before starting
    if (this.soldiers.length === 0) {
      // Soldiers haven't dropped yet, try again shortly
      this.time.delayedCall(500, () => {
        if (selectionToken !== this.selectionToken) return;
        this.startCharacterSelection();
      });
      return;
    }
    
    const currentTeam = this.turnManager.getCurrentTeam();
    
    // Get available soldiers (alive AND haven't acted this round)
    this.selectableSoldiers = this.turnManager.getAvailableSoldiers(currentTeam);
    
    if (this.selectableSoldiers.length === 0) {
      // No available soldiers on this team, check for game over
      const gameState = this.turnManager.checkGameOver();
      if (gameState.isOver) {
        this.events.emit('game-over', gameState.winner);
        return;
      }
      // Switch to other team (nextTurn will handle new round if needed)
      this.turnManager.nextTurn();
      this.time.delayedCall(500, () => {
        if (selectionToken !== this.selectionToken) return;
        this.startCharacterSelection();
      });
      return;
    }
    
    if (this.isTeamAI(currentTeam)) {
      // AI automatically selects a soldier. Keep selection UI hidden for AI turns.
      this.isSelectingCharacter = false;
      this.selectionIndicator.clear();
      this.selectionText.setVisible(false);

      // Reset key states to prevent any lingering input from previous player turns.
      this.enterKey.reset();
      this.spaceKey.reset();

      const chosen = this.chooseAISoldierForSelection(this.selectableSoldiers, currentTeam);
      this.time.delayedCall(250, () => {
        if (selectionToken !== this.selectionToken) return;
        if (this.turnManager.getCurrentTeam() !== currentTeam) return;
        if (!chosen || !chosen.isAlive()) {
          this.startCharacterSelection();
          return;
        }
        this.selectSoldier(chosen);
      });
      return;
    }

    if (this.selectableSoldiers.length === 1) {
      // Only one option, auto-select
      // Reset key states to prevent accidental firing/skipping from previous keypresses
      this.enterKey.reset();
      this.spaceKey.reset();
      // Small delay to ensure clean state
      this.time.delayedCall(100, () => {
        if (selectionToken !== this.selectionToken) return;
        if (this.selectableSoldiers.length > 0) {
          this.selectSoldier(this.selectableSoldiers[0]);
        }
      });
      return;
    }
    
    // Enter selection mode
    this.isSelectingCharacter = true;
    this.selectionIndex = 0;
    
    // Reset enter/space key state to prevent accidental selection from previous keypress
    this.enterKey.reset();
    this.spaceKey.reset();
    
    // Zoom in slightly and center on team area
    const avgX = this.selectableSoldiers.reduce((sum, s) => sum + s.x, 0) / this.selectableSoldiers.length;
    
    this.tweens.add({
      targets: this.cameras.main,
      zoom: 0.8,
      duration: 500,
      ease: 'Power2',
    });
      this.cameras.main.pan(avgX, this.worldHeight / 2, 500);
    
    // Emit event for UI
    this.emitCharacterSelectionEvent();
    
    this.updateSelectionIndicator();
  }

  private updateSelectionIndicator(): void {
    this.selectionIndicator.clear();
    
    if (!this.isSelectingCharacter || this.selectableSoldiers.length === 0) {
      this.selectionText.setVisible(false);
      return;
    }
    
    const selectedSoldier = this.selectableSoldiers[this.selectionIndex];
    
    // Draw bouncing arrow above selected soldier
    this.selectionIndicator.fillStyle(0xffff00, 1);
    this.selectionIndicator.fillTriangle(
      selectedSoldier.x, selectedSoldier.y - 50,
      selectedSoldier.x - 10, selectedSoldier.y - 65,
      selectedSoldier.x + 10, selectedSoldier.y - 65
    );
    
    // Draw circle around selected soldier
    this.selectionIndicator.lineStyle(3, 0xffff00, 0.8);
    this.selectionIndicator.strokeCircle(selectedSoldier.x, selectedSoldier.y, 25);
    
    // Show selection prompt text
    this.selectionText.setText('▶ ENTER/SPACE TO SELECT ◀');
    this.selectionText.setPosition(selectedSoldier.x, selectedSoldier.y - 80);
    this.selectionText.setVisible(true);
  }

  private selectSoldier(soldier: Soldier): void {
    // Clean input state before a new turn begins.
    this.clearChargeState();
    this.exitAirstrikeTargeting();
    this.exitHowitzerMode();

    // Initialize sound on first interaction
    SoundManager.init();
    
    this.isSelectingCharacter = false;
    this.selectionIndicator.clear();
    this.selectionText.setVisible(false);
    this.currentSoldier = soldier;
    this.turnManager.setCurrentSoldier(soldier);
    
    // Announce the soldier type
    const weaponConfig = WEAPONS[soldier.getWeaponType()];
    SoundManager.playSelect();
    SoundManager.announceUnit(weaponConfig.name);
    
    this.startTurn();
  }

  private getCloseRangeMovementFloor(type: WeaponType): number {
    switch (type) {
      case WeaponType.FLAMER:
        return 360;
      case WeaponType.SHOTGUN:
        return 340;
      case WeaponType.SMG:
      case WeaponType.CARBINE:
        return 390;
      case WeaponType.PISTOL:
        return 380;
      case WeaponType.SLUG:
        return 340;
      case WeaponType.DEMO:
        return 300;
      default:
        return 0;
    }
  }

  private getSoldierMoveSpeed(type: WeaponType): number {
    switch (type) {
      case WeaponType.FLAMER:
      case WeaponType.SHOTGUN:
        return 220;
      case WeaponType.SMG:
      case WeaponType.CARBINE:
      case WeaponType.PISTOL:
        return 235;
      case WeaponType.SLUG:
        return 215;
      case WeaponType.DEMO:
        return 190;
      default:
        return DEFAULT_MOVE_SPEED;
    }
  }

  private deselectSoldier(): void {
    // Return to character selection mode
    this.isSelectingCharacter = true;
    this.exitAirstrikeTargeting();
    this.exitHowitzerMode();
    this.isCharging = false;
    this.isMouseCharging = false;
    this.mouseChargeTurnId = 0;
    this.mouseChargeSoldier = null;
    this.keyboardChargeTurnId = 0;
    this.keyboardChargeSoldier = null;
    
    // Clear aim line
    this.aimLine.clear();
    
    // Deactivate current soldier
    if (this.currentSoldier) {
      this.currentSoldier.setActive(false);
      this.currentSoldier.stopMoving();
    }
    
    // Reset to first selectable soldier in the index
    const currentTeam = this.turnManager.getCurrentTeam();
    this.selectableSoldiers = this.turnManager.getAvailableSoldiers(currentTeam);
    
    if (this.selectableSoldiers.length > 0) {
      this.selectionIndex = 0;
      this.updateSelectionIndicator();
      
      // Show selection text
      this.selectionText.setText(`${currentTeam.toUpperCase()} TEAM - Choose your soldier (ESC to return)`);
      this.selectionText.setVisible(true);
      
      // Pan to first soldier
      this.cameras.main.stopFollow();
      this.cameras.main.pan(this.selectableSoldiers[0].x, this.worldHeight / 2, 300);
      
      // Emit event for UI
      this.emitCharacterSelectionEvent();
    }
  }

  private startTurn(): void {
    // New turn boundary (guards all delayed callbacks from the previous turn).
    this.turnId++;
    this.clearChargeState();
    this.exitAirstrikeTargeting();
    this.exitHowitzerMode();

    this.hasFired = false;
    this.isTurnEnding = false; // Reset turn ending flag
    
    if (this.currentSoldier) {
      this.currentSoldier.setActive(true);
      
      // Reset grapple uses for this turn
      this.currentSoldier.resetGrappleUses();
      
      // Calculate movement limit based on weapon weight and mobility bonus
      const weight = this.currentSoldier.weapon.weight || 1;
      const mobilityBonus = this.currentSoldier.weapon.mobilityBonus || 0;
      // Base movement divided by weight, then add mobility bonus (percentage of base)
      const baseMovement = Math.floor(BASE_MOVEMENT_DISTANCE / weight);
      const bonusMovement = Math.floor(BASE_MOVEMENT_DISTANCE * mobilityBonus);
      const movementFloor = this.getCloseRangeMovementFloor(this.currentSoldier.getWeaponType());
      this.maxMovement = Math.max(baseMovement + bonusMovement, movementFloor);
      this.movementUsed = 0;
      this.startX = this.currentSoldier.x;
      this.currentSoldier.setMoveSpeed(this.getSoldierMoveSpeed(this.currentSoldier.getWeaponType()));
      
      // Zoom in and pan to current soldier
      this.tweens.add({
        targets: this.cameras.main,
        zoom: 1,
        duration: 800,
        ease: 'Power2',
      });
      
      // Start following the soldier after zoom
      this.time.delayedCall(300, () => {
        if (this.currentSoldier) {
          this.cameras.main.startFollow(this.currentSoldier.sprite, true, 0.08, 0.08);
        }
      });
    }

    // Reset aiming
    this.aimAngle = -45;
    this.mouseAimTargetAngle = null;
    this.power = 50;
    this.powerChargeDirection = 1;
    this.isCharging = false;
    this.isMouseCharging = false;

    // Emit turn started event for UI
    this.events.emit('turn-started', {
      ...this.turnManager.getTurnInfo(),
      maxMovement: this.maxMovement,
      movementUsed: this.movementUsed,
    });

    // Queue AI action if this unit is AI-controlled.
    this.queueAITurnIfNeeded();
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(50, Math.max(0, delta)) / 1000;
    // Handle new game key
    if (Phaser.Input.Keyboard.JustDown(this.nKey)) {
      this.newGame();
      return;
    }

    // Handle zoom keys (always available)
    if (Phaser.Input.Keyboard.JustDown(this.zoomInKey)) {
      this.adjustZoom(0.2);
    }
    if (Phaser.Input.Keyboard.JustDown(this.zoomOutKey)) {
      this.adjustZoom(-0.2);
    }

    // Intro can be skipped with SPACE/ENTER/ESC (mouse click handled in setupMouseControls).
    if (!this.introDone) {
      if (
        Phaser.Input.Keyboard.JustDown(this.spaceKey) ||
        Phaser.Input.Keyboard.JustDown(this.enterKey) ||
        Phaser.Input.Keyboard.JustDown(this.escKey)
      ) {
        this.skipIntro();
      }
    }

    // Always maintain terrain collision. Terrain is not an Arcade collider, so if we skip this
    // (e.g. during character selection between turns), units can fall / phase into the dirt.
    this.soldiers.forEach(soldier => {
      if (soldier.isAlive()) {
        soldier.update(dt, this.terrain);
        const grounded = this.terrain.checkCollision(soldier.sprite);
        soldier.setGrounded(grounded);
        this.checkOutOfBounds(soldier);
      }
    });

    // Supply drops can be collected any time (even during selection between turns).
    this.checkSupplyDropPickups();

    // Handle character selection mode
    if (this.isSelectingCharacter) {
      this.handleCharacterSelection();
      this.emitAbilityStatus(null, null);
      return;
    }

    if (!this.currentSoldier || !this.currentSoldier.isAlive()) {
      return;
    }

    // During AI turns, player input is ignored. The AI runs via timers.
    if (this.isTeamAI(this.currentSoldier.team)) {
      this.emitAbilityStatus(null, null);
      return;
    }

    // ESC to cancel special modes or deselect current soldier and return to character selection (only if haven't fired)
    if (Phaser.Input.Keyboard.JustDown(this.escKey) && !this.hasFired) {
      if (this.isAirstrikeTargeting) {
        this.exitAirstrikeTargeting();
        return;
      }
      if (this.isHowitzerMode) {
        this.exitHowitzerMode();
        return;
      }
      this.deselectSoldier();
      return;
    }

    // Calculate remaining movement
    const distanceMoved = Math.abs(this.currentSoldier.x - this.startX);
    this.movementUsed = distanceMoved;
    const canMove = this.movementUsed < this.maxMovement;

    // A/D to pan camera for scouting (releases follow)
    if (!this.isShotResolving()) {
      const panSpeed = 12;
      if (this.aKey.isDown) {
        if (!this.isPanningCamera) {
          this.cameras.main.stopFollow();
          this.isPanningCamera = true;
        }
        this.cameras.main.scrollX = Math.max(0, this.cameras.main.scrollX - panSpeed);
      } else if (this.dKey.isDown) {
        if (!this.isPanningCamera) {
          this.cameras.main.stopFollow();
          this.isPanningCamera = true;
        }
        this.cameras.main.scrollX = Math.min(this.worldWidth - this.cameras.main.width, this.cameras.main.scrollX + panSpeed);
      } else if (this.isPanningCamera && !this.aKey.isDown && !this.dKey.isDown) {
        // Camera stays where user panned it - no auto-return to soldier
        this.isPanningCamera = false;
      }
    } else {
      // While a shot is resolving, keep camera tracking stable.
      this.isPanningCamera = false;
    }

    // Airstrike targeting mode: player designates a map location with the mouse.
    // Movement/firing is disabled until the target is confirmed or canceled.
    if (this.isAirstrikeTargeting) {
      if (Phaser.Input.Keyboard.JustDown(this.xKey) && !this.hasFired) {
        this.exitAirstrikeTargeting();
      }

      this.currentSoldier.stopMoving();
      this.updateAirstrikeMarker();
      this.emitAbilityStatus(this.getCurrentDigInStatus(), this.getCurrentHealStatus());

      // Keep UI updated.
      this.events.emit('movement-update', {
        movementUsed: Math.floor(this.movementUsed),
        maxMovement: this.maxMovement,
      });

      // Suppress normal aiming/firing UI while targeting.
      this.drawAimLine();
      return;
    }

    // Allow canceling howitzer mode at any time before firing.
    if (this.isHowitzerMode && Phaser.Input.Keyboard.JustDown(this.cKey) && !this.hasFired) {
      this.exitHowitzerMode();

      // Keep UI updated (and avoid immediately re-entering on the same key press).
      this.events.emit('movement-update', {
        movementUsed: Math.floor(this.movementUsed),
        maxMovement: this.maxMovement,
      });
      this.drawAimLine();
      return;
    }

    // Handle movement (only if we have movement left, not panning, and not using a placed weapon)
    if (canMove && !this.isPanningCamera && !this.isHowitzerMode) {
      if (this.cursors.left.isDown) {
        this.currentSoldier.moveLeft();
      } else if (this.cursors.right.isDown) {
        this.currentSoldier.moveRight();
      } else {
        this.currentSoldier.stopMoving();
      }
    } else if (!this.isPanningCamera) {
      this.currentSoldier.stopMoving();
    }

    // Handle jumping (uses movement)
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) && canMove && !this.isPanningCamera && !this.isHowitzerMode) {
      this.currentSoldier.jump();
    }

    // Handle aiming (W/S keys - completely independent from movement)
    // Allow full 360 degree aiming
    if (this.wKey.isDown) {
      this.lastAimInput = 'keys';
      this.aimAngle -= 1.5;
      if (this.aimAngle < -180) this.aimAngle += 360;
    }
    if (this.sKey.isDown) {
      this.lastAimInput = 'keys';
      this.aimAngle += 1.5;
      if (this.aimAngle > 180) this.aimAngle -= 360;
    }

    // If the mouse was the last aim input, keep the aim target in sync with the pointer —
    // but NOT while the player is panning the camera (A/D or drag). Panning used to drag
    // the aim with the scrolling world, making shots impossible to line up.
    if (this.lastAimInput === 'mouse' && !this.isDraggingCamera && !this.isPanningCamera && !this.isAirstrikeTargeting) {
      const pointer = this.input.activePointer;
      if (pointer) {
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const origin = this.getAimOrigin();
        if (!origin) return;
        const dx = worldPoint.x - origin.x;
        const dy = worldPoint.y - origin.y;
        if (Math.hypot(dx, dy) >= MOUSE_AIM_DEADZONE_PX) {
          this.mouseAimTargetAngle = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
        }
      }
    }

    // Rotate the aim toward the mouse target at a capped speed instead of snapping.
    // Small corrections land instantly; big pointer swings sweep over deliberately.
    if (this.lastAimInput === 'mouse' && this.mouseAimTargetAngle !== null) {
      const maxStep = MOUSE_AIM_TURN_SPEED_DEG_PER_SEC * dt;
      const diff = wrapDeg(this.mouseAimTargetAngle - this.aimAngle);
      if (Math.abs(diff) <= maxStep) {
        this.aimAngle = this.mouseAimTargetAngle;
      } else {
        this.aimAngle = wrapDeg(this.aimAngle + Math.sign(diff) * maxStep);
      }
    }

    // Keep any placed weapon visuals in sync with the current aim.
    this.updateHowitzerVisual();

    // Handle power adjustment (hold space to charge, release to fire)
    // Only start charging if not currently grappling
    if (this.spaceKey.isDown && !this.hasFired && !this.currentSoldier.isCurrentlyGrappling()) {
      if (!this.isCharging) {
        this.isCharging = true;
        this.power = POWER_MIN; // Start at minimum power
        this.powerChargeDirection = 1;
        this.keyboardChargeTurnId = this.turnId;
        this.keyboardChargeSoldier = this.currentSoldier;
      }
      this.updateChargePower(dt);
    }

    // Only fire on space release if we were actually charging (not from grapple)
    if (this.isCharging && Phaser.Input.Keyboard.JustUp(this.spaceKey) && !this.currentSoldier.isCurrentlyGrappling()) {
      const sameTurn = this.keyboardChargeTurnId === this.turnId;
      const sameSoldier = this.keyboardChargeSoldier === this.currentSoldier;
      this.keyboardChargeTurnId = 0;
      this.keyboardChargeSoldier = null;
      if (sameTurn && sameSoldier) {
        this.fireProjectile();
      }
      this.isCharging = false;
    }
    
    // Handle mouse charging (left mouse button held) - also check not grappling
    if (this.isMouseCharging && !this.hasFired && !this.currentSoldier.isCurrentlyGrappling()) {
      this.updateChargePower(dt);
    }

    // End turn manually (only after firing, and only once the shot is fully resolved).
    if (Phaser.Input.Keyboard.JustDown(this.enterKey) && this.hasFired && !this.isTurnEnding && !this.isShotResolving()) {
      this.endTurn();
    }

// Handle grappling hook (G key) - completely separate from firing
    // Only allow if: not fired, not charging, not already grappling
    if (Phaser.Input.Keyboard.JustDown(this.gKey) && 
        !this.hasFired && 
        !this.isCharging && 
        !this.isMouseCharging &&
        !this.isHowitzerMode &&
        !this.currentSoldier.isCurrentlyGrappling()) {
      // Use aim angle and power to determine grapple target
      const angleRad = Phaser.Math.DegToRad(this.aimAngle);
      const grappleDistance = 150 + this.power * 2.5; // 150-400 range (increased)
      const targetX = this.currentSoldier.x + Math.cos(angleRad) * grappleDistance;
      const targetY = this.currentSoldier.y + Math.sin(angleRad) * grappleDistance;
      
      // Check for Shift+G (jetpack mode - no terrain required)
      const isJetpackMode = this.shiftKey.isDown;
      
      // Try to grapple - jetpack mode doesn't require terrain
      if (this.currentSoldier.startGrapple(targetX, targetY, this.terrain, !isJetpackMode)) {
        this.movementUsed = this.maxMovement; // Uses all movement
      }
    }

    // Shift+G for jetpack mode (separate check for just Shift+G without regular G trigger)
    if (Phaser.Input.Keyboard.JustDown(this.gKey) && this.shiftKey.isDown &&
        !this.hasFired && 
        !this.isCharging && 
        !this.isMouseCharging &&
        !this.isHowitzerMode &&
        !this.currentSoldier.isCurrentlyGrappling()) {
      const angleRad = Phaser.Math.DegToRad(this.aimAngle);
      const grappleDistance = 150 + this.power * 2.5;
      const targetX = this.currentSoldier.x + Math.cos(angleRad) * grappleDistance;
      const targetY = this.currentSoldier.y + Math.sin(angleRad) * grappleDistance;
      
      if (this.currentSoldier.startGrapple(targetX, targetY, this.terrain, false)) {
        this.movementUsed = this.maxMovement;
      }
    }

    // Abilities (consume the turn action; only when not fired/charging/grappling)
    if (!this.hasFired &&
        !this.isCharging &&
        !this.isMouseCharging &&
        !this.isHowitzerMode &&
        !this.currentSoldier.isCurrentlyGrappling()) {
      if (Phaser.Input.Keyboard.JustDown(this.xKey)) {
        this.enterAirstrikeTargeting();
      } else if (Phaser.Input.Keyboard.JustDown(this.cKey)) {
        this.enterHowitzerMode();
      }
    }

    // Dig In / Heal: always check the key so a blocked press explains why instead of silently doing nothing.
    const digStatus = this.getCurrentDigInStatus();
    const healStatus = this.getCurrentHealStatus();
    if (Phaser.Input.Keyboard.JustDown(this.bKey)) {
      if (digStatus.ready) this.tryDigIn();
      else this.showAbilityBlocked(`Can't dig in: ${digStatus.reason}`);
    } else if (Phaser.Input.Keyboard.JustDown(this.hKey)) {
      if (healStatus.ready) this.tryMedicHeal();
      else this.showAbilityBlocked(`Can't heal: ${healStatus.reason}`);
    }
    this.emitAbilityStatus(digStatus, healStatus);

    // Update aim line
    this.drawAimLine();

    // Soldier maintenance runs at top of update() now.

    // Update movement info for UI
    this.events.emit('movement-update', {
      movementUsed: Math.floor(this.movementUsed),
      maxMovement: this.maxMovement,
    });
  }
  
  private checkOutOfBounds(soldier: Soldier): void {
    const x = soldier.x;
    const y = soldier.y;
    const margin = 50; // Small margin before death
    
    // Check if soldier is out of bounds
    if (y > this.worldHeight + margin || x < -margin || x > this.worldWidth + margin) {
      // Soldier fell off the map - instant death!
      soldier.fallToDeath();
      
      // Create dramatic falling death effect
      this.createFallDeathEffect(x, Math.min(y, this.worldHeight));
      
      // If this was the current soldier, end their turn
      if (soldier === this.currentSoldier && !this.isTurnEnding) {
        const turnId = this.turnId;
        const soldierRef = soldier;
        this.time.delayedCall(500, () => {
          if (turnId !== this.turnId) return;
          if (this.currentSoldier !== soldierRef) return;
          if (!this.isTurnEnding) {
            this.endTurn();
          }
        });
      }
    }
  }
  
  private createFallDeathEffect(x: number, y: number): void {
    // Scream text
    const screamText = this.add.text(x, y - 50, 'AAAAHHH!', {
      fontSize: '24px',
      fontFamily: 'Arial Black',
      color: '#ff0000',
      stroke: '#000000',
      strokeThickness: 4,
    });
    screamText.setOrigin(0.5);
    screamText.setDepth(200);
    
    this.tweens.add({
      targets: screamText,
      y: y - 150,
      alpha: 0,
      scale: 1.5,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => screamText.destroy(),
    });
    
    // Camera shake
    this.cameras.main.shake(300, 0.015);
  }

  private handleCharacterSelection(): void {
    // Q/E or A/D to pan camera across battlefield for scouting
    const panSpeed = 15;
    if (this.qKey.isDown || this.aKey.isDown) {
      this.cameras.main.scrollX = Math.max(0, this.cameras.main.scrollX - panSpeed);
    }
    if (this.eKey.isDown || this.dKey.isDown) {
      this.cameras.main.scrollX = Math.min(this.worldWidth - this.cameras.main.width, this.cameras.main.scrollX + panSpeed);
    }
    
    // Tab or arrow keys to cycle through characters
    if (Phaser.Input.Keyboard.JustDown(this.tabKey) || Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      this.selectionIndex = (this.selectionIndex + 1) % this.selectableSoldiers.length;
      this.updateSelectionIndicator();
      this.cameras.main.pan(this.selectableSoldiers[this.selectionIndex].x, this.worldHeight / 2, 200);
      this.emitCharacterSelectionEvent();
    }
    
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
      this.selectionIndex = (this.selectionIndex - 1 + this.selectableSoldiers.length) % this.selectableSoldiers.length;
      this.updateSelectionIndicator();
      this.cameras.main.pan(this.selectableSoldiers[this.selectionIndex].x, this.worldHeight / 2, 200);
      this.emitCharacterSelectionEvent();
    }
    
    // Enter or Space to confirm selection
    if (Phaser.Input.Keyboard.JustDown(this.enterKey) || Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.selectionText.setVisible(false);
      this.selectSoldier(this.selectableSoldiers[this.selectionIndex]);
    }
    
    // Number keys 1-5 for direct selection (using pre-registered keys)
    for (let i = 0; i < Math.min(5, this.selectableSoldiers.length); i++) {
      if (Phaser.Input.Keyboard.JustDown(this.numberKeys[i])) {
        this.selectionText.setVisible(false);
        this.selectSoldier(this.selectableSoldiers[i]);
      }
    }
    
    // Update indicator position
    this.updateSelectionIndicator();
  }

  private emitCharacterSelectionEvent(): void {
    const soldier = this.selectableSoldiers[this.selectionIndex];
    const weapon = soldier.weapon;
    this.events.emit('character-selection', {
      team: soldier.team,
      soldier: {
        name: soldier.name,
        health: soldier.getHealth(),
        squadIndex: soldier.squadIndex,
      },
      weapon: {
        name: weapon.name,
        damage: weapon.damage,
        explosionRadius: weapon.explosionRadius,
        projectileSpeed: weapon.projectileSpeed,
        gravity: weapon.gravity,
        weight: weapon.weight,
        description: weapon.description,
        pelletCount: weapon.pelletCount,
        bounce: weapon.bounce,
      },
      currentIndex: this.selectionIndex,
      totalCount: this.selectableSoldiers.length,
      soldierX: soldier.x,
    });
  }

  private getAimOrigin(): { x: number; y: number } | null {
    if (!this.currentSoldier) return null;

    if (this.isHowitzerMode && this.howitzer) {
      // Aim from the howitzer pivot (near ground), not the soldier torso.
      return { x: this.howitzer.x, y: this.howitzer.y - 6 };
    }

    return { x: this.currentSoldier.x, y: this.currentSoldier.y - 10 };
  }

  private getActiveWeaponConfig(): WeaponConfig | null {
    if (!this.currentSoldier) return null;
    if (this.isHowitzerMode) return HOWITZER_CONFIG;
    return this.currentSoldier.weapon;
  }

  private updateChargePower(dt: number): void {
    const rate = this.powerChargeDirection > 0 ? POWER_CHARGE_UP_PER_SECOND : POWER_CHARGE_DOWN_PER_SECOND;
    this.power += this.powerChargeDirection * rate * dt;

    if (this.power >= 100) {
      this.power = 100;
      this.powerChargeDirection = -1;
    } else if (this.power <= POWER_MIN) {
      this.power = POWER_MIN;
      this.powerChargeDirection = 1;
    }
  }

  private drawAimLine(): void {
    this.aimLine.clear();

    if (!this.currentSoldier || !this.currentSoldier.isAlive()) {
      this.aimPowerText.setVisible(false);
      return;
    }

    // While designating an airstrike target, suppress the normal weapon trajectory UI.
    if (this.isAirstrikeTargeting) {
      this.aimPowerText.setVisible(false);
      return;
    }

    const origin = this.getAimOrigin();
    const weaponConfig = this.getActiveWeaponConfig();
    if (!origin || !weaponConfig) return;

    const startX = origin.x;
    const startY = origin.y;
    const angleRad = Phaser.Math.DegToRad(this.aimAngle);
    
    // Get weapon config for trajectory physics
    const speed = (this.power / 100) * weaponConfig.projectileSpeed;
    const gravityMultiplier = weaponConfig.gravity;
    const worldGravity = 500;
    const effectiveGravity = worldGravity * gravityMultiplier;
    
    // Calculate trajectory points
    const vx = Math.cos(angleRad) * speed;
    const vy = Math.sin(angleRad) * speed;
    
// Simulate trajectory with fine time steps
    const trajectoryPoints: { x: number; y: number }[] = [];
    const timeStep = 0.016; // ~60fps simulation
    const maxTime = 12.0; // Longer preview for long-range shots (mortar, rocket)
    let t = 0;
    
    while (t < maxTime) {
      const px = startX + vx * t;
      const py = startY + vy * t + 0.5 * effectiveGravity * t * t;
      
      // Stop if out of world bounds
      if (px < 0 || px > this.worldWidth || py > this.worldHeight) break;
      
      // Stop if hits terrain. Refine the collision point so the impact marker is accurate.
      if (py > 0 && this.terrain.isPointSolid(px, py)) {
        if (trajectoryPoints.length > 0) {
          // Binary search between the last non-solid point and the first solid point.
          let ax = trajectoryPoints[trajectoryPoints.length - 1].x;
          let ay = trajectoryPoints[trajectoryPoints.length - 1].y;
          let bx = px;
          let by = py;
          for (let i = 0; i < 10; i++) {
            const mx = (ax + bx) * 0.5;
            const my = (ay + by) * 0.5;
            if (this.terrain.isPointSolid(mx, my)) {
              bx = mx;
              by = my;
            } else {
              ax = mx;
              ay = my;
            }
          }
          trajectoryPoints.push({ x: ax, y: ay });
        }
        break;
      }
      
      trajectoryPoints.push({ x: px, y: py });
      t += timeStep;
    }
    
    // Draw laser-style dotted trajectory line
    if (trajectoryPoints.length > 1) {
      const dotSpacing = 10; // Slightly wider spacing for clarity
      const dotSize = 3; // Larger dot size for better visibility
      let accumulatedDistance = 0;
      
      for (let i = 1; i < trajectoryPoints.length; i++) {
        const p0 = trajectoryPoints[i - 1];
        const p1 = trajectoryPoints[i];
        const segmentDist = Phaser.Math.Distance.Between(p0.x, p0.y, p1.x, p1.y);
        
        // Interpolate dots along this segment
        let localDist = dotSpacing - (accumulatedDistance % dotSpacing);
        while (localDist < segmentDist) {
          const ratio = localDist / segmentDist;
          const dotX = p0.x + (p1.x - p0.x) * ratio;
          const dotY = p0.y + (p1.y - p0.y) * ratio;
          
          // Calculate fade: dots fade out further along trajectory
          const totalDist = accumulatedDistance + localDist;
          const maxDist = 1200; // Fade over longer distance for long-range weapons
          const alpha = Math.max(0.3, 1 - totalDist / maxDist);
          
          // Bright trajectory color with glow effect
          this.aimLine.fillStyle(0xff2222, alpha * 0.95);
          this.aimLine.fillCircle(dotX, dotY, dotSize);
          
          // Inner bright core
          this.aimLine.fillStyle(0xff6666, alpha);
          this.aimLine.fillCircle(dotX, dotY, dotSize * 0.6);
          
          localDist += dotSpacing;
        }
        accumulatedDistance += segmentDist;
      }
      
      // Draw impact marker at end of trajectory
      if (trajectoryPoints.length > 2) {
        const lastPoint = trajectoryPoints[trajectoryPoints.length - 1];
        
        // Crosshair at impact point
        this.aimLine.lineStyle(2, 0xff0000, 0.8);
        this.aimLine.strokeCircle(lastPoint.x, lastPoint.y, 10);
        this.aimLine.lineBetween(lastPoint.x - 16, lastPoint.y, lastPoint.x + 16, lastPoint.y);
        this.aimLine.lineBetween(lastPoint.x, lastPoint.y - 16, lastPoint.x, lastPoint.y + 16);
        
        // Show explosion radius for explosive weapons (non-bullet types)
        const isExplosive = weaponConfig.type !== WeaponType.RIFLE && 
                           weaponConfig.type !== WeaponType.SNIPER && 
                           weaponConfig.type !== WeaponType.PISTOL && 
                           weaponConfig.type !== WeaponType.SMG && 
                           weaponConfig.type !== WeaponType.MINIGUN && 
                           weaponConfig.type !== WeaponType.CARBINE && 
                           weaponConfig.type !== WeaponType.SHOTGUN && 
                           weaponConfig.type !== WeaponType.SLUG &&
                           weaponConfig.type !== WeaponType.FLAMER;
        
        if (isExplosive && weaponConfig.explosionRadius > 10) {
          // Draw explosion radius ring
          this.aimLine.lineStyle(2, 0xff8800, 0.6);
          this.aimLine.strokeCircle(lastPoint.x, lastPoint.y, weaponConfig.explosionRadius);
          
          // Fill with low opacity to show blast zone
          this.aimLine.fillStyle(0xff6600, 0.1);
          this.aimLine.fillCircle(lastPoint.x, lastPoint.y, weaponConfig.explosionRadius);
          
          // Draw damage info
          this.aimLine.fillStyle(0xffaa00, 0.9);
          this.aimLine.fillCircle(lastPoint.x, lastPoint.y - weaponConfig.explosionRadius - 20, 12);
          this.aimLine.fillStyle(0x000000, 1);
          this.aimLine.fillCircle(lastPoint.x, lastPoint.y - weaponConfig.explosionRadius - 20, 8);
        }
      }
    }
    
    // Draw weapon muzzle indicator (small bright dot at start)
    this.aimLine.fillStyle(0xff6666, 1);
    this.aimLine.fillCircle(startX + Math.cos(angleRad) * 20, startY + Math.sin(angleRad) * 20, 4);

    // Draw power indicator bar (sleek horizontal bar)
    const barX = startX - 25;
    const barY = startY - 35;
    const barWidth = 50;
    const barHeight = 4;
    
    // Background
    this.aimLine.fillStyle(0x000000, 0.5);
    this.aimLine.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
    
    // Power fill with gradient color
    const greenColor = new Phaser.Display.Color(0, 255, 0);
    const redColor = new Phaser.Display.Color(255, 0, 0);
    const powerColor = Phaser.Display.Color.Interpolate.ColorWithColor(
      greenColor,
      redColor,
      100,
      this.power
    );
    const color = Phaser.Display.Color.GetColor(powerColor.r, powerColor.g, powerColor.b);
    
    this.aimLine.fillStyle(color, 1);
    this.aimLine.fillRect(barX, barY, barWidth * (this.power / 100), barHeight);

    // Numeric readout while charging — the bar alone made precise power hard to judge.
    if (this.isCharging || this.isMouseCharging) {
      this.aimPowerText.setText(`${Math.round(this.power)}%`);
      this.aimPowerText.setPosition(startX, barY - 6);
      this.aimPowerText.setVisible(true);
    } else {
      this.aimPowerText.setVisible(false);
    }
  }

  private fireProjectile(): void {
    if (!this.currentSoldier || this.hasFired) return;

    if (this.isHowitzerMode) {
      this.fireHowitzerShot();
      return;
    }
    this.hasFired = true;
    this.isMouseCharging = false;
    this.isCharging = false;
    this.mouseChargeTurnId = 0;
    this.mouseChargeSoldier = null;
    this.keyboardChargeTurnId = 0;
    this.keyboardChargeSoldier = null;
    
    // Stop following the soldier
    this.cameras.main.stopFollow();
    
    // Freeze angle/power at trigger time (so setup animation can't change the shot)
    const shotAngle = this.aimAngle;
    const shotPower = this.power;

    const doFire = (): void => {
      if (!this.currentSoldier) return;

      // === FIRING PIZZAZZ ===
      // Muzzle flash
      const angleRad = Phaser.Math.DegToRad(shotAngle);
      const muzzleX = this.currentSoldier.x + Math.cos(angleRad) * 25;
      const muzzleY = this.currentSoldier.y + Math.sin(angleRad) * 25;
      
      const muzzleFlash = this.add.circle(muzzleX, muzzleY, 15, 0xffff00, 0.9);
      muzzleFlash.setDepth(200);
      this.tweens.add({
        targets: muzzleFlash,
        scale: 2,
        alpha: 0,
        duration: 100,
        onComplete: () => muzzleFlash.destroy(),
      });
      
      // Small recoil animation for soldier
      const recoilX = -Math.cos(angleRad) * 5;
      this.tweens.add({
        targets: this.currentSoldier.sprite,
        x: this.currentSoldier.sprite.x + recoilX,
        duration: 50,
        yoyo: true,
        ease: 'Power2',
      });
      
      // Camera kick
      this.cameras.main.shake(100, 0.005);
      
      // Track this shot so the turn can't advance until everything has resolved.
      this.beginShotResolution(this.currentSoldier, this.currentSoldier.weapon);

      // Fire using the weapon system
      this.currentSoldier.fire(shotAngle, shotPower, this.terrain);
    };

    doFire();
  }

  private fireHowitzerShot(): void {
    if (!this.currentSoldier || this.hasFired) return;

    const shooter = this.currentSoldier;
    if (!shooter.consumeArtilleryCharge()) {
      // Charges are granted by supply drops; if something desyncs, just bail safely.
      this.exitHowitzerMode();
      return;
    }

    this.hasFired = true;
    this.clearChargeState();

    // Stop following the soldier
    this.cameras.main.stopFollow();

    // Freeze angle/power at trigger time.
    const shotAngle = this.aimAngle;
    const shotPower = this.power;
    const angleRad = Phaser.Math.DegToRad(shotAngle);

    const origin = this.getAimOrigin() ?? { x: shooter.x, y: shooter.y - 10 };
    const muzzleX = origin.x + Math.cos(angleRad) * 34;
    const muzzleY = origin.y + Math.sin(angleRad) * 34;

    // Flash + recoil on the placed weapon (fallback: soldier sprite).
    const muzzleFlash = this.add.circle(muzzleX, muzzleY, 22, 0xffdd88, 0.95);
    muzzleFlash.setDepth(200);
    this.tweens.add({
      targets: muzzleFlash,
      scale: 2.4,
      alpha: 0,
      duration: 120,
      onComplete: () => muzzleFlash.destroy(),
    });

    const recoilX = -Math.cos(angleRad) * 7;
    const recoilY = -Math.sin(angleRad) * 4;
    const recoilTarget: Phaser.GameObjects.GameObject & { x: number; y: number } =
      (this.howitzer as any) ?? (shooter.sprite as any);

    this.tweens.add({
      targets: recoilTarget,
      x: recoilTarget.x + recoilX,
      y: recoilTarget.y + recoilY,
      duration: 80,
      yoyo: true,
      ease: 'Power2',
    });

    // Camera kick (bigger than small arms)
    this.cameras.main.shake(150, 0.010);

    // Track this shot so the turn can't advance until everything has resolved.
    this.beginShotResolution(shooter, HOWITZER_CONFIG);

    // Exit mode UI (leave the howitzer model; it will be cleaned up on endTurn).
    if (this.howitzerHelpText) {
      this.howitzerHelpText.destroy();
      this.howitzerHelpText = null;
    }
    this.isHowitzerMode = false;

    // Fire shell.
    createProjectile(this, muzzleX, muzzleY, shotAngle, shotPower, HOWITZER_CONFIG, this.terrain, shooter);
  }

  private enterHowitzerMode(): void {
    if (!this.currentSoldier || this.hasFired) return;

    // Toggle off if already active.
    if (this.isHowitzerMode) {
      this.exitHowitzerMode();
      return;
    }

    if (this.currentSoldier.getArtilleryCharges() <= 0) return;

    this.exitAirstrikeTargeting();
    this.clearChargeState();

    this.isHowitzerMode = true;

    // Place it near the soldier on the local ground.
    const soldier = this.currentSoldier;
    const footY = soldier.y + 14;
    const groundY = this.terrain.findSurfaceYAtOrBelow(soldier.x, footY - 6, 320) ?? this.terrain.getSurfaceY(soldier.x);

    // Clean any existing model.
    if (this.howitzer) {
      this.howitzer.destroy(true);
      this.howitzer = null;
      this.howitzerBarrel = null;
    }

    const howitzer = this.add.container(soldier.x, groundY - 6);
    howitzer.setDepth(90);

    const base = this.add.rectangle(0, 12, 46, 14, 0x2f2f2f, 0.95);
    base.setOrigin(0.5, 0.5);

    const wheelL = this.add.circle(-16, 18, 6, 0x1a1a1a, 1);
    const wheelR = this.add.circle(16, 18, 6, 0x1a1a1a, 1);

    const barrel = this.add.rectangle(0, 6, 44, 6, 0x5a5a5a, 1);
    barrel.setOrigin(0.06, 0.5); // pivot near the breech

    // Subtle team decal
    const decalColor = soldier.team === Team.RED ? 0xff6666 : 0x6699ff;
    const decal = this.add.rectangle(-18, 10, 8, 6, decalColor, 0.85);
    decal.setOrigin(0.5, 0.5);

    howitzer.add([base, wheelL, wheelR, decal, barrel]);

    this.howitzer = howitzer;
    this.howitzerBarrel = barrel;

    if (this.howitzerHelpText) this.howitzerHelpText.destroy();
    this.howitzerHelpText = this.add.text(this.cameras.main.width / 2, 52, 'HOWITZER: Aim + fire (SPACE/LMB). C/Esc cancel', {
      font: 'bold 14px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      backgroundColor: '#00000055',
      padding: { x: 10, y: 6 },
    });
    this.howitzerHelpText.setOrigin(0.5);
    this.howitzerHelpText.setScrollFactor(0);
    this.howitzerHelpText.setDepth(300);

    this.updateHowitzerVisual();
  }

  private exitHowitzerMode(): void {
    this.isHowitzerMode = false;

    if (this.howitzerHelpText) {
      this.howitzerHelpText.destroy();
      this.howitzerHelpText = null;
    }

    if (this.howitzer) {
      this.howitzer.destroy(true);
      this.howitzer = null;
    }
    this.howitzerBarrel = null;
  }

  private updateHowitzerVisual(): void {
    if (!this.isHowitzerMode || !this.howitzer || !this.howitzerBarrel || !this.currentSoldier) return;

    // Keep the model anchored to the ground under the soldier (accounts for small settling).
    const soldier = this.currentSoldier;
    const footY = soldier.y + 14;
    const groundY = this.terrain.findSurfaceYAtOrBelow(soldier.x, footY - 6, 320) ?? this.terrain.getSurfaceY(soldier.x);
    this.howitzer.setPosition(soldier.x, groundY - 6);

    const angleRad = Phaser.Math.DegToRad(this.aimAngle);
    this.howitzerBarrel.setRotation(angleRad);
  }

  private enterAirstrikeTargeting(): void {
    if (!this.currentSoldier || this.hasFired) return;

    if (this.isAirstrikeTargeting) {
      this.exitAirstrikeTargeting();
      return;
    }

    if (this.currentSoldier.getAirstrikeCharges() <= 0) return;

    this.exitHowitzerMode();
    this.clearChargeState();

    // Let the player scout a target without camera follow fighting them.
    this.cameras.main.stopFollow();

    this.isAirstrikeTargeting = true;

    if (this.airstrikeMarker) this.airstrikeMarker.destroy();
    this.airstrikeMarker = this.add.graphics();
    this.airstrikeMarker.setDepth(220);

    if (this.airstrikeHelpText) this.airstrikeHelpText.destroy();
    this.airstrikeHelpText = this.add.text(this.cameras.main.width / 2, 52, 'AIRSTRIKE: Click to designate target. X/Esc cancel', {
      font: 'bold 14px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      backgroundColor: '#00000055',
      padding: { x: 10, y: 6 },
    });
    this.airstrikeHelpText.setOrigin(0.5);
    this.airstrikeHelpText.setScrollFactor(0);
    this.airstrikeHelpText.setDepth(300);

    this.updateAirstrikeMarker();
  }

  private exitAirstrikeTargeting(): void {
    this.isAirstrikeTargeting = false;

    if (this.airstrikeHelpText) {
      this.airstrikeHelpText.destroy();
      this.airstrikeHelpText = null;
    }

    if (this.airstrikeMarker) {
      this.airstrikeMarker.destroy();
      this.airstrikeMarker = null;
    }
  }

  private updateAirstrikeMarker(): void {
    if (!this.isAirstrikeTargeting || !this.airstrikeMarker) return;

    const pointer = this.input.activePointer;
    if (!pointer) return;

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const targetX = Phaser.Math.Clamp(worldPoint.x, 60, this.worldWidth - 60);
    const targetY = this.terrain.getSurfaceY(targetX) - 6;

    const g = this.airstrikeMarker;
    g.clear();

    // Main crosshair
    g.lineStyle(2, 0x66ffff, 0.85);
    g.strokeCircle(targetX, targetY, 10);
    g.lineBetween(targetX - 18, targetY, targetX + 18, targetY);
    g.lineBetween(targetX, targetY - 18, targetX, targetY + 18);

    // Preview of the bomb line footprint
    const spacing = 42;
    g.lineStyle(2, 0x66ffff, 0.45);
    for (let i = 0; i < AIRSTRIKE_BOMB_COUNT; i++) {
      const offset = (i - (AIRSTRIKE_BOMB_COUNT - 1) / 2) * spacing;
      const bx = Phaser.Math.Clamp(targetX + offset, 40, this.worldWidth - 40);
      g.strokeCircle(bx, targetY, 6);
    }
  }

  private confirmAirstrikeTarget(worldX: number): void {
    if (!this.isAirstrikeTargeting) return;
    if (!this.currentSoldier || this.hasFired) return;

    const targetX = Phaser.Math.Clamp(worldX, 60, this.worldWidth - 60);
    this.exitAirstrikeTargeting();
    this.callAirstrikeAt(targetX);
  }

  private callAirstrikeAt(targetX: number): void {
    if (!this.currentSoldier || this.hasFired) return;

    const shooter = this.currentSoldier;
    if (!shooter.consumeAirstrikeCharge()) return;

    this.hasFired = true;
    this.clearChargeState();

    const targetY = this.terrain.getSurfaceY(targetX) - 6;

    this.cameras.main.stopFollow();
    this.cameras.main.pan(targetX, targetY, 350, 'Sine.easeInOut');

    this.showPowerupText(targetX, targetY - 40, 'AIRSTRIKE!', 0x66ffff);

    SoundManager.playPlaneEngine(3.2);
    SoundManager.playBombWhistle(0.55);

    // Prevent the turn from advancing until all bombs have impacted.
    this.beginShotResolution(shooter, AIRSTRIKE_SHOT_CONFIG);

    const facingRight = shooter.team === Team.RED;
    const startX = facingRight ? -100 : this.worldWidth + 100;
    const endX = facingRight ? this.worldWidth + 200 : -200;
    const planeY = 75 + Phaser.Math.Between(0, 40);
    const duration = 4200;

    const plane = this.createPlane(startX, planeY, facingRight);
    plane.setDepth(120);

    this.tweens.add({
      targets: plane,
      x: endX,
      duration,
      ease: 'Linear',
      onComplete: () => plane.destroy(),
    });

    const planeSpeed = (endX - startX) / duration;

    // Schedule bombs when the plane reaches each drop X.
    const spacing = 42;
    const drops: Array<{ x: number; delay: number }> = [];
    for (let i = 0; i < AIRSTRIKE_BOMB_COUNT; i++) {
      const offset = (i - (AIRSTRIKE_BOMB_COUNT - 1) / 2) * spacing;
      const dropX = Phaser.Math.Clamp(targetX + offset, 40, this.worldWidth - 40);
      const timeToReachDrop = Math.abs((dropX - startX) / planeSpeed);
      const dropDelay = Phaser.Math.Clamp(timeToReachDrop + Phaser.Math.Between(-40, 40), 120, duration - 120);
      drops.push({ x: dropX, delay: dropDelay });
    }

    let primaryIndex = 0;
    for (let i = 1; i < drops.length; i++) {
      if (drops[i].delay < drops[primaryIndex].delay) primaryIndex = i;
    }

    const turnId = this.turnId;
    drops.forEach((d, idx) => {
      this.time.delayedCall(d.delay, () => {
        if (turnId !== this.turnId) return;
        if (this.isTurnEnding) return;

        const bomb = new Projectile(this, d.x, planeY + 18, 0, 120, AIRSTRIKE_BOMB_CONFIG, this.terrain);
        this.events.emit('projectile-spawned', bomb);
        if (idx === primaryIndex) {
          this.events.emit('projectile-created', bomb);
        }
      });
    });
  }

  private tryDigIn(): void {
    if (!this.currentSoldier || this.hasFired) return;
    const turnId = this.turnId;

    const soldier = this.currentSoldier;
    const digX = soldier.x;
    const digY = soldier.y;

    const angleRad = Phaser.Math.DegToRad(this.aimAngle);
    const facing: -1 | 1 = Math.cos(angleRad) < 0 ? -1 : 1;

    // Compute ground at the soldier's feet (not the global "top surface" heightmap, which can be wrong in caves).
    // Also sample at the barrier X (buildCrudeBarrier offsets by facing*26) so the berm anchors correctly on slopes.
    const barrierX = digX + facing * 26;
    const footY = digY + 14;
    const soldierGroundY = this.terrain.findSurfaceYAtOrBelow(digX, footY - 6, 320) ?? this.terrain.getSurfaceY(digX);
    let groundY = this.terrain.findSurfaceYAtOrBelow(barrierX, footY - 6, 320);
    if (groundY === null || Math.abs(groundY - soldierGroundY) > 70) {
      // If the sample is missing (cliff edge) or wildly different (overhang/complex geometry), anchor to the soldier.
      groundY = soldierGroundY;
    }

    // Small dirt burst + hammering animation
    soldier.sayQuip('moving');
    this.hasFired = true;

    const digText = this.add.text(digX, digY - 70, 'DIGGING IN', {
      font: 'bold 14px Arial',
      color: '#d0c080',
      stroke: '#000000',
      strokeThickness: 3,
    });
    digText.setOrigin(0.5);
    digText.setDepth(200);

    this.tweens.add({
      targets: digText,
      y: digText.y - 20,
      alpha: 0,
      duration: 900,
      ease: 'Power2',
      onComplete: () => digText.destroy(),
    });

    // Quick "shovel" jiggle
    this.tweens.add({
      targets: soldier.sprite,
      x: soldier.sprite.x + facing * 3,
      duration: 70,
      yoyo: true,
      repeat: 6,
    });

    // Dirt particles
    for (let i = 0; i < 10; i++) {
      const p = this.add.circle(
        digX + facing * 18 + (Math.random() - 0.5) * 18,
        digY + 16 + (Math.random() - 0.5) * 10,
        2 + Math.random() * 2,
        0x9b7a4a,
        0.7
      );
      p.setDepth(160);
      this.tweens.add({
        targets: p,
        x: p.x + facing * (10 + Math.random() * 18),
        y: p.y - (15 + Math.random() * 20),
        alpha: 0,
        scale: 0,
        duration: 450 + Math.random() * 250,
        onComplete: () => p.destroy(),
      });
    }

    this.time.delayedCall(350, () => {
      if (turnId !== this.turnId) return;
      if (this.isTurnEnding) return;
      if (!soldier.isAlive()) return;
      if (this.currentSoldier !== soldier) return;
      // Build the barrier after the short animation windup
      this.terrain.buildCrudeBarrier(digX, groundY, facing);

      // End turn quickly
      this.time.delayedCall(650, () => {
        if (turnId !== this.turnId) return;
        if (!this.isTurnEnding) this.endTurn();
      });
    });
  }

  private getWoundedAlliesInRange(): Soldier[] {
    if (!this.currentSoldier) return [];
    const range = 150;
    return this.soldiers
      .filter(s =>
        s.isAlive() &&
        s.team === this.currentSoldier!.team &&
        s !== this.currentSoldier &&
        s.getHealth() < 100 &&
        Phaser.Math.Distance.Between(this.currentSoldier!.x, this.currentSoldier!.y, s.x, s.y) <= range
      )
      .sort((a, b) =>
        Phaser.Math.Distance.Between(this.currentSoldier!.x, this.currentSoldier!.y, a.x, a.y) -
        Phaser.Math.Distance.Between(this.currentSoldier!.x, this.currentSoldier!.y, b.x, b.y)
      );
  }

  private getTurnActionState(): TurnActionState {
    return {
      hasFired: this.hasFired,
      isCharging: this.isCharging || this.isMouseCharging,
      isHowitzerMode: this.isHowitzerMode,
      isAirstrikeTargeting: this.isAirstrikeTargeting,
      isGrappling: !!this.currentSoldier?.isCurrentlyGrappling(),
    };
  }

  private getCurrentDigInStatus(): AbilityStatus {
    return getDigInStatus({
      ...this.getTurnActionState(),
      isOnGround: !!this.currentSoldier?.isSteadyOnGround(),
    });
  }

  private getCurrentHealStatus(): AbilityStatus {
    return getHealStatus({
      ...this.getTurnActionState(),
      isMedic: this.currentSoldier?.getWeaponType() === WeaponType.PISTOL,
      woundedAlliesInRange: this.getWoundedAlliesInRange().length,
    });
  }

  private emitAbilityStatus(dig: AbilityStatus | null, heal: AbilityStatus | null): void {
    const key = dig && heal ? `${dig.reason}|${heal.reason}` : 'hidden';
    if (key === this.lastAbilityStatusKey) return;
    this.lastAbilityStatusKey = key;
    this.events.emit('ability-status', dig && heal ? { dig, heal } : null);
  }

  private showAbilityBlocked(message: string): void {
    if (!this.currentSoldier) return;
    const text = this.add.text(this.currentSoldier.x, this.currentSoldier.y - 70, message, {
      font: 'bold 13px Arial',
      color: '#ff9a7a',
      stroke: '#000000',
      strokeThickness: 3,
    });
    text.setOrigin(0.5);
    text.setDepth(200);
    this.tweens.add({
      targets: text,
      y: text.y - 18,
      alpha: 0,
      delay: 500,
      duration: 700,
      onComplete: () => text.destroy(),
    });
  }

  private tryMedicHeal(): void {
    if (!this.currentSoldier || this.hasFired) return;
    if (this.currentSoldier.getWeaponType() !== WeaponType.PISTOL) return; // Medic class
    const turnId = this.turnId;

    const candidates = this.getWoundedAlliesInRange();

    if (candidates.length === 0) return;

    this.hasFired = true;

    const target = candidates[0];
    this.currentSoldier.sayQuip('healing');

    // Heal beam
    const beam = this.add.graphics();
    beam.setDepth(190);
    beam.lineStyle(3, 0x44ff66, 0.9);
    beam.lineBetween(this.currentSoldier.x, this.currentSoldier.y - 10, target.x, target.y - 10);

    const core = this.add.graphics();
    core.setDepth(191);
    core.lineStyle(1, 0xffffff, 0.9);
    core.lineBetween(this.currentSoldier.x, this.currentSoldier.y - 10, target.x, target.y - 10);

    this.tweens.add({
      targets: [beam, core],
      alpha: 0,
      duration: 350,
      ease: 'Sine.easeOut',
      onComplete: () => {
        beam.destroy();
        core.destroy();
      },
    });

    target.heal(30, this.currentSoldier.name);

    // End turn quickly
    this.time.delayedCall(900, () => {
      if (turnId !== this.turnId) return;
      if (!this.isTurnEnding) this.endTurn();
    });
  }

  private isShotResolving(): boolean {
    return (
      this.shotTurnId === this.turnId &&
      (this.shotPendingSpawns > 0 || this.shotActiveProjectiles > 0)
    );
  }

  private clearShotResolution(): void {
    this.shotPendingSpawns = 0;
    this.shotActiveProjectiles = 0;
    this.shotTurnId = 0;
    this.shotShooter = null;
    this.shotEndScheduled = false;
    if (this.shotSafetyTimer) {
      this.shotSafetyTimer.destroy();
      this.shotSafetyTimer = null;
    }
  }

  private beginShotResolution(shooter: Soldier, weapon: WeaponConfig): void {
    // Reset any prior state (defensive).
    this.clearShotResolution();

    this.shotTurnId = this.turnId;
    this.shotShooter = shooter;
    this.shotEndScheduled = false;

    if (weapon.type === WeaponType.FLAMER) {
      // Flamethrower uses a FlameJet, not Projectile instances. Treat it as a single "in-flight" action.
      this.shotPendingSpawns = 0;
      this.shotActiveProjectiles = 1;
    } else if (weapon.pelletCount > 1) {
      // Includes shotgun pellets and rapid-fire bullet bursts.
      this.shotPendingSpawns = Math.max(1, Math.floor(weapon.pelletCount));
      this.shotActiveProjectiles = 0;
    } else {
      this.shotPendingSpawns = 1;
      this.shotActiveProjectiles = 0;
    }

    const shotTurnId = this.shotTurnId;
    // Safety: never let a shot soft-lock the game if a projectile gets stuck.
    this.shotSafetyTimer = this.time.delayedCall(14000, () => {
      if (shotTurnId !== this.turnId) return;
      if (this.isTurnEnding) return;
      if (!this.hasFired) return;
      // Force-resolve.
      this.shotPendingSpawns = 0;
      this.shotActiveProjectiles = 0;
      this.shotEndScheduled = false;
      if (!this.isTurnEnding) this.endTurn();
    });
  }

  private onProjectileSpawned(_projectile: Projectile): void {
    if (this.shotTurnId !== this.turnId) return;
    if (!this.shotShooter) return;
    if (this.isTurnEnding) return;
    if (!this.hasFired) return;

    this.shotActiveProjectiles++;
    if (this.shotPendingSpawns > 0) this.shotPendingSpawns--;
  }

  private onProjectileEnded(_projectile: Projectile): void {
    if (this.shotTurnId !== this.turnId) return;
    if (!this.shotShooter) return;
    if (this.isTurnEnding) return;

    if (this.shotActiveProjectiles > 0) this.shotActiveProjectiles--;
    this.maybeFinishShot();
  }

  private maybeFinishShot(): void {
    if (this.shotTurnId !== this.turnId) return;
    if (!this.shotShooter) return;
    if (this.isTurnEnding) return;
    if (this.shotEndScheduled) return;

    if (this.shotPendingSpawns > 0) return;
    if (this.shotActiveProjectiles > 0) return;

    this.shotEndScheduled = true;
    const turnId = this.turnId;

    // Small delay so the player sees the impact/explosion.
    this.time.delayedCall(650, () => {
      if (turnId !== this.turnId) return;
      if (this.isTurnEnding) return;
      if (!this.hasFired) return;
      if (!this.isTurnEnding) this.endTurn();
    });
  }

  private trackProjectile(projectile: Projectile): void {
    // Get weapon speed to determine camera lerp
    const speed = projectile.getSpeed();
    
    // Calculate lerp based on speed - faster projectiles need faster camera
    // Sniper (~1500 speed) -> lerp 0.25
    // Rocket (~500 speed) -> lerp 0.12
    // Grenade (~300 speed) -> lerp 0.08
    const lerpX = Math.min(0.25, Math.max(0.08, speed / 6000));
    const lerpY = lerpX;
    
    // Always follow the projectile
    this.cameras.main.startFollow(projectile.getSprite(), true, lerpX, lerpY);
    
    // For very fast projectiles, also do a slight zoom out to see more
    if (speed > 1000) {
      this.tweens.add({
        targets: this.cameras.main,
        zoom: 0.9,
        duration: 200,
        yoyo: true,
        hold: 500,
        ease: 'Sine.easeInOut',
      });
    }
  }
  
  private trackFlameJet(_flameJet: unknown): void {
    // For flamethrower, keep camera on the soldier since flames are short range
    if (this.currentSoldier) {
      this.cameras.main.startFollow(this.currentSoldier.sprite, true, 0.1, 0.1);
    }
  }

  private handleExplosion(x: number, y: number, radius: number, baseDamage: number = 50, shooter: Soldier | null = null): void {
    // Destroy terrain (skip for tiny bullet impacts)
    if (radius > 5) {
      this.terrain.destroyCircle(x, y, radius);
    }

    // Damage soldiers in radius. `shooter` is only set for bullet impacts — their tiny
    // splash never harms the one who fired (big explosives still self-damage as usual).
    this.soldiers.forEach(soldier => {
      if (soldier === shooter) return;
      if (soldier.isAlive()) {
        const distance = Phaser.Math.Distance.Between(x, y, soldier.x, soldier.y);
        if (distance < radius) {
          const damage = Math.round((1 - distance / radius) * baseDamage);
          soldier.takeDamage(damage);

          // Apply knockback (reduced for bullets)
          if (radius > 10) {
            const angle = Phaser.Math.Angle.Between(x, y, soldier.x, soldier.y);
            const strength = 1 - distance / radius;
            const knockback = strength * 230;
            soldier.applyKnockback(
              Math.cos(angle) * knockback,
              Phaser.Math.Clamp(Math.sin(angle) * knockback - strength * 45, -140, 110)
            );
          }
        }
      }
    });

    // Supply crates should persist across turns, but they can be destroyed by enemy fire.
    // Apply explosion damage to any active crates inside the blast envelope.
    if (radius > 0 && this.supplyDrops.length > 0) {
      for (const drop of this.supplyDrops) {
        if (drop.collected) continue;
        if (!drop.crate.active) continue;

        const dist = Phaser.Math.Distance.Between(x, y, drop.crate.x, drop.crate.y);
        if (dist > radius + SUPPLY_DROP_RADIUS) continue;

        const effectiveDist = Math.max(0, dist - SUPPLY_DROP_RADIUS);
        if (effectiveDist >= radius) continue;

        const dmg = Math.round((1 - effectiveDist / radius) * baseDamage);
        if (dmg <= 0) continue;

        drop.hp -= dmg;
        if (drop.hp <= 0) {
          this.destroySupplyDrop(drop);
        }
      }
    }

    // Play appropriate sound and create effect based on explosion size
    if (radius > 15) {
      // Big explosion (rocket, mortar, grenade)
      if (radius >= 80) {
        SoundManager.playExplosion('large');
      } else {
        SoundManager.playExplosion('medium');
      }
      this.createExplosionEffect(x, y, radius);
    } else if (radius <= 5) {
      // Tiny bullet spark effect
      SoundManager.playBulletImpact();
      this.createBulletSparkEffect(x, y);
    } else {
      // Small explosion (shotgun pellets, etc)
      SoundManager.playExplosion('small');

      this.createSmallImpactEffect(x, y, radius);
    }
  }
  
  private createBulletSparkEffect(x: number, y: number): void {
    // Tiny spark on bullet impact
    const spark = this.add.circle(x, y, 4, 0xffff88, 0.8);
    spark.setDepth(200);
    this.tweens.add({
      targets: spark,
      scale: 0,
      alpha: 0,
      duration: 80,
      onComplete: () => spark.destroy(),
    });
    
    // A few small particles
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const particle = this.add.circle(x, y, 1, 0xaaaaaa, 0.6);
      particle.setDepth(199);
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * 15,
        y: y + Math.sin(angle) * 10,
        alpha: 0,
        duration: 150,
        onComplete: () => particle.destroy(),
      });
    }
  }
  
  private createSmallImpactEffect(x: number, y: number, radius: number): void {
    // Small impact for shotgun pellets etc
    const flash = this.add.circle(x, y, radius * 0.5, 0xffaa00, 0.7);
    flash.setDepth(200);
    this.tweens.add({
      targets: flash,
      scale: 1.5,
      alpha: 0,
      duration: 120,
      onComplete: () => flash.destroy(),
    });
    
    // Small dust puff
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const particle = this.add.circle(x, y, 2, 0x886644, 0.5);
      particle.setDepth(199);
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * 20,
        y: y + Math.sin(angle) * 15 + 10,
        alpha: 0,
        scale: 0.5,
        duration: 250,
        onComplete: () => particle.destroy(),
      });
    }
  }

  private createExplosionEffect(x: number, y: number, radius: number): void {
    // === ENHANCED EXPLOSION WITH PIZZAZZ ===
    
    // Multiple flash layers for dramatic effect
    const flashColors = [0xffffff, 0xffff00, 0xff8800, 0xff4400];
    flashColors.forEach((color, i) => {
      const flash = this.add.circle(x, y, radius * (1 - i * 0.15), color, 0.9 - i * 0.15);
      flash.setDepth(200 + i);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        scale: 1.8 - i * 0.2,
        duration: 150 + i * 50,
        ease: 'Power2',
        onComplete: () => flash.destroy(),
      });
    });
    
    // Fire/smoke particles - MORE of them
    const particles = this.add.particles(x, y, 'explosion-particle', {
      speed: { min: 150, max: 400 },
      scale: { start: 1.5, end: 0 },
      lifespan: 600,
      quantity: 35,
      emitting: false,
      tint: [0xffaa00, 0xff6600, 0xff3300, 0x333333],
    });
    particles.setDepth(199);
    particles.explode(35);
    
    // Debris particles (dirt chunks)
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 150 + Math.random() * 250;
      const size = 3 + Math.random() * 6;
      
      const debris = this.add.rectangle(x, y, size, size, 0x5c4033);
      debris.setDepth(198);
      
      this.tweens.add({
        targets: debris,
        x: x + Math.cos(angle) * speed * 0.8,
        y: y + Math.sin(angle) * speed * 0.5 + 80, // Gravity arc
        rotation: Math.random() * 10,
        alpha: 0,
        duration: 600 + Math.random() * 400,
        ease: 'Power1',
        onComplete: () => debris.destroy(),
      });
    }
    
    // Sparks
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = radius * 0.5 + Math.random() * radius;
      
      const spark = this.add.circle(x, y, 2, 0xffff88);
      spark.setDepth(201);
      
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0,
        duration: 200 + Math.random() * 200,
        onComplete: () => spark.destroy(),
      });
    }
    
    // Shockwave ring
    const shockwave = this.add.circle(x, y, radius * 0.3, 0xffffff, 0);
    shockwave.setStrokeStyle(4, 0xffffff, 0.6);
    shockwave.setDepth(195);
    
    this.tweens.add({
      targets: shockwave,
      scale: 3,
      alpha: 0,
      duration: 300,
      ease: 'Power2',
      onComplete: () => shockwave.destroy(),
    });
    
    // SCREEN SHAKE - intensity based on explosion size
    const shakeIntensity = Math.min(0.025, 0.008 + (radius / 100) * 0.012);
    this.cameras.main.shake(300, shakeIntensity);
    
    // Brief zoom punch for big explosions
    if (radius > 40) {
      const currentZoom = this.cameras.main.zoom;
      this.tweens.add({
        targets: this.cameras.main,
        zoom: currentZoom * 1.05,
        duration: 50,
        yoyo: true,
        ease: 'Power2',
      });
    }
    
    // Smoke cloud that lingers
    const smoke = this.add.circle(x, y, radius * 0.6, 0x333333, 0.4);
    smoke.setDepth(150);
    this.tweens.add({
      targets: smoke,
      scale: 2,
      alpha: 0,
      duration: 1500,
      ease: 'Power1',
      onComplete: () => smoke.destroy(),
    });
  }

  private handleFlameWave(
    startX: number,
    startY: number,
    angle: number,
    range: number,
    damage: number,
    shooter: Soldier | null = null
  ): void {
    // One wave damages each soldier in the flame corridor exactly once
    // (no terrain destruction, no knockback). The shooter never burns themselves.
    const endX = startX + Math.cos(angle) * range;
    const endY = startY + Math.sin(angle) * range;
    const corridorRadius = 25;

    this.soldiers.forEach(soldier => {
      if (!soldier.isAlive() || soldier === shooter) return;

      // Distance from the soldier to the flame ray segment.
      const dx = endX - startX;
      const dy = endY - startY;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq > 0
        ? Phaser.Math.Clamp(((soldier.x - startX) * dx + (soldier.y - startY) * dy) / lenSq, 0, 1)
        : 0;
      const closestX = startX + dx * t;
      const closestY = startY + dy * t;

      if (Phaser.Math.Distance.Between(soldier.x, soldier.y, closestX, closestY) <= corridorRadius) {
        soldier.takeDamage(damage);
      }
    });
  }

  private handleFlameJetEnded(): void {
    // If this flamethrower action is the current shot, resolve it via the normal shot pipeline.
    if (this.shotTurnId === this.turnId && this.shotShooter) {
      if (this.shotActiveProjectiles > 0) this.shotActiveProjectiles--;
      this.maybeFinishShot();
      return;
    }

    // Fallback: end turn after flamethrower finishes (legacy behavior).
    const turnId = this.turnId;
    this.time.delayedCall(500, () => {
      if (turnId !== this.turnId) return;
      if (!this.isTurnEnding) this.endTurn();
    });
  }

  private endTurn(): void {
    // Prevent double endTurn calls
    if (this.isTurnEnding) return;
    this.isTurnEnding = true;

    // Clear any in-flight shot bookkeeping and timers.
    this.clearShotResolution();
    this.exitAirstrikeTargeting();
    this.exitHowitzerMode();
    
    if (this.currentSoldier) {
      this.currentSoldier.setActive(false);
    }

    // Prevent any pending "release-to-fire" from firing after the turn changes.
    this.clearChargeState();

    // Clear all aiming artifacts
    this.aimLine.clear();
    this.aimPowerText.setVisible(false);
    this.power = 50;
    this.powerChargeDirection = 1;
    this.aimAngle = -45;
    this.mouseAimTargetAngle = null;
    this.cameras.main.stopFollow();
    this.currentSoldier = null;

    // Check for game over
    const gameState = this.turnManager.checkGameOver();
    if (gameState.isOver) {
      this.events.emit('game-over', gameState.winner);
      return;
    }

    // Next turn - switch to other team
    this.turnManager.nextTurn();

    // Occasionally drop something that can swing the fight (helps the losing side more often).
    this.maybeTriggerBalanceEvent();
    
    // Start character selection for next team
    this.time.delayedCall(500, () => {
      this.startCharacterSelection();
    });
  }

  private clearChargeState(): void {
    this.isCharging = false;
    this.isMouseCharging = false;
    this.powerChargeDirection = 1;
    this.mouseChargeTurnId = 0;
    this.mouseChargeSoldier = null;
    this.keyboardChargeTurnId = 0;
    this.keyboardChargeSoldier = null;
  }

  private maybeTriggerBalanceEvent(): void {
    // "Every few turns" drop something that can swing momentum.
    // Use TurnManager's turnNumber (increments each action).
    const info = this.turnManager.getTurnInfo();

    // Avoid spamming events if turn number jumps for any reason.
    if (info.turnNumber < this.nextBalanceEventTurn) return;

    // Schedule the next event with a little variability.
    const interval = Phaser.Math.Between(3, 5);
    this.nextBalanceEventTurn = info.turnNumber + interval;

    const favoredTeam = this.getLosingTeam();
    if (info.turnNumber >= 6 && Math.random() < 0.22) {
      this.showWorldBanner('STRAY BARRAGE');
      this.triggerStrayBarrage();
      return;
    }

    const dropType = this.chooseSupplyDropType(favoredTeam);

    this.showWorldBanner('SUPPLY DROP INCOMING');
    this.triggerSupplyDrop(dropType, favoredTeam);
  }

  private getTeamTotalHealth(team: Team): number {
    let sum = 0;
    for (const s of this.soldiers) {
      if (s.isAlive() && s.team === team) sum += s.getHealth();
    }
    return sum;
  }

  private getLosingTeam(): Team {
    const redAlive = this.soldiers.filter(s => s.isAlive() && s.team === Team.RED).length;
    const blueAlive = this.soldiers.filter(s => s.isAlive() && s.team === Team.BLUE).length;

    if (redAlive < blueAlive) return Team.RED;
    if (blueAlive < redAlive) return Team.BLUE;

    const redHealth = this.getTeamTotalHealth(Team.RED);
    const blueHealth = this.getTeamTotalHealth(Team.BLUE);

    if (redHealth < blueHealth) return Team.RED;
    if (blueHealth < redHealth) return Team.BLUE;

    // Perfect tie, pick randomly.
    return Math.random() < 0.5 ? Team.RED : Team.BLUE;
  }

  private chooseSupplyDropType(favoredTeam: Team): SupplyDropType {
    // Favor medkits when the favored team is actually hurting.
    const alive = this.soldiers.filter(s => s.isAlive() && s.team === favoredTeam).length;
    const avgHealth = alive > 0 ? this.getTeamTotalHealth(favoredTeam) / alive : 100;

    const r = Math.random();

    // If the team is low, medkits become common.
    if (avgHealth < 55) {
      if (r < 0.55) return 'medkit';
      if (r < 0.72) return 'armor';
      if (r < 0.86) return 'artillery';
      if (r < 0.96) return 'airstrike';
      return 'munitions';
    }

    // Otherwise, a more even spread.
    if (r < 0.28) return 'medkit';
    if (r < 0.48) return 'armor';
    if (r < 0.68) return 'artillery';
    if (r < 0.86) return 'airstrike';
    return 'munitions';
  }

  private triggerStrayBarrage(): void {
    const strikes = Phaser.Math.Between(3, 5);
    const center = this.worldWidth * Phaser.Math.FloatBetween(0.32, 0.68);

    for (let i = 0; i < strikes; i++) {
      const x = Phaser.Math.Clamp(center + Phaser.Math.Between(-360, 360), 120, this.worldWidth - 120);
      const surfaceY = this.terrain.getSurfaceY(x);
      const warningY = Math.max(80, surfaceY - 70);
      const delay = 650 + i * 420 + Phaser.Math.Between(0, 260);
      const radius = Phaser.Math.Between(46, 68);
      const damage = Phaser.Math.Between(28, 42);

      const marker = this.add.graphics();
      marker.setDepth(240);
      marker.lineStyle(2, 0xff3333, 0.85);
      marker.strokeCircle(x, warningY, radius * 0.55);
      marker.lineBetween(x - 12, warningY, x + 12, warningY);
      marker.lineBetween(x, warningY - 12, x, warningY + 12);

      this.tweens.add({
        targets: marker,
        alpha: 0.25,
        duration: 160,
        yoyo: true,
        repeat: Math.max(1, Math.floor(delay / 320)),
      });

      this.time.delayedCall(delay, () => {
        marker.destroy();
        SoundManager.playMortarExplosion();
        this.handleExplosion(x, surfaceY - 8, radius, damage);
      });
    }
  }

  private showWorldBanner(text: string): void {
    const cam = this.cameras.main;
    const banner = this.add.text(cam.width / 2, 150, text, {
      font: 'bold 24px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6,
    });
    banner.setOrigin(0.5);
    banner.setScrollFactor(0);
    banner.setDepth(1000);

    const sub = this.add.text(cam.width / 2, 182, 'Contest it to swing the fight', {
      font: 'bold 14px Arial',
      color: '#d9e6ff',
      stroke: '#000000',
      strokeThickness: 4,
    });
    sub.setOrigin(0.5);
    sub.setScrollFactor(0);
    sub.setDepth(1000);

    this.tweens.add({
      targets: [banner, sub],
      alpha: 0,
      y: '+=10',
      duration: 1700,
      ease: 'Sine.easeOut',
      onComplete: () => {
        banner.destroy();
        sub.destroy();
      },
    });
  }

  private pickDropXForTeam(team: Team): number {
    const margin = 140;
    const zoneWidth = Math.min(720, Math.floor(this.worldWidth * 0.30));

    const minX = team === Team.RED ? margin : Math.max(margin, this.worldWidth - margin - zoneWidth);
    const maxX = team === Team.RED ? Math.min(this.worldWidth - margin, margin + zoneWidth) : (this.worldWidth - margin);

    // Try a few times to avoid dropping inside a "roof" (surface too high up).
    for (let i = 0; i < 8; i++) {
      const x = Phaser.Math.Between(minX, maxX);
      const surfaceY = this.terrain.getSurfaceY(x);
      if (surfaceY > 140 && surfaceY < this.worldHeight - 40) return x;
    }

    return Phaser.Math.Between(minX, maxX);
  }

  private triggerSupplyDrop(type: SupplyDropType, favoredTeam: Team): void {
    const dropX = this.pickDropXForTeam(favoredTeam);

    // Plane direction loosely matches the side being favored (feels like "reinforcements").
    const facingRight = favoredTeam === Team.RED;
    const startX = facingRight ? -100 : this.worldWidth + 100;
    const endX = facingRight ? this.worldWidth + 200 : -200;
    const planeY = 85 + Phaser.Math.Between(0, 40);
    const duration = 5200;

    SoundManager.playPlaneEngine(4);

    const plane = this.createPlane(startX, planeY, facingRight);
    plane.setDepth(120);

    this.tweens.add({
      targets: plane,
      x: endX,
      duration,
      ease: 'Linear',
      onComplete: () => plane.destroy(),
    });

    // Drop timing: wait until the plane's tail reaches dropX (same logic as paratrooper drops).
    const planeBackOffset = 55;
    const planeSpeed = (endX - startX) / duration;

    const timeToReachDrop = facingRight
      ? (dropX + planeBackOffset - startX) / planeSpeed
      : Math.abs((dropX - planeBackOffset - startX) / planeSpeed);

    const dropDelay = Phaser.Math.Clamp(timeToReachDrop, 200, duration - 200);

    this.time.delayedCall(dropDelay, () => {
      this.dropSupplyCrate(dropX, planeY + 20, type);
    });
  }

  private getSupplyDropLabel(type: SupplyDropType): string {
    if (type === 'medkit') return 'MEDKIT';
    if (type === 'artillery') return 'HOWITZER';
    if (type === 'armor') return 'ARMOR';
    if (type === 'munitions') return 'MUNITIONS';
    return 'AIRSTRIKE';
  }

  private dropSupplyCrate(dropX: number, startY: number, type: SupplyDropType): void {
    const landingY = this.terrain.getSurfaceY(dropX) - 10;

    const crate = this.add.container(dropX, startY);
    crate.setDepth(98);

    // Crate sprite
    const crateImg = this.add.image(0, 0, 'supply-crate');
    crateImg.setScale(1.25);
    crate.add(crateImg);

    // Subtle type glow (helps spot it in caves/shadows)
    const glowColor =
      type === 'medkit' ? 0x44ff66 :
      type === 'armor' ? 0x66ccff :
      type === 'munitions' ? 0xff66cc :
      type === 'artillery' ? 0xffaa00 :
      0x66ffff;
    const glow = this.add.rectangle(0, 0, 52, 38, glowColor, 0.10);
    glow.setOrigin(0.5);
    crate.addAt(glow, 0);

    // Label
    const label = this.add.text(0, 18, this.getSupplyDropLabel(type), {
      font: 'bold 11px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    });
    label.setOrigin(0.5, 0);
    crate.add(label);

    // Parachute
    const parachute = this.add.container(dropX, startY - 30);
    parachute.setDepth(99);

    const chuteG = this.add.graphics();
    chuteG.fillStyle(0xffffff, 0.82);
    chuteG.beginPath();
    chuteG.arc(0, 0, 24, Math.PI, 0, false);
    chuteG.closePath();
    chuteG.fillPath();

    chuteG.lineStyle(1, 0x444444, 1);
    chuteG.lineBetween(-18, 0, -6, 30);
    chuteG.lineBetween(0, 1, 0, 30);
    chuteG.lineBetween(18, 0, 6, 30);

    parachute.add(chuteG);

    this.tweens.add({
      targets: parachute,
      angle: { from: -7, to: 7 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const drop: SupplyDrop = { type, crate, parachute, landed: false, collected: false, hp: SUPPLY_DROP_HP };
    this.supplyDrops.push(drop);

    const fallDistance = landingY - startY;
    const descentDuration = Math.max(1200, fallDistance * 3.6);

    this.tweens.add({
      targets: crate,
      y: landingY,
      duration: descentDuration,
      ease: 'Linear',
      onUpdate: () => {
        parachute.setPosition(crate.x, crate.y - 30);
      },
      onComplete: () => {
        this.tweens.killTweensOf(parachute);

        this.tweens.add({
          targets: parachute,
          y: parachute.y - 50,
          alpha: 0,
          duration: 500,
          onComplete: () => parachute.destroy(),
        });

        drop.parachute = null;
        drop.landed = true;

        // Little landing bounce + dust
        this.tweens.add({
          targets: crate,
          y: landingY - 4,
          duration: 120,
          yoyo: true,
          ease: 'Quad.easeOut',
        });

        this.createSupplyDropLandingEffect(dropX, landingY + 12, glowColor);
      },
    });
  }

  private createSupplyDropLandingEffect(x: number, y: number, color: number): void {
    // Dust puff
    for (let i = 0; i < 10; i++) {
      const p = this.add.circle(
        x + (Math.random() - 0.5) * 35,
        y + (Math.random() - 0.5) * 10,
        2 + Math.random() * 3,
        0x8b6a4a,
        0.55
      );
      p.setDepth(160);
      this.tweens.add({
        targets: p,
        y: p.y - (10 + Math.random() * 18),
        x: p.x + (Math.random() - 0.5) * 30,
        alpha: 0,
        scale: 0,
        duration: 450 + Math.random() * 250,
        onComplete: () => p.destroy(),
      });
    }

    // Brief ping ring
    const ring = this.add.circle(x, y - 6, 10, color, 0);
    ring.setDepth(170);
    ring.setStrokeStyle(2, color, 0.55);
    this.tweens.add({
      targets: ring,
      scale: 2.8,
      alpha: 0,
      duration: 700,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private checkSupplyDropPickups(): void {
    if (this.supplyDrops.length === 0) return;

    for (const drop of this.supplyDrops) {
      if (!drop.landed || drop.collected) continue;
      if (!drop.crate.active) continue;

      for (const soldier of this.soldiers) {
        if (!soldier.isAlive()) continue;

        const dist = Phaser.Math.Distance.Between(soldier.x, soldier.y, drop.crate.x, drop.crate.y);
        if (dist > 30) continue;

        drop.collected = true;
        this.applySupplyDropToSoldier(drop.type, soldier, drop.crate.x, drop.crate.y);

        // Visual pickup
        this.tweens.add({
          targets: drop.crate,
          scaleX: 0.0,
          scaleY: 0.0,
          alpha: 0,
          duration: 220,
          ease: 'Back.easeIn',
          onComplete: () => drop.crate.destroy(),
        });

        break;
      }
    }

    // Compact list (remove destroyed pickups)
    this.supplyDrops = this.supplyDrops.filter(d => d.crate.active);
  }

  private destroySupplyDrop(drop: SupplyDrop): void {
    if (!drop.crate.active) return;

    // Mark removed so it can't be collected.
    drop.collected = true;

    // Stop any descent tween / onUpdate that could reference destroyed objects.
    try { this.tweens.killTweensOf(drop.crate); } catch (e) { /* ignored */ }

    // If it still has a parachute, kill it too.
    if (drop.parachute) {
      try { this.tweens.killTweensOf(drop.parachute); } catch (e) { /* ignored */ }
      try { drop.parachute.destroy(); } catch (e) { /* ignored */ }
      drop.parachute = null;
    }

    const x = drop.crate.x;
    const y = drop.crate.y;

    // Small wooden splinter burst
    for (let i = 0; i < 12; i++) {
      const w = 3 + Math.random() * 6;
      const h = 2 + Math.random() * 4;
      const splinter = this.add.rectangle(x, y, w, h, 0x7a4f2a, 0.9);
      splinter.setDepth(190);
      const angle = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 220;
      this.tweens.add({
        targets: splinter,
        x: x + Math.cos(angle) * speed * 0.7,
        y: y + Math.sin(angle) * speed * 0.5 + 60,
        rotation: Math.random() * 10 - 5,
        alpha: 0,
        duration: 520 + Math.random() * 300,
        ease: 'Power2',
        onComplete: () => splinter.destroy(),
      });
    }

    // Fade out the crate quickly.
    this.tweens.add({
      targets: drop.crate,
      alpha: 0,
      scaleX: 0,
      scaleY: 0,
      duration: 260,
      ease: 'Back.easeIn',
      onComplete: () => {
        if (drop.crate.active) drop.crate.destroy();
      },
    });
  }

  private applySupplyDropToSoldier(type: SupplyDropType, soldier: Soldier, x: number, y: number): void {
    // Small confirmation sound
    SoundManager.playSelect();

    if (type === 'medkit') {
      const amount = Phaser.Math.Between(25, 45);
      const healed = soldier.heal(amount);
      this.showPowerupText(x, y - 20, healed > 0 ? 'MEDKIT' : 'MEDKIT (FULL)', 0x44ff66);
      return;
    }

    if (type === 'artillery') {
      soldier.addArtilleryCharges(1);
      this.showPowerupText(x, y - 20, 'HOWITZER READY (C)', 0xffaa00);
      return;
    }

    if (type === 'armor') {
      soldier.addArmor(40);
      this.showPowerupText(x, y - 20, 'ARMOR PLATES', 0x66ccff);
      return;
    }

    if (type === 'munitions') {
      soldier.addAirstrikeCharges(1);
      soldier.addArtilleryCharges(1);
      this.showPowerupText(x, y - 20, 'MUNITIONS CACHE', 0xff66cc);
      return;
    }

    soldier.addAirstrikeCharges(1);
    this.showPowerupText(x, y - 20, 'AIRSTRIKE READY (X)', 0x66ffff);
  }

  private showPowerupText(x: number, y: number, text: string, color: number): void {
    const label = this.add.text(x, y, text, {
      font: 'bold 16px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    });
    label.setOrigin(0.5);
    label.setDepth(250);

    // Color glow outline via shadow
    label.setShadow(0, 0, Phaser.Display.Color.IntegerToColor(color).rgba, 8, true, true);

    this.tweens.add({
      targets: label,
      y: y - 55,
      alpha: 0,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => label.destroy(),
    });
  }

  private isTeamAI(team: Team): boolean {
    return this.vsAI && team === Team.BLUE;
  }

  private chooseAISoldierForSelection(choices: Soldier[], team: Team): Soldier | null {
    if (choices.length === 0) return null;

    const enemies = this.soldiers.filter(s => s.isAlive() && s.team !== team);
    if (enemies.length === 0) return choices[0];

    // Pick the unit with the closest enemy (reduces wasted long shots).
    let best = choices[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const s of choices) {
      let nearest = Number.POSITIVE_INFINITY;
      for (const e of enemies) {
        const d = Phaser.Math.Distance.Between(s.x, s.y, e.x, e.y);
        if (d < nearest) nearest = d;
      }
      if (nearest < bestScore) {
        bestScore = nearest;
        best = s;
      }
    }
    return best;
  }

  private queueAITurnIfNeeded(): void {
    if (!this.currentSoldier) return;
    if (!this.isTeamAI(this.currentSoldier.team)) return;
    if (this.hasFired || this.isTurnEnding) return;

    // Ensure the AI unit isn't sliding due to leftover velocity from knockback.
    this.currentSoldier.stopMoving();

    const token = ++this.aiTurnToken;

    // Small delay so camera settles and the player can see the AI line up.
    this.time.delayedCall(900, () => {
      if (token !== this.aiTurnToken) return;
      if (!this.currentSoldier || !this.currentSoldier.isAlive()) return;
      if (!this.isTeamAI(this.currentSoldier.team)) return;
      if (this.hasFired || this.isTurnEnding) return;

      this.takeAITurn(token);
    });
  }

  private getMovementRemaining(soldier: Soldier): number {
    // startX/maxMovement are set at startTurn() for the active unit.
    const used = Math.abs(soldier.x - this.startX);
    return Math.max(0, this.maxMovement - used);
  }

  private aiMoveTowardX(
    token: number,
    soldier: Soldier,
    targetX: number,
    desiredMove: number,
    onDone: () => void
  ): void {
    if (token !== this.aiTurnToken) return;
    if (this.currentSoldier !== soldier) return;
    if (!soldier.isAlive()) return;
    if (this.hasFired || this.isTurnEnding) return;

    const remaining = this.getMovementRemaining(soldier);
    const moveDist = Math.min(Math.max(0, desiredMove), remaining);
    if (moveDist < 6) {
      onDone();
      return;
    }

    const dir: -1 | 1 = targetX >= soldier.x ? 1 : -1;
    const legStartX = soldier.x;
    const legGoalX = legStartX + dir * moveDist;

    // Begin moving.
    if (dir < 0) soldier.moveLeft();
    else soldier.moveRight();

    let done = false;
    let lastX = soldier.x;
    let stuckTicks = 0;

    const finish = (): void => {
      if (done) return;
      done = true;
      soldier.stopMoving();
      this.time.delayedCall(220, () => {
        if (token !== this.aiTurnToken) return;
        if (this.currentSoldier !== soldier) return;
        if (!soldier.isAlive()) return;
        if (this.hasFired || this.isTurnEnding) return;
        onDone();
      });
    };

    const tick = this.time.addEvent({
      delay: 60,
      loop: true,
      callback: () => {
        if (done) return;

        if (token !== this.aiTurnToken) {
          tick.destroy();
          finish();
          return;
        }
        if (this.currentSoldier !== soldier) {
          tick.destroy();
          finish();
          return;
        }
        if (!soldier.isAlive() || this.hasFired || this.isTurnEnding) {
          tick.destroy();
          finish();
          return;
        }

        const movedLeg = Math.abs(soldier.x - legStartX);
        const movedTurn = Math.abs(soldier.x - this.startX);

        const reachedLeg =
          movedLeg >= moveDist - 2 ||
          (dir > 0 ? soldier.x >= legGoalX : soldier.x <= legGoalX);
        const reachedTurn = movedTurn >= this.maxMovement - 2;
        const nearBounds = soldier.x < 20 || soldier.x > this.worldWidth - 20;

        // Probe the ground ahead — high-mobility AI units used to sprint straight
        // off cliffs and bottomless craters, dying without ever taking a shot.
        const aheadX = soldier.x + dir * 34;
        const cliffAhead = this.terrain.findSurfaceYAtOrBelow(aheadX, soldier.y - 4, 300) === null;

        if (Math.abs(soldier.x - lastX) < 0.5) stuckTicks++;
        else stuckTicks = 0;
        lastX = soldier.x;

        if (reachedLeg || reachedTurn || nearBounds || cliffAhead || stuckTicks >= 8) {
          tick.destroy();
          finish();
        }
      },
    });

    // Safety timeout: stop even if the timer misses a condition.
    this.time.delayedCall(1800, () => {
      if (done) return;
      tick.destroy();
      finish();
    });
  }

  private takeAITurn(token: number): void {
    if (token !== this.aiTurnToken) return;
    if (!this.currentSoldier || !this.currentSoldier.isAlive()) return;

    const shooter = this.currentSoldier;
    const team = shooter.team;

    const enemies = this.soldiers.filter(s => s.isAlive() && s.team !== team);
    if (enemies.length === 0) {
      if (!this.isTurnEnding) this.endTurn();
      return;
    }

    const aimAndFire = (preferredTarget: Soldier): void => {
      if (token !== this.aiTurnToken) return;
      if (!this.currentSoldier || this.currentSoldier !== shooter || !shooter.isAlive()) return;
      if (!this.isTeamAI(shooter.team)) return;
      if (this.hasFired || this.isTurnEnding) return;

      const currentEnemies = this.soldiers.filter(s => s.isAlive() && s.team !== shooter.team);
      const plan = this.chooseAIShotPlan(shooter, currentEnemies, preferredTarget);
      if (!plan) {
        if (!this.isTurnEnding) this.endTurn();
        return;
      }

      this.aimAngle = plan.angle;
      this.power = plan.power;

      // Show a brief aim line so it's readable that the AI is acting.
      this.drawAimLine();

      this.time.delayedCall(650, () => {
        if (token !== this.aiTurnToken) return;
        if (!this.currentSoldier || this.currentSoldier !== shooter || !shooter.isAlive()) return;
        if (!this.isTeamAI(shooter.team)) return;
        if (this.hasFired || this.isTurnEnding) return;

        this.fireProjectile();
      });
    };

    const attack = (): void => {
      if (token !== this.aiTurnToken) return;
      if (!this.currentSoldier || this.currentSoldier !== shooter || !shooter.isAlive()) return;
      if (this.hasFired || this.isTurnEnding) return;

      const liveEnemies = this.soldiers.filter(s => s.isAlive() && s.team !== team);
      if (liveEnemies.length === 0) {
        if (!this.isTurnEnding) this.endTurn();
        return;
      }

      const weaponType = shooter.getWeaponType();
      const startX = shooter.x;
      const startY = shooter.y - 10;
      const isBullet = this.isBulletWeapon(weaponType);

      // Prefer targets with line of sight for bullet weapons (and the flamer).
      const losPreferred = isBullet || weaponType === WeaponType.FLAMER;
      const visibleEnemies = losPreferred
        ? liveEnemies.filter(e => !this.isLineBlockedByTerrain(startX, startY, e.x, e.y - 10, 5))
        : liveEnemies;

      const pool = (losPreferred && visibleEnemies.length > 0) ? visibleEnemies : liveEnemies;
      const target = this.pickAITarget(shooter, pool);
      if (!target) {
        if (!this.isTurnEnding) this.endTurn();
        return;
      }

      // Decide whether to reposition before firing.
      const remainingMove = this.getMovementRemaining(shooter);
      const dist = Phaser.Math.Distance.Between(startX, startY, target.x, target.y - 10);

      let desiredMove = 0;
      if (weaponType === WeaponType.FLAMER) {
        const desiredRange = 220;
        if (dist > desiredRange) desiredMove = dist - desiredRange;
      } else if (
        weaponType === WeaponType.SHOTGUN ||
        weaponType === WeaponType.SMG ||
        weaponType === WeaponType.PISTOL ||
        weaponType === WeaponType.CARBINE ||
        weaponType === WeaponType.SLUG ||
        weaponType === WeaponType.DEMO
      ) {
        const desiredRange = 320;
        if (dist > desiredRange) desiredMove = dist - desiredRange;
      } else if (isBullet) {
        const blocked = this.isLineBlockedByTerrain(startX, startY, target.x, target.y - 10, 5);
        if (blocked) desiredMove = 120;
      }

      desiredMove = Math.min(desiredMove, remainingMove);

      if (desiredMove > 12) {
        this.aiMoveTowardX(token, shooter, target.x, desiredMove, () => {
          if (token !== this.aiTurnToken) return;
          if (!this.currentSoldier || this.currentSoldier !== shooter || !shooter.isAlive()) return;
          if (this.hasFired || this.isTurnEnding) return;

          const refreshedEnemies = this.soldiers.filter(s => s.isAlive() && s.team !== team);
          if (refreshedEnemies.length === 0) {
            if (!this.isTurnEnding) this.endTurn();
            return;
          }

          const sx = shooter.x;
          const sy = shooter.y - 10;
          const visible2 = losPreferred
            ? refreshedEnemies.filter(e => !this.isLineBlockedByTerrain(sx, sy, e.x, e.y - 10, 5))
            : refreshedEnemies;
          const pool2 = (losPreferred && visible2.length > 0) ? visible2 : refreshedEnemies;
          const target2 = this.pickAITarget(shooter, pool2) || target;

          aimAndFire(target2);
        });
        return;
      }

      aimAndFire(target);
    };

    // Medic behavior: heal a nearby ally if possible; otherwise try to move toward the nearest wounded ally once.
    if (shooter.getWeaponType() === WeaponType.PISTOL) {
      const woundedAllies = this.soldiers
        .filter(s =>
          s.isAlive() &&
          s.team === team &&
          s !== shooter &&
          s.getHealth() < 100
        )
        .sort((a, b) =>
          Phaser.Math.Distance.Between(shooter.x, shooter.y, a.x, a.y) -
          Phaser.Math.Distance.Between(shooter.x, shooter.y, b.x, b.y)
        );

      const healTarget = woundedAllies[0] || null;
      if (healTarget) {
        const healRange = 150;
        const d = Phaser.Math.Distance.Between(shooter.x, shooter.y, healTarget.x, healTarget.y);
        if (d <= healRange) {
          this.tryMedicHeal();
          return;
        }

        const remaining = this.getMovementRemaining(shooter);
        if (remaining > 12) {
          const desired = Math.min(remaining, Math.max(40, d - (healRange - 10)));
          this.aiMoveTowardX(token, shooter, healTarget.x, desired, () => {
            if (token !== this.aiTurnToken) return;
            if (!this.currentSoldier || this.currentSoldier !== shooter || !shooter.isAlive()) return;
            if (this.hasFired || this.isTurnEnding) return;

            this.tryMedicHeal();
            if (this.hasFired || this.isTurnEnding) return;

            attack();
          });
          return;
        }
      }
    }

    attack();
  }

  private pickAITarget(shooter: Soldier, enemies: Soldier[]): Soldier | null {
    if (enemies.length === 0) return null;

    // Nearest enemy, tie-break by lowest health.
    let best = enemies[0];
    let bestDist = Phaser.Math.Distance.Between(shooter.x, shooter.y, best.x, best.y);
    for (let i = 1; i < enemies.length; i++) {
      const e = enemies[i];
      const d = Phaser.Math.Distance.Between(shooter.x, shooter.y, e.x, e.y);
      if (d < bestDist - 1) {
        best = e;
        bestDist = d;
        continue;
      }
      if (Math.abs(d - bestDist) <= 1 && e.getHealth() < best.getHealth()) {
        best = e;
        bestDist = d;
      }
    }
    return best;
  }

  private chooseAIShotPlan(shooter: Soldier, enemies: Soldier[], preferredTarget?: Soldier): AIShotPlan | null {
    if (enemies.length === 0) return null;

    const candidates = [...enemies].sort((a, b) => {
      if (preferredTarget) {
        if (a === preferredTarget) return -1;
        if (b === preferredTarget) return 1;
      }

      const da = Phaser.Math.Distance.Between(shooter.x, shooter.y, a.x, a.y);
      const db = Phaser.Math.Distance.Between(shooter.x, shooter.y, b.x, b.y);
      return da - db;
    });

    let best: AIShotPlan | null = null;
    for (const target of candidates) {
      const shot = this.computeBestShot(shooter, target);
      const preferredBias = target === preferredTarget ? -6 : 0;
      const plan: AIShotPlan = {
        target,
        angle: shot.angle,
        power: shot.power,
        score: shot.score + preferredBias,
      };

      if (!best || plan.score < best.score) {
        best = plan;
      }
    }

    return best;
  }

  private isBulletWeapon(type: WeaponType): boolean {
    return (
      type === WeaponType.RIFLE ||
      type === WeaponType.SNIPER ||
      type === WeaponType.PISTOL ||
      type === WeaponType.SMG ||
      type === WeaponType.MINIGUN ||
      type === WeaponType.SHOTGUN ||
      type === WeaponType.CARBINE ||
      type === WeaponType.SLUG
    );
  }

  private isLineBlockedByTerrain(x0: number, y0: number, x1: number, y1: number, step: number = 4): boolean {
    const dist = Phaser.Math.Distance.Between(x0, y0, x1, y1);
    const steps = Math.max(1, Math.floor(dist / step));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (this.terrain.isPointSolid(x, y)) return true;
    }
    return false;
  }

  private computeBestShot(shooter: Soldier, target: Soldier): { angle: number; power: number; score: number } {
    const weapon = shooter.weapon;
    const startX = shooter.x;
    const startY = shooter.y - 10;
    const targetX = target.x;
    const targetY = target.y - 10;

    const dx = targetX - startX;
    const dy = targetY - startY;
    const directAngle = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
    const dist = Phaser.Math.Distance.Between(startX, startY, targetX, targetY);

    // Flamethrower: short range, mostly direct.
    if (weapon.type === WeaponType.FLAMER) {
      const clampedDist = Phaser.Math.Clamp(dist, 80, 200);
      const power = Phaser.Math.Clamp((clampedDist - 100), 10, 100);
      return { angle: directAngle, power, score: Math.max(0, dist - 190) };
    }

    const isBullet = this.isBulletWeapon(weapon.type);
    const towardsRight = dx >= 0;

    const shortestBetweenDeg = (a: number, b: number): number => {
      // Normalize into [-180, 180] (degrees).
      let d = a - b;
      d = ((d + 180) % 360 + 360) % 360 - 180;
      return d;
    };

    const minPower = isBullet ? 55 : 35;
    const maxPower = 100;

    const angleStep = isBullet ? 3 : 4;
    const powerStep = isBullet ? 4 : 5;
    const angleWindow = isBullet ? 55 : 999;

    let bestAngle = Phaser.Math.Clamp(directAngle, -180, 180);
    const baRad = Phaser.Math.DegToRad(bestAngle);
    if ((towardsRight && Math.cos(baRad) <= 0) || (!towardsRight && Math.cos(baRad) >= 0)) {
      bestAngle = towardsRight ? -15 : -165;
    }
    let bestPower = Phaser.Math.Clamp(80, minPower, maxPower);
    let bestScore = Number.POSITIVE_INFINITY;

    // Brute-force search for a reasonable ballistic solution using the same simplified model as the aim preview.
    // Important: include BOTH upward and downward angles (AI used to only try upward shots).
    for (let angle = -180; angle <= 180; angle += angleStep) {
      const angleRad = Phaser.Math.DegToRad(angle);
      const dir = Math.cos(angleRad);

      // Only consider angles that actually fire toward the target side.
      if (towardsRight) {
        if (dir <= 0.06) continue;
      } else {
        if (dir >= -0.06) continue;
      }

      // Bullet weapons should generally shoot near the direct angle (less "lobbing").
      if (isBullet && Math.abs(shortestBetweenDeg(angle, directAngle)) > angleWindow) continue;

      // Non-mortar weapons shouldn't attempt near-vertical shots (wastes the turn).
      if (weapon.type !== WeaponType.MORTAR && Math.abs(dir) < 0.12) continue;

      for (let power = minPower; power <= maxPower; power += powerStep) {
        const evalRes = this.evaluateShot(startX, startY, angle, power, weapon, targetX, targetY);
        const tacticalScore = this.scoreAIShotResult(shooter, target, weapon, evalRes);
        if (tacticalScore < bestScore) {
          bestScore = tacticalScore;
          bestAngle = angle;
          bestPower = power;
          // Early exit if we have a near-direct hit.
          if (bestScore <= 14) break;
        }
      }
      if (bestScore <= 14) break;
    }

    // If search failed badly, fall back to a direct-ish shot.
    if (!Number.isFinite(bestScore) || bestScore > 220) {
      const fallbackPower = Phaser.Math.Clamp(85, minPower, maxPower);
      return { angle: directAngle, power: fallbackPower, score: bestScore + 80 };
    }

    // Add a little imperfection so it doesn't feel like an aimbot.
    const jitterAngle = Phaser.Math.FloatBetween(-2.5, 2.5);
    const jitterPower = Phaser.Math.FloatBetween(-4, 4);

    return {
      angle: Phaser.Math.Clamp(bestAngle + jitterAngle, -180, 180),
      power: Phaser.Math.Clamp(bestPower + jitterPower, minPower, maxPower),
      score: bestScore,
    };
  }

  private evaluateShot(
    startX: number,
    startY: number,
    angleDeg: number,
    power: number,
    weapon: WeaponConfig,
    targetX: number,
    targetY: number
  ): { score: number; minDist: number; impactX: number | null; impactY: number | null } {
    const angleRad = Phaser.Math.DegToRad(angleDeg);
    const speed = (power / 100) * weapon.projectileSpeed;

    const vx = Math.cos(angleRad) * speed;
    const vy = Math.sin(angleRad) * speed;
    const effectiveGravity = 500 * weapon.gravity;

    const isBullet = this.isBulletWeapon(weapon.type);
    // Smaller timestep for fast weapons so the score matches the actual 60fps-ish simulation more closely.
    const dt = isBullet ? 0.012 : 0.02;
    const maxTime = 6.0;

    let minDist = Number.POSITIVE_INFINITY;
    let impactX: number | null = null;
    let impactY: number | null = null;

    for (let t = 0; t < maxTime; t += dt) {
      const x = startX + vx * t;
      const y = startY + vy * t + 0.5 * effectiveGravity * t * t;

      // Out of bounds
      if (x < 0 || x > this.worldWidth || y > this.worldHeight + 80) break;

      const d = Phaser.Math.Distance.Between(x, y, targetX, targetY);
      if (d < minDist) minDist = d;

      // Terrain hit
      if (y > 0 && this.terrain.isPointSolid(x, y)) {
        impactX = x;
        impactY = y;
        break;
      }
    }

    let score = minDist;

    // For explosives, what matters most is where the projectile impacts (explosion center),
    // not merely whether the arc passes near the target mid-flight.
    if (weapon.explosionRadius > 12) {
      const targetHitRadius = 18;
      if (minDist <= targetHitRadius) {
        score = minDist;
      } else if (impactX !== null && impactY !== null) {
        score = Phaser.Math.Distance.Between(impactX, impactY, targetX, targetY);
      } else {
        score = minDist + 250;
      }
    }

    // Avoid obvious self-splash for explosives.
    if (impactX !== null && impactY !== null && weapon.explosionRadius > 12) {
      const selfDist = Phaser.Math.Distance.Between(startX, startY, impactX, impactY);
      if (selfDist < weapon.explosionRadius * 1.1) {
        score += 1000;
      }
    }

    return { score, minDist, impactX, impactY };
  }

  private scoreAIShotResult(
    shooter: Soldier,
    target: Soldier,
    weapon: WeaponConfig,
    evalRes: { score: number; minDist: number; impactX: number | null; impactY: number | null }
  ): number {
    let score = evalRes.score;

    if (weapon.explosionRadius > 12 && evalRes.impactX !== null && evalRes.impactY !== null) {
      let expectedEnemyDamage = 0;
      let expectedFriendlyDamage = 0;

      for (const soldier of this.soldiers) {
        if (!soldier.isAlive()) continue;

        const distance = Phaser.Math.Distance.Between(evalRes.impactX, evalRes.impactY, soldier.x, soldier.y);
        if (distance >= weapon.explosionRadius) continue;

        const expectedDamage = Math.max(0, Math.round((1 - distance / weapon.explosionRadius) * weapon.damage));
        if (expectedDamage <= 0) continue;

        if (soldier.team !== shooter.team) {
          expectedEnemyDamage += expectedDamage;
          if (expectedDamage >= soldier.getHealth()) expectedEnemyDamage += 35;
          if (soldier === target) expectedEnemyDamage += 12;
        } else {
          const friendlyWeight = soldier === shooter ? 2.8 : 2.0;
          expectedFriendlyDamage += expectedDamage * friendlyWeight;
        }
      }

      score -= expectedEnemyDamage * 1.25;
      score += expectedFriendlyDamage * 1.75;
    } else if (this.isBulletWeapon(weapon.type)) {
      const healthPressure = Math.max(0, 100 - target.getHealth()) * 0.08;
      score -= healthPressure;

      if (evalRes.minDist <= 16) {
        score -= Math.min(50, weapon.damage * Math.max(1, Math.min(weapon.pelletCount, 12)) * 0.18);
        if (weapon.damage >= target.getHealth()) score -= 35;
      }
    }

    return score;
  }

  // Getters for UI
  public getTurnInfo() {
    return this.turnManager.getTurnInfo();
  }

  public getAimInfo() {
    return {
      angle: this.aimAngle,
      power: this.power,
    };
  }

  private checkSoldierHit(
    lastX: number,
    lastY: number,
    currentX: number,
    currentY: number,
    damage: number,
    isBullet: boolean,
    excludedSoldier: Soldier | null,
    onHit: (hitX: number, hitY: number) => void
  ): void {
    // Check if projectile path intersects with any soldier
    // Use line-circle intersection for accurate hit detection

    for (const soldier of this.soldiers) {
      if (!soldier.isAlive()) continue;
      // Skip the shooter (bullets always; explosives during their spawn grace window).
      if (soldier === excludedSoldier) continue;
      
      // Soldier hitbox - slightly larger than visual for better gameplay
      const soldierX = soldier.x;
      const soldierY = soldier.y;
      const hitRadius = 18; // Radius around soldier center for hit detection
      
      // Check if the line from lastPos to currentPos passes through soldier hitbox
      // Using closest point on line segment to circle center
      const dx = currentX - lastX;
      const dy = currentY - lastY;
      const fx = lastX - soldierX;
      const fy = lastY - soldierY;
      
      const a = dx * dx + dy * dy;
      
      // Handle zero-length line (projectile hasn't moved) - check point-in-circle
      if (a < 0.0001) {
        const distSq = fx * fx + fy * fy;
        if (distSq <= hitRadius * hitRadius) {
          // Point is inside circle - hit!
          if (isBullet) {
            soldier.takeDamage(damage);
            const angle = Math.atan2(dy || 0.001, dx || 0.001);
            soldier.applyKnockback(
              Math.cos(angle) * 24,
              Math.sin(angle) * 18 - 14
            );
            this.createBulletHitEffect(lastX, lastY);
          }
          onHit(lastX, lastY);
          return;
        }
        continue;
      }
      
      const b = 2 * (fx * dx + fy * dy);
      const c = fx * fx + fy * fy - hitRadius * hitRadius;
      
      let discriminant = b * b - 4 * a * c;
      
      if (discriminant >= 0) {
        discriminant = Math.sqrt(discriminant);
        
        // Check both intersection points
        const t1 = (-b - discriminant) / (2 * a);
        const t2 = (-b + discriminant) / (2 * a);
        
        // t must be between 0 and 1 for intersection to be on the line segment
        if ((t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1)) {
          // Hit! Calculate hit point
          const t = Math.max(0, Math.min(1, t1 >= 0 ? t1 : t2));
          const hitX = lastX + t * dx;
          const hitY = lastY + t * dy;
          
          // Apply damage directly for bullets (not through explosion system)
          if (isBullet) {
            soldier.takeDamage(damage);
            
            // Small knockback for bullets
            const angle = Math.atan2(dy, dx);
            soldier.applyKnockback(
              Math.cos(angle) * 24,
              Math.sin(angle) * 18 - 14
            );
            
            // Create hit effect on soldier
            this.createBulletHitEffect(hitX, hitY);
          }
          
          // Trigger the callback to stop the projectile
          onHit(hitX, hitY);
          return; // Only hit one soldier per frame
        }
      }
    }
  }

  private createBulletHitEffect(x: number, y: number): void {
    // === ENHANCED HIT EFFECT ===
    
    // Impact flash
    const flash = this.add.circle(x, y, 12, 0xffffff, 0.9);
    flash.setDepth(200);
    this.tweens.add({
      targets: flash,
      scale: 0,
      alpha: 0,
      duration: 80,
      onComplete: () => flash.destroy(),
    });
    
    // "HIT" marker
    const hitText = this.add.text(x, y - 20, 'HIT!', {
      font: 'bold 14px Arial',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 3,
    });
    hitText.setOrigin(0.5);
    hitText.setDepth(201);
    hitText.setScale(0.5);
    
    this.tweens.add({
      targets: hitText,
      scale: 1.2,
      y: y - 40,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
      onComplete: () => hitText.destroy(),
    });
    
    // Blood splatter effect - more particles
    for (let i = 0; i < 12; i++) {
      const particle = this.add.circle(x, y, 2 + Math.random() * 2, 0xff0000, 1);
      particle.setDepth(199);
      
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * speed * 0.5,
        y: y + Math.sin(angle) * speed * 0.4 + 20,
        alpha: 0,
        scale: 0,
        duration: 350,
        ease: 'Power1',
        onComplete: () => particle.destroy()
      });
    }
    
    // Small screen shake on hit
    this.cameras.main.shake(80, 0.004);
  }
}
