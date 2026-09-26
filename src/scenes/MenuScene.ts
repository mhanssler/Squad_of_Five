import Phaser from 'phaser';
import { fitScreenCamera } from '../utils/Resolution';
import { SoundManager } from '../utils/SoundManager';
import { GameMode, getModeLabel } from '../systems/GameRules';
import {
  findNextAvailableClassIndex,
  getAvailableClassIds,
  isClassAvailableOnMap,
} from '../systems/SquadRules';
import { getClassStats, type ClassStats } from '../systems/ClassStats';
import { WeaponType } from '../systems/WeaponTypes';
import { isTouchUI } from '../utils/TouchSupport';
import {
  getMapPixelWidth,
  getMapPreviewRect,
  getMenuClassGridPosition,
  getMenuNeighbourIndex,
  getMenuRoleHeaderRect,
  MENU_CARD,
  MENU_INTEL_BOX,
  MENU_ORDERED_CLASS_IDS,
  MENU_ROLE_COLUMNS,
  SOLDIER_CLASSES,
  type MapSize,
  type MenuDirection,
  type SoldierClass,
} from './MenuLayout';

/** Carried by each class card; `weaponType` maps menu ids onto weapon configs. */
const CLASS_PERKS: Record<string, string> = {
  shotgun: 'Assault sprint',
  flamer: 'Assault sprint, sets fires',
  slug: 'Punches through cover',
  rifle: 'Reliable all-rounder',
  smg: 'Assault sprint',
  carbine: 'Strong while advancing',
  grenade: 'Bounces round corners',
  minigun: 'Area denial',
  demo: 'Craters the terrain',
  sniper: 'Near-straight shot',
  rocket: 'Flat, fast, huge blast',
  mortar: 'Indirect fire over walls',
  pistol: 'Heals wounded allies',
};

const STAT_COLORS = { power: 0xe0864f, reach: 0x6fb7d6, mobility: 0x8fd49a };
const TEAM_COLORS = { red: 0xe2645c, blue: 0x6694df };

interface TeamSelection {
  selected: string[];
  currentIndex: number;
}


export class MenuScene extends Phaser.Scene {
  private redTeam: TeamSelection = { selected: [], currentIndex: 0 };
  private blueTeam: TeamSelection = { selected: [], currentIndex: 0 };
  private currentTeam: 'red' | 'blue' = 'red';
  private selectionComplete: boolean = false;

  // Soldier card ordering (grouped by effective range)
  private orderedClasses: SoldierClass[] = [];

  // Battlefield settings (right-side panel)
  private mapSize: MapSize = 'medium';
  private terrainPreset: 'standard' | 'plains' | 'hills' | 'caves' = 'standard';
  private vsAI: boolean = true;
  private gameMode: GameMode = 'expanded';
  
  private teamIndicator!: Phaser.GameObjects.Text;
  private stepTracker!: Phaser.GameObjects.Graphics;
  private stepNumbers: Phaser.GameObjects.Text[] = [];
  private stepLabels: Phaser.GameObjects.Text[] = [];
  private closeColumnLock!: Phaser.GameObjects.Container;
  private intelPanel!: Phaser.GameObjects.Container;
  private classStats = new Map<string, ClassStats>();
  private soldierCards: Phaser.GameObjects.Container[] = [];
  private selectedDisplay!: Phaser.GameObjects.Container;
  private startButton!: Phaser.GameObjects.Container;
  private autoSelectButton!: Phaser.GameObjects.Container;
  private battlefieldPanel!: Phaser.GameObjects.Container;
  private battlefieldPreview!: Phaser.GameObjects.Graphics;
  private mapSizeButtonBg: Partial<Record<'small' | 'medium' | 'large', Phaser.GameObjects.Graphics>> = {};
  private terrainButtonBg: Partial<Record<'standard' | 'plains' | 'hills' | 'caves', Phaser.GameObjects.Graphics>> = {};
  private opponentButtonBg: Partial<Record<'ai' | 'hotseat', Phaser.GameObjects.Graphics>> = {};
  private modeButtonBg: Partial<Record<GameMode, Phaser.GameObjects.Graphics>> = {};
  private battlefieldInfoText!: Phaser.GameObjects.Text;
  private battlefieldTerrainText!: Phaser.GameObjects.Text;
  private battlefieldModeText!: Phaser.GameObjects.Text;
  private rangeRestrictionText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    fitScreenCamera(this);
    this.cameras.main.setBackgroundColor('#081015');
    this.createCommandBackground();

    this.add.text(40, 18, 'SQUAD OF FIVE', {
      font: 'bold 38px Arial',
      color: '#f4f1e8',
      stroke: '#05080a',
      strokeThickness: 4,
    });

    this.add.text(42, 62, 'FIELD COMMAND  //  SQUAD ASSEMBLY', {
      font: 'bold 11px Arial',
      color: '#a8b5ad',
    });

    this.createStepTracker();

    this.teamIndicator = this.add.text(700, 72, '', {
      font: 'bold 13px Arial',
      color: '#ff736a',
      stroke: '#05080a',
      strokeThickness: 3,
    });
    this.teamIndicator.setOrigin(0.5, 0);

    this.add.text(1238, 22, '1944', {
      font: 'bold 18px Courier New',
      color: '#d2bd78',
    }).setOrigin(1, 0);
    this.add.text(1238, 49, 'OPERATIONS DESK', {
      font: 'bold 10px Arial',
      color: '#81918c',
    }).setOrigin(1, 0);

    // Create soldier selection cards
    this.createSoldierCards();

    // Battlefield settings panel (map size + terrain type)
    this.createBattlefieldPanel();
    
    // Selected soldiers display
    this.createSelectedDisplay();
    
    // Auto-select button
    this.createAutoSelectButton();
    
    // Start button (hidden initially)
    this.createStartButton();
    
    // Setup input
    this.setupInput();
    
    // Initial highlight
    this.ensureSelectionIndicesAvailable();
    this.refreshTeamIndicator();
    this.updateCardHighlights();
    this.updateSelectedDisplay();
    
    // Start military music (on first interaction)
    this.input.once('pointerdown', () => {
      SoundManager.init();
      SoundManager.startMilitaryMusic();
    });
    
    // Also start on any key press
    this.input.keyboard?.once('keydown', () => {
      SoundManager.init();
      SoundManager.startMilitaryMusic();
    });
  }

  private createSoldierCards(): void {
    this.soldierCards.forEach(c => c.destroy());
    this.soldierCards = [];

    const byId = new Map<string, SoldierClass>(SOLDIER_CLASSES.map(s => [s.id, s]));

    this.orderedClasses = MENU_ORDERED_CLASS_IDS
      .map(id => byId.get(id))
      .filter(Boolean) as SoldierClass[];
    this.orderedClasses.forEach(soldier => {
      this.classStats.set(soldier.id, getClassStats(soldier.id as WeaponType, soldier.range));
    });

    const frame = this.add.graphics();
    frame.fillStyle(0x0c151b, 0.97);
    frame.fillRect(24, 112, 844, 488);
    frame.lineStyle(1, 0x64736d, 0.8);
    frame.strokeRect(24, 112, 844, 488);

    const headerBar = this.add.graphics();
    headerBar.fillStyle(0x17231f, 1);
    headerBar.fillRect(24, 112, 844, 48);
    headerBar.fillStyle(0x9f423d, 1);
    headerBar.fillRect(24, 112, 5, 48);
    headerBar.lineStyle(1, 0x43524c, 0.9);
    headerBar.lineBetween(24, 160, 868, 160);

    this.add.text(40, 125, 'UNIT ROSTER', {
      font: 'bold 15px Arial',
      color: '#f3f0e7',
    });

    this.add.text(852, 127, isTouchUI() ? 'TAP TO PICK 5' : 'ARROWS + SPACE  //  PICK 5', {
      font: 'bold 11px Arial',
      color: '#9eb0a8',
    }).setOrigin(1, 0);

    this.rangeRestrictionText = this.add.text(456, 128, '', {
      font: 'bold 11px Arial',
      color: '#ffbd66',
    }).setOrigin(0.5, 0);

    // Role column headers: a label and a coloured rule spanning the column(s).
    const headers = this.add.graphics();
    for (const role of MENU_ROLE_COLUMNS) {
      const rect = getMenuRoleHeaderRect(role.cols);
      headers.fillStyle(role.color, 0.9);
      headers.fillRect(rect.x, rect.y + rect.h - 3, rect.w, 2);
      headers.fillStyle(role.color, 0.12);
      headers.fillRect(rect.x, rect.y, rect.w, rect.h - 3);
      this.add.text(rect.x + 6, rect.y + 3, role.label, {
        font: 'bold 10px Arial',
        color: `#${role.color.toString(16).padStart(6, '0')}`,
      });
      if (role.range === 'mid') {
        this.add.text(rect.x + rect.w - 6, rect.y + 4, 'BULLETS  |  EXPLOSIVES', {
          font: 'bold 8px Arial',
          color: '#8a8f78',
        }).setOrigin(1, 0);
      }
    }

    this.orderedClasses.forEach((soldier, globalIndex) => {
      const pos = getMenuClassGridPosition(globalIndex);
      const cardWidth = pos.w;
      const cardHeight = pos.h;
      const left = -cardWidth / 2;
      const top = -cardHeight / 2;
      const stats = this.classStats.get(soldier.id)!;
      const card = this.add.container(
        Math.round(pos.x + cardWidth / 2),
        Math.round(pos.y + cardHeight / 2),
      );

      const bg = this.add.graphics();
      card.add(bg);

      const portraitPlate = this.add.graphics();
      portraitPlate.fillStyle(0x070d11, 0.9);
      portraitPlate.fillRoundedRect(left + 8, top + 10, 56, 56, 4);
      portraitPlate.fillStyle(soldier.color, 0.16);
      portraitPlate.fillRoundedRect(left + 8, top + 48, 56, 18, { tl: 0, tr: 0, bl: 4, br: 4 });
      card.add(portraitPlate);

      const portrait = this.add.image(left + 36, top + 38, this.getClassTextureKey(soldier.id));
      portrait.setDisplaySize(58, 58);
      card.add(portrait);

      const textWidth = cardWidth - 78;
      const nameText = this.add.text(left + 72, top + 13, soldier.name.toUpperCase(), {
        font: 'bold 12px Arial',
        color: '#f5f3eb',
      });
      this.fitTextWidth(nameText, textWidth);
      card.add(nameText);

      const weaponText = this.add.text(left + 72, top + 31, soldier.weapon, {
        font: 'bold 10px Arial',
        color: '#b9c7cf',
      });
      this.fitTextWidth(weaponText, textWidth);
      card.add(weaponText);

      const moveText = this.add.text(left + 72, top + 52, `MOVE ${stats.movePx}`, {
        font: 'bold 9px Arial',
        color: '#7f918b',
      });
      card.add(moveText);

      // Stat bars: five pips each, worked out from the weapon numbers.
      const bars = this.add.graphics();
      const rows: { label: string; value: number; color: number }[] = [
        { label: 'POWER', value: stats.power, color: STAT_COLORS.power },
        { label: 'REACH', value: stats.reach, color: STAT_COLORS.reach },
        { label: 'MOBILITY', value: stats.mobility, color: STAT_COLORS.mobility },
      ];
      rows.forEach((row, r) => {
        const y = top + 78 + r * 14;
        const label = this.add.text(left + 10, y - 1, row.label, {
          font: 'bold 8px Arial',
          color: '#8b9b95',
        });
        card.add(label);
        for (let pip = 0; pip < 5; pip++) {
          bars.fillStyle(pip < row.value ? row.color : 0x26343b, pip < row.value ? 0.95 : 1);
          bars.fillRect(left + 60 + pip * 18, y + 1, 15, 6);
        }
      });
      card.add(bars);

      const badge = this.add.graphics();
      badge.setName('selBadge');
      card.add(badge);

      const selNum = this.add.text(left + 62, top + 12, '', {
        font: 'bold 12px Arial',
        color: '#ffffff',
      });
      selNum.setOrigin(0.5);
      selNum.setName('selNum');
      card.add(selNum);

      card.setData('soldierId', soldier.id);
      card.setData('bg', bg);
      card.setData('index', globalIndex);
      card.setData('w', cardWidth);
      card.setData('h', cardHeight);

      this.soldierCards.push(card);
    });

    this.createIntelPanel();
    this.createCloseColumnLock();
  }

  /** Shrink a one-line label until it fits, rather than letting it spill out of its card. */
  private fitTextWidth(text: Phaser.GameObjects.Text, maxWidth: number, minSize = 8): void {
    let size = parseInt(String(text.style.fontSize), 10) || 12;
    while (text.width > maxWidth && size > minSize) {
      size -= 0.5;
      text.setFontSize(size);
    }
  }

  /** One lock over the whole close-quarters column instead of three cluttered cards. */
  private createCloseColumnLock(): void {
    const role = MENU_ROLE_COLUMNS.find(r => r.range === 'close')!;
    const header = getMenuRoleHeaderRect(role.cols);
    const x = header.x - 4;
    const y = header.y - 4;
    const w = header.w + 8;
    const h = MENU_CARD.startY + 3 * MENU_CARD.h + 2 * MENU_CARD.gapY + 4 - y;

    this.closeColumnLock = this.add.container(x, y);
    this.closeColumnLock.setDepth(5);

    const shade = this.add.graphics();
    shade.fillStyle(0x05090c, 0.84);
    shade.fillRoundedRect(0, 0, w, h, 6);
    shade.lineStyle(1, 0xb08a4a, 0.55);
    shade.strokeRoundedRect(0.5, 0.5, w - 1, h - 1, 6);
    // Padlock icon.
    const cx = w / 2;
    const cy = h / 2 - 44;
    shade.lineStyle(4, 0xd9b36c, 1);
    shade.beginPath();
    shade.arc(cx, cy - 6, 10, Math.PI, 0, false);
    shade.strokePath();
    shade.fillStyle(0xd9b36c, 1);
    shade.fillRoundedRect(cx - 15, cy - 6, 30, 24, 4);
    shade.fillStyle(0x05090c, 1);
    shade.fillCircle(cx, cy + 4, 3);
    shade.fillRect(cx - 1.5, cy + 4, 3, 7);
    this.closeColumnLock.add(shade);

    const title = this.add.text(cx, h / 2 - 2, 'SMALL MAPS ONLY', {
      font: 'bold 13px Arial',
      color: '#ffd18a',
    }).setOrigin(0.5);
    const sub = this.add.text(cx, h / 2 + 18, 'Close-quarters units need\na tight battlefield.', {
      font: '10px Arial',
      color: '#b8a584',
      align: 'center',
    }).setOrigin(0.5, 0);
    this.closeColumnLock.add([title, sub]);

    const button = this.add.graphics();
    const drawButton = (hovered: boolean): void => {
      button.clear();
      button.fillStyle(hovered ? 0x4a3a1e : 0x2e2616, 1);
      button.fillRoundedRect(cx - 62, h / 2 + 58, 124, 28, 4);
      button.lineStyle(1, 0xd9b36c, hovered ? 1 : 0.7);
      button.strokeRoundedRect(cx - 62, h / 2 + 58, 124, 28, 4);
    };
    drawButton(false);
    const buttonText = this.add.text(cx, h / 2 + 72, 'SWITCH TO SMALL', {
      font: 'bold 10px Arial',
      color: '#f3dca8',
    }).setOrigin(0.5);
    this.closeColumnLock.add([button, buttonText]);

    // The whole lock swallows clicks so the cards underneath can't be picked.
    const hit = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.changeMapSize('small'));
    hit.on('pointerover', () => drawButton(true));
    hit.on('pointerout', () => drawButton(false));
    this.closeColumnLock.add(hit);
  }

  /** Detailed read-out of the focused class, filling the space under the Medic. */
  private createIntelPanel(): void {
    const { x, y, w, h } = MENU_INTEL_BOX;
    this.intelPanel = this.add.container(x, y);

    const frame = this.add.graphics();
    frame.fillStyle(0x0f1b21, 1);
    frame.fillRoundedRect(0, 0, w, h, 4);
    frame.lineStyle(1, 0x3d4f57, 1);
    frame.strokeRoundedRect(0.5, 0.5, w - 1, h - 1, 4);
    frame.fillStyle(0x17262d, 1);
    frame.fillRoundedRect(0, 0, w, 20, { tl: 4, tr: 4, bl: 0, br: 0 });
    this.intelPanel.add(frame);

    this.intelPanel.add(this.add.text(8, 5, 'FIELD INTEL', {
      font: 'bold 9px Arial',
      color: '#9eb0a8',
    }));

    const accent = this.add.graphics();
    accent.setName('intelAccent');
    this.intelPanel.add(accent);

    const portrait = this.add.image(w / 2, 62, 'worm');
    portrait.setDisplaySize(76, 76);
    portrait.setName('intelPortrait');
    this.intelPanel.add(portrait);

    const name = this.add.text(w / 2, 104, '', { font: 'bold 14px Arial', color: '#f5f3eb' }).setOrigin(0.5, 0);
    name.setName('intelName');
    const weapon = this.add.text(w / 2, 122, '', { font: 'bold 10px Arial', color: '#b9c7cf' }).setOrigin(0.5, 0);
    weapon.setName('intelWeapon');
    const desc = this.add.text(10, 142, '', {
      font: '10px Arial',
      color: '#95a7ad',
      wordWrap: { width: w - 20 },
      maxLines: 3,
      lineSpacing: 1,
    });
    desc.setName('intelDesc');
    const factLabels = this.add.text(10, 186, 'ROLE\nMOVE\nBLAST', {
      font: 'bold 9px Arial',
      color: '#7f918b',
      lineSpacing: 5,
    });
    const facts = this.add.text(52, 186, '', {
      font: 'bold 9px Arial',
      color: '#c6d4d9',
      lineSpacing: 5,
    });
    facts.setName('intelFacts');
    this.intelPanel.add(factLabels);
    const perk = this.add.text(w / 2, h - 12, '', { font: 'bold 9px Arial', color: '#d8bd68' }).setOrigin(0.5);
    perk.setName('intelPerk');
    this.intelPanel.add([name, weapon, desc, facts, perk]);
  }

  private updateIntelPanel(soldier: SoldierClass | undefined): void {
    if (!this.intelPanel || !soldier) return;
    const { w } = MENU_INTEL_BOX;
    const stats = this.classStats.get(soldier.id)!;
    const role = MENU_ROLE_COLUMNS.find(r => r.range === soldier.range)!;

    const accent = this.intelPanel.getByName('intelAccent') as Phaser.GameObjects.Graphics;
    accent.clear();
    accent.fillStyle(soldier.color, 0.14);
    accent.fillCircle(w / 2, 62, 40);
    accent.lineStyle(2, soldier.color, 0.8);
    accent.strokeCircle(w / 2, 62, 40);

    (this.intelPanel.getByName('intelPortrait') as Phaser.GameObjects.Image)
      .setTexture(this.getClassTextureKey(soldier.id))
      .setDisplaySize(76, 76);
    (this.intelPanel.getByName('intelName') as Phaser.GameObjects.Text).setText(soldier.name.toUpperCase());
    (this.intelPanel.getByName('intelWeapon') as Phaser.GameObjects.Text).setText(soldier.weapon);
    (this.intelPanel.getByName('intelDesc') as Phaser.GameObjects.Text).setText(soldier.description);
    (this.intelPanel.getByName('intelFacts') as Phaser.GameObjects.Text).setText([
      role.label,
      `${stats.movePx} px per turn`,
      stats.blast >= 40 ? `${stats.blast} px radius` : 'Direct hit',
    ].join('\n'));
    const perk = this.intelPanel.getByName('intelPerk') as Phaser.GameObjects.Text;
    perk.setFontSize(9);
    perk.setText(`\u2605 ${(CLASS_PERKS[soldier.id] ?? '').toUpperCase()}`);
    this.fitTextWidth(perk, w - 12, 7);
  }

  private getClassTextureKey(classId: string): string {
    const textureId: Record<string, string> = {
      carbine: 'rifle',
      slug: 'shotgun',
      demo: 'grenade',
    };
    const key = `worm-${textureId[classId] ?? classId}`;
    // Prefer the high-resolution portrait bake so large portraits stay sharp.
    if (this.textures.exists(`${key}@hi`)) return `${key}@hi`;
    return this.textures.exists(key) ? key : 'worm';
  }

  private createSelectedDisplay(): void {
    this.selectedDisplay = this.add.container(585, 654);

    const bg = this.add.graphics();
    bg.fillStyle(0x0d171d, 1);
    bg.fillRect(-391, -38, 782, 76);
    bg.lineStyle(1, 0x53635d, 0.9);
    bg.strokeRect(-391, -38, 782, 76);
    this.selectedDisplay.add(bg);

    const accent = this.add.graphics();
    accent.setName('selectedAccent');
    this.selectedDisplay.add(accent);

    const title = this.add.text(-375, -26, 'RED SQUAD', {
      font: 'bold 13px Arial',
      color: '#ff736a',
    });
    title.setName('selectedTitle');
    this.selectedDisplay.add(title);

    const count = this.add.text(-375, -8, '0 / 5 READY', {
      font: 'bold 10px Arial',
      color: '#8fa19b',
    });
    count.setName('selectedCount');
    this.selectedDisplay.add(count);

    // Once red is locked, its picks stay visible here while blue chooses.
    const rivalLabel = this.add.text(-375, 13, 'VS', {
      font: 'bold 9px Arial',
      color: '#ff736a',
    });
    rivalLabel.setName('rivalLabel');
    this.selectedDisplay.add(rivalLabel);
    for (let i = 0; i < 5; i++) {
      const mini = this.add.image(-346 + i * 17, 19, 'worm');
      mini.setDisplaySize(18, 18);
      mini.setName(`rival${i}`);
      this.selectedDisplay.add(mini);
    }

    for (let i = 0; i < 5; i++) {
      const slotX = -205 + i * 130;

      const slot = this.add.graphics();
      slot.setName(`slotBg${i}`);
      this.selectedDisplay.add(slot);

      const portrait = this.add.image(slotX - 32, 0, 'worm');
      portrait.setDisplaySize(44, 44);
      portrait.setName(`slotPortrait${i}`);
      portrait.setVisible(false);
      this.selectedDisplay.add(portrait);

      const slotText = this.add.text(slotX + 18, -6, `${i + 1}`, {
        font: 'bold 10px Arial',
        color: '#65756f',
        align: 'center',
      });
      slotText.setOrigin(0.5);
      slotText.setName(`slot${i}`);
      this.selectedDisplay.add(slotText);

      const slotSub = this.add.text(slotX + 18, 10, '', {
        font: '9px Arial',
        color: '#8a9a95',
        align: 'center',
      });
      slotSub.setOrigin(0.5);
      slotSub.setName(`slotSub${i}`);
      this.selectedDisplay.add(slotSub);

      // Click a filled slot to send that soldier back to the roster.
      const hit = this.add.rectangle(slotX, 0, 114, 54, 0x000000, 0);
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.removeFromSquad(i));
      hit.on('pointerover', () => this.drawSlot(i, true));
      hit.on('pointerout', () => this.drawSlot(i, false));
      this.selectedDisplay.add(hit);
    }
  }

  private removeFromSquad(slot: number): void {
    if (this.selectionComplete) return;
    const team = this.getCurrentTeam();
    if (!team.selected[slot]) return;
    team.selected.splice(slot, 1);
    this.refreshTeamIndicator();
    this.updateCardHighlights();
    this.updateSelectedDisplay();
  }

  private drawSlot(i: number, hovered: boolean): void {
    const slot = this.selectedDisplay.getByName(`slotBg${i}`) as Phaser.GameObjects.Graphics;
    if (!slot) return;
    const slotX = -205 + i * 130;
    const soldierId = this.getCurrentTeam().selected[i];
    const soldier = soldierId ? SOLDIER_CLASSES.find(s => s.id === soldierId) : undefined;
    const canRemove = !!soldier && !this.selectionComplete;

    slot.clear();
    if (soldier) {
      slot.fillStyle(hovered && canRemove ? 0x2a2224 : 0x172730, 1);
      slot.fillRoundedRect(slotX - 57, -27, 114, 54, 4);
      slot.fillStyle(soldier.color, 0.9);
      slot.fillRect(slotX - 57, -24, 3, 48);
      slot.lineStyle(1, hovered && canRemove ? 0xd06a62 : 0x4a5d66, 1);
      slot.strokeRoundedRect(slotX - 56.5, -26.5, 113, 53, 4);
      if (hovered && canRemove) {
        slot.lineStyle(2, 0xff8a80, 1);
        slot.lineBetween(slotX + 44, -21, slotX + 51, -14);
        slot.lineBetween(slotX + 51, -21, slotX + 44, -14);
      }
    } else {
      slot.fillStyle(0x101b21, 1);
      slot.fillRoundedRect(slotX - 57, -27, 114, 54, 4);
      // Dashed outline for an empty slot.
      slot.lineStyle(1, 0x3a4a52, 1);
      for (let d = 0; d < 114; d += 8) {
        slot.lineBetween(slotX - 57 + d, -27, slotX - 57 + Math.min(114, d + 4), -27);
        slot.lineBetween(slotX - 57 + d, 27, slotX - 57 + Math.min(114, d + 4), 27);
      }
      for (let d = 0; d < 54; d += 8) {
        slot.lineBetween(slotX - 57, -27 + d, slotX - 57, -27 + Math.min(54, d + 4));
        slot.lineBetween(slotX + 57, -27 + d, slotX + 57, -27 + Math.min(54, d + 4));
      }
    }
  }

  private createAutoSelectButton(): void {
    this.autoSelectButton = this.add.container(101, 654);

    const bg = this.add.graphics();
    const draw = (hovered: boolean): void => {
      bg.clear();
      bg.fillStyle(hovered ? 0x284039 : 0x192b27, 1);
      bg.fillRect(-77, -38, 154, 76);
      bg.lineStyle(1, hovered ? 0xa4bd85 : 0x647a65, 1);
      bg.strokeRect(-77, -38, 154, 76);
    };
    draw(false);
    this.autoSelectButton.add(bg);

    const die = this.add.graphics();
    die.lineStyle(2, 0xd7dfc3, 1);
    die.strokeRect(-58, -13, 26, 26);
    die.fillStyle(0xd7dfc3, 1);
    die.fillCircle(-52, -7, 2);
    die.fillCircle(-38, 7, 2);
    die.fillCircle(-45, 0, 2);
    this.autoSelectButton.add(die);

    const text = this.add.text(22, -9, 'RANDOM', {
      font: 'bold 14px Arial',
      color: '#f1f2e8',
    });
    text.setOrigin(0.5);
    this.autoSelectButton.add(text);

    const keyText = this.add.text(22, 13, 'R', {
      font: 'bold 10px Arial',
      color: '#9daf9f',
    });
    keyText.setOrigin(0.5);
    this.autoSelectButton.add(keyText);

    const hitArea = this.add.rectangle(0, 0, 154, 76, 0x000000, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', () => this.autoSelectSquad());
    hitArea.on('pointerover', () => draw(true));
    hitArea.on('pointerout', () => draw(false));
    this.autoSelectButton.add(hitArea);
  }

  private createStartButton(): void {
    this.startButton = this.add.container(1124, 654);

    const bg = this.add.graphics();
    bg.setName('primaryBg');
    this.startButton.add(bg);

    const text = this.add.text(0, -10, '', {
      font: 'bold 17px Arial',
      color: '#f7f4eb',
    });
    text.setOrigin(0.5);
    text.setName('primaryText');
    this.startButton.add(text);

    const sub = this.add.text(0, 15, '', {
      font: 'bold 9px Arial',
      color: '#aeb9b4',
    });
    sub.setOrigin(0.5);
    sub.setName('primarySub');
    this.startButton.add(sub);

    const hitArea = this.add.rectangle(0, 0, 264, 76, 0x000000, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', () => {
      if (this.selectionComplete) this.startGame();
      else this.confirmTeam();
    });
    hitArea.on('pointerover', () => this.drawPrimaryActionButton(true));
    hitArea.on('pointerout', () => this.drawPrimaryActionButton(false));
    this.startButton.add(hitArea);

    this.drawPrimaryActionButton(false);
  }

  private drawPrimaryActionButton(hovered: boolean): void {
    if (!this.startButton) return;
    const bg = this.startButton.getByName('primaryBg') as Phaser.GameObjects.Graphics;
    const text = this.startButton.getByName('primaryText') as Phaser.GameObjects.Text;
    const sub = this.startButton.getByName('primarySub') as Phaser.GameObjects.Text;
    if (!bg || !text || !sub) return;

    const team = this.getCurrentTeam();
    const ready = this.selectionComplete || team.selected.length === 5;
    const accent = this.selectionComplete
      ? 0xd1b55f
      : this.currentTeam === 'red' ? 0xd65b54 : 0x5a86ce;

    bg.clear();
    bg.fillStyle(
      ready
        ? hovered ? 0x39483f : 0x293930
        : hovered ? 0x1c2930 : 0x131e24,
      1,
    );
    bg.fillRect(-132, -38, 264, 76);
    bg.fillStyle(accent, ready ? 1 : 0.45);
    bg.fillRect(-132, -38, 6, 76);
    bg.lineStyle(ready ? 2 : 1, accent, ready ? 1 : 0.55);
    bg.strokeRect(-132, -38, 264, 76);

    if (this.selectionComplete) {
      text.setText('DEPLOY SQUADS');
      sub.setText('ENTER  //  START BATTLE');
    } else if (ready) {
      text.setText(`LOCK ${this.currentTeam.toUpperCase()} SQUAD`);
      sub.setText('ENTER  //  CONFIRM ROSTER');
    } else {
      const remaining = Math.max(0, 5 - team.selected.length);
      text.setText(`SELECT ${remaining} UNIT${remaining === 1 ? '' : 'S'}`);
      sub.setText('ROSTER INCOMPLETE');
    }
  }

  private setupInput(): void {
    // Arrow keys for navigation
    for (const direction of ['left', 'right', 'up', 'down'] as const) {
      this.input.keyboard!.on(`keydown-${direction.toUpperCase()}`, () => this.navigateCards(direction));
    }
    
    // Space to select/deselect
    this.input.keyboard!.on('keydown-SPACE', () => {
      this.toggleSelection();
    });
    
    // R for random
    this.input.keyboard!.on('keydown-R', () => {
      this.autoSelectSquad();
    });
    
    // Enter to confirm team / start game
    this.input.keyboard!.on('keydown-ENTER', () => {
      this.confirmTeam();
    });
    
    // Click on cards
    this.soldierCards.forEach((card, index) => {
      const baseW = (card.getData('w') as number) || 115;
      const baseH = (card.getData('h') as number) || 160;
      const w = baseW * (card.scaleX || 1);
      const h = baseH * (card.scaleY || 1);
      const hitArea = this.add.rectangle(card.x, card.y, w, h, 0x000000, 0);
      hitArea.setInteractive({ useHandCursor: true });
      hitArea.on('pointerdown', () => {
        this.getCurrentTeam().currentIndex = index;
        this.updateCardHighlights();
        this.toggleSelection();
      });
      // Hovering focuses the card, so the intel panel follows the mouse.
      hitArea.on('pointerover', () => {
        if (this.selectionComplete || !isClassAvailableOnMap(this.orderedClasses[index].id, this.mapSize)) return;
        this.getCurrentTeam().currentIndex = index;
        this.updateCardHighlights();
      });
    });
  }

  private createBattlefieldPanel(): void {
    const panelX = 884;
    const panelY = 112;
    const panelW = 372;
    const panelH = 488;

    this.battlefieldPanel = this.add.container(panelX, panelY);

    const bg = this.add.graphics();
    bg.fillStyle(0x0c151b, 0.98);
    bg.fillRect(0, 0, panelW, panelH);
    bg.fillStyle(0x18222a, 1);
    bg.fillRect(0, 0, panelW, 48);
    bg.fillStyle(0x5479b8, 1);
    bg.fillRect(panelW - 5, 0, 5, 48);
    bg.lineStyle(1, 0x53636c, 0.9);
    bg.strokeRect(0, 0, panelW, panelH);
    bg.lineBetween(0, 48, panelW, 48);
    this.battlefieldPanel.add(bg);

    const title = this.add.text(16, 14, 'MISSION SETUP', {
      font: 'bold 15px Arial',
      color: '#f3f0e7',
    });
    this.battlefieldPanel.add(title);

    const setupTag = this.add.text(panelW - 16, 16, 'BATTLEFIELD', {
      font: 'bold 10px Arial',
      color: '#8fa3ad',
    });
    setupTag.setOrigin(1, 0);
    this.battlefieldPanel.add(setupTag);

    const sub1 = this.add.text(16, 58, 'MAP SIZE', {
      font: 'bold 10px Arial',
      color: '#9badb4',
    });
    this.battlefieldPanel.add(sub1);

    const sizeButtons: { key: 'small' | 'medium' | 'large'; label: string; x: number }[] = [
      { key: 'small', label: 'SMALL', x: 16 },
      { key: 'medium', label: 'MEDIUM', x: 128 },
      { key: 'large', label: 'LARGE', x: 240 },
    ];

    for (const b of sizeButtons) {
      const btn = this.createOptionButton(b.x, 76, 100, 32, b.label, () => {
        this.changeMapSize(b.key);
      });
      this.mapSizeButtonBg[b.key] = btn.bg;
      this.battlefieldPanel.add(btn.bg);
      this.battlefieldPanel.add(btn.text);
      this.battlefieldPanel.add(btn.hit);
    }

    this.battlefieldInfoText = this.add.text(16, 113, '', {
      font: 'bold 10px Arial',
      color: '#c6d4d9',
    });
    this.battlefieldPanel.add(this.battlefieldInfoText);

    const sub2 = this.add.text(16, 136, 'TERRAIN PROFILE', {
      font: 'bold 10px Arial',
      color: '#9badb4',
    });
    this.battlefieldPanel.add(sub2);

    const terrainButtons: { key: 'standard' | 'plains' | 'hills' | 'caves'; label: string; x: number; y: number }[] = [
      { key: 'standard', label: 'STANDARD', x: 16, y: 152 },
      { key: 'plains', label: 'PLAINS', x: 190, y: 152 },
      { key: 'hills', label: 'HILLS', x: 16, y: 188 },
      { key: 'caves', label: 'CAVES', x: 190, y: 188 },
    ];

    for (const b of terrainButtons) {
      const btn = this.createOptionButton(b.x, b.y, 166, 30, b.label, () => {
        this.terrainPreset = b.key;
        this.updateBattlefieldPanel();
      });
      this.terrainButtonBg[b.key] = btn.bg;
      this.battlefieldPanel.add(btn.bg);
      this.battlefieldPanel.add(btn.text);
      this.battlefieldPanel.add(btn.hit);
    }

    this.battlefieldTerrainText = this.add.text(16, 223, '', {
      font: '10px Arial',
      color: '#c6d4d9',
    });
    this.battlefieldPanel.add(this.battlefieldTerrainText);

    const sub3 = this.add.text(16, 248, 'OPPONENT', {
      font: 'bold 10px Arial',
      color: '#9badb4',
    });
    this.battlefieldPanel.add(sub3);

    const opponentButtons: { key: 'ai' | 'hotseat'; label: string; x: number }[] = [
      { key: 'ai', label: 'VS AI', x: 16 },
      { key: 'hotseat', label: 'HOTSEAT', x: 190 },
    ];

    for (const b of opponentButtons) {
      const btn = this.createOptionButton(b.x, 264, 166, 30, b.label, () => {
        this.vsAI = b.key === 'ai';
        this.updateBattlefieldPanel();
      });
      this.opponentButtonBg[b.key] = btn.bg;
      this.battlefieldPanel.add(btn.bg);
      this.battlefieldPanel.add(btn.text);
      this.battlefieldPanel.add(btn.hit);
    }

    const modeLabel = this.add.text(16, 310, 'RULESET', {
      font: 'bold 10px Arial',
      color: '#9badb4',
    });
    this.battlefieldPanel.add(modeLabel);

    const modeButtons: { key: GameMode; label: string; x: number }[] = [
      { key: 'basic', label: 'BASIC', x: 16 },
      { key: 'expanded', label: 'OPERATIONS', x: 190 },
    ];

    for (const b of modeButtons) {
      const btn = this.createOptionButton(b.x, 326, 166, 30, b.label, () => {
        this.gameMode = b.key;
        this.updateBattlefieldPanel();
      });
      this.modeButtonBg[b.key] = btn.bg;
      this.battlefieldPanel.add(btn.bg);
      this.battlefieldPanel.add(btn.text);
      this.battlefieldPanel.add(btn.hit);
    }

    this.battlefieldModeText = this.add.text(16, 363, '', {
      font: 'bold 10px Arial',
      color: '#9dd9c2',
    });
    this.battlefieldPanel.add(this.battlefieldModeText);

    const previewLabel = this.add.text(16, 390, 'TACTICAL PREVIEW', {
      font: 'bold 10px Arial',
      color: '#9badb4',
    });
    this.battlefieldPanel.add(previewLabel);

    this.battlefieldPreview = this.add.graphics();
    this.battlefieldPanel.add(this.battlefieldPreview);

    this.updateBattlefieldPanel();
  }

  private createOptionButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    onClick: () => void,
  ): { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; hit: Phaser.GameObjects.Rectangle } {
    const bg = this.add.graphics();
    bg.setPosition(0, 0);

    const text = this.add.text(x + w / 2, y + h / 2, label, {
      font: 'bold 12px Arial',
      color: '#ffffff',
    });
    text.setOrigin(0.5);

    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerdown', onClick);

    // Keep inside panel bounds
    hit.on('pointerover', () => {
      const g = bg;
      g.lineStyle(2, 0xffffff, 0.35);
      g.strokeRoundedRect(x, y, w, h, 4);
    });
    hit.on('pointerout', () => {
      // full redraw happens in updateBattlefieldPanel
      this.updateBattlefieldPanel();
    });

    return { bg, text, hit };
  }

  private changeMapSize(mapSize: MapSize): void {
    if (this.mapSize === mapSize) return;

    this.mapSize = mapSize;
    const rosterChanged = this.enforceMapRosterAvailability();
    this.updateBattlefieldPanel();

    if (rosterChanged) {
      this.showRosterWarning('CLOSE-RANGE PICKS REMOVED - SMALL MAP ONLY');
    }
  }

  private ensureSelectionIndicesAvailable(): void {
    const classIds = this.orderedClasses.map(soldier => soldier.id);
    for (const team of [this.redTeam, this.blueTeam]) {
      const selectedId = classIds[team.currentIndex];
      if (!selectedId || !isClassAvailableOnMap(selectedId, this.mapSize)) {
        team.currentIndex = findNextAvailableClassIndex(
          classIds,
          Math.max(-1, team.currentIndex),
          1,
          this.mapSize,
        );
      }
    }
  }

  private enforceMapRosterAvailability(): boolean {
    const redCount = this.redTeam.selected.length;
    const blueCount = this.blueTeam.selected.length;

    this.redTeam.selected = this.redTeam.selected.filter(classId =>
      isClassAvailableOnMap(classId, this.mapSize)
    );
    this.blueTeam.selected = this.blueTeam.selected.filter(classId =>
      isClassAvailableOnMap(classId, this.mapSize)
    );

    const redChanged = this.redTeam.selected.length !== redCount;
    const blueChanged = this.blueTeam.selected.length !== blueCount;
    const rosterChanged = redChanged || blueChanged;

    if (rosterChanged) {
      this.selectionComplete = false;
      this.currentTeam = redChanged ? 'red' : 'blue';
      this.refreshTeamIndicator();
    }

    this.ensureSelectionIndicesAvailable();
    this.updateCardHighlights();
    this.updateSelectedDisplay();
    return rosterChanged;
  }

  private createStepTracker(): void {
    this.stepTracker = this.add.graphics();
    const labels = ['RED SQUAD', 'BLUE SQUAD', 'DEPLOY'];
    labels.forEach((label, i) => {
      const x = 560 + i * 140;
      this.stepNumbers.push(this.add.text(x, 34, `${i + 1}`, {
        font: 'bold 13px Arial',
        color: '#ffffff',
      }).setOrigin(0.5));
      this.stepLabels.push(this.add.text(x, 52, label, {
        font: 'bold 10px Arial',
        color: '#92a29d',
      }).setOrigin(0.5, 0));
    });
  }

  /** Red squad -> Blue squad -> Deploy, with done / active / waiting states. */
  private drawStepTracker(): void {
    const g = this.stepTracker;
    const red = this.currentTeam === 'red' && !this.selectionComplete;
    const states: ('done' | 'active' | 'waiting')[] = this.selectionComplete
      ? ['done', 'done', 'active']
      : red ? ['active', 'waiting', 'waiting'] : ['done', 'active', 'waiting'];
    const colors = [TEAM_COLORS.red, TEAM_COLORS.blue, 0xd1b55f];

    g.clear();
    for (let i = 0; i < 2; i++) {
      const x = 560 + i * 140;
      g.lineStyle(2, states[i] === 'done' ? 0x8a9a93 : 0x34413f, 1);
      g.lineBetween(x + 18, 34, x + 122, 34);
    }
    states.forEach((state, i) => {
      const x = 560 + i * 140;
      const color = colors[i];
      if (state === 'active') {
        g.fillStyle(color, 0.22);
        g.fillCircle(x, 34, 19);
        g.fillStyle(color, 1);
        g.fillCircle(x, 34, 14);
      } else if (state === 'done') {
        g.fillStyle(0x23302d, 1);
        g.fillCircle(x, 34, 14);
        g.lineStyle(2, color, 0.9);
        g.strokeCircle(x, 34, 14);
      } else {
        g.fillStyle(0x121b1e, 1);
        g.fillCircle(x, 34, 14);
        g.lineStyle(1, 0x4a5854, 1);
        g.strokeCircle(x, 34, 14);
      }
      this.stepNumbers[i].setText(state === 'done' ? '✓' : `${i + 1}`);
      this.stepNumbers[i].setColor(state === 'waiting' ? '#6b7a75' : state === 'done' ? `#${color.toString(16)}` : '#ffffff');
      this.stepLabels[i].setColor(state === 'active' ? '#f3f0e7' : state === 'done' ? '#a9b6b1' : '#5f6d69');
    });
  }

  private refreshTeamIndicator(): void {
    this.drawStepTracker();
    if (this.selectionComplete) {
      this.teamIndicator.setText('BOTH SQUADS LOCKED  //  READY TO DEPLOY');
      this.teamIndicator.setColor('#d1b55f');
      this.drawPrimaryActionButton(false);
      return;
    }

    const team = this.getCurrentTeam();
    const teamName = this.currentTeam === 'red' ? 'RED' : 'BLUE';
    this.teamIndicator.setText(`${teamName} COMMAND  //  ${team.selected.length} OF 5 SELECTED`);
    this.teamIndicator.setColor(this.currentTeam === 'red' ? '#ff736a' : '#72a0ed');
    this.drawPrimaryActionButton(false);
  }

  private showRosterWarning(message: string): void {
    this.tweens.killTweensOf(this.teamIndicator);
    this.teamIndicator.setAlpha(1);
    this.teamIndicator.setText(message);
    this.teamIndicator.setColor('#ffd166');
    this.tweens.add({
      targets: this.teamIndicator,
      alpha: { from: 1, to: 0.35 },
      duration: 130,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        this.teamIndicator.setAlpha(1);
        this.refreshTeamIndicator();
      },
    });
  }

  private updateBattlefieldPanel(): void {
    const drawButton = (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, selected: boolean): void => {
      g.clear();
      g.fillStyle(selected ? 0x294137 : 0x142129, 1);
      g.fillRoundedRect(x, y, w, h, 4);
      g.lineStyle(2, selected ? 0x8dc79e : 0x3b4b54, selected ? 1 : 0.9);
      g.strokeRoundedRect(x, y, w, h, 4);
    };

    drawButton(this.mapSizeButtonBg.small!, 16, 76, 100, 32, this.mapSize === 'small');
    drawButton(this.mapSizeButtonBg.medium!, 128, 76, 100, 32, this.mapSize === 'medium');
    drawButton(this.mapSizeButtonBg.large!, 240, 76, 100, 32, this.mapSize === 'large');

    const sizePx = getMapPixelWidth(this.mapSize);
    this.battlefieldInfoText.setText(`${sizePx} x 720 PX  //  ${this.mapSize.toUpperCase()} THEATER`);
    this.rangeRestrictionText.setText(
      this.mapSize === 'small' ? 'ALL RANGES AVAILABLE' : 'CLOSE RANGE: SMALL MAP ONLY'
    );
    this.rangeRestrictionText.setColor(this.mapSize === 'small' ? '#9ddf8d' : '#ffbd66');
    this.updateCardHighlights();

    drawButton(this.terrainButtonBg.standard!, 16, 152, 166, 30, this.terrainPreset === 'standard');
    drawButton(this.terrainButtonBg.plains!, 190, 152, 166, 30, this.terrainPreset === 'plains');
    drawButton(this.terrainButtonBg.hills!, 16, 188, 166, 30, this.terrainPreset === 'hills');
    drawButton(this.terrainButtonBg.caves!, 190, 188, 166, 30, this.terrainPreset === 'caves');

    drawButton(this.opponentButtonBg.ai!, 16, 264, 166, 30, this.vsAI);
    drawButton(this.opponentButtonBg.hotseat!, 190, 264, 166, 30, !this.vsAI);
    drawButton(this.modeButtonBg.basic!, 16, 326, 166, 30, this.gameMode === 'basic');
    drawButton(this.modeButtonBg.expanded!, 190, 326, 166, 30, this.gameMode === 'expanded');

    this.battlefieldModeText.setText(
      this.gameMode === 'expanded'
        ? `${getModeLabel(this.gameMode).toUpperCase()}  //  SIGNAL TARGET 7`
        : `${getModeLabel(this.gameMode).toUpperCase()}  //  LAST SQUAD STANDING`
    );

    const terrainLabel =
      this.terrainPreset === 'plains' ? 'Plains (smooth, few caves)' :
      this.terrainPreset === 'hills' ? 'Hills (steep, overhangs)' :
      this.terrainPreset === 'caves' ? 'Caves (more tunnels)' :
      'Standard (mixed)';
    this.battlefieldTerrainText.setText(terrainLabel);

    this.battlefieldPreview.clear();
    const { x: px, y: py, w: pw, h: ph } = getMapPreviewRect(this.mapSize);
    const inset = 6;

    this.battlefieldPreview.fillStyle(0x071016, 1);
    this.battlefieldPreview.fillRect(px, py, pw, ph);

    // Terrain silhouette uses the same world aspect ratio as the selected map.
    const baseY = py + ph * 0.47;
    const amp =
      this.terrainPreset === 'plains' ? ph * 0.055 :
      this.terrainPreset === 'hills' ? ph * 0.17 :
      this.terrainPreset === 'caves' ? ph * 0.10 :
      ph * 0.11;
    const surfaceAt = (t: number): number => Phaser.Math.Clamp(
      baseY + Math.sin(t * Math.PI * 2) * amp + Math.sin(t * Math.PI * 6) * (amp * 0.32),
      py + inset + 4,
      py + ph - inset - 18,
    );

    this.battlefieldPreview.fillStyle(0x384332, 1);
    this.battlefieldPreview.beginPath();
    this.battlefieldPreview.moveTo(px + inset, py + ph - inset);
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const x = px + inset + t * (pw - inset * 2);
      this.battlefieldPreview.lineTo(x, surfaceAt(t));
    }
    this.battlefieldPreview.lineTo(px + pw - inset, py + ph - inset);
    this.battlefieldPreview.closePath();
    this.battlefieldPreview.fillPath();

    // Connected entrances and branches read as an underground network, even at preview scale.
    if (this.terrainPreset === 'caves') {
      const entranceT = 0.34;
      const entranceX = px + inset + entranceT * (pw - inset * 2);
      const entranceY = surfaceAt(entranceT) - 2;
      const lowerY = Math.min(py + ph - 12, entranceY + 32);
      const cavePath = [
        { x: entranceX, y: entranceY },
        { x: entranceX + pw * 0.035, y: entranceY + 12 },
        { x: entranceX + pw * 0.13, y: lowerY - 5 },
        { x: entranceX + pw * 0.27, y: lowerY },
        { x: entranceX + pw * 0.39, y: lowerY - 8 },
      ];

      const strokeCavePath = (width: number, color: number): void => {
        this.battlefieldPreview.lineStyle(width, color, 1);
        this.battlefieldPreview.beginPath();
        this.battlefieldPreview.moveTo(cavePath[0].x, cavePath[0].y);
        cavePath.slice(1).forEach(point => this.battlefieldPreview.lineTo(point.x, point.y));
        this.battlefieldPreview.strokePath();
      };
      strokeCavePath(11, 0x26302e);
      strokeCavePath(7, 0x05080a);

      this.battlefieldPreview.lineStyle(7, 0x05080a, 1);
      this.battlefieldPreview.lineBetween(cavePath[2].x, cavePath[2].y, cavePath[2].x - pw * 0.11, lowerY + 5);
    }

    this.battlefieldPreview.lineStyle(2, 0x637983, 1);
    this.battlefieldPreview.strokeRect(px, py, pw, ph);
  }

  private getCurrentTeam(): TeamSelection {
    return this.currentTeam === 'red' ? this.redTeam : this.blueTeam;
  }

  private navigateCards(direction: MenuDirection): void {
    if (this.selectionComplete) return;

    const team = this.getCurrentTeam();
    team.currentIndex = getMenuNeighbourIndex(
      team.currentIndex,
      direction,
      classId => isClassAvailableOnMap(classId, this.mapSize),
    );
    this.updateCardHighlights();
  }

  private toggleSelection(): void {
    if (this.selectionComplete) return;
    
    const team = this.getCurrentTeam();
    const soldierId = this.orderedClasses[team.currentIndex].id;

    if (!isClassAvailableOnMap(soldierId, this.mapSize)) {
      this.showRosterWarning('CLOSE-RANGE UNITS REQUIRE A SMALL MAP');
      return;
    }
    
    const existingIndex = team.selected.indexOf(soldierId);
    
    if (existingIndex >= 0) {
      // Deselect
      team.selected.splice(existingIndex, 1);
    } else if (team.selected.length < 5) {
      // Select
      team.selected.push(soldierId);
    }
    
    this.refreshTeamIndicator();
    this.updateCardHighlights();
    this.updateSelectedDisplay();
  }

  private autoSelectSquad(): void {
    if (this.selectionComplete) return;
    
    const team = this.getCurrentTeam();
    team.selected = [];
    
    // Randomly select 5 unique soldiers
    const available = getAvailableClassIds(
      this.orderedClasses.map(soldier => soldier.id),
      this.mapSize,
    );
    while (team.selected.length < 5 && available.length > 0) {
      const randomIndex = Math.floor(Math.random() * available.length);
      team.selected.push(available.splice(randomIndex, 1)[0]);
    }
    
    this.refreshTeamIndicator();
    this.updateCardHighlights();
    this.updateSelectedDisplay();
  }

  private confirmTeam(): void {
    // Both squads already locked in — Enter launches the battle.
    if (this.selectionComplete) {
      this.startGame();
      return;
    }

    const team = this.getCurrentTeam();
    team.selected = team.selected.filter(classId => isClassAvailableOnMap(classId, this.mapSize));

    if (team.selected.length !== 5) {
      // Flash warning
      this.teamIndicator.setColor('#ff0000');
      this.tweens.add({
        targets: this.teamIndicator,
        alpha: { from: 1, to: 0.3 },
        duration: 100,
        yoyo: true,
        repeat: 3,
        onComplete: () => {
          this.teamIndicator.setAlpha(1);
          this.refreshTeamIndicator();
        }
      });
      return;
    }
    
    if (this.currentTeam === 'red') {
      // Move to blue team
      this.currentTeam = 'blue';
      this.blueTeam.currentIndex = 0;
      this.ensureSelectionIndicesAvailable();
      this.refreshTeamIndicator();
      this.updateCardHighlights();
      this.updateSelectedDisplay();
    } else {
      this.selectionComplete = true;
      this.refreshTeamIndicator();
      this.updateCardHighlights();
      this.updateSelectedDisplay();
    }
  }

  private startGame(): void {
    if (!this.selectionComplete) return;
    if (
      [...this.redTeam.selected, ...this.blueTeam.selected]
        .some(classId => !isClassAvailableOnMap(classId, this.mapSize))
    ) {
      this.enforceMapRosterAvailability();
      this.showRosterWarning('SQUAD UPDATED FOR THE SELECTED MAP');
      return;
    }
    
    // Stop menu music
    SoundManager.stopMusic();
    
    // Pass selections to game scene
    this.scene.start('GameScene', {
      redSquad: this.redTeam.selected,
      blueSquad: this.blueTeam.selected,
      mapSize: this.mapSize,
      terrainPreset: this.terrainPreset,
      vsAI: this.vsAI,
      gameMode: this.gameMode,
    });
  }

  private updateCardHighlights(): void {
    const team = this.getCurrentTeam();
    const teamAccent = TEAM_COLORS[this.currentTeam];

    this.soldierCards.forEach((card, index) => {
      const bg = card.getData('bg') as Phaser.GameObjects.Graphics;
      const soldier = this.orderedClasses[index];
      const isHighlighted = index === team.currentIndex && !this.selectionComplete;
      const selIndex = team.selected.indexOf(soldier.id);
      const isSelected = selIndex >= 0;
      const isAvailable = isClassAvailableOnMap(soldier.id, this.mapSize);
      const w = (card.getData('w') as number) || MENU_CARD.w;
      const h = (card.getData('h') as number) || MENU_CARD.h;
      const left = -w / 2;
      const top = -h / 2;

      bg.clear();
      if (isHighlighted) {
        // Soft glow around the focused card.
        bg.fillStyle(0xd8bd68, 0.16);
        bg.fillRoundedRect(left - 4, top - 4, w + 8, h + 8, 7);
      }
      bg.fillStyle(isSelected ? (this.currentTeam === 'red' ? 0x33201f : 0x1b2940) : isHighlighted ? 0x223029 : 0x132029, 1);
      bg.fillRoundedRect(left, top, w, h, 5);
      bg.fillStyle(soldier.color, isSelected || isHighlighted ? 0.95 : 0.6);
      bg.fillRoundedRect(left, top, w, 3, { tl: 5, tr: 5, bl: 0, br: 0 });
      if (isSelected) {
        bg.lineStyle(2, teamAccent, 1);
        bg.strokeRoundedRect(left + 1, top + 1, w - 2, h - 2, 5);
      } else if (isHighlighted) {
        bg.lineStyle(2, 0xd8bd68, 1);
        bg.strokeRoundedRect(left + 1, top + 1, w - 2, h - 2, 5);
      } else {
        bg.lineStyle(1, 0x31424a, 1);
        bg.strokeRoundedRect(left + 0.5, top + 0.5, w - 1, h - 1, 5);
      }

      const badge = card.getByName('selBadge') as Phaser.GameObjects.Graphics;
      const selNum = card.getByName('selNum') as Phaser.GameObjects.Text;
      badge.clear();
      if (isSelected) {
        badge.fillStyle(0x05080a, 0.9);
        badge.fillCircle(left + 62, top + 12, 11);
        badge.fillStyle(teamAccent, 1);
        badge.fillCircle(left + 62, top + 12, 9);
        selNum.setText(`${selIndex + 1}`);
      } else {
        selNum.setText('');
      }
      card.setAlpha(isAvailable ? 1 : 0.5);
    });

    this.closeColumnLock?.setVisible(this.mapSize !== 'small');
    this.updateIntelPanel(this.orderedClasses[team.currentIndex]);
  }

  private updateSelectedDisplay(): void {
    const team = this.getCurrentTeam();
    const teamName = this.currentTeam === 'red' ? 'RED SQUAD' : 'BLUE SQUAD';
    const teamColor = this.currentTeam === 'red' ? '#ff736a' : '#72a0ed';
    const accentColor = this.currentTeam === 'red' ? 0xd65b54 : 0x5a86ce;
    const title = this.selectedDisplay.getByName('selectedTitle') as Phaser.GameObjects.Text;
    const count = this.selectedDisplay.getByName('selectedCount') as Phaser.GameObjects.Text;
    const accent = this.selectedDisplay.getByName('selectedAccent') as Phaser.GameObjects.Graphics;

    title.setText(teamName);
    title.setColor(teamColor);
    count.setText(`${team.selected.length} / 5 READY`);
    accent.clear();
    accent.fillStyle(accentColor, 1);
    accent.fillRect(-391, -38, 5, 76);

    const showRival = this.currentTeam === 'blue';
    (this.selectedDisplay.getByName('rivalLabel') as Phaser.GameObjects.Text).setVisible(showRival);
    for (let i = 0; i < 5; i++) {
      const mini = this.selectedDisplay.getByName(`rival${i}`) as Phaser.GameObjects.Image;
      const rivalId = this.redTeam.selected[i];
      mini.setVisible(showRival && !!rivalId);
      if (rivalId) mini.setTexture(this.getClassTextureKey(rivalId)).setDisplaySize(18, 18);
    }

    for (let i = 0; i < 5; i++) {
      const slotText = this.selectedDisplay.getByName(`slot${i}`) as Phaser.GameObjects.Text;
      const slotSub = this.selectedDisplay.getByName(`slotSub${i}`) as Phaser.GameObjects.Text;
      const portrait = this.selectedDisplay.getByName(`slotPortrait${i}`) as Phaser.GameObjects.Image;
      const soldier = team.selected[i] ? SOLDIER_CLASSES.find(s => s.id === team.selected[i]) : undefined;

      if (soldier) {
        slotText.setText(soldier.name.toUpperCase());
        slotText.setColor('#f2f1e9');
        slotText.setFontSize(10);
        slotText.setX(-205 + i * 130 + 20);
        slotSub.setX(-205 + i * 130 + 20);
        slotSub.setText(soldier.weapon);
        slotSub.setFontSize(9);
        this.fitTextWidth(slotText, 62, 7);
        this.fitTextWidth(slotSub, 64, 7);
        portrait.setTexture(this.getClassTextureKey(soldier.id)).setDisplaySize(44, 44);
        portrait.setVisible(true);
      } else {
        slotText.setText(`SLOT ${i + 1}`);
        slotText.setColor('#56655f');
        slotText.setFontSize(10);
        slotText.setX(-205 + i * 130);
        slotSub.setX(-205 + i * 130);
        slotSub.setText(i === team.selected.length ? 'pick a unit' : '');
        portrait.setVisible(false);
      }
      this.drawSlot(i, false);
    }

    this.drawPrimaryActionButton(false);
  }

  private createCommandBackground(): void {
    const graphics = this.add.graphics();
    graphics.setDepth(-10);

    graphics.fillStyle(0x081015, 1);
    graphics.fillRect(0, 0, 1280, 720);

    graphics.fillStyle(0x111b1a, 1);
    graphics.fillRect(0, 0, 1280, 100);
    graphics.fillStyle(0x10191b, 1);
    graphics.fillRect(0, 608, 1280, 112);
    graphics.fillStyle(0x9f423d, 1);
    graphics.fillRect(0, 0, 6, 720);
    graphics.fillStyle(0x4e73ad, 1);
    graphics.fillRect(1274, 0, 6, 720);

    graphics.lineStyle(1, 0x5b6d67, 0.13);
    for (let x = 0; x <= 1280; x += 40) {
      graphics.lineBetween(x, 0, x, 720);
    }
    for (let y = 0; y <= 720; y += 40) {
      graphics.lineBetween(0, y, 1280, y);
    }

    for (let band = 0; band < 6; band++) {
      graphics.lineStyle(1, band % 2 === 0 ? 0x354c3e : 0x334954, 0.28);
      graphics.beginPath();
      for (let x = 0; x <= 1280; x += 20) {
        const y = 150 + band * 78
          + Math.sin(x / 105 + band * 0.8) * 18
          + Math.sin(x / 43 + band) * 7;
        if (x === 0) graphics.moveTo(x, y);
        else graphics.lineTo(x, y);
      }
      graphics.strokePath();
    }

    graphics.lineStyle(2, 0x8a7948, 0.24);
    graphics.beginPath();
    graphics.moveTo(40, 574);
    graphics.lineTo(248, 470);
    graphics.lineTo(430, 510);
    graphics.lineTo(620, 362);
    graphics.lineTo(820, 402);
    graphics.lineTo(1030, 264);
    graphics.lineTo(1240, 302);
    graphics.strokePath();

    graphics.fillStyle(0xd1b55f, 0.5);
    for (const point of [
      { x: 248, y: 470 },
      { x: 620, y: 362 },
      { x: 1030, y: 264 },
    ]) {
      graphics.fillRect(point.x - 3, point.y - 3, 6, 6);
    }
  }

}
