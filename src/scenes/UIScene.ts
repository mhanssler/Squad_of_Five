import Phaser from 'phaser';
import { Team } from '../systems/TurnManager';
import { GameMode, RelayControl } from '../systems/GameRules';
import type { AbilityStatus } from '../systems/Abilities';
import { isWindCalm } from '../systems/Wind';
import {
  FactionId,
  FactionMatchup,
  getFaction,
  getFactionSpriteTextureKey,
} from '../systems/Factions';

interface TurnInfo {
  currentTeam: Team;
  currentSoldierName: string;
  turnNumber: number;
  redTeamAlive: number;
  blueTeamAlive: number;
  maxMovement?: number;
  movementUsed?: number;
  roundNumber?: number;
  redActedThisRound?: number;
  blueActedThisRound?: number;
}

interface WeaponInfo {
  name: string;
  damage: number;
  explosionRadius: number;
  projectileSpeed: number;
  gravity: number;
  weight: number;
  description: string;
  pelletCount: number;
  bounce: number;
}

interface SoldierInfo {
  name: string;
  health: number;
  squadIndex: number;
  factionId: FactionId;
  portraitTextureKey: string;
}

interface CharacterSelectionInfo {
  team: Team;
  soldier: SoldierInfo;
  weapon: WeaponInfo;
  currentIndex: number;
  totalCount: number;
  soldierX: number;
}

interface ObjectiveInfo {
  mode: GameMode;
  redScore: number;
  blueScore: number;
  targetScore: number;
  owners: RelayControl[];
}

interface PowerupInfo {
  name: string;
  armor: number;
  airstrikeCharges: number;
  artilleryCharges: number;
}

export class UIScene extends Phaser.Scene {
  private turnText!: Phaser.GameObjects.Text;
  private teamText!: Phaser.GameObjects.Text;
  private controlsText!: Phaser.GameObjects.Text;
  private movementBar!: Phaser.GameObjects.Graphics;
  private movementText!: Phaser.GameObjects.Text;
  private abilityTexts: Phaser.GameObjects.Text[] = [];
  private windGraphics!: Phaser.GameObjects.Graphics;
  private windText!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;
  private powerupText!: Phaser.GameObjects.Text;
  private contextText!: Phaser.GameObjects.Text;
  private tacReadoutPanel!: Phaser.GameObjects.Container;
  private redSquadText!: Phaser.GameObjects.Text;
  private blueSquadText!: Phaser.GameObjects.Text;
  private briefingContainer: Phaser.GameObjects.Container | null = null;
  private gameScene!: Phaser.Scene;
  private maxMovement: number = 200;
  private gameMode: GameMode = 'basic';
  private factionMatchup: FactionMatchup = {
    red: 'united-states',
    blue: 'germany',
  };

  constructor() {
    super({ key: 'UIScene' });
  }

  init(data: {
    gameScene: Phaser.Scene;
    gameMode?: GameMode;
    factionMatchup?: FactionMatchup;
  }): void {
    this.gameScene = data.gameScene;
    this.gameMode = data.gameMode ?? 'basic';
    this.factionMatchup = data.factionMatchup ?? this.factionMatchup;
  }

  create(): void {
    const chrome = this.add.graphics();
    chrome.fillStyle(0x071019, 0.82);
    chrome.fillRect(0, 0, 1280, 96);
    chrome.fillRect(0, 654, 1280, 66);
    chrome.lineStyle(1, 0x7f9bad, 0.35);
    chrome.lineBetween(0, 96, 1280, 96);
    chrome.lineBetween(0, 654, 1280, 654);

    // Turn indicator
    this.turnText = this.add.text(640, 12, 'Round 1', {
      font: 'bold 21px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    });
    this.turnText.setOrigin(0.5, 0);

    // Current team/worm indicator
    this.teamText = this.add.text(640, 40, '', {
      font: 'bold 15px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.teamText.setOrigin(0.5, 0);

    // Team status (top corners)
    this.redSquadText = this.add.text(14, 14, '', {
      font: 'bold 16px Arial',
      color: '#ff6666',
      stroke: '#000000',
      strokeThickness: 2,
    });

    this.blueSquadText = this.add.text(1266, 14, '', {
      font: 'bold 16px Arial',
      color: '#6666ff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(1, 0);

    this.objectiveText = this.add.text(640, 66, '', {
      font: 'bold 11px Courier New',
      color: '#dfe9ef',
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.objectiveText.setOrigin(0.5, 0);
    this.objectiveText.setVisible(this.gameMode === 'expanded');

    // Movement bar
    this.movementBar = this.add.graphics();
    this.movementText = this.add.text(640, 676, 'Movement: 200/200', {
      font: '12px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.movementText.setOrigin(0.5, 0);

    this.powerupText = this.add.text(16, 664, 'SUPPLIES  NONE', {
      font: 'bold 9px Courier New',
      color: '#aab7c0',
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.powerupText.setOrigin(0, 0);

    this.contextText = this.add.text(1264, 663, '', {
      font: 'bold 9px Courier New',
      color: '#ffe28a',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'right',
      wordWrap: { width: 420 },
    });
    this.contextText.setOrigin(1, 0);

    // Tactical Readout Panel (top left, below team indicator) - military style
    this.tacReadoutPanel = this.add.container(10, 40);
    this.tacReadoutPanel.setVisible(false);

    // Controls help - keyboard and mouse
    const terrainControl = this.gameMode === 'expanded' ? 'B Tunnel | Shift+B Cover 90' : 'B Cover 90';
    this.controlsText = this.add.text(640, 700,
      `ARROWS Move | W/S Aim | SHIFT Fine | RMB Pan | HOLD SPACE/LMB Fire | G Grapple | ${terrainControl} | H Heal`, {
      font: '11px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.controlsText.setOrigin(0.5, 0);

    // Listen for game events
    this.gameScene.events.on('turn-started', this.updateTurnDisplay, this);
    this.gameScene.events.on('game-over', this.showGameOver, this);
    this.gameScene.events.on('movement-update', this.updateMovementBar, this);
    this.gameScene.events.on('ability-status', this.updateAbilityStatus, this);
    this.gameScene.events.on('wind-changed', this.updateWind, this);

    // Wind gauge (top center, under the turn/objective lines)
    this.windGraphics = this.add.graphics();
    this.windText = this.add.text(640, 86, '', {
      font: 'bold 11px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0);
    this.gameScene.events.on('character-selection', this.showTacReadout, this);
    this.gameScene.events.on('new-game', this.resetUI, this);
    this.gameScene.events.on('objectives-update', this.updateObjectives, this);
    this.gameScene.events.on('powerups-update', this.updatePowerups, this);
    this.gameScene.events.on('context-update', this.updateContext, this);
    this.gameScene.events.on('show-operations-briefing', this.showOperationsBriefing, this);
    this.gameScene.events.on('factions-update', this.updateFactionMatchup, this);
    this.updateFactionLabels();
  }

  private updateTurnDisplay(info: TurnInfo): void {
    // Show round number instead of turn number (round = when all soldiers have acted)
    const roundNum = info.roundNumber || 1;
    this.turnText.setText(`Round ${roundNum}`);
    
    const teamColor = info.currentTeam === Team.RED ? '#ff6666' : '#6666ff';
    const factionId = info.currentTeam === Team.RED
      ? this.factionMatchup.red
      : this.factionMatchup.blue;
    const teamName = getFaction(factionId).shortName;
    
    // Show how many soldiers have acted vs total alive
    const redActed = info.redActedThisRound || 0;
    const blueActed = info.blueActedThisRound || 0;
    const redRemaining = info.redTeamAlive - redActed;
    const blueRemaining = info.blueTeamAlive - blueActed;
    
    this.teamText.setText(`${teamName} - ${info.currentSoldierName}  |  R:${redRemaining} B:${blueRemaining} ready`);
    this.teamText.setColor(teamColor);
    
    // Update max movement
    if (info.maxMovement) {
      this.maxMovement = info.maxMovement;
    }
    
    // Hide tactical readout panel when turn starts
    this.tacReadoutPanel.setVisible(false);
    
    // Reset movement display
    this.updateMovementBar({ movementUsed: 0, maxMovement: this.maxMovement });
  }

  private updateObjectives(info: ObjectiveInfo): void {
    this.gameMode = info.mode;
    if (info.mode !== 'expanded') {
      this.objectiveText.setVisible(false);
      return;
    }

    const relayState = info.owners
      .map(owner => owner === Team.RED ? 'R' : owner === Team.BLUE ? 'B' : '-')
      .join(' ');
    const redTag = getFaction(this.factionMatchup.red).tag;
    const blueTag = getFaction(this.factionMatchup.blue).tag;
    this.objectiveText.setText(
      `OPERATIONS  ${redTag} ${info.redScore}  |  RELAYS [ ${relayState} ]  |  ${info.blueScore} ${blueTag}  |  TARGET ${info.targetScore}`
    );
    this.objectiveText.setVisible(true);
  }

  private updatePowerups(info: PowerupInfo | null): void {
    if (!info) {
      this.powerupText.setText('SUPPLIES  NONE');
      this.powerupText.setColor('#aab7c0');
      return;
    }

    const supplies: string[] = [];
    if (info.armor > 0) supplies.push(`ARMOR ${info.armor} PASSIVE`);
    if (info.airstrikeCharges > 0) supplies.push(`X AIRSTRIKE x${info.airstrikeCharges}`);
    if (info.artilleryCharges > 0) supplies.push(`C HOWITZER x${info.artilleryCharges}`);

    this.powerupText.setText(`SUPPLIES  ${supplies.length > 0 ? supplies.join('  |  ') : 'NONE'}`);
    this.powerupText.setColor(supplies.length > 0 ? '#9eeaff' : '#aab7c0');
  }

  private updateContext(message: string): void {
    this.contextText.setText(message);
    this.contextText.setVisible(message.length > 0);
  }

  private updateFactionMatchup(matchup: FactionMatchup): void {
    this.factionMatchup = matchup;
    this.updateFactionLabels();
  }

  private updateFactionLabels(): void {
    if (!this.redSquadText || !this.blueSquadText) return;
    const redFaction = getFaction(this.factionMatchup.red);
    const blueFaction = getFaction(this.factionMatchup.blue);
    this.redSquadText.setText(`RED  ${redFaction.tag}  ${redFaction.shortName.toUpperCase()}`);
    this.blueSquadText.setText(`${blueFaction.shortName.toUpperCase()}  ${blueFaction.tag}  BLUE`);
  }

  private showOperationsBriefing(): void {
    if (this.briefingContainer) return;

    const redFaction = getFaction(this.factionMatchup.red);
    const blueFaction = getFaction(this.factionMatchup.blue);
    const container = this.add.container(0, 0);
    container.setDepth(2000);

    const blocker = this.add.rectangle(640, 360, 1280, 720, 0x02070b, 0.7);
    blocker.setInteractive();

    const panel = this.add.graphics();
    panel.fillStyle(0x0b1720, 0.98);
    panel.fillRect(240, 125, 800, 470);
    panel.lineStyle(2, 0xd7c98b, 0.9);
    panel.strokeRect(240, 125, 800, 470);
    panel.lineStyle(1, 0x7f9bad, 0.5);
    panel.strokeRect(246, 131, 788, 458);
    panel.lineBetween(270, 205, 1010, 205);
    panel.lineBetween(270, 449, 1010, 449);

    const eyebrow = this.add.text(640, 145, 'AXIS / ALLIES CONTACT REPORT', {
      font: 'bold 12px Courier New',
      color: '#d7c98b',
    }).setOrigin(0.5, 0);
    const title = this.add.text(640, 168, 'FACTION CONTACT', {
      font: 'bold 27px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0);

    const redTeam = this.add.text(400, 216, 'RED COMMAND', {
      font: 'bold 11px Courier New',
      color: '#ff7770',
    }).setOrigin(0.5, 0);
    const blueTeam = this.add.text(880, 216, 'BLUE COMMAND', {
      font: 'bold 11px Courier New',
      color: '#78aaff',
    }).setOrigin(0.5, 0);

    const redEmblem = this.add.image(400, 257, `faction-emblem-${redFaction.id}`);
    redEmblem.setDisplaySize(42, 42);
    const blueEmblem = this.add.image(880, 257, `faction-emblem-${blueFaction.id}`);
    blueEmblem.setDisplaySize(42, 42);

    const redPortrait = this.add.image(
      400,
      323,
      getFactionSpriteTextureKey(redFaction.id, 'rifle'),
    );
    redPortrait.setDisplaySize(104, 104);
    const bluePortrait = this.add.image(
      880,
      323,
      getFactionSpriteTextureKey(blueFaction.id, 'rifle'),
    );
    bluePortrait.setDisplaySize(104, 104);
    bluePortrait.setFlipX(true);

    const versus = this.add.text(640, 302, 'VS', {
      font: 'bold 35px Arial',
      color: '#d7c98b',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    const redName = this.add.text(400, 377, redFaction.name.toUpperCase(), {
      font: 'bold 16px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
      wordWrap: { width: 280 },
    }).setOrigin(0.5, 0);
    const blueName = this.add.text(880, 377, blueFaction.name.toUpperCase(), {
      font: 'bold 16px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
      wordWrap: { width: 280 },
    }).setOrigin(0.5, 0);

    const redAlliance = this.add.text(400, 402, `${redFaction.alliance.toUpperCase()}  |  ${redFaction.flavor}`, {
      font: '10px Courier New',
      color: '#c6d2d9',
      align: 'center',
      wordWrap: { width: 280 },
    }).setOrigin(0.5, 0);
    const blueAlliance = this.add.text(880, 402, `${blueFaction.alliance.toUpperCase()}  |  ${blueFaction.flavor}`, {
      font: '10px Courier New',
      color: '#c6d2d9',
      align: 'center',
      wordWrap: { width: 280 },
    }).setOrigin(0.5, 0);

    const missionTitle = this.add.text(
      640,
      462,
      this.gameMode === 'expanded' ? 'MISSION  SECURE THE SIGNAL NETWORK' : 'MISSION  ELIMINATE THE ENEMY SQUAD',
      {
        font: 'bold 13px Courier New',
        color: '#9eeaff',
      },
    ).setOrigin(0.5, 0);
    const missionCopy = this.add.text(
      640,
      488,
      this.gameMode === 'expanded'
        ? 'Enter relay rings, end the turn inside to capture, and hold through round end.\nFirst to 7 signal points or total elimination wins.'
        : 'Use movement, terrain, cover, and class weapons to remove all five enemy soldiers.',
      {
        font: '11px Courier New',
        color: '#dfe9ef',
        align: 'center',
        lineSpacing: 5,
        wordWrap: { width: 680 },
      },
    ).setOrigin(0.5, 0);

    const closeBg = this.add.rectangle(640, 558, 210, 36, 0x243745, 1);
    closeBg.setStrokeStyle(1, 0x9eeaff, 0.9);
    closeBg.setInteractive({ useHandCursor: true });
    const closeText = this.add.text(640, 558, 'BEGIN OPERATION', {
      font: 'bold 13px Courier New',
      color: '#ffffff',
    }).setOrigin(0.5, 0);
    closeText.setOrigin(0.5);

    const close = (): void => this.hideOperationsBriefing();
    blocker.on('pointerdown', close);
    closeBg.on('pointerdown', close);
    container.add([
      blocker,
      panel,
      eyebrow,
      title,
      redTeam,
      blueTeam,
      redEmblem,
      blueEmblem,
      redPortrait,
      bluePortrait,
      versus,
      redName,
      blueName,
      redAlliance,
      blueAlliance,
      missionTitle,
      missionCopy,
      closeBg,
      closeText,
    ]);
    this.briefingContainer = container;
  }

  private hideOperationsBriefing(): void {
    if (this.briefingContainer) {
      this.briefingContainer.destroy(true);
      this.briefingContainer = null;
    }
  }

  private updateWind(wind: number): void {
    const g = this.windGraphics;
    g.clear();
    const cx = 640;
    const y = 102;
    const halfWidth = 60;

    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(cx - halfWidth - 4, y - 4, halfWidth * 2 + 8, 12, 3);
    g.lineStyle(1, 0xffffff, 0.4);
    g.lineBetween(cx, y - 4, cx, y + 8);

    if (isWindCalm(wind)) {
      this.windText.setText('WIND: CALM');
      return;
    }

    const strength = Math.abs(wind);
    const len = strength * halfWidth;
    const dir = wind > 0 ? 1 : -1;
    const color = strength >= 0.7 ? 0xff5544 : strength >= 0.4 ? 0xffcc33 : 0x66ddff;
    g.fillStyle(color, 1);
    g.fillRect(dir > 0 ? cx : cx - len, y, len, 4);
    const tipX = cx + dir * len;
    g.fillTriangle(tipX + dir * 7, y + 2, tipX, y - 3, tipX, y + 7);

    const arrows = (dir > 0 ? '▶' : '◀').repeat(Math.ceil(strength * 3));
    const label = `${strength >= 0.7 ? 'GALE' : 'WIND'} ${Math.round(strength * 100)}%`;
    this.windText.setText(dir > 0 ? `${label} ${arrows}` : `${arrows} ${label}`);
  }

  // One line above the movement bar: what B / Shift+B / H will do right now, or why they can't.
  private updateAbilityStatus(list: { label: string; status: AbilityStatus }[] | null): void {
    this.abilityTexts.forEach(t => t.destroy());
    this.abilityTexts = [];
    if (!list || list.length === 0) return;

    const gap = 22;
    const texts = list.map(({ label, status }) =>
      this.add.text(0, 643, `${label}: ${status.reason}`, {
        font: 'bold 11px Arial',
        color: status.ready ? '#7dffa0' : '#9a9a9a',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0, 0));
    const total = texts.reduce((w, t) => w + t.width, 0) + gap * (texts.length - 1);
    let x = 640 - total / 2;
    for (const t of texts) {
      t.setX(x);
      x += t.width + gap;
    }
    this.abilityTexts = texts;
  }

  private updateMovementBar(info: { movementUsed: number; maxMovement: number }): void {
    this.movementBar.clear();
    
    const barWidth = 200;
    const barHeight = 10;
    const x = 640 - barWidth / 2;
    const y = 663;
    
    // Background
    this.movementBar.fillStyle(0x333333, 0.8);
    this.movementBar.fillRect(x, y, barWidth, barHeight);
    
    // Remaining movement
    const remaining = Math.max(0, info.maxMovement - info.movementUsed);
    const remainingWidth = (remaining / info.maxMovement) * barWidth;
    
    // Color based on remaining (green -> yellow -> red)
    const ratio = remaining / info.maxMovement;
    let color: number;
    if (ratio > 0.5) {
      color = 0x44ff44;
    } else if (ratio > 0.25) {
      color = 0xffff44;
    } else {
      color = 0xff4444;
    }
    
    this.movementBar.fillStyle(color, 1);
    this.movementBar.fillRect(x, y, remainingWidth, barHeight);
    
    // Border
    this.movementBar.lineStyle(2, 0xffffff, 0.5);
    this.movementBar.strokeRect(x, y, barWidth, barHeight);
    
    this.movementText.setText(`Movement: ${Math.floor(remaining)}/${info.maxMovement}`);
  }

  private showTacReadout(info: CharacterSelectionInfo): void {
    // The header otherwise keeps showing the previous turn while a new team picks a soldier.
    const faction = getFaction(info.soldier.factionId);
    const teamName = faction.shortName;
    this.teamText.setText(`${teamName} - choose a soldier`);
    this.teamText.setColor(info.team === Team.RED ? '#ff6666' : '#6666ff');

    // Clear existing panel
    this.tacReadoutPanel.removeAll(true);
    
    const panelWidth = 230;
    const panelHeight = 280;
    
    // Position panel on opposite side from soldier (screen coords)
    // If soldier is on left half of world, show panel on right; otherwise show on left
    const worldWidth = (this.gameScene.physics?.world?.bounds?.width as number | undefined) || 2560;
    const worldMidpoint = worldWidth / 2;
    const panelX = info.soldierX < worldMidpoint ? 1040 : 10;
    this.tacReadoutPanel.setPosition(panelX, 40);
    
    // Create military-style panel background
    const panelBg = this.add.graphics();
    
    // Main dark background with slight transparency
    panelBg.fillStyle(0x1a2a1a, 0.95);
    panelBg.fillRect(0, 0, panelWidth, panelHeight);
    
    // Green military border
    panelBg.lineStyle(2, 0x3d6b3d, 1);
    panelBg.strokeRect(0, 0, panelWidth, panelHeight);
    
    // Inner border accent
    panelBg.lineStyle(1, 0x4a8b4a, 0.6);
    panelBg.strokeRect(3, 3, panelWidth - 6, panelHeight - 6);
    
    // Corner accents (military style)
    panelBg.fillStyle(0x4a8b4a, 1);
    panelBg.fillRect(0, 0, 8, 2);
    panelBg.fillRect(0, 0, 2, 8);
    panelBg.fillRect(panelWidth - 8, 0, 8, 2);
    panelBg.fillRect(panelWidth - 2, 0, 2, 8);
    panelBg.fillRect(0, panelHeight - 2, 8, 2);
    panelBg.fillRect(0, panelHeight - 8, 2, 8);
    panelBg.fillRect(panelWidth - 8, panelHeight - 2, 8, 2);
    panelBg.fillRect(panelWidth - 2, panelHeight - 8, 2, 8);
    
    // Scanline effect
    panelBg.lineStyle(1, 0x2a4a2a, 0.3);
    for (let y = 5; y < panelHeight; y += 4) {
      panelBg.lineBetween(3, y, panelWidth - 3, y);
    }
    
    this.tacReadoutPanel.add(panelBg);
    
    // Header - "TAC READOUT"
    const header = this.add.text(panelWidth / 2, 8, '[ TAC READOUT ]', {
      font: 'bold 11px Courier New',
      color: '#5aff5a',
    });
    header.setOrigin(0.5, 0);
    this.tacReadoutPanel.add(header);
    
    // Divider line
    const divider = this.add.graphics();
    divider.lineStyle(1, 0x4a8b4a, 0.8);
    divider.lineBetween(10, 24, panelWidth - 10, 24);
    this.tacReadoutPanel.add(divider);
    
    // Unit designation
    const unitLabel = this.add.text(10, 30, 'UNIT:', {
      font: '9px Courier New',
      color: '#7aaa7a',
    });
    this.tacReadoutPanel.add(unitLabel);
    
    const unitName = this.add.text(
      panelWidth - 52,
      30,
      `${info.soldier.name.toUpperCase()} [${faction.tag}]`,
      {
      font: 'bold 10px Courier New',
      color: '#ffffff',
      },
    );
    unitName.setOrigin(1, 0);
    this.tacReadoutPanel.add(unitName);

    const portraitFrame = this.add.rectangle(panelWidth - 27, 52, 46, 46, 0x0a1115, 0.9);
    portraitFrame.setStrokeStyle(1, faction.palette.accent, 0.9);
    this.tacReadoutPanel.add(portraitFrame);
    const portrait = this.add.image(panelWidth - 27, 53, info.soldier.portraitTextureKey);
    portrait.setDisplaySize(42, 42);
    this.tacReadoutPanel.add(portrait);
    
    // Selection indicator
    const selText = this.add.text(10, 44, 'SELECT:', {
      font: '9px Courier New',
      color: '#7aaa7a',
    });
    this.tacReadoutPanel.add(selText);
    
    const selValue = this.add.text(panelWidth - 52, 44, `${info.currentIndex + 1}/${info.totalCount}`, {
      font: 'bold 10px Courier New',
      color: '#ffff66',
    });
    selValue.setOrigin(1, 0);
    this.tacReadoutPanel.add(selValue);
    
    // Health bar
    const healthLabel = this.add.text(10, 60, 'HEALTH:', {
      font: '9px Courier New',
      color: '#7aaa7a',
    });
    this.tacReadoutPanel.add(healthLabel);
    
    const healthBarBg = this.add.graphics();
    healthBarBg.fillStyle(0x333333, 1);
    healthBarBg.fillRect(60, 60, 100, 10);
    const healthColor = info.soldier.health > 50 ? 0x44ff44 : info.soldier.health > 25 ? 0xffff44 : 0xff4444;
    healthBarBg.fillStyle(healthColor, 1);
    healthBarBg.fillRect(60, 60, info.soldier.health, 10);
    healthBarBg.lineStyle(1, 0x5a8a5a, 1);
    healthBarBg.strokeRect(60, 60, 100, 10);
    this.tacReadoutPanel.add(healthBarBg);
    
    const healthValue = this.add.text(panelWidth - 52, 60, `${info.soldier.health}%`, {
      font: 'bold 9px Courier New',
      color: '#ffffff',
    });
    healthValue.setOrigin(1, 0);
    this.tacReadoutPanel.add(healthValue);
    
    // Divider
    const divider2 = this.add.graphics();
    divider2.lineStyle(1, 0x4a8b4a, 0.5);
    divider2.lineBetween(10, 78, panelWidth - 10, 78);
    this.tacReadoutPanel.add(divider2);
    
    // Weapon header
    const weaponHeader = this.add.text(panelWidth / 2, 82, `[ ${info.weapon.name.toUpperCase()} ]`, {
      font: 'bold 10px Courier New',
      color: '#66ffff',
    });
    weaponHeader.setOrigin(0.5, 0);
    this.tacReadoutPanel.add(weaponHeader);
    
    // Weapon stats
    const statsY = 100;
    const lineHeight = 16;
    
    const stats = [
      { label: 'DAMAGE', value: info.weapon.pelletCount > 1 ? `${info.weapon.damage}x${info.weapon.pelletCount}` : `${info.weapon.damage}`, color: '#ff6666' },
      { label: 'BLAST RAD', value: `${info.weapon.explosionRadius}m`, color: '#ffaa44' },
      { label: 'VELOCITY', value: `${info.weapon.projectileSpeed}`, color: '#66ff66' },
      { label: 'GRAVITY', value: `${(info.weapon.gravity * 100).toFixed(0)}%`, color: '#6666ff' },
      { label: 'WEIGHT', value: info.weapon.weight <= 1.5 ? 'LIGHT' : info.weapon.weight <= 2.5 ? 'MEDIUM' : 'HEAVY', color: '#ffff66' },
      { label: 'BOUNCE', value: info.weapon.bounce > 0 ? 'YES' : 'NO', color: info.weapon.bounce > 0 ? '#44ff44' : '#888888' },
    ];
    
    stats.forEach((stat, i) => {
      const y = statsY + i * lineHeight;
      
      const label = this.add.text(10, y, stat.label + ':', {
        font: '9px Courier New',
        color: '#7aaa7a',
      });
      this.tacReadoutPanel.add(label);
      
      const value = this.add.text(panelWidth - 10, y, stat.value, {
        font: 'bold 9px Courier New',
        color: stat.color,
      });
      value.setOrigin(1, 0);
      this.tacReadoutPanel.add(value);
    });
    
    // Divider before description
    const divider3 = this.add.graphics();
    divider3.lineStyle(1, 0x4a8b4a, 0.5);
    divider3.lineBetween(10, statsY + stats.length * lineHeight + 4, panelWidth - 10, statsY + stats.length * lineHeight + 4);
    this.tacReadoutPanel.add(divider3);
    
    // Description
    const descY = statsY + stats.length * lineHeight + 10;
    const desc = this.add.text(panelWidth / 2, descY, info.weapon.description, {
      font: '8px Courier New',
      color: '#aaffaa',
      wordWrap: { width: panelWidth - 20 },
      align: 'center',
    });
    desc.setOrigin(0.5, 0);
    this.tacReadoutPanel.add(desc);
    
    // Instructions at bottom
    const instructions = this.add.text(panelWidth / 2, panelHeight - 32, '< > CYCLE | CLICK SELECT', {
      font: '8px Courier New',
      color: '#5a8a5a',
    });
    instructions.setOrigin(0.5, 0);
    this.tacReadoutPanel.add(instructions);
    
    const instructions2 = this.add.text(panelWidth / 2, panelHeight - 20, 'RMB DRAG PAN | ENTER OK', {
      font: 'bold 9px Courier New',
      color: '#88ff88',
    });
    instructions2.setOrigin(0.5, 0);
    this.tacReadoutPanel.add(instructions2);
    
    this.tacReadoutPanel.setVisible(true);
  }

  private resetUI(): void {
    this.turnText.setText('Round 1');
    this.teamText.setText('');
    this.tacReadoutPanel.setVisible(false);
    this.updatePowerups(null);
    this.updateAbilityStatus(null);
    this.windGraphics.clear();
    this.windText.setText('');
    this.updateContext('');
    this.hideOperationsBriefing();
    this.updateFactionLabels();
  }

  private showGameOver(winner: Team | null, reason: 'elimination' | 'signal' = 'elimination'): void {
    // Hide tactical readout
    this.tacReadoutPanel.setVisible(false);
    this.hideOperationsBriefing();
    this.updateAbilityStatus(null);
    
    // Darken background
    this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7);

    let text: string;
    let color: string;

    if (winner === Team.RED) {
      const faction = getFaction(this.factionMatchup.red);
      text = reason === 'signal'
        ? `${faction.shortName.toUpperCase()} SIGNAL VICTORY`
        : `${faction.shortName.toUpperCase()} WINS`;
      color = '#ff6666';
    } else if (winner === Team.BLUE) {
      const faction = getFaction(this.factionMatchup.blue);
      text = reason === 'signal'
        ? `${faction.shortName.toUpperCase()} SIGNAL VICTORY`
        : `${faction.shortName.toUpperCase()} WINS`;
      color = '#6666ff';
    } else {
      text = "IT'S A DRAW!";
      color = '#ffffff';
    }

    const winText = this.add.text(640, 300, text, {
      font: 'bold 48px Arial',
      color: color,
      stroke: '#000000',
      strokeThickness: 6,
    });
    winText.setOrigin(0.5);

    const restartText = this.add.text(640, 400, 'Press N for New Game', {
      font: '24px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    });
    restartText.setOrigin(0.5);
  }
}
