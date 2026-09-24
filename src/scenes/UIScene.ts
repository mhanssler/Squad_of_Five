import Phaser from 'phaser';
import { Team } from '../systems/TurnManager';
import type { AbilityStatus } from '../systems/Abilities';
import { isWindCalm } from '../systems/Wind';

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

interface AbilityStatusInfo {
  dig: AbilityStatus;
  heal: AbilityStatus;
  special: { name: string; hint: string; armed: boolean } | null;
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
}

interface CharacterSelectionInfo {
  team: Team;
  soldier: SoldierInfo;
  weapon: WeaponInfo;
  currentIndex: number;
  totalCount: number;
  soldierX: number;
}

export class UIScene extends Phaser.Scene {
  private turnText!: Phaser.GameObjects.Text;
  private teamText!: Phaser.GameObjects.Text;
  private controlsText!: Phaser.GameObjects.Text;
  private movementBar!: Phaser.GameObjects.Graphics;
  private movementText!: Phaser.GameObjects.Text;
  private digStatusText!: Phaser.GameObjects.Text;
  private healStatusText!: Phaser.GameObjects.Text;
  private specialStatusText!: Phaser.GameObjects.Text;
  private windGraphics!: Phaser.GameObjects.Graphics;
  private windText!: Phaser.GameObjects.Text;
  private tacReadoutPanel!: Phaser.GameObjects.Container;
  private gameScene!: Phaser.Scene;
  private maxMovement: number = 200;

  constructor() {
    super({ key: 'UIScene' });
  }

  init(data: { gameScene: Phaser.Scene }): void {
    this.gameScene = data.gameScene;
  }

  create(): void {
    // Turn indicator
    this.turnText = this.add.text(640, 20, 'Turn 1', {
      font: 'bold 24px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    });
    this.turnText.setOrigin(0.5, 0);

    // Current team/worm indicator
    this.teamText = this.add.text(640, 50, '', {
      font: '18px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.teamText.setOrigin(0.5, 0);

    // Team status (top corners)
    this.add.text(10, 10, '🔴 Red Team', {
      font: 'bold 16px Arial',
      color: '#ff6666',
      stroke: '#000000',
      strokeThickness: 2,
    });

    this.add.text(1270, 10, '🔵 Blue Team', {
      font: 'bold 16px Arial',
      color: '#6666ff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(1, 0);

    // Movement bar
    this.movementBar = this.add.graphics();
    this.movementText = this.add.text(640, 640, 'Movement: 200/200', {
      font: '14px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.movementText.setOrigin(0.5, 0);

    // Ability availability (B Dig In / H Heal), shown just above the movement bar during the player's turn
    const abilityStyle = { font: 'bold 13px Arial', color: '#ffffff', stroke: '#000000', strokeThickness: 3 };
    this.digStatusText = this.add.text(630, 602, '', abilityStyle).setOrigin(1, 0).setVisible(false);
    this.healStatusText = this.add.text(650, 602, '', abilityStyle).setOrigin(0, 0).setVisible(false);
    this.specialStatusText = this.add.text(640, 582, '', abilityStyle).setOrigin(0.5, 0).setVisible(false);

    // Wind gauge (top center, under the team line)
    this.windGraphics = this.add.graphics();
    this.windText = this.add.text(640, 78, '', {
      font: 'bold 12px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0);

    // Tactical Readout Panel (top left, below team indicator) - military style
    this.tacReadoutPanel = this.add.container(10, 40);
    this.tacReadoutPanel.setVisible(false);

    // Controls help - keyboard and mouse
    this.controlsText = this.add.text(640, 680, 
      '← → Move | W/S Aim | A/D Scout | SPACE/LMB Fire | RMB Drag | G Grapple | B Dig In | H Heal | Q Special | Scroll Zoom', {
      font: '13px Arial',
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
    this.gameScene.events.on('character-selection', this.showTacReadout, this);
    this.gameScene.events.on('new-game', this.resetUI, this);
  }

  private updateTurnDisplay(info: TurnInfo): void {
    // Show round number instead of turn number (round = when all soldiers have acted)
    const roundNum = info.roundNumber || 1;
    this.turnText.setText(`Round ${roundNum}`);
    
    const teamColor = info.currentTeam === Team.RED ? '#ff6666' : '#6666ff';
    const teamName = info.currentTeam === Team.RED ? 'Red' : 'Blue';
    
    // Show how many soldiers have acted vs total alive
    const redActed = info.redActedThisRound || 0;
    const blueActed = info.blueActedThisRound || 0;
    const redRemaining = info.redTeamAlive - redActed;
    const blueRemaining = info.blueTeamAlive - blueActed;
    
    this.teamText.setText(`${teamName} Team - ${info.currentSoldierName} (🔴${redRemaining} 🔵${blueRemaining} left)`);
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

  private updateAbilityStatus(info: AbilityStatusInfo | null): void {
    this.digStatusText.setVisible(!!info);
    this.healStatusText.setVisible(!!info);
    this.specialStatusText.setVisible(!!info?.special);
    if (!info) return;
    this.setAbilityText(this.digStatusText, '[B] Dig In', info.dig);
    this.setAbilityText(this.healStatusText, '[H] Heal', info.heal);
    if (info.special) {
      const { name, hint, armed } = info.special;
      this.specialStatusText.setText(armed ? `★ ${name} ARMED - ${hint} (Q/ESC to put away)` : `[Q] ${name}`);
      this.specialStatusText.setColor(armed ? '#ffdd33' : '#ffeeaa');
    }
  }

  private updateWind(wind: number): void {
    const g = this.windGraphics;
    g.clear();
    const cx = 640;
    const y = 96;
    const halfWidth = 60;

    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(cx - halfWidth - 4, y - 4, halfWidth * 2 + 8, 12, 3);
    g.lineStyle(1, 0xffffff, 0.4);
    g.lineBetween(cx, y - 4, cx, y + 8);

    if (isWindCalm(wind)) {
      this.windText.setText('WIND: CALM');
      return;
    }

    const len = Math.abs(wind) * halfWidth;
    const dir = wind > 0 ? 1 : -1;
    const color = Math.abs(wind) >= 0.7 ? 0xff5544 : Math.abs(wind) >= 0.4 ? 0xffcc33 : 0x66ddff;
    g.fillStyle(color, 1);
    g.fillRect(dir > 0 ? cx : cx - len, y, len, 4);
    const tipX = cx + dir * len;
    g.fillTriangle(tipX + dir * 7, y + 2, tipX, y - 3, tipX, y + 7);

    const arrows = dir > 0 ? '▶'.repeat(Math.ceil(Math.abs(wind) * 3)) : '◀'.repeat(Math.ceil(Math.abs(wind) * 3));
    const label = Math.abs(wind) >= 0.7 ? 'GALE' : 'WIND';
    this.windText.setText(dir > 0 ? `${label} ${Math.round(Math.abs(wind) * 100)}% ${arrows}` : `${arrows} ${label} ${Math.round(Math.abs(wind) * 100)}%`);
  }

  private setAbilityText(text: Phaser.GameObjects.Text, label: string, status: AbilityStatus): void {
    text.setText(`${label}: ${status.ready ? 'READY' : status.reason}`);
    text.setColor(status.ready ? '#66ff88' : '#888888');
  }

  private updateMovementBar(info: { movementUsed: number; maxMovement: number }): void {
    this.movementBar.clear();
    
    const barWidth = 200;
    const barHeight = 10;
    const x = 640 - barWidth / 2;
    const y = 625;
    
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
    const teamName = info.team === Team.RED ? 'Red' : 'Blue';
    this.teamText.setText(`${teamName} Team — choose a soldier`);
    this.teamText.setColor(info.team === Team.RED ? '#ff6666' : '#6666ff');

    // Clear existing panel
    this.tacReadoutPanel.removeAll(true);
    
    const panelWidth = 200;
    const panelHeight = 280;
    
    // Position panel on opposite side from soldier (screen coords)
    // If soldier is on left half of world, show panel on right; otherwise show on left
    const worldWidth = (this.gameScene.physics?.world?.bounds?.width as number | undefined) || 2560;
    const worldMidpoint = worldWidth / 2;
    const panelX = info.soldierX < worldMidpoint ? 1070 : 10;
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
    const header = this.add.text(panelWidth / 2, 8, '◆ TAC READOUT ◆', {
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
    
    const unitName = this.add.text(panelWidth - 10, 30, info.soldier.name.toUpperCase(), {
      font: 'bold 10px Courier New',
      color: '#ffffff',
    });
    unitName.setOrigin(1, 0);
    this.tacReadoutPanel.add(unitName);
    
    // Selection indicator
    const selText = this.add.text(10, 44, 'SELECT:', {
      font: '9px Courier New',
      color: '#7aaa7a',
    });
    this.tacReadoutPanel.add(selText);
    
    const selValue = this.add.text(panelWidth - 10, 44, `${info.currentIndex + 1}/${info.totalCount}`, {
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
    
    const healthValue = this.add.text(panelWidth - 10, 60, `${info.soldier.health}%`, {
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
    const instructions = this.add.text(panelWidth / 2, panelHeight - 32, '◄ ► CYCLE | CLICK SELECT', {
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
    this.turnText.setText('Turn 1');
    this.teamText.setText('');
    this.tacReadoutPanel.setVisible(false);
    this.updateAbilityStatus(null);
    this.windGraphics.clear();
    this.windText.setText('');
  }

  private showGameOver(winner: Team | null): void {
    // Hide tactical readout
    this.tacReadoutPanel.setVisible(false);
    this.updateAbilityStatus(null);
    
    // Darken background
    this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7);

    let text: string;
    let color: string;

    if (winner === Team.RED) {
      text = '🔴 RED TEAM WINS! 🔴';
      color = '#ff6666';
    } else if (winner === Team.BLUE) {
      text = '🔵 BLUE TEAM WINS! 🔵';
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
