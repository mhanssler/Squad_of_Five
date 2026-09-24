import Phaser from 'phaser';
import type { SpecialTool } from '../systems/SpecialActions';
import { advanceFlight, BALLISTIC_STEP, createFlight, getMuzzle, sweepTerrain } from '../systems/Ballistics';
import { playBattleExplosion } from '../systems/BattleEffects';
import { Soldier } from '../entities/Soldier';
import { Terrain } from '../systems/Terrain';
import { TurnManager, Team } from '../systems/TurnManager';
import { Projectile, createProjectile } from '../entities/Projectile';
import { ALL_WEAPON_TYPES, WeaponConfig, WeaponType, WEAPONS } from '../systems/WeaponTypes';
import { SoundManager } from '../utils/SoundManager';
import {
  GameMode,
  MAX_TUNNELS_PER_TURN,
  OPERATION_SCORE_TO_WIN,
  RELAY_CAPTURE_RADIUS,
  RelayControl,
  TUNNEL_MOVEMENT_COST,
  getTunnelPlan,
  resolveRelayControl,
} from '../systems/GameRules';
import { adjustDropXsForTerrain, getDeploymentZone, planTeamDropXs } from '../systems/Deployment';
import { COVER_MOVEMENT_COST } from '../systems/Cover';
import {
  advanceChargePower,
  getAimAssistProfile,
  getAimReadout,
  getLocalPointerAimAngle,
  resolveKeyboardChargeInput,
} from '../systems/AimControls';
import { BattlefieldSky } from '../systems/BattlefieldSky';
import { getBattlefieldRevealFrame } from '../systems/CameraFraming';
import {
  FactionId,
  FactionMatchup,
  createFactionMatchup,
  getFaction,
} from '../systems/Factions';
import { sanitizeSquadForMap } from '../systems/SquadRules';
import {
  findFirstUnitIntercept,
  getHorizontalShotProgress,
  getTerrainObstructionPenalty,
  type ShotUnit,
} from '../systems/AIShotSafety';
import { shouldDeformTerrainOnImpact } from '../systems/ImpactRules';
import {
  chooseAIAreaStrikeTargetX,
  chooseAIGrappleDestination,
  chooseAIRecoveryAction,
  chooseSpacedDestinationX,
  type AIGrappleCandidate,
  type AIMoveOutcome,
  type AIMoveStopReason,
} from '../systems/AITactics';

// Base movement distance (modified by weapon weight)
const BASE_MOVEMENT_DISTANCE = 320;
const POWER_MIN = 10;
// One deliberate pass to full power gives the player a readable release window.
const POWER_CHARGE_PER_SECOND = 32;
const AI_MAX_ACCEPTABLE_SHOT_SCORE = 260;
const AI_FRIENDLY_FIRE_PENALTY = 6000;
const AI_MAX_NAVIGATION_RECOVERIES = 3;
const AI_FORMATION_SPACING = 78;

const KEYBOARD_AIM_SPEED_DEG_PER_SEC = 68;
const FINE_AIM_SPEED_DEG_PER_SEC = 16;
const LOCAL_AIM_DEADZONE_PX = 28;

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

type AIShotEvaluation = {
  score: number;
  minDist: number;
  impactX: number | null;
  impactY: number | null;
  interceptedSoldier: Soldier | null;
  terrainProgress: number | null;
};

type RelayObjective = {
  id: number;
  x: number;
  y: number;
  owner: RelayControl;
  container: Phaser.GameObjects.Container;
  graphics: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  highlight: 'none' | 'ready' | 'secured' | 'contested';
};

export class GameScene extends Phaser.Scene {
  // Battlefield dimensions (wider than viewport). Configurable via MenuScene.
  private worldWidth: number = 2560;
  private worldHeight: number = 720;
  private terrainPreset: 'standard' | 'plains' | 'hills' | 'caves' = 'standard';
  private vsAI: boolean = true;
  private gameMode: GameMode = 'expanded';
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
  private battlefieldSky!: BattlefieldSky;

  // Squad selections from menu
  private redSquad: string[] = [];
  private blueSquad: string[] = [];
  private factionMatchup: FactionMatchup = {
    red: 'united-states',
    blue: 'germany',
  };

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
  private isCharging: boolean = false;
  private aimLine!: Phaser.GameObjects.Graphics;
  private aimPowerText!: Phaser.GameObjects.Text;
  private hasFired: boolean = false;
  private specialTool: SpecialTool | null = null;
  private specialTarget = { x: 0, y: 0 };
  private specialLabel: Phaser.GameObjects.Text | null = null;
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
  private lastMovementX: number = 0;
  private tunnelsUsedThisTurn: number = 0;
  private isTunnelActionInProgress: boolean = false;
  private isCoverActionInProgress: boolean = false;
  private coverUsedThisTurn: boolean = false;

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
  private introCameraTween: Phaser.Tweens.Tween | null = null;
  private paraDropPlans: Array<{
    x: number;
    team: Team;
    factionId: FactionId;
    name: string;
    index: number;
    weaponId: string;
    spawned: boolean;
  }> = [];
  private activeDescents: Array<{ soldier: Soldier; parachute: Phaser.GameObjects.Container; landingY: number }> = [];
  private soldiersExpected: number = 10;
  private soldiersLanded: number = 0;

  // Balance events / airdrops
  private supplyDrops: SupplyDrop[] = [];
  private nextBalanceEventTurn: number = 4;

  // Expanded-mode signal relays create a movement objective beyond pure elimination.
  private relayObjectives: RelayObjective[] = [];
  private operationScore: Record<Team, number> = { [Team.RED]: 0, [Team.BLUE]: 0 };
  private lastRelayIncomeRound: number = 1;
  private lastRelayContext: string = '';
  private operationsBriefingShown: boolean = false;

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

  init(data: { redSquad?: string[], blueSquad?: string[], mapSize?: 'small' | 'medium' | 'large', terrainPreset?: 'standard' | 'plains' | 'hills' | 'caves', vsAI?: boolean, gameMode?: GameMode }): void {
    // Receive squad selections from menu
    const size = data.mapSize ?? 'medium';
    const defaultSquad = ['rifle', 'grenade', 'rocket', 'sniper', 'mortar'];
    this.redSquad = sanitizeSquadForMap(
      data.redSquad ?? defaultSquad,
      size,
      ALL_WEAPON_TYPES,
    );
    this.blueSquad = sanitizeSquadForMap(
      data.blueSquad ?? defaultSquad,
      size,
      ALL_WEAPON_TYPES,
    );

    if (size === 'small') this.worldWidth = 1920;
    else if (size === 'large') this.worldWidth = 3200;
    else this.worldWidth = 2560;
    this.worldHeight = 720;

    this.terrainPreset = data.terrainPreset ?? 'standard';
    this.vsAI = data.vsAI ?? true;
    this.gameMode = data.gameMode ?? 'basic';
    this.factionMatchup = createFactionMatchup();
    this.operationScore = { [Team.RED]: 0, [Team.BLUE]: 0 };
    this.lastRelayIncomeRound = 1;
    this.lastRelayContext = '';
    this.operationsBriefingShown = false;
  }

  create(): void {
    this.specialTool = null;
    this.specialLabel = null;
    // Set up world bounds (larger than camera)
    this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
    
    // Set up camera bounds
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    
    // Create starry night background (covers entire world)
    this.createStarryBackground();
    
    // Create terrain (wider battlefield) with random seed
    this.terrain = new Terrain(this, this.worldWidth, this.worldHeight, undefined, { preset: this.terrainPreset });
    this.battlefieldSky = new BattlefieldSky(
      this,
      this.worldWidth,
      this.worldHeight,
      x => this.terrain.getSurfaceY(x),
    );

    if (this.gameMode === 'expanded') {
      this.createRelayObjectives();
    }

    // Create aim line graphics
    this.aimLine = this.add.graphics();
    this.aimLine.setDepth(100);

    // Local fire-control readout stays with the active soldier.
    this.aimPowerText = this.add.text(0, 0, '', {
      font: 'bold 12px "Arial Narrow", Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      backgroundColor: '#07100dcc',
      padding: { x: 5, y: 3 },
    });
    this.aimPowerText.setOrigin(0.5, 0);
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
    this.scene.launch('UIScene', {
      gameScene: this,
      gameMode: this.gameMode,
      factionMatchup: this.factionMatchup,
    });
    this.time.delayedCall(0, () => this.emitOperationStatus());

    // Listen for projectile explosions (now includes damage parameter)
    this.events.on('projectile-explode', this.handleExplosion, this);
    
    // Listen for flame damage (flamethrower)
    this.events.on('flame-wave', this.handleFlameWave, this);
    this.events.on('bullet-near-miss', this.handleBulletNearMiss, this);
    
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
    this.events.on('soldier-died', this.handleSoldierDeath, this);
    
    // Setup mouse controls
    this.setupMouseControls();

    // In-game music. Menu music is stopped when GameScene starts.
    SoundManager.init();
    SoundManager.setBattleMusicPhase('maneuver');
    SoundManager.startBattleMusic();

    // Ensure music stops if this scene is ever shut down.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.battlefieldSky.destroy();
      SoundManager.stopMusic();
    });
  }
  
  private setupMouseControls(): void {
    // Right-click or middle-click drag to pan camera
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.specialTool) {
        if (pointer.rightButtonDown()) this.cancelSpecial();
        else if (pointer.leftButtonDown()) this.confirmSpecial();
        return;
      }
      if (this.currentSoldier && !this.isSelectingCharacter &&
          (this.currentSoldier.isCurrentlyGrappling() || this.isTunnelActionInProgress || this.isCoverActionInProgress || this.isTeamAI(this.currentSoldier.team))) return;
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
        this.updateMouseAimTarget(pointer.x, pointer.y);
        this.isMouseCharging = true;
        this.power = POWER_MIN;
        this.mouseChargeTurnId = this.turnId;
        this.mouseChargeSoldier = this.currentSoldier;
      }
    });
    
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.specialTool && this.currentSoldier) {
        this.specialTarget = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.aimAngle = Phaser.Math.RadToDeg(Math.atan2(this.specialTarget.y - this.currentSoldier.y, this.specialTarget.x - this.currentSoldier.x));
        return;
      }
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
      
      // Mouse aiming uses the pointer direction around the active soldier.
      // Positions right on top of the soldier are ignored because the angle is unstable there.
      if (this.currentSoldier && !this.isSelectingCharacter && !this.isDraggingCamera && !this.isAirstrikeTargeting) {
        this.updateMouseAimTarget(pointer.x, pointer.y);
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

  private updateMouseAimTarget(screenX: number, screenY: number): void {
    const origin = this.getAimOrigin();
    if (!origin) return;
    const camera = this.cameras.main;
    const originScreenX = camera.x + (origin.x - camera.worldView.x) * camera.zoom;
    const originScreenY = camera.y + (origin.y - camera.worldView.y) * camera.zoom;
    const targetAngle = getLocalPointerAimAngle(
      screenX,
      screenY,
      originScreenX,
      originScreenY,
      LOCAL_AIM_DEADZONE_PX,
    );
    if (targetAngle !== null) this.aimAngle = targetAngle;
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

    this.destroyRelayObjectives();
    this.operationScore = { [Team.RED]: 0, [Team.BLUE]: 0 };
    this.lastRelayIncomeRound = 1;
    this.operationsBriefingShown = false;
    this.factionMatchup = createFactionMatchup();
    
    // Stop camera follow
    this.cameras.main.stopFollow();
    
    // Clear selection state
    this.isSelectingCharacter = false;
    this.selectionIndicator.clear();
    this.currentSoldier = null;
    
    // Regenerate terrain with new seed
    this.terrain.regenerate();
    this.battlefieldSky.refreshGroundAnchors();
    if (this.gameMode === 'expanded') {
      this.createRelayObjectives();
    }
    
    // Reset game state - destroy all soldiers
    this.soldiers.forEach(soldier => soldier.destroy());
    this.soldiers = [];
    
    // Reinitialize teams
    this.initializeTeams();
    
    // Reset turn manager
    this.turnManager = new TurnManager(this.soldiers);
    
    // Reset UI
    this.events.emit('new-game');
    this.events.emit('factions-update', this.factionMatchup);
    
    // Reset flags
    this.hasFired = false;
    this.movementUsed = 0;
    this.tunnelsUsedThisTurn = 0;
    this.isTunnelActionInProgress = false;
    this.isCoverActionInProgress = false;
    this.coverUsedThisTurn = false;
    this.emitOperationStatus();
    
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

    const redFaction = getFaction(this.factionMatchup.red);
    const blueFaction = getFaction(this.factionMatchup.blue);
    const redNames = redFaction.soldierNames;
    const blueNames = blueFaction.soldierNames;
    const redZone = getDeploymentZone(this.worldWidth, 'red');
    const blueZone = getDeploymentZone(this.worldWidth, 'blue');
    const sampleSurface = (x: number): number => this.terrain.getSurfaceY(x);
    const redXs = adjustDropXsForTerrain(
      planTeamDropXs(this.worldWidth, redNames.length, 'red'),
      redZone,
      this.worldHeight,
      sampleSurface,
    );
    const blueXs = adjustDropXsForTerrain(
      planTeamDropXs(this.worldWidth, blueNames.length, 'blue'),
      blueZone,
      this.worldHeight,
      sampleSurface,
    );

    redNames.forEach((name, index) => {
      this.paraDropPlans.push({
        x: redXs[index],
        team: Team.RED,
        factionId: redFaction.id,
        name,
        index,
        weaponId: this.redSquad[index] || 'rifle',
        spawned: false,
      });
    });

    blueNames.forEach((name, index) => {
      this.paraDropPlans.push({
        x: blueXs[index],
        team: Team.BLUE,
        factionId: blueFaction.id,
        name,
        index,
        weaponId: this.blueSquad[index] || 'rifle',
        spawned: false,
      });
    });
  }

  private showIntroSkipHint(): void {
    if (this.introHintText) this.introHintText.destroy();

    this.introHintText = this.add.text(this.cameras.main.width - 24, this.cameras.main.height - 88, 'SPACE / CLICK  SKIP INTRO', {
      font: 'bold 12px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      backgroundColor: '#00000066',
      padding: { x: 9, y: 4 },
    });
    this.introHintText.setOrigin(1, 0.5);
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
    this.stopIntroCameraMove();

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

  private spawnSoldierOnGround(plan: {
    x: number;
    team: Team;
    factionId: FactionId;
    name: string;
    index: number;
    weaponId: string;
  }): void {
    const landingY = this.terrain.getSurfaceY(plan.x) - 15;
    const soldier = new Soldier(
      this,
      plan.x,
      landingY,
      plan.team,
      plan.name,
      plan.index,
      true,
      plan.weaponId as WeaponType,
      plan.factionId,
    );
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
    this.stopIntroCameraMove();

    if (this.introHintText) {
      this.introHintText.destroy();
      this.introHintText = null;
    }

    this.startCharacterSelection();
    if (!this.operationsBriefingShown) {
      this.operationsBriefingShown = true;
      this.time.delayedCall(180, () => this.events.emit('show-operations-briefing'));
    }
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
    const redPlane = this.createPlane(-100, 80, true, this.factionMatchup.red); // Flying right
    const bluePlane = this.createPlane(this.worldWidth + 100, 120, false, this.factionMatchup.blue); // Flying left

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
        this.dropParatrooper(
          plan.x,
          planeY + 20,
          plan.team,
          plan.factionId,
          plan.name,
          plan.index,
          plan.weaponId,
        );
      });
    });
  }

  private createPlane(
    x: number,
    y: number,
    facingRight: boolean,
    factionId: FactionId,
  ): Phaser.GameObjects.Container {
    const plane = this.add.container(x, y);
    plane.setDepth(100);
    
    const graphics = this.add.graphics();
    const faction = getFaction(factionId);
    
    // Faction-toned transport silhouette with a bright team recognition stripe.
    graphics.fillStyle(faction.palette.helmetDark, 1);
    
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

    const stripeColor = factionId === this.factionMatchup.red ? 0xbd4a43 : 0x4779b8;
    graphics.fillStyle(stripeColor, 1);
    graphics.fillRect(facingRight ? -34 : 28, -8, 6, 16);
    
    const marking = this.add.image(facingRight ? 7 : -7, 0, `faction-emblem-${factionId}`);
    marking.setDisplaySize(14, 14);
    plane.add([graphics, marking]);
    return plane;
  }

  private dropParatrooper(
    dropX: number,
    startY: number,
    team: Team,
    factionId: FactionId,
    name: string,
    squadIndex: number,
    weaponTypeId: string,
  ): void {
    // Calculate landing position FIRST (where the terrain surface is)
    const landingY = this.terrain.getSurfaceY(dropX) - 15;
    
    // Convert weapon type string to WeaponType enum
    const weaponType = weaponTypeId as WeaponType;
    
    // Create the soldier with gravity DISABLED from the start
    const soldier = new Soldier(
      this,
      dropX,
      startY,
      team,
      name,
      squadIndex,
      true,
      weaponType,
      factionId,
    );
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
    const faction = getFaction(factionId);
    const chuteColor = faction.palette.uniformLight;
    chuteGraphics.fillStyle(chuteColor, 0.8);
    chuteGraphics.beginPath();
    chuteGraphics.arc(0, 0, 25, Math.PI, 0, false);
    chuteGraphics.closePath();
    chuteGraphics.fillPath();

    chuteGraphics.lineStyle(3, team === Team.RED ? 0xbd4a43 : 0x4779b8, 0.95);
    chuteGraphics.beginPath();
    chuteGraphics.arc(0, 0, 23, Math.PI, 0, false);
    chuteGraphics.strokePath();
    
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

    // Layered sky and distant ridgelines add depth without competing with gameplay silhouettes.
    this.backgroundGraphics.fillStyle(0x09111f, 1);
    this.backgroundGraphics.fillRect(0, 0, this.worldWidth, this.worldHeight);
    this.backgroundGraphics.fillStyle(0x13243a, 1);
    this.backgroundGraphics.fillRect(0, 260, this.worldWidth, 210);

    this.backgroundGraphics.fillStyle(0x101a28, 1);
    this.backgroundGraphics.beginPath();
    this.backgroundGraphics.moveTo(0, 440);
    for (let x = 0; x <= this.worldWidth; x += 90) {
      const y = 365 + Math.sin(x * 0.006) * 34 + Math.sin(x * 0.017) * 18;
      this.backgroundGraphics.lineTo(x, y);
    }
    this.backgroundGraphics.lineTo(this.worldWidth, 520);
    this.backgroundGraphics.lineTo(0, 520);
    this.backgroundGraphics.closePath();
    this.backgroundGraphics.fillPath();

    this.backgroundGraphics.fillStyle(0x0b131d, 1);
    this.backgroundGraphics.beginPath();
    this.backgroundGraphics.moveTo(0, 500);
    for (let x = 0; x <= this.worldWidth; x += 70) {
      const y = 415 + Math.sin(x * 0.009 + 1.6) * 28 + Math.sin(x * 0.025) * 12;
      this.backgroundGraphics.lineTo(x, y);
    }
    this.backgroundGraphics.lineTo(this.worldWidth, 540);
    this.backgroundGraphics.lineTo(0, 540);
    this.backgroundGraphics.closePath();
    this.backgroundGraphics.fillPath();
    
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

  private createRelayObjectives(): void {
    this.destroyRelayObjectives();

    const positions = [0.32, 0.50, 0.68];
    positions.forEach((ratio, index) => {
      const x = Math.round(this.worldWidth * ratio);
      const y = this.terrain.getSurfaceY(x) - 4;
      const container = this.add.container(x, y);
      container.setDepth(35);

      const graphics = this.add.graphics();
      const label = this.add.text(0, -72, `RELAY ${index + 1}`, {
        font: 'bold 10px Arial',
        color: '#e9edf3',
        stroke: '#000000',
        strokeThickness: 3,
      });
      label.setOrigin(0.5);
      container.add([graphics, label]);

      const relay: RelayObjective = {
        id: index + 1,
        x,
        y,
        owner: 'neutral',
        container,
        graphics,
        label,
        highlight: 'none',
      };
      this.relayObjectives.push(relay);
      this.redrawRelayObjective(relay);

      this.tweens.add({
        targets: label,
        alpha: { from: 0.7, to: 1 },
        duration: 900 + index * 140,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
  }

  private redrawRelayObjective(relay: RelayObjective): void {
    const color = relay.owner === Team.RED
      ? 0xff5544
      : relay.owner === Team.BLUE
        ? 0x5599ff
        : 0xd7c98b;
    const g = relay.graphics;
    g.clear();

    const ringColor = relay.highlight === 'contested'
      ? 0xffcc55
      : relay.highlight === 'ready'
        ? 0xffffff
        : color;
    const ringAlpha = relay.highlight === 'none' ? 0.55 : 0.95;
    g.lineStyle(relay.highlight === 'none' ? 2 : 3, ringColor, ringAlpha);
    for (let segment = 0; segment < 18; segment++) {
      const start = (segment / 18) * Math.PI * 2;
      const end = start + Math.PI * 0.075;
      g.lineBetween(
        Math.cos(start) * RELAY_CAPTURE_RADIUS,
        -8 + Math.sin(start) * RELAY_CAPTURE_RADIUS,
        Math.cos(end) * RELAY_CAPTURE_RADIUS,
        -8 + Math.sin(end) * RELAY_CAPTURE_RADIUS,
      );
    }

    g.fillStyle(0x111820, 0.88);
    g.fillRect(-18, -9, 36, 9);
    g.lineStyle(3, 0x253442, 1);
    g.lineBetween(0, -10, 0, -58);
    g.lineStyle(2, color, 1);
    g.lineBetween(-12, -44, 0, -58);
    g.lineBetween(12, -44, 0, -58);
    g.lineBetween(-9, -33, 9, -33);
    g.fillStyle(color, 1);
    g.fillTriangle(0, -58, 23, -51, 0, -44);
    g.fillStyle(0xffffff, 0.75);
    g.fillCircle(0, -58, 3);

    const ownerLabel = relay.owner === Team.RED
      ? 'RED CONTROL'
      : relay.owner === Team.BLUE
        ? 'BLUE CONTROL'
        : 'NEUTRAL';
    const stateLabel = relay.highlight === 'contested'
      ? 'CONTESTED'
      : relay.highlight === 'ready'
        ? 'CAPTURE READY'
        : relay.highlight === 'secured'
          ? 'SECURED'
          : ownerLabel;
    relay.label.setText(`RELAY ${relay.id} - ${stateLabel}`);
    relay.label.setColor(relay.highlight === 'contested'
      ? '#ffcc55'
      : relay.owner === 'neutral'
        ? '#e9edf3'
        : `#${color.toString(16).padStart(6, '0')}`);
  }

  private updateRelayPositions(): void {
    if (this.gameMode !== 'expanded') return;
    for (const relay of this.relayObjectives) {
      const nextY = this.terrain.getSurfaceY(relay.x) - 4;
      if (Math.abs(nextY - relay.y) > 0.5) {
        relay.y = nextY;
        relay.container.y = nextY;
      }
    }
  }

  private updateRelayAwareness(): void {
    if (this.gameMode !== 'expanded' || !this.currentSoldier || !this.currentSoldier.isAlive()) {
      for (const relay of this.relayObjectives) {
        if (relay.highlight !== 'none') {
          relay.highlight = 'none';
          this.redrawRelayObjective(relay);
        }
      }
      this.emitRelayContext('');
      return;
    }

    const soldier = this.currentSoldier;
    const opponents = this.soldiers.filter(candidate =>
      candidate.isAlive() && candidate.team !== soldier.team
    );
    let context = '';
    let nearest: { relay: RelayObjective; distance: number } | null = null;

    for (const relay of this.relayObjectives) {
      const distance = Phaser.Math.Distance.Between(soldier.x, soldier.y, relay.x, relay.y);
      if (!nearest || distance < nearest.distance) nearest = { relay, distance };

      let highlight: RelayObjective['highlight'] = 'none';
      if (distance <= RELAY_CAPTURE_RADIUS) {
        const enemyPresent = opponents.some(opponent =>
          Phaser.Math.Distance.Between(opponent.x, opponent.y, relay.x, relay.y) <= RELAY_CAPTURE_RADIUS
        );
        if (enemyPresent) {
          highlight = 'contested';
          context = `RELAY ${relay.id}: CONTESTED | CLEAR THE RING`;
        } else if (relay.owner === soldier.team) {
          highlight = 'secured';
          context = `RELAY ${relay.id}: SECURED | HOLD FOR ROUND SCORE`;
        } else {
          highlight = 'ready';
          context = `RELAY ${relay.id}: CAPTURE READY | END TURN IN RING`;
        }
      }

      if (relay.highlight !== highlight) {
        relay.highlight = highlight;
        this.redrawRelayObjective(relay);
      }
    }

    if (!context && nearest && nearest.distance <= RELAY_CAPTURE_RADIUS + 140) {
      context = `RELAY ${nearest.relay.id}: NEARBY | ENTER DASHED RING`;
    }
    this.emitRelayContext(context);
  }

  private emitRelayContext(message: string): void {
    if (message === this.lastRelayContext) return;
    this.lastRelayContext = message;
    this.events.emit('context-update', message);
  }

  private destroyRelayObjectives(): void {
    this.relayObjectives.forEach(relay => {
      this.tweens.killTweensOf(relay.label);
      relay.container.destroy(true);
    });
    this.relayObjectives = [];
  }

  private processRelayCaptures(): Team | null {
    if (this.gameMode !== 'expanded') return null;

    for (const relay of this.relayObjectives) {
      const redSoldiers = this.soldiers.filter(s => s.isAlive() && s.team === Team.RED);
      const blueSoldiers = this.soldiers.filter(s => s.isAlive() && s.team === Team.BLUE);
      const redDistances = redSoldiers.map(s => Phaser.Math.Distance.Between(s.x, s.y, relay.x, relay.y));
      const blueDistances = blueSoldiers.map(s => Phaser.Math.Distance.Between(s.x, s.y, relay.x, relay.y));
      const control = resolveRelayControl(redDistances, blueDistances);

      if (control === 'neutral' || control === 'contested' || control === relay.owner) continue;

      relay.owner = control;
      const team = control === 'red' ? Team.RED : Team.BLUE;
      this.operationScore[team]++;
      this.redrawRelayObjective(relay);
      this.updateBattleMusicPhase();

      const nearby = (team === Team.RED ? redSoldiers : blueSoldiers)
        .filter(s => Phaser.Math.Distance.Between(s.x, s.y, relay.x, relay.y) <= RELAY_CAPTURE_RADIUS)
        .sort((a, b) =>
          Phaser.Math.Distance.Between(a.x, a.y, relay.x, relay.y) -
          Phaser.Math.Distance.Between(b.x, b.y, relay.x, relay.y)
        );
      nearby[0]?.sayQuip('objective');
      nearby[0]?.playActionAnimation('celebrate', nearby[0].sprite.flipX ? -1 : 1);

      const teamName = team === Team.RED ? 'RED' : 'BLUE';
      this.showWorldBanner(`${teamName} TOOK RELAY ${relay.id}`, '+1 capture | Held relays score each round');
      SoundManager.playObjectiveStinger(team === Team.RED ? 'red' : 'blue');
      SoundManager.pulseMusicIntensity(1, 1.8);
      this.emitOperationStatus();
    }

    return this.getOperationWinner();
  }

  private awardRelayIncome(roundNumber: number): Team | null {
    if (this.gameMode !== 'expanded' || roundNumber <= this.lastRelayIncomeRound) return null;
    this.lastRelayIncomeRound = roundNumber;

    const redHeld = this.relayObjectives.filter(relay => relay.owner === Team.RED).length;
    const blueHeld = this.relayObjectives.filter(relay => relay.owner === Team.BLUE).length;
    this.operationScore[Team.RED] += redHeld;
    this.operationScore[Team.BLUE] += blueHeld;
    this.updateBattleMusicPhase();

    if (redHeld + blueHeld > 0) {
      this.showWorldBanner('RELAY SIGNALS SCORED', `Red +${redHeld}   Blue +${blueHeld}`);
      SoundManager.pulseMusicIntensity(0.78, 1.2);
    }
    this.emitOperationStatus();
    return this.getOperationWinner();
  }

  private getOperationWinner(): Team | null {
    const red = this.operationScore[Team.RED];
    const blue = this.operationScore[Team.BLUE];
    if (red >= OPERATION_SCORE_TO_WIN && blue >= OPERATION_SCORE_TO_WIN) {
      if (red === blue) return null;
      return red > blue ? Team.RED : Team.BLUE;
    }
    if (red >= OPERATION_SCORE_TO_WIN) return Team.RED;
    if (blue >= OPERATION_SCORE_TO_WIN) return Team.BLUE;
    return null;
  }

  private emitOperationStatus(): void {
    this.events.emit('objectives-update', {
      mode: this.gameMode,
      redScore: this.operationScore[Team.RED],
      blueScore: this.operationScore[Team.BLUE],
      targetScore: OPERATION_SCORE_TO_WIN,
      owners: this.relayObjectives.map(relay => relay.owner),
    });
  }

  private updateBattleMusicPhase(): void {
    if (!this.turnManager) return;
    const info = this.turnManager.getTurnInfo();
    const totalAlive = info.redTeamAlive + info.blueTeamAlive;
    const leadingScore = Math.max(this.operationScore[Team.RED], this.operationScore[Team.BLUE]);

    if (info.roundNumber >= 5 || totalAlive <= 4 || leadingScore >= 5) {
      SoundManager.setBattleMusicPhase('finale');
    } else if (info.roundNumber >= 3 || totalAlive <= 7 || leadingScore >= 2) {
      SoundManager.setBattleMusicPhase('pressure');
    } else {
      SoundManager.setBattleMusicPhase('maneuver');
    }
  }

  private showBattlefieldOverview(): void {
    // Fill the viewport and sweep across the battlefield. Fitting the entire map width
    // made Medium and Large maps occupy only the upper half of the screen.
    const viewW = this.cameras.main.width || 1280;
    const viewH = this.cameras.main.height || 720;
    const frame = getBattlefieldRevealFrame(
      viewW,
      viewH,
      this.worldWidth,
      this.worldHeight,
    );
    this.stopIntroCameraMove();
    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(frame.zoom);
    this.cameras.main.centerOn(frame.startCenterX, frame.centerY);
    this.cameras.main.fadeIn(260, 4, 8, 12);

    const targetScrollX = frame.endCenterX - viewW / (2 * frame.zoom);
    const targetScrollY = frame.centerY - viewH / (2 * frame.zoom);
    this.introCameraTween = this.tweens.add({
      targets: this.cameras.main,
      scrollX: targetScrollX,
      scrollY: targetScrollY,
      duration: 10500,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.introCameraTween = null;
      },
    });

    // Normally the intro hands over control as soon as everyone has landed
    // (see maybeFinishIntro). This is only a safety net so a lost callback
    // can never leave the player stuck watching the sky.
    const token = this.introToken;
    this.time.delayedCall(16000, () => {
      if (token !== this.introToken) return;
      this.transitionFromIntro();
    });
  }

  private stopIntroCameraMove(): void {
    if (!this.introCameraTween) return;
    this.introCameraTween.stop();
    this.introCameraTween = null;
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
      zoom: 1,
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
    this.selectionText.setText('< ENTER/SPACE TO SELECT >');
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
    this.tunnelsUsedThisTurn = 0;
    this.isTunnelActionInProgress = false;
    this.isCoverActionInProgress = false;
    this.coverUsedThisTurn = false;
    
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
      this.maxMovement = Math.floor(Math.max(baseMovement + bonusMovement, movementFloor) * this.currentSoldier.getMovementAllowanceMultiplier());
      this.movementUsed = 0;
      this.lastMovementX = this.currentSoldier.x;
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
    this.power = 50;
    this.isCharging = false;
    this.isMouseCharging = false;

    // Emit turn started event for UI
    this.events.emit('turn-started', {
      ...this.turnManager.getTurnInfo(),
      maxMovement: this.maxMovement,
      movementUsed: this.movementUsed,
    });
    this.emitPowerupStatus();
    this.updateBattleMusicPhase();
    SoundManager.settleBattleMusic();

    // Queue AI action if this unit is AI-controlled.
    this.queueAITurnIfNeeded();
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(50, Math.max(0, delta)) / 1000;
    this.battlefieldSky.update(dt);
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
        const grounded = soldier.isCurrentlyGrappling() ? false : this.terrain.checkCollision(soldier.sprite);
        soldier.setGrounded(grounded);
        this.checkOutOfBounds(soldier);
      }
    });

    // Supply drops can be collected any time (even during selection between turns).
    this.checkSupplyDropPickups();
    this.updateRelayPositions();
    this.updateRelayAwareness();

    // Handle character selection mode
    if (this.isSelectingCharacter) {
      this.handleCharacterSelection();
      return;
    }

    if (
      !this.currentSoldier ||
      !this.currentSoldier.isAlive() ||
      this.hasFired ||
      this.isShotResolving()
    ) {
      return;
    }

    // Account for both human and AI locomotion before either input path returns.
    const distanceMoved = Math.abs(this.currentSoldier.x - this.lastMovementX);
    this.movementUsed = Math.min(this.maxMovement, this.movementUsed + distanceMoved);
    this.lastMovementX = this.currentSoldier.x;
    const canMove = this.movementUsed < this.maxMovement;

    // During AI turns, player input is ignored. The AI runs via timers.
    if (this.isTeamAI(this.currentSoldier.team)) {
      return;
    }

    if (this.specialTool) {
      this.currentSoldier.stopMoving();
      if (Phaser.Input.Keyboard.JustDown(this.escKey)) { this.cancelSpecial(); return; }
      const adjust = (this.sKey.isDown ? 1 : 0) - (this.wKey.isDown ? 1 : 0);
      if (adjust) {
        const distance = Math.min(400, Math.hypot(this.specialTarget.x - this.currentSoldier.x, this.specialTarget.y - this.currentSoldier.y));
        this.aimAngle = wrapDeg(this.aimAngle + adjust * 55 * dt);
        const angle = Phaser.Math.DegToRad(this.aimAngle);
        this.specialTarget = { x: this.currentSoldier.x + Math.cos(angle) * distance, y: this.currentSoldier.y + Math.sin(angle) * distance };
      }
      if (Phaser.Input.Keyboard.JustDown(this.enterKey) ||
          Phaser.Input.Keyboard.JustDown(this.gKey) || Phaser.Input.Keyboard.JustDown(this.bKey)) {
        this.confirmSpecial();
        return;
      }
      this.drawSpecialPreview();
      return;
    }

    if (this.isTunnelActionInProgress || this.isCoverActionInProgress) {
      this.currentSoldier.stopMoving();
      this.drawAimLine();
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

    // W/S rotates the local sight. Holding Shift enables deliberate fine adjustment.
    const aimDirection = Number(this.sKey.isDown) - Number(this.wKey.isDown);
    if (aimDirection !== 0) {
      const aimSpeed = this.shiftKey.isDown
        ? FINE_AIM_SPEED_DEG_PER_SEC
        : KEYBOARD_AIM_SPEED_DEG_PER_SEC;
      this.aimAngle = wrapDeg(this.aimAngle + aimDirection * aimSpeed * dt);
    }

    // Keep any placed weapon visuals in sync with the current aim.
    this.updateHowitzerVisual();

    // A charge must begin with a fresh gameplay keydown. This prevents the Space
    // used to select a soldier or skip the intro from firing when it is released.
    const keyboardChargeIntent = resolveKeyboardChargeInput({
      wasCharging: this.isCharging,
      keyIsDown: this.spaceKey.isDown,
      keyJustDown: Phaser.Input.Keyboard.JustDown(this.spaceKey),
      keyJustUp: Phaser.Input.Keyboard.JustUp(this.spaceKey),
      canCharge: !this.hasFired && !this.currentSoldier.isCurrentlyGrappling(),
      contextMatches:
        this.keyboardChargeTurnId === this.turnId &&
        this.keyboardChargeSoldier === this.currentSoldier,
    });

    if (keyboardChargeIntent.startCharge) {
      this.power = POWER_MIN;
      this.keyboardChargeTurnId = this.turnId;
      this.keyboardChargeSoldier = this.currentSoldier;
    }
    if (keyboardChargeIntent.continueCharge) {
      this.updateChargePower(dt);
    }

    this.isCharging = keyboardChargeIntent.nextCharging;
    if (keyboardChargeIntent.fireOnRelease) {
      this.keyboardChargeTurnId = 0;
      this.keyboardChargeSoldier = null;
      this.fireProjectile();
    } else if (!this.isCharging) {
      this.keyboardChargeTurnId = 0;
      this.keyboardChargeSoldier = null;
    }
    
    // Handle mouse charging (left mouse button held) - also check not grappling
    if (this.isMouseCharging && !this.hasFired && !this.currentSoldier.isCurrentlyGrappling()) {
      this.updateChargePower(dt);
    }

    // End turn manually (only after firing, and only once the shot is fully resolved).
    if (Phaser.Input.Keyboard.JustDown(this.enterKey) && this.hasFired && !this.isTurnEnding && !this.isShotResolving()) {
      this.endTurn();
    }

    if (Phaser.Input.Keyboard.JustDown(this.gKey) && !this.hasFired && !this.isCharging &&
        !this.isMouseCharging && !this.isHowitzerMode && !this.currentSoldier.isCurrentlyGrappling()) {
      this.beginSpecial(this.shiftKey.isDown ? 'jetpack' : 'grapple');
      return;
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
      } else if (Phaser.Input.Keyboard.JustDown(this.bKey)) {
        if (this.gameMode === 'expanded' && !this.shiftKey.isDown) {
          this.beginSpecial('dig');
        } else {
          this.beginSpecial('cover');
        }
      } else if (Phaser.Input.Keyboard.JustDown(this.hKey)) {
        this.tryMedicHeal();
      }
    }

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
        factionId: soldier.getFactionId(),
        portraitTextureKey: soldier.getPortraitTextureKey(),
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
    this.emitPowerupStatus(soldier);
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
    const previousPower = this.power;
    this.power = advanceChargePower(this.power, dt, POWER_CHARGE_PER_SECOND, POWER_MIN, 100);

    // Full power fires immediately, matching the committed timing of classic artillery controls.
    if (previousPower < 100 && this.power >= 100 && !this.hasFired) {
      this.fireProjectile();
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
    
    const muzzle = this.isHowitzerMode ? getMuzzle(startX, startY, this.aimAngle, 34, 34) : getMuzzle(startX, startY, this.aimAngle);
    let flight = createFlight(muzzle.x, muzzle.y, this.aimAngle, this.power, weaponConfig.projectileSpeed);
    const trajectoryPoints: { x: number; y: number }[] = [{ x: flight.x, y: flight.y }];
    const solid = (x: number, y: number): boolean => this.terrain.isPointSolid(x, y);
    const radius = this.isBulletWeapon(weaponConfig.type) ? 0 : weaponConfig.projectileSize / 2;
    const units = this.getLiveShotUnits();
    const isFlame = weaponConfig.type === WeaponType.FLAMER;
    if (isFlame) {
      const range = 100 + this.power;
      const endX = muzzle.x + Math.cos(angleRad) * range;
      const endY = muzzle.y + Math.sin(angleRad) * range;
      const hit = sweepTerrain(muzzle.x, muzzle.y, endX, endY, solid);
      trajectoryPoints.push(hit ? { x: hit.x, y: hit.y } : { x: endX, y: endY });
    }
    for (let i = 0; !isFlame && i < 10 / BALLISTIC_STEP; i++) {
      const previous = flight;
      const result = advanceFlight(flight, weaponConfig, solid, BALLISTIC_STEP, radius);
      flight = result.state;
      const hit = findFirstUnitIntercept(previous.x, previous.y, flight.x, flight.y, units,
        this.isBulletWeapon(weaponConfig.type) || previous.age < 0.4 ? this.currentSoldier : null, 18);
      trajectoryPoints.push(hit ? { x: hit.x, y: hit.y } : { x: flight.x, y: flight.y });
      if (hit || result.ended || flight.x < 0 || flight.x > this.worldWidth || flight.y > this.worldHeight - 2) break;
    }

    const lastTrajectoryPoint = trajectoryPoints.length > 0
      ? trajectoryPoints[trajectoryPoints.length - 1]
      : { x: startX, y: startY };
    const horizontalRange = Math.abs(lastTrajectoryPoint.x - startX);
    const aimAssist = getAimAssistProfile(horizontalRange, this.gameMode);
    
    // Operations mode becomes less exact with range; Basic retains the full solution.
    if (trajectoryPoints.length > 1) {
      const dotSpacing = 10;
      const dotSize = 3;
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
          
          const totalDist = accumulatedDistance + localDist;
          const alpha = Math.max(aimAssist.alphaFloor, 1 - totalDist / 1200);
          const dotIndex = Math.floor(totalDist / dotSpacing);
          const distanceToImpact = Phaser.Math.Distance.Between(
            dotX,
            dotY,
            lastTrajectoryPoint.x,
            lastTrajectoryPoint.y,
          );
          const hidesExactCenter = !aimAssist.exactImpact &&
            distanceToImpact < aimAssist.uncertaintyRadius * 1.65;

          if (dotIndex % aimAssist.dotStride === 0 && !hidesExactCenter) {
            this.aimLine.fillStyle(0xff3b2f, alpha * 0.95);
            this.aimLine.fillCircle(dotX, dotY, dotSize);

            this.aimLine.fillStyle(0xff8a70, alpha);
            this.aimLine.fillCircle(dotX, dotY, dotSize * 0.6);
          }
          
          localDist += dotSpacing;
        }
        accumulatedDistance += segmentDist;
      }
      
      // Distant Operations shots show a landing bracket rather than an exact center.
      if (trajectoryPoints.length > 2) {
        const lastPoint = lastTrajectoryPoint;

        if (aimAssist.exactImpact) {
          this.aimLine.lineStyle(2, 0xff3b2f, 0.8);
          this.aimLine.strokeCircle(lastPoint.x, lastPoint.y, 10);
          this.aimLine.lineBetween(lastPoint.x - 16, lastPoint.y, lastPoint.x + 16, lastPoint.y);
          this.aimLine.lineBetween(lastPoint.x, lastPoint.y - 16, lastPoint.x, lastPoint.y + 16);

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
            this.aimLine.lineStyle(2, 0xff9d38, 0.6);
            this.aimLine.strokeCircle(lastPoint.x, lastPoint.y, weaponConfig.explosionRadius);

            this.aimLine.fillStyle(0xff6d24, 0.1);
            this.aimLine.fillCircle(lastPoint.x, lastPoint.y, weaponConfig.explosionRadius);
          }
        } else {
          const radius = aimAssist.uncertaintyRadius;
          const corner = 8;
          this.aimLine.lineStyle(2, 0xffc45c, 0.82);
          this.aimLine.lineBetween(lastPoint.x - radius, lastPoint.y - radius, lastPoint.x - radius + corner, lastPoint.y - radius);
          this.aimLine.lineBetween(lastPoint.x - radius, lastPoint.y - radius, lastPoint.x - radius, lastPoint.y - radius + corner);
          this.aimLine.lineBetween(lastPoint.x + radius, lastPoint.y - radius, lastPoint.x + radius - corner, lastPoint.y - radius);
          this.aimLine.lineBetween(lastPoint.x + radius, lastPoint.y - radius, lastPoint.x + radius, lastPoint.y - radius + corner);
          this.aimLine.lineBetween(lastPoint.x - radius, lastPoint.y + radius, lastPoint.x - radius + corner, lastPoint.y + radius);
          this.aimLine.lineBetween(lastPoint.x - radius, lastPoint.y + radius, lastPoint.x - radius, lastPoint.y + radius - corner);
          this.aimLine.lineBetween(lastPoint.x + radius, lastPoint.y + radius, lastPoint.x + radius - corner, lastPoint.y + radius);
          this.aimLine.lineBetween(lastPoint.x + radius, lastPoint.y + radius, lastPoint.x + radius, lastPoint.y + radius - corner);
        }
      }
    }
    
    // The angle dial stays centered on the initiator, independent of camera scouting.
    const dialRadius = 42;
    this.aimLine.lineStyle(1, 0xe8e2cf, 0.34);
    this.aimLine.strokeCircle(startX, startY, dialRadius);
    for (let tick = 0; tick < 8; tick++) {
      const tickAngle = tick * Math.PI / 4;
      const inner = dialRadius - (tick % 2 === 0 ? 6 : 4);
      this.aimLine.lineBetween(
        startX + Math.cos(tickAngle) * inner,
        startY + Math.sin(tickAngle) * inner,
        startX + Math.cos(tickAngle) * dialRadius,
        startY + Math.sin(tickAngle) * dialRadius,
      );
    }

    const sightStart = 23;
    const sightEnd = 58;
    this.aimLine.lineStyle(3, 0xffd164, 0.96);
    this.aimLine.lineBetween(
      startX + Math.cos(angleRad) * sightStart,
      startY + Math.sin(angleRad) * sightStart,
      startX + Math.cos(angleRad) * sightEnd,
      startY + Math.sin(angleRad) * sightEnd,
    );
    this.aimLine.fillStyle(0xfff0b0, 1);
    this.aimLine.fillCircle(
      startX + Math.cos(angleRad) * sightEnd,
      startY + Math.sin(angleRad) * sightEnd,
      3,
    );

    const barWidth = 72;
    const barHeight = 5;
    const barX = startX - barWidth / 2;
    const barY = startY + 48;
    
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

    // Persistent readout keeps fine angle and power adjustments legible.
    const readout = getAimReadout(this.aimAngle);
    const estimateLabel = aimAssist.exactImpact ? '' : '  |  EST';
    this.aimPowerText.setText(
      `ANG ${readout.elevation.toFixed(1)} ${readout.direction}  |  PWR ${Math.round(this.power).toString().padStart(3, '0')}${estimateLabel}`,
    );
    const camera = this.cameras.main;
    const readoutHalfWidth = (this.aimPowerText.width / 2 + 6) / camera.zoom;
    const readoutX = Phaser.Math.Clamp(
      startX,
      camera.worldView.left + readoutHalfWidth,
      camera.worldView.right - readoutHalfWidth,
    );
    this.aimPowerText.setPosition(readoutX, barY + 10);
    this.aimPowerText.setVisible(true);
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
    SoundManager.pulseMusicIntensity(0.9, 2.4);
    
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
    this.emitPowerupStatus(shooter);

    this.hasFired = true;
    this.clearChargeState();

    // Stop following the soldier
    this.cameras.main.stopFollow();

    // Freeze angle/power at trigger time.
    const shotAngle = this.aimAngle;
    const shotPower = this.power;
    const angleRad = Phaser.Math.DegToRad(shotAngle);

    const origin = this.getAimOrigin() ?? { x: shooter.x, y: shooter.y - 10 };
    const muzzle = getMuzzle(origin.x, origin.y, shotAngle, 34, 34);
    const muzzleX = muzzle.x;
    const muzzleY = muzzle.y;

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
    this.emitPowerupStatus(shooter);

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

    const plane = this.createPlane(startX, planeY, facingRight, shooter.getFactionId());
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

  private tryDigIn(): boolean {
    if (!this.currentSoldier || this.hasFired) return false;
    const turnId = this.turnId;

    const soldier = this.currentSoldier;
    if (this.coverUsedThisTurn || this.isCoverActionInProgress) {
      soldier.sayQuip('tired');
      return false;
    }
    if (this.getMovementRemaining(soldier) < COVER_MOVEMENT_COST) {
      soldier.sayQuip('tired');
      return false;
    }

    const digX = soldier.x;
    const digY = soldier.y;

    const angleRad = Phaser.Math.DegToRad(this.aimAngle);
    const facing: -1 | 1 = Math.cos(angleRad) < 0 ? -1 : 1;

    // Compute ground at the soldier's feet (not the global "top surface" heightmap, which can be wrong in caves).
    // Also sample at the barrier X so the wall anchors correctly on slopes.
    const barrierX = digX + facing * 40;
    const footY = digY + 16;
    const soldierGroundY = this.terrain.findSurfaceYAtOrBelow(digX, footY - 6, 320) ?? this.terrain.getSurfaceY(digX);
    let groundY = this.terrain.findSurfaceYAtOrBelow(barrierX, footY - 6, 320);
    if (groundY === null || Math.abs(groundY - soldierGroundY) > 70) {
      // If the sample is missing (cliff edge) or wildly different (overhang/complex geometry), anchor to the soldier.
      groundY = soldierGroundY;
    }

    // Small dirt burst + hammering animation
    soldier.sayQuip('moving');
    this.coverUsedThisTurn = true;
    this.isCoverActionInProgress = true;
    this.movementUsed = Math.min(this.maxMovement, this.movementUsed + COVER_MOVEMENT_COST);
    this.lastMovementX = soldier.x;
    this.events.emit('movement-update', {
      movementUsed: Math.floor(this.movementUsed),
      maxMovement: this.maxMovement,
    });

    const digText = this.add.text(digX, digY - 70, 'BUILDING COVER', {
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

    // Quick shovel motion without displacing the physics body.
    this.tweens.add({
      targets: soldier.sprite,
      angle: facing * 4,
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
      this.isCoverActionInProgress = false;
      digText.setText('COVER READY');
    });

    return true;
  }

  private beginSpecial(tool: SpecialTool): void {
    if (!this.currentSoldier || this.hasFired) return;
    this.clearChargeState();
    this.currentSoldier.stopMoving();
    this.specialTool = tool;
    const angle = Phaser.Math.DegToRad(this.aimAngle);
    const range = tool === 'grapple' || tool === 'jetpack' ? 350 : 92;
    this.specialTarget = { x: this.currentSoldier.x + Math.cos(angle) * range, y: this.currentSoldier.y + Math.sin(angle) * range };
    this.specialLabel = this.add.text(this.scale.width / 2, this.scale.height - 108, '', {
      font: 'bold 15px Arial', color: '#aee5dc', stroke: '#142125', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(350);
    this.drawSpecialPreview();
  }

  private cancelSpecial(): void {
    this.specialTool = null;
    this.specialLabel?.destroy();
    this.specialLabel = null;
    this.aimLine?.clear();
  }

  private drawSpecialPreview(): void {
    const soldier = this.currentSoldier;
    if (!soldier || !this.specialTool) return;
    this.aimLine.clear();
    this.aimPowerText.setVisible(false);
    let end = this.specialTarget;
    let ready = true;
    if (this.specialTool === 'grapple' || this.specialTool === 'jetpack') {
      const hit = sweepTerrain(soldier.x, soldier.y - 16, end.x, end.y, (x, y) => this.terrain.isPointSolid(x, y));
      ready = Math.hypot(end.x - soldier.x, end.y - soldier.y) <= 400 && soldier.getRemainingGrapples() > 0 && (this.specialTool === 'jetpack' || !!hit);
      if (hit) end = hit;
    } else if (this.specialTool === 'dig') {
      const plan = getTunnelPlan(soldier.x, soldier.y, this.aimAngle, this.worldWidth);
      end = { x: plan.endX, y: plan.endY };
      ready = this.tunnelsUsedThisTurn < MAX_TUNNELS_PER_TURN && this.getMovementRemaining(soldier) >= TUNNEL_MOVEMENT_COST;
      this.aimLine.lineStyle(plan.radius * 2, ready ? 0x80cdb2 : 0xe77664, 0.2);
      this.aimLine.lineBetween(plan.startX, plan.startY, end.x, end.y);
    } else {
      const facing = end.x >= soldier.x ? 1 : -1;
      end = { x: soldier.x + facing * 40, y: soldier.y + 5 };
      ready = !this.coverUsedThisTurn && this.getMovementRemaining(soldier) >= COVER_MOVEMENT_COST;
      this.aimLine.lineStyle(3, 0xd6c59d, 0.8);
      this.aimLine.strokeRoundedRect(end.x - 29, end.y - 18, 58, 36, 4);
    }
    this.aimLine.lineStyle(2, ready ? 0x8de2cc : 0xef796d, 0.9);
    this.aimLine.lineBetween(soldier.x, soldier.y - 12, end.x, end.y);
    this.aimLine.strokeCircle(end.x, end.y, 8);
    this.specialLabel?.setText(`${this.specialTool.toUpperCase()} / ${ready ? 'READY' : 'UNAVAILABLE'}`);
  }

  private confirmSpecial(): void {
    const soldier = this.currentSoldier, tool = this.specialTool;
    if (!soldier || !tool || !soldier.isAlive() || this.hasFired) { this.cancelSpecial(); return; }
    const target = this.specialTarget;
    this.cancelSpecial();
    if (tool === 'dig') this.tryTunnel();
    else if (tool === 'cover') this.tryDigIn();
    else if (soldier.startGrapple(target.x, target.y, this.terrain, tool !== 'jetpack')) this.movementUsed = this.maxMovement;
  }

  private tryTunnel(): boolean {
    if (this.gameMode !== 'expanded' || !this.currentSoldier || this.hasFired) return false;
    if (this.isTunnelActionInProgress) return false;

    const soldier = this.currentSoldier;
    if (this.tunnelsUsedThisTurn >= MAX_TUNNELS_PER_TURN) {
      soldier.sayQuip('tired');
      return false;
    }
    if (this.getMovementRemaining(soldier) < TUNNEL_MOVEMENT_COST) {
      soldier.sayQuip('tired');
      return false;
    }

    const plan = getTunnelPlan(soldier.x, soldier.y, this.aimAngle, this.worldWidth);
    const hasGround = Array.from({ length: 13 }, (_, i) => {
      const t = i / 12;
      const x = plan.startX + (plan.endX - plan.startX) * t;
      const y = plan.startY + (plan.endY - plan.startY) * t;
      return [-12, 0, 12].some(offset => this.terrain.isPointSolid(x, y + offset));
    }).filter(Boolean).length >= 2;
    if (!hasGround) { soldier.sayQuip('blocked'); return false; }
    const turn = this.turnId;
    for (let stroke = 0; stroke < 3; stroke++) {
      this.time.delayedCall(stroke * 240, () => {
        if (turn !== this.turnId || this.currentSoldier !== soldier || !soldier.isAlive()) return;
        const a = stroke / 3, b = (stroke + 1) / 3;
        this.terrain.digTunnel(
          plan.startX + (plan.endX - plan.startX) * a, plan.startY + (plan.endY - plan.startY) * a,
          plan.startX + (plan.endX - plan.startX) * b, plan.startY + (plan.endY - plan.startY) * b, plan.radius);
        soldier.playActionAnimation('dig', plan.facing);
        SoundManager.playDig();
      });
    }

    this.isTunnelActionInProgress = true;
    this.tunnelsUsedThisTurn++;
    this.movementUsed = Math.min(this.maxMovement, this.movementUsed + TUNNEL_MOVEMENT_COST);
    soldier.stopMoving();
    soldier.sayQuip('tunneling');

    for (let i = 0; i < 16; i++) {
      const t = Math.random();
      const x = plan.startX + (plan.endX - plan.startX) * t;
      const y = plan.startY + (plan.endY - plan.startY) * t;
      const dirt = this.add.rectangle(
        x + (Math.random() - 0.5) * 16,
        y + (Math.random() - 0.5) * 12,
        3 + Math.random() * 4,
        3 + Math.random() * 3,
        Math.random() > 0.5 ? 0x8b653d : 0x59402a,
        0.9,
      );
      dirt.setDepth(165);
      this.tweens.add({
        targets: dirt,
        x: dirt.x - plan.facing * (10 + Math.random() * 24),
        y: dirt.y - (12 + Math.random() * 30),
        angle: Phaser.Math.Between(-90, 90),
        alpha: 0,
        duration: 420 + Math.random() * 280,
        ease: 'Quad.easeOut',
        onComplete: () => dirt.destroy(),
      });
    }

    this.showPowerupText(
      soldier.x,
      soldier.y - 72,
      `TUNNEL ${this.tunnelsUsedThisTurn}/${MAX_TUNNELS_PER_TURN}`,
      0xd8bd82,
    );

    this.time.delayedCall(900, () => {
      if (this.currentSoldier === soldier && soldier.isAlive()) {
        this.isTunnelActionInProgress = false;
        this.lastMovementX = soldier.x;
      }
    });

    return true;
  }

  private tryMedicHeal(): void {
    if (!this.currentSoldier || this.hasFired) return;
    if (this.currentSoldier.getWeaponType() !== WeaponType.PISTOL) return; // Medic class
    const turnId = this.turnId;

    const range = 150;
    const candidates = this.soldiers
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

    if (candidates.length === 0) return;

    this.hasFired = true;

    const target = candidates[0];
    this.currentSoldier.sayQuip('healing');
    this.currentSoldier.playActionAnimation('heal', this.currentSoldier.sprite.flipX ? -1 : 1);

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
    const isBulletImpact = shooter !== null;
    const blastExposure = new Map<Soldier, number>();
    this.soldiers.forEach(soldier => {
      if (!soldier.isAlive() || soldier === shooter) return;
      if (Phaser.Math.Distance.Between(x, y, soldier.x, soldier.y) >= radius) return;
      blastExposure.set(soldier, this.terrain.getBlastExposure(x, y, soldier.x, soldier.y - 6));
    });

    // Direct-fire rounds leave sparks and dust, not fresh craters or regenerated grass.
    if (shouldDeformTerrainOnImpact(radius, isBulletImpact)) {
      this.terrain.destroyCircle(x, y, radius);
    }
    if (radius >= 45) SoundManager.pulseMusicIntensity(0.95, 1.4);

    // Damage soldiers in radius. `shooter` is only set for bullet impacts, so their tiny
    // splash never harms the one who fired (big explosives still self-damage as usual).
    this.soldiers.forEach(soldier => {
      if (soldier === shooter) return;
      if (soldier.isAlive()) {
        const distance = Phaser.Math.Distance.Between(x, y, soldier.x, soldier.y);
        if (distance < radius) {
          const rawDamage = Math.round((1 - distance / radius) * baseDamage);
          const exposure = blastExposure.get(soldier) ?? 1;
          const damage = Math.round(rawDamage * exposure);
          soldier.takeDamage(damage);
          if (exposure < 1 && rawDamage - damage >= 2) {
            this.showCoverProtection(soldier, rawDamage - damage);
          }

          // Apply knockback (reduced for bullets)
          if (radius > 10) {
            const angle = Phaser.Math.Angle.Between(x, y, soldier.x, soldier.y);
            const strength = 1 - distance / radius;
            const knockback = strength * 230 * exposure;
            soldier.applyKnockback(
              Math.cos(angle) * knockback,
              Phaser.Math.Clamp((Math.sin(angle) * strength * 230 - strength * 45) * exposure, -140, 110)
            );
          }
        }
      }
    });

    if (radius >= 25) {
      const nearMiss = this.soldiers
        .filter(soldier => soldier.isAlive() && soldier !== shooter)
        .map(soldier => ({ soldier, distance: Phaser.Math.Distance.Between(x, y, soldier.x, soldier.y) }))
        .filter(entry => entry.distance >= radius && entry.distance <= radius + 72)
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearMiss && Math.random() < 0.72) nearMiss.soldier.sayQuip('nearMiss');
    }

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

    // Bullet hit radii describe hit forgiveness, not explosion size.
    if (isBulletImpact) {
      SoundManager.playBulletImpact();
      this.createBulletSparkEffect(x, y);
    } else if (radius > 15) {
      // Big explosion (rocket, mortar, grenade)
      if (radius >= 80) {
        SoundManager.playExplosion('large');
      } else {
        SoundManager.playExplosion('medium');
      }
      this.createExplosionEffect(x, y, radius);
    } else {
      // Small non-bullet explosive impact.
      SoundManager.playExplosion('small');

      this.createSmallImpactEffect(x, y, radius);
    }
  }

  private showCoverProtection(soldier: Soldier, blockedDamage: number): void {
    const text = this.add.text(soldier.x, soldier.y - 62, `COVER -${blockedDamage}`, {
      font: 'bold 13px Arial',
      color: '#bde8ff',
      stroke: '#071018',
      strokeThickness: 3,
    });
    text.setOrigin(0.5);
    text.setDepth(220);
    this.tweens.add({
      targets: text,
      y: text.y - 18,
      alpha: 0,
      duration: 850,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private handleSoldierDeath(fallen: Soldier): void {
    this.updateBattleMusicPhase();
    SoundManager.pulseMusicIntensity(0.84, 1.6);

    const witness = this.soldiers
      .filter(soldier => soldier.isAlive() && soldier.team === fallen.team && soldier !== fallen)
      .map(soldier => ({ soldier, distance: Phaser.Math.Distance.Between(soldier.x, soldier.y, fallen.x, fallen.y) }))
      .filter(entry => entry.distance <= 420)
      .sort((a, b) => a.distance - b.distance)[0];

    if (!witness) return;
    this.time.delayedCall(650, () => {
      if (witness.soldier.isAlive()) witness.soldier.sayQuip('allyDown');
    });
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
    playBattleExplosion(this, x, y, radius);
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

      if (Phaser.Math.Distance.Between(soldier.x, soldier.y, closestX, closestY) <= corridorRadius &&
          !sweepTerrain(startX, startY, soldier.x, soldier.y - 6, (x, y) => this.terrain.isPointSolid(x, y))) {
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

    const relayWinner = this.processRelayCaptures();

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
    this.aimAngle = -45;
    this.cameras.main.stopFollow();
    this.currentSoldier = null;
    this.emitPowerupStatus(null);

    // Check for game over
    const gameState = this.turnManager.checkGameOver();
    if (gameState.isOver) {
      this.events.emit('game-over', gameState.winner, 'elimination');
      return;
    }
    if (relayWinner) {
      this.events.emit('game-over', relayWinner, 'signal');
      return;
    }

    // Next turn - switch to other team
    const previousRound = this.turnManager.getTurnInfo().roundNumber;
    this.turnManager.nextTurn();
    const nextRound = this.turnManager.getTurnInfo().roundNumber;
    const relayIncomeWinner = nextRound > previousRound
      ? this.awardRelayIncome(nextRound)
      : null;
    if (relayIncomeWinner) {
      this.events.emit('game-over', relayIncomeWinner, 'signal');
      return;
    }

    // Occasionally drop something that can swing the fight (helps the losing side more often).
    this.maybeTriggerBalanceEvent();
    
    // Start character selection for next team
    this.time.delayedCall(500, () => {
      this.startCharacterSelection();
    });
  }

  private clearChargeState(): void {
    this.cancelSpecial();
    this.isCharging = false;
    this.isMouseCharging = false;
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

  private showWorldBanner(text: string, subtitle: string = 'Contest it to swing the fight'): void {
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

    const sub = this.add.text(cam.width / 2, 182, subtitle, {
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

    const factionId = favoredTeam === Team.RED
      ? this.factionMatchup.red
      : this.factionMatchup.blue;
    const plane = this.createPlane(startX, planeY, facingRight, factionId);
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

  private getSupplyDropPurpose(type: SupplyDropType): string {
    if (type === 'medkit') return 'INSTANT HEAL';
    if (type === 'artillery') return 'PRESS C TO USE';
    if (type === 'armor') return 'PASSIVE DEFENSE';
    if (type === 'munitions') return 'X + C CALL-INS';
    return 'PRESS X TO USE';
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

    const purpose = this.add.text(0, 31, this.getSupplyDropPurpose(type), {
      font: 'bold 7px Courier New',
      color: Phaser.Display.Color.IntegerToColor(glowColor).rgba,
      stroke: '#000000',
      strokeThickness: 2,
    });
    purpose.setOrigin(0.5, 0);
    crate.add(purpose);

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
    SoundManager.playSelect();
    soldier.sayQuip('supply');

    let title = '';
    let subtitle = '';
    let color = 0xffffff;

    if (type === 'medkit') {
      const amount = Phaser.Math.Between(25, 45);
      const healed = soldier.heal(amount);
      title = healed > 0 ? `MEDKIT +${healed} HP` : 'MEDKIT - HEALTH FULL';
      subtitle = 'APPLIED ON PICKUP';
      color = 0x44ff66;
    } else if (type === 'artillery') {
      soldier.addArtilleryCharges(1);
      title = 'HOWITZER READY';
      subtitle = 'PRESS C TO DEPLOY';
      color = 0xffaa00;
    } else if (type === 'armor') {
      soldier.addArmor(40);
      title = 'ARMOR +40';
      subtitle = 'PASSIVE: ABSORBS 65% OF DAMAGE';
      color = 0x66ccff;
    } else if (type === 'munitions') {
      soldier.addAirstrikeCharges(1);
      soldier.addArtilleryCharges(1);
      title = 'MUNITIONS CACHE';
      subtitle = 'X AIRSTRIKE + C HOWITZER';
      color = 0xff66cc;
    } else {
      soldier.addAirstrikeCharges(1);
      title = 'AIRSTRIKE READY';
      subtitle = 'PRESS X TO TARGET';
      color = 0x66ffff;
    }

    this.showPowerupText(x, y - 20, title, color, subtitle);
    this.emitPowerupStatus(soldier);
  }

  private showPowerupText(
    x: number,
    y: number,
    text: string,
    color: number,
    subtitle: string = '',
  ): void {
    const container = this.add.container(x, y);
    container.setDepth(250);
    const label = this.add.text(0, 0, text, {
      font: 'bold 16px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    });
    label.setOrigin(0.5);
    label.setShadow(0, 0, Phaser.Display.Color.IntegerToColor(color).rgba, 8, true, true);
    container.add(label);

    if (subtitle) {
      const detail = this.add.text(0, 19, subtitle, {
        font: 'bold 9px Courier New',
        color: Phaser.Display.Color.IntegerToColor(color).rgba,
        stroke: '#000000',
        strokeThickness: 3,
      });
      detail.setOrigin(0.5);
      container.add(detail);
    }

    this.tweens.add({
      targets: container,
      y: y - 55,
      alpha: 0,
      duration: subtitle ? 1900 : 1200,
      ease: 'Power2',
      onComplete: () => container.destroy(true),
    });
  }

  private emitPowerupStatus(soldier: Soldier | null = this.currentSoldier): void {
    this.events.emit('powerups-update', soldier ? {
      name: soldier.name,
      armor: soldier.getArmor(),
      airstrikeCharges: soldier.getAirstrikeCharges(),
      artilleryCharges: soldier.getArtilleryCharges(),
    } : null);
  }

  private isTeamAI(team: Team): boolean {
    return this.vsAI && team === Team.BLUE;
  }

  private chooseAISoldierForSelection(choices: Soldier[], team: Team): Soldier | null {
    if (choices.length === 0) return null;

    const enemies = this.soldiers.filter(s => s.isAlive() && s.team !== team);
    if (enemies.length === 0) return choices[0];

    // Favor useful engagement range, but activate crowded soldiers early so they
    // can spread out before the rest of the squad takes its turns.
    const teammates = this.soldiers.filter(
      soldier => soldier.isAlive() && soldier.team === team,
    );
    let best = choices[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const s of choices) {
      let nearest = Number.POSITIVE_INFINITY;
      for (const e of enemies) {
        const d = Phaser.Math.Distance.Between(s.x, s.y, e.x, e.y);
        if (d < nearest) nearest = d;
      }
      const congestion = teammates
        .filter(other => other !== s)
        .reduce((score, other) => {
          const gap = Phaser.Math.Distance.Between(s.x, s.y, other.x, other.y);
          return score + Math.max(0, 100 - gap);
        }, 0);
      const utilityReadiness =
        (s.getAirstrikeCharges() + s.getArtilleryCharges()) * 28;
      const tacticalScore = nearest - congestion * 0.35 - utilityReadiness;

      if (tacticalScore < bestScore) {
        bestScore = tacticalScore;
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
    if (soldier !== this.currentSoldier) return 0;
    return Math.max(0, this.maxMovement - this.movementUsed);
  }

  private getAISpacedDestinationX(
    soldier: Soldier,
    goalX: number,
    desiredMove: number,
    minimumSpacing: number = AI_FORMATION_SPACING,
  ): number {
    const direction = Math.sign(goalX - soldier.x) || 1;
    const preferredX = Phaser.Math.Clamp(
      soldier.x + direction * Math.max(0, desiredMove),
      28,
      this.worldWidth - 28,
    );
    const allyXs = this.soldiers
      .filter(ally => ally !== soldier && ally.isAlive() && ally.team === soldier.team)
      .map(ally => ally.x);

    return chooseSpacedDestinationX({
      originX: soldier.x,
      goalX,
      preferredX,
      worldWidth: this.worldWidth,
      squadIndex: soldier.squadIndex,
      allyXs,
      minimumSpacing,
    });
  }

  private hasAITunnelObstruction(soldier: Soldier, goalX: number): boolean {
    const direction = Math.sign(goalX - soldier.x) || 1;
    const probeDistances = [18, 28, 40, 54];
    const probeHeights = [-12, -2, 9];

    return probeDistances.some(distance =>
      probeHeights.some(offsetY =>
        this.terrain.isPointSolid(
          soldier.x + direction * distance,
          soldier.y + offsetY,
        )
      )
    );
  }

  private isAIBodyClear(x: number, y: number): boolean {
    const xOffsets = [-7, 0, 7];
    const yOffsets = [-18, -9, 1, 13];
    return xOffsets.every(offsetX =>
      yOffsets.every(offsetY =>
        !this.terrain.isPointSolid(x + offsetX, y + offsetY)
      )
    );
  }

  private getAIWalkableSurfaceYs(x: number): number[] {
    const surfaces: number[] = [];
    for (let y = 26; y < this.worldHeight - 4; y++) {
      if (
        this.terrain.isPointSolid(x, y) &&
        !this.terrain.isPointSolid(x, y - 1)
      ) {
        const soldierY = y - 16;
        if (this.isAIBodyClear(x, soldierY)) {
          surfaces.push(y);
        }
      }
    }
    return surfaces;
  }

  private findAIGrappleDestination(
    soldier: Soldier,
    goalX: number,
  ): AIGrappleCandidate | null {
    if (soldier.getRemainingGrapples() <= 0) return null;

    const direction = Math.sign(goalX - soldier.x) || 1;
    const candidates: AIGrappleCandidate[] = [];
    const distances = [100, 150, 210, 270, 330];

    for (const distance of distances) {
      const x = Phaser.Math.Clamp(
        soldier.x + direction * distance,
        26,
        this.worldWidth - 26,
      );

      for (const surfaceY of this.getAIWalkableSurfaceYs(x)) {
        const y = surfaceY - 16;
        const pathClear = !this.isLineBlockedByTerrain(
          soldier.x,
          soldier.y - 5,
          x,
          y - 5,
          3,
        );
        candidates.push({
          x,
          y,
          pathClear,
          bodyClear: this.isAIBodyClear(x, y),
          stableLanding: true,
        });
      }

      // An open point over a nearby floor lets the hook vault a crater or low wall.
      const airY = Phaser.Math.Clamp(soldier.y - 78, 48, this.worldHeight - 80);
      const floorBelow = this.terrain.findSurfaceYAtOrBelow(x, airY + 16, 190);
      if (floorBelow !== null) {
        candidates.push({
          x,
          y: airY,
          pathClear: !this.isLineBlockedByTerrain(
            soldier.x,
            soldier.y - 5,
            x,
            airY - 5,
            3,
          ),
          bodyClear: this.isAIBodyClear(x, airY),
          stableLanding: false,
        });
      }
    }

    const allyXs = this.soldiers
      .filter(ally => ally !== soldier && ally.isAlive() && ally.team === soldier.team)
      .map(ally => ally.x);

    return chooseAIGrappleDestination({
      originX: soldier.x,
      originY: soldier.y,
      goalX,
      worldWidth: this.worldWidth,
      allyXs,
      candidates,
    });
  }

  private aiMoveTowardX(
    token: number,
    soldier: Soldier,
    targetX: number,
    desiredMove: number,
    onDone: (outcome: AIMoveOutcome) => void,
  ): void {
    if (token !== this.aiTurnToken) return;
    if (this.currentSoldier !== soldier) return;
    if (!soldier.isAlive()) return;
    if (this.hasFired || this.isTurnEnding) return;

    const remaining = this.getMovementRemaining(soldier);
    const moveDist = Math.min(Math.max(0, desiredMove), remaining);
    if (moveDist < 6) {
      onDone({
        reason: remaining < 6 ? 'budget' : 'goal',
        distanceMoved: 0,
        requestedDistance: moveDist,
      });
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

    const finish = (reason: AIMoveStopReason): void => {
      if (done) return;
      done = true;
      soldier.stopMoving();
      const outcome: AIMoveOutcome = {
        reason,
        distanceMoved: Math.abs(soldier.x - legStartX),
        requestedDistance: moveDist,
      };
      this.time.delayedCall(220, () => {
        if (token !== this.aiTurnToken) return;
        if (this.currentSoldier !== soldier) return;
        if (!soldier.isAlive()) return;
        if (this.hasFired || this.isTurnEnding) return;
        onDone(outcome);
      });
    };

    const tick = this.time.addEvent({
      delay: 60,
      loop: true,
      callback: () => {
        if (done) return;

        if (token !== this.aiTurnToken) {
          tick.destroy();
          finish('cancelled');
          return;
        }
        if (this.currentSoldier !== soldier) {
          tick.destroy();
          finish('cancelled');
          return;
        }
        if (!soldier.isAlive() || this.hasFired || this.isTurnEnding) {
          tick.destroy();
          finish('cancelled');
          return;
        }

        const movedLeg = Math.abs(soldier.x - legStartX);

        const reachedLeg =
          movedLeg >= moveDist - 2 ||
          (dir > 0 ? soldier.x >= legGoalX : soldier.x <= legGoalX);
        const reachedTurn = this.getMovementRemaining(soldier) <= 2;
        const nearBounds = soldier.x < 20 || soldier.x > this.worldWidth - 20;

        // Probe the ground ahead — high-mobility AI units used to sprint straight
        // off cliffs and bottomless craters, dying without ever taking a shot.
        const aheadX = soldier.x + dir * 34;
        const cliffAhead = this.terrain.findSurfaceYAtOrBelow(aheadX, soldier.y - 4, 300) === null;

        if (Math.abs(soldier.x - lastX) < 0.5) stuckTicks++;
        else stuckTicks = 0;
        lastX = soldier.x;

        let stopReason: AIMoveStopReason | null = null;
        if (reachedLeg) stopReason = 'goal';
        else if (reachedTurn) stopReason = 'budget';
        else if (nearBounds) stopReason = 'bounds';
        else if (cliffAhead) stopReason = 'cliff';
        else if (stuckTicks >= 8) stopReason = 'blocked';

        if (stopReason) {
          tick.destroy();
          finish(stopReason);
        }
      },
    });

    // Safety timeout: stop even if the timer misses a condition.
    this.time.delayedCall(1800, () => {
      if (done) return;
      tick.destroy();
      const moved = Math.abs(soldier.x - legStartX);
      finish(moved >= moveDist * 0.85 ? 'goal' : 'timeout');
    });
  }

  private aiNavigateTowardX(
    token: number,
    soldier: Soldier,
    goalX: number,
    destinationX: number,
    onDone: () => void,
    recoveryCount: number = 0,
  ): void {
    const requestedDistance = Math.abs(destinationX - soldier.x);
    this.aiMoveTowardX(
      token,
      soldier,
      destinationX,
      requestedDistance,
      outcome => {
        if (token !== this.aiTurnToken) return;
        if (this.currentSoldier !== soldier || !soldier.isAlive()) return;
        if (this.hasFired || this.isTurnEnding) return;

        if (
          recoveryCount >= AI_MAX_NAVIGATION_RECOVERIES ||
          outcome.reason === 'goal' ||
          outcome.reason === 'budget' ||
          outcome.reason === 'bounds' ||
          outcome.reason === 'cancelled'
        ) {
          onDone();
          return;
        }

        const grappleDestination = this.findAIGrappleDestination(soldier, goalX);
        const canTunnel = this.hasAITunnelObstruction(soldier, goalX);
        const recovery = chooseAIRecoveryAction({
          reason: outcome.reason,
          distanceMoved: outcome.distanceMoved,
          requestedDistance: outcome.requestedDistance,
          expandedMode: this.gameMode === 'expanded',
          movementRemaining: this.getMovementRemaining(soldier),
          tunnelMovementCost: TUNNEL_MOVEMENT_COST,
          tunnelsRemaining: MAX_TUNNELS_PER_TURN - this.tunnelsUsedThisTurn,
          canTunnel,
          grapplesRemaining: soldier.getRemainingGrapples(),
          hasGrappleDestination: grappleDestination !== null,
        });

        let shouldGrapple = recovery === 'grapple';
        if (recovery === 'tunnel') {
          this.aimAngle = goalX >= soldier.x ? 0 : 180;
          if (this.tryTunnel()) {
            this.time.delayedCall(700, () => {
              if (token !== this.aiTurnToken) return;
              if (this.currentSoldier !== soldier || !soldier.isAlive()) return;
              if (this.hasFired || this.isTurnEnding) return;
              this.aiNavigateTowardX(
                token,
                soldier,
                goalX,
                destinationX,
                onDone,
                recoveryCount + 1,
              );
            });
            return;
          }
          shouldGrapple = true;
        }

        if (
          shouldGrapple &&
          grappleDestination &&
          soldier.getRemainingGrapples() > 0 &&
          soldier.startGrapple(
            grappleDestination.x,
            grappleDestination.y,
            this.terrain,
            false,
          )
        ) {
          this.movementUsed = this.maxMovement;
          this.events.emit('movement-update', {
            movementUsed: Math.floor(this.movementUsed),
            maxMovement: this.maxMovement,
          });
          this.time.delayedCall(760, () => {
            if (token !== this.aiTurnToken) return;
            if (this.currentSoldier !== soldier || !soldier.isAlive()) return;
            if (this.hasFired || this.isTurnEnding) return;
            onDone();
          });
          return;
        }

        onDone();
      },
    );
  }

  private tryAIUseAirstrike(
    shooter: Soldier,
    enemies: Soldier[],
    useForBlockedTarget: boolean,
  ): boolean {
    if (shooter.getAirstrikeCharges() <= 0) return false;

    const plan = chooseAIAreaStrikeTargetX(
      this.soldiers
        .filter(soldier => soldier.isAlive())
        .map(soldier => ({
          x: soldier.x,
          allegiance: soldier.team === shooter.team
            ? 'friendly' as const
            : 'enemy' as const,
        })),
      this.worldWidth,
    );
    if (!plan || plan.friendlyHits > 0) return false;

    const clusteredTarget = plan.enemyHits >= 2 && plan.score >= 4;
    const blockedFallback =
      useForBlockedTarget &&
      plan.enemyHits >= 1 &&
      plan.score >= 2 &&
      enemies.length > 0;
    if (!clusteredTarget && !blockedFallback) return false;

    shooter.sayQuip('supply');
    this.callAirstrikeAt(plan.x);
    return this.hasFired;
  }

  private tryAIUseHowitzer(
    token: number,
    shooter: Soldier,
    enemies: Soldier[],
    preferredTarget: Soldier,
    useForBlockedTarget: boolean,
  ): boolean {
    if (shooter.getArtilleryCharges() <= 0) return false;

    const targetDistance = Phaser.Math.Distance.Between(
      shooter.x,
      shooter.y,
      preferredTarget.x,
      preferredTarget.y,
    );
    if (!useForBlockedTarget && targetDistance < 520) return false;

    const plan = this.chooseAIShotPlan(
      shooter,
      enemies,
      preferredTarget,
      HOWITZER_CONFIG,
    );
    if (!plan) return false;

    this.enterHowitzerMode();
    if (!this.isHowitzerMode) return false;

    this.aimAngle = plan.angle;
    this.power = plan.power;
    this.drawAimLine();
    shooter.sayQuip('supply');

    this.time.delayedCall(650, () => {
      if (token !== this.aiTurnToken) return;
      if (this.currentSoldier !== shooter || !shooter.isAlive()) return;
      if (this.hasFired || this.isTurnEnding || !this.isHowitzerMode) return;
      this.fireProjectile();
    });
    return true;
  }

  private tryAIBuildCover(
    token: number,
    shooter: Soldier,
    threat: Soldier,
    onDone: () => void,
  ): boolean {
    if (shooter.getHealth() > 52) return false;
    if (this.coverUsedThisTurn || this.isCoverActionInProgress) return false;
    if (this.getMovementRemaining(shooter) < COVER_MOVEMENT_COST) return false;

    // A barrier inside a narrow cave would worsen the congestion it is meant to solve.
    const topSurfaceY = this.terrain.getSurfaceY(shooter.x);
    if (shooter.y > topSurfaceY + 56) return false;

    const threatDistance = Phaser.Math.Distance.Between(
      shooter.x,
      shooter.y,
      threat.x,
      threat.y,
    );
    if (threatDistance < 150 || threatDistance > 760) return false;

    this.aimAngle = Phaser.Math.RadToDeg(
      Math.atan2(threat.y - shooter.y, threat.x - shooter.x),
    );
    if (!this.tryDigIn()) return false;

    this.time.delayedCall(560, () => {
      if (token !== this.aiTurnToken) return;
      if (this.currentSoldier !== shooter || !shooter.isAlive()) return;
      if (this.hasFired || this.isTurnEnding) return;
      onDone();
    });
    return true;
  }

  private chooseAISupplyDrop(shooter: Soldier): SupplyDrop | null {
    let best: SupplyDrop | null = null;
    let bestScore = 35;

    for (const drop of this.supplyDrops) {
      if (!drop.landed || drop.collected || !drop.crate.active) continue;

      const distance = Phaser.Math.Distance.Between(
        shooter.x,
        shooter.y,
        drop.crate.x,
        drop.crate.y,
      );
      if (distance > 380) continue;

      let value = 0;
      if (drop.type === 'medkit') {
        value = shooter.getHealth() < 70 ? 170 - shooter.getHealth() : 0;
      } else if (drop.type === 'armor') {
        value = shooter.getArmor() < 35 ? 115 - shooter.getArmor() : 0;
      } else if (drop.type === 'airstrike') {
        value = shooter.getAirstrikeCharges() === 0 ? 115 : 65;
      } else if (drop.type === 'artillery') {
        value = shooter.getArtilleryCharges() === 0 ? 115 : 65;
      } else {
        value =
          shooter.getAirstrikeCharges() + shooter.getArtilleryCharges() === 0
            ? 145
            : 85;
      }

      const score = value - distance * 0.22;
      if (score > bestScore) {
        bestScore = score;
        best = drop;
      }
    }

    return best;
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

    const aimAndFire = (
      preferredTarget: Soldier,
      allowTerrainAction: boolean = true,
    ): void => {
      if (token !== this.aiTurnToken) return;
      if (!this.currentSoldier || this.currentSoldier !== shooter || !shooter.isAlive()) return;
      if (!this.isTeamAI(shooter.team)) return;
      if (this.hasFired || this.isTurnEnding) return;

      const currentEnemies = this.soldiers.filter(s => s.isAlive() && s.team !== shooter.team);
      const plan = this.chooseAIShotPlan(shooter, currentEnemies, preferredTarget);
      if (!plan) {
        const canOpenLane =
          allowTerrainAction &&
          this.gameMode === 'expanded' &&
          this.getMovementRemaining(shooter) >= TUNNEL_MOVEMENT_COST &&
          this.hasAITunnelObstruction(shooter, preferredTarget.x);
        if (canOpenLane) {
          this.aimAngle = preferredTarget.x >= shooter.x ? 0 : 180;
          if (this.tryTunnel()) {
            this.time.delayedCall(700, () => {
              if (token !== this.aiTurnToken) return;
              if (this.currentSoldier !== shooter || !shooter.isAlive()) return;
              if (this.hasFired || this.isTurnEnding) return;
              aimAndFire(preferredTarget, false);
            });
            return;
          }
        }
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
      const hasBlockedDirectTarget =
        losPreferred &&
        visibleEnemies.length === 0;

      if (this.tryAIUseAirstrike(shooter, liveEnemies, hasBlockedDirectTarget)) {
        return;
      }
      if (
        this.tryAIUseHowitzer(
          token,
          shooter,
          liveEnemies,
          target,
          hasBlockedDirectTarget,
        )
      ) {
        return;
      }
      if (this.tryAIBuildCover(token, shooter, target, attack)) {
        return;
      }

      let desiredMove = 0;
      if (weaponType === WeaponType.FLAMER) {
        const desiredRange = 185;
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
        const destinationX = this.getAISpacedDestinationX(
          shooter,
          target.x,
          desiredMove,
        );
        this.aiNavigateTowardX(token, shooter, target.x, destinationX, () => {
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

    const supplyTarget = this.chooseAISupplyDrop(shooter);
    if (supplyTarget && this.getMovementRemaining(shooter) > 30) {
      const horizontalDistance = Math.abs(supplyTarget.crate.x - shooter.x);
      const desired = Math.min(
        this.getMovementRemaining(shooter),
        Math.max(36, horizontalDistance - 18),
      );
      const direction = Math.sign(supplyTarget.crate.x - shooter.x) || 1;
      const destinationX = Phaser.Math.Clamp(
        shooter.x + direction * desired,
        28,
        this.worldWidth - 28,
      );
      this.aiNavigateTowardX(
        token,
        shooter,
        supplyTarget.crate.x,
        destinationX,
        () => {
          if (token !== this.aiTurnToken) return;
          if (this.currentSoldier !== shooter || !shooter.isAlive()) return;
          if (this.hasFired || this.isTurnEnding) return;
          attack();
        },
      );
      return;
    }

    // In Operations mode the AI will sometimes trade its shot for signal control.
    if (this.gameMode === 'expanded' && this.relayObjectives.length > 0) {
      const relayTarget = [...this.relayObjectives]
        .filter(relay => relay.owner !== team)
        .sort((a, b) =>
          Phaser.Math.Distance.Between(shooter.x, shooter.y, a.x, a.y) -
          Phaser.Math.Distance.Between(shooter.x, shooter.y, b.x, b.y)
        )[0];

      if (relayTarget) {
        const relayDistance = Phaser.Math.Distance.Between(shooter.x, shooter.y, relayTarget.x, relayTarget.y);
        if (relayDistance <= RELAY_CAPTURE_RADIUS) {
          shooter.sayQuip('objective');
          this.time.delayedCall(500, () => {
            if (token === this.aiTurnToken && !this.isTurnEnding) this.endTurn();
          });
          return;
        }

        const remaining = this.getMovementRemaining(shooter);
        const shouldContest = relayTarget.owner !== 'neutral' || Math.random() < 0.55;
        if (shouldContest && remaining > 40) {
          const desired = Math.min(remaining, Math.max(48, relayDistance - RELAY_CAPTURE_RADIUS + 10));
          const spacedX = this.getAISpacedDestinationX(
            shooter,
            relayTarget.x,
            desired,
            52,
          );
          const destinationX = Phaser.Math.Clamp(
            spacedX,
            relayTarget.x - RELAY_CAPTURE_RADIUS + 8,
            relayTarget.x + RELAY_CAPTURE_RADIUS - 8,
          );
          this.aiNavigateTowardX(token, shooter, relayTarget.x, destinationX, () => {
            if (token !== this.aiTurnToken || this.currentSoldier !== shooter || this.isTurnEnding) return;
            const nowNear = Phaser.Math.Distance.Between(shooter.x, shooter.y, relayTarget.x, relayTarget.y) <= RELAY_CAPTURE_RADIUS;
            if (nowNear) {
              shooter.sayQuip('objective');
              this.time.delayedCall(350, () => {
                if (token === this.aiTurnToken && !this.isTurnEnding) this.endTurn();
              });
            } else {
              attack();
            }
          });
          return;
        }
      }
    }

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
          const destinationX = this.getAISpacedDestinationX(
            shooter,
            healTarget.x,
            desired,
            58,
          );
          this.aiNavigateTowardX(token, shooter, healTarget.x, destinationX, () => {
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

  private chooseAIShotPlan(
    shooter: Soldier,
    enemies: Soldier[],
    preferredTarget?: Soldier,
    weapon: WeaponConfig = shooter.weapon,
  ): AIShotPlan | null {
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
      const shot = this.computeBestShot(shooter, target, weapon);
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

    return best && best.score <= AI_MAX_ACCEPTABLE_SHOT_SCORE ? best : null;
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

  private computeBestShot(
    shooter: Soldier,
    target: Soldier,
    weapon: WeaponConfig = shooter.weapon,
  ): { angle: number; power: number; score: number } {
    const startX = shooter.x;
    const startY = shooter.y - 10;
    const targetX = target.x;
    const targetY = target.y - 10;
    const shotUnits = this.getLiveShotUnits();

    const dx = targetX - startX;
    const dy = targetY - startY;
    const directAngle = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
    const dist = Phaser.Math.Distance.Between(startX, startY, targetX, targetY);

    // Flamethrower: short range, mostly direct.
    if (weapon.type === WeaponType.FLAMER) {
      const clampedDist = Phaser.Math.Clamp(dist, 80, 200);
      const power = Phaser.Math.Clamp((clampedDist - 100), 10, 100);
      const flameRange = 100 + power;
      const directAngleRad = Phaser.Math.DegToRad(directAngle);
      const launchX = startX + Math.cos(directAngleRad) * 20;
      const launchY = startY + Math.sin(directAngleRad) * 10;
      const endX = launchX + Math.cos(directAngleRad) * flameRange;
      const endY = launchY + Math.sin(directAngleRad) * flameRange;
      const targetIntercept = findFirstUnitIntercept(
        launchX,
        launchY,
        endX,
        endY,
        shotUnits.filter(unit => unit.value === target),
        shooter,
        25,
      );
      const friendlyInCorridor = shotUnits.some(unit =>
        unit.team === shooter.team &&
        unit.value !== shooter &&
        findFirstUnitIntercept(launchX, launchY, endX, endY, [unit], shooter, 25) !== null
      );

      let score = targetIntercept ? -60 : 1200 + Math.max(0, dist - flameRange) * 8;
      if (this.isLineBlockedByTerrain(launchX, launchY, endX, endY, 4)) score += 2200;
      if (friendlyInCorridor) score += AI_FRIENDLY_FIRE_PENALTY;
      return { angle: directAngle, power, score };
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
        const evalRes = this.evaluateShot(
          shooter,
          startX,
          startY,
          angle,
          power,
          weapon,
          targetX,
          targetY,
          shotUnits,
        );
        let tacticalScore = this.scoreAIShotResult(shooter, target, weapon, evalRes);
        if (
          isBullet &&
          this.hasFriendlyInSpreadCorridor(
            shooter,
            angle,
            dist + 100,
            weapon.spreadAngle,
            shotUnits,
          )
        ) {
          tacticalScore += AI_FRIENDLY_FIRE_PENALTY;
        }
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

    if (!Number.isFinite(bestScore)) {
      return { angle: bestAngle, power: bestPower, score: Number.POSITIVE_INFINITY };
    }

    // Keep a small human-looking variance only when the perturbed shot remains safe.
    const jitterAngle = Phaser.Math.FloatBetween(-2.5, 2.5);
    const jitterPower = Phaser.Math.FloatBetween(-4, 4);
    const candidateAngle = Phaser.Math.Clamp(bestAngle + jitterAngle, -180, 180);
    const candidatePower = Phaser.Math.Clamp(bestPower + jitterPower, minPower, maxPower);
    const jitterEval = this.evaluateShot(
      shooter,
      startX,
      startY,
      candidateAngle,
      candidatePower,
      weapon,
      targetX,
      targetY,
      shotUnits,
    );
    let jitterScore = this.scoreAIShotResult(shooter, target, weapon, jitterEval);
    if (
      isBullet &&
      this.hasFriendlyInSpreadCorridor(
        shooter,
        candidateAngle,
        dist + 100,
        weapon.spreadAngle,
        shotUnits,
      )
    ) {
      jitterScore += AI_FRIENDLY_FIRE_PENALTY;
    }

    if (
      jitterScore <= AI_MAX_ACCEPTABLE_SHOT_SCORE &&
      jitterScore <= bestScore + 24
    ) {
      return {
        angle: candidateAngle,
        power: candidatePower,
        score: jitterScore,
      };
    }

    return { angle: bestAngle, power: bestPower, score: bestScore };
  }

  private getLiveShotUnits(): ShotUnit<Soldier, Team>[] {
    return this.soldiers
      .filter(soldier => soldier.isAlive())
      .map(soldier => ({
        value: soldier,
        x: soldier.x,
        y: soldier.y,
        team: soldier.team,
      }));
  }

  private hasFriendlyInSpreadCorridor(
    shooter: Soldier,
    angleDeg: number,
    maxDistance: number,
    spreadAngleDeg: number,
    shotUnits: readonly ShotUnit<Soldier, Team>[],
  ): boolean {
    if (spreadAngleDeg <= 0) return false;

    const angleRad = Phaser.Math.DegToRad(angleDeg);
    const launchX = shooter.x + Math.cos(angleRad) * 20;
    const launchY = shooter.y - 10 + Math.sin(angleRad) * 10;
    const dirX = Math.cos(angleRad);
    const dirY = Math.sin(angleRad);
    const spreadSlope = Math.tan(Phaser.Math.DegToRad(spreadAngleDeg));

    return shotUnits.some(unit => {
      if (unit.value === shooter || unit.team !== shooter.team) return false;
      const dx = unit.x - launchX;
      const dy = unit.y - launchY;
      const along = dx * dirX + dy * dirY;
      if (along <= 0 || along > maxDistance) return false;

      const perpendicular = Math.abs(dx * dirY - dy * dirX);
      return perpendicular <= 18 + along * spreadSlope;
    });
  }

  private evaluateShot(
    shooter: Soldier, startX: number, startY: number, angleDeg: number, power: number,
    weapon: WeaponConfig, targetX: number, targetY: number, shotUnits: readonly ShotUnit<Soldier, Team>[],
  ): AIShotEvaluation {
    const cannonY = weapon === HOWITZER_CONFIG
      ? (this.terrain.findSurfaceYAtOrBelow(shooter.x, shooter.y + 8, 320) ?? this.terrain.getSurfaceY(shooter.x)) - 12
      : startY;
    const muzzle = weapon === HOWITZER_CONFIG ? getMuzzle(startX, cannonY, angleDeg, 34, 34) : getMuzzle(startX, startY, angleDeg);
    const launchX = muzzle.x;
    let flight = createFlight(muzzle.x, muzzle.y, angleDeg, power, weapon.projectileSpeed);
    const isBullet = this.isBulletWeapon(weapon.type);
    const solid = (x: number, y: number): boolean => this.terrain.isPointSolid(x, y);
    let minDist = Number.POSITIVE_INFINITY;
    let impactX: number | null = null;
    let impactY: number | null = null;
    let interceptedSoldier: Soldier | null = null;
    let terrainProgress: number | null = null;
    for (let i = 0; i < 10 / BALLISTIC_STEP; i++) {
      const previous = flight;
      const result = advanceFlight(flight, weapon, solid, BALLISTIC_STEP, isBullet ? 0 : weapon.projectileSize / 2);
      flight = result.state;
      if (flight.x < 0 || flight.x > this.worldWidth || flight.y > this.worldHeight) break;
      minDist = Math.min(minDist, Math.hypot(flight.x - targetX, flight.y - targetY));
      const unitHit = findFirstUnitIntercept(previous.x, previous.y, flight.x, flight.y, shotUnits,
        isBullet || previous.age < 0.4 ? shooter : null, 18);
      if (unitHit) {
        impactX = unitHit.x;
        impactY = unitHit.y;
        interceptedSoldier = unitHit.unit.value;
        minDist = Math.min(minDist, Math.hypot(unitHit.x - targetX, unitHit.y - targetY));
        break;
      }
      if (result.ended) {
        impactX = flight.x;
        impactY = flight.y;
        terrainProgress = getHorizontalShotProgress(launchX, targetX, flight.x);
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

    return {
      score,
      minDist,
      impactX,
      impactY,
      interceptedSoldier,
      terrainProgress,
    };
  }

  private scoreAIShotResult(
    shooter: Soldier,
    target: Soldier,
    weapon: WeaponConfig,
    evalRes: AIShotEvaluation
  ): number {
    let score = evalRes.score;

    if (evalRes.interceptedSoldier) {
      if (evalRes.interceptedSoldier.team === shooter.team) {
        score += AI_FRIENDLY_FIRE_PENALTY;
      } else {
        score -= evalRes.interceptedSoldier === target ? 170 : 75;
      }
    }

    if (evalRes.terrainProgress !== null) {
      score += getTerrainObstructionPenalty(evalRes.terrainProgress, evalRes.score);
      if (this.isBulletWeapon(weapon.type) && evalRes.score > 22) {
        score += 900 + evalRes.score * 2;
      }
    }

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
      if (expectedFriendlyDamage > 0) {
        score += 1500 + expectedFriendlyDamage * 7;
      }
    } else if (this.isBulletWeapon(weapon.type)) {
      const healthPressure = Math.max(0, 100 - target.getHealth()) * 0.08;
      score -= healthPressure;

      if (evalRes.minDist <= 16) {
        score -= Math.min(50, weapon.damage * Math.max(1, Math.min(weapon.pelletCount, 12)) * 0.18);
        if (weapon.damage >= target.getHealth()) score -= 35;
      }
    }

    if (
      evalRes.impactX === null &&
      evalRes.interceptedSoldier === null &&
      evalRes.minDist > Math.max(24, weapon.explosionRadius * 0.8)
    ) {
      score += 400;
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

  private handleBulletNearMiss(x0: number, y0: number, x1: number, y1: number, shooter: Soldier): void {
    if (this.gameMode !== 'expanded') return;
    const dx = x1 - x0, dy = y1 - y0;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq < 0.01) return;
    for (const soldier of this.soldiers) {
      if (!soldier.isAlive() || soldier.team === shooter.team) continue;
      const t = Phaser.Math.Clamp(((soldier.x - x0) * dx + (soldier.y - y0) * dy) / lengthSq, 0, 1);
      const x = x0 + dx * t, y = y0 + dy * t;
      const distance = Math.hypot(soldier.x - x, soldier.y - y);
      if (distance > 18 && distance < 48 && !sweepTerrain(x, y, soldier.x, soldier.y - 6, (px, py) => this.terrain.isPointSolid(px, py))) {
        soldier.applySuppression();
      }
    }
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
    const hit = findFirstUnitIntercept(
      lastX,
      lastY,
      currentX,
      currentY,
      this.getLiveShotUnits(),
      excludedSoldier,
      18,
    );
    if (!hit) return;

    const soldier = hit.unit.value;
    const dx = currentX - lastX;
    const dy = currentY - lastY;
    if (isBullet) {
      soldier.takeDamage(damage);
      const angle = Math.atan2(dy || 0.001, dx || 0.001);
      soldier.applyKnockback(
        Math.cos(angle) * 24,
        Math.sin(angle) * 18 - 14
      );
      this.createBulletHitEffect(hit.x, hit.y);
    }

    onHit(hit.x, hit.y);
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
