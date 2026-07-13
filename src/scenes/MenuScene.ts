import Phaser from 'phaser';
import { SoundManager } from '../utils/SoundManager';
import { getMenuClassGridPosition, MENU_ORDERED_CLASS_IDS, SOLDIER_CLASSES, type SoldierClass } from './MenuLayout';

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
  private mapSize: 'small' | 'medium' | 'large' = 'medium';
  private terrainPreset: 'standard' | 'plains' | 'hills' | 'caves' = 'standard';
  private vsAI: boolean = true;
  
  private titleText!: Phaser.GameObjects.Text;
  private teamIndicator!: Phaser.GameObjects.Text;
  private soldierCards: Phaser.GameObjects.Container[] = [];
  private selectedDisplay!: Phaser.GameObjects.Container;
  private startButton!: Phaser.GameObjects.Container;
  private autoSelectButton!: Phaser.GameObjects.Container;
  private battlefieldPanel!: Phaser.GameObjects.Container;
  private battlefieldPreview!: Phaser.GameObjects.Graphics;
  private mapSizeButtonBg: Partial<Record<'small' | 'medium' | 'large', Phaser.GameObjects.Graphics>> = {};
  private terrainButtonBg: Partial<Record<'standard' | 'plains' | 'hills' | 'caves', Phaser.GameObjects.Graphics>> = {};
  private opponentButtonBg: Partial<Record<'ai' | 'hotseat', Phaser.GameObjects.Graphics>> = {};
  private battlefieldInfoText!: Phaser.GameObjects.Text;
  private battlefieldTerrainText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    // Background - WW2 camouflage pattern
    this.cameras.main.setBackgroundColor('#1d241b');
    
    // Create camouflage pattern with irregular blobs
    this.createCamouflageBackground();
    
    // Title
    this.titleText = this.add.text(640, 38, 'SQUAD OF FIVE', {
      font: 'bold 48px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 5,
    });
    this.titleText.setOrigin(0.5);
    
    // Subtitle
    this.add.text(640, 88, 'SELECT YOUR SQUAD', {
      font: '24px Arial',
      color: '#d8dfd2',
    }).setOrigin(0.5);
    
    // Team indicator
    this.teamIndicator = this.add.text(640, 126, 'RED TEAM - Choose 5 Soldiers', {
      font: 'bold 28px Arial',
      color: '#ff6666',
      stroke: '#000000',
      strokeThickness: 4,
    });
    this.teamIndicator.setOrigin(0.5);
    
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
    this.updateCardHighlights();
    
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
    // Clear prior cards if scene is recreated (defensive)
    this.soldierCards.forEach(c => c.destroy());
    this.soldierCards = [];

    const byId = new Map<string, SoldierClass>(SOLDIER_CLASSES.map(s => [s.id, s]));

    this.orderedClasses = MENU_ORDERED_CLASS_IDS
      .map(id => byId.get(id))
      .filter(Boolean) as SoldierClass[];

    // Left panel framing (soldiers)
    const frame = this.add.graphics();
    frame.fillStyle(0x101820, 0.92);
    frame.fillRect(30, 165, 830, 440);
    frame.lineStyle(2, 0x92a17f, 0.9);
    frame.strokeRect(30, 165, 830, 440);

    const headerBar = this.add.graphics();
    headerBar.fillStyle(0x26311f, 1);
    headerBar.fillRect(30, 165, 830, 36);
    headerBar.lineStyle(1, 0x92a17f, 0.75);
    headerBar.lineBetween(30, 201, 860, 201);

    this.add.text(54, 176, 'UNIT ROSTER', {
      font: 'bold 14px Arial',
      color: '#ffffff',
    }).setOrigin(0, 0);

    this.add.text(754, 176, '13 CLASSES', {
      font: 'bold 12px Arial',
      color: '#b8c9a8',
    }).setOrigin(0, 0);

    // Create tiles within group sections
    this.orderedClasses.forEach((soldier, globalIndex) => {
        const pos = getMenuClassGridPosition(globalIndex);
        const x = pos.x + pos.w / 2;
        const y = pos.y + pos.h / 2;
        const cardWidth = pos.w;
        const cardHeight = pos.h;
        const role =
          ['shotgun', 'flamer', 'slug'].includes(soldier.id) ? 'CLOSE' :
          ['sniper', 'rocket', 'mortar'].includes(soldier.id) ? 'LONG' :
          soldier.id === 'pistol' ? 'SUPPORT' :
          'MID';

        const card = this.add.container(Math.round(x), Math.round(y));

        // Card background (compact tile)
        const bg = this.add.graphics();
        bg.fillStyle(0x1a2433, 1);
        bg.fillRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight);
        bg.lineStyle(2, soldier.color, 0.65);
        bg.strokeRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight);
        card.add(bg);

        // Left icon
        const icon = this.add.graphics();
        icon.fillStyle(soldier.color, 1);
        icon.fillRect(-cardWidth / 2 + 12, -22, 28, 28);
        icon.fillStyle(0x000000, 0.22);
        icon.fillRect(-cardWidth / 2 + 18, -16, 16, 16);
        card.add(icon);

        const nameText = this.add.text(-cardWidth / 2 + 50, -26, soldier.name.toUpperCase(), {
          font: 'bold 12px Arial',
          color: '#ffffff',
        });
        nameText.setOrigin(0, 0);
        card.add(nameText);

        const roleText = this.add.text(cardWidth / 2 - 9, -26, role, {
          font: 'bold 9px Arial',
          color: '#a9b99a',
        });
        roleText.setOrigin(1, 0);
        card.add(roleText);

        const weaponText = this.add.text(-cardWidth / 2 + 50, -9, soldier.weapon, {
          font: '10px Arial',
          color: '#b7c5d8',
        });
        weaponText.setOrigin(0, 0);
        card.add(weaponText);

        const descText = this.add.text(-cardWidth / 2 + 50, 8, soldier.description, {
          font: '9px Arial',
          color: '#7f90a8',
          wordWrap: { width: cardWidth - 60 },
        });
        descText.setOrigin(0, 0);
        card.add(descText);

        // Selection number (shown when selected)
        const selNum = this.add.text(cardWidth / 2 - 14, -cardHeight / 2 + 10, '', {
          font: 'bold 16px Arial',
          color: '#00ff00',
          stroke: '#000000',
          strokeThickness: 3,
        });
        selNum.setOrigin(0.5);
        selNum.setName('selNum');
        card.add(selNum);

        card.setData('soldierId', soldier.id);
        card.setData('bg', bg);
        card.setData('index', globalIndex);
        card.setData('w', cardWidth); // base size in local coords (before scaling)
        card.setData('h', cardHeight);

        this.soldierCards.push(card);
    });
  }

  private createSelectedDisplay(): void {
    // Keep selection UI under the soldier grid (left side)
    // Moved down + slightly right so it doesn't overlap the soldier frame or the Random button.
    this.selectedDisplay = this.add.container(545, 665);
    
    // Background panel
    const bg = this.add.graphics();
    bg.fillStyle(0x121820, 0.95);
    bg.fillRect(-300, -50, 600, 100);
    bg.lineStyle(2, 0x92a17f, 0.85);
    bg.strokeRect(-300, -50, 600, 100);
    this.selectedDisplay.add(bg);
    
    // Title
    const title = this.add.text(0, -35, 'SELECTED SQUAD', {
      font: 'bold 14px Arial',
      color: '#666688',
    });
    title.setOrigin(0.5);
    this.selectedDisplay.add(title);
    
    // 5 slots for selected soldiers
    for (let i = 0; i < 5; i++) {
      const slotX = -200 + i * 100;
      
      const slot = this.add.graphics();
      slot.fillStyle(0x273144, 1);
      slot.fillRect(slotX - 35, -15, 70, 50);
      slot.lineStyle(1, 0x657089, 1);
      slot.strokeRect(slotX - 35, -15, 70, 50);
      this.selectedDisplay.add(slot);
      
      const slotText = this.add.text(slotX, 10, `[${i + 1}]`, {
        font: '12px Arial',
        color: '#444466',
      });
      slotText.setOrigin(0.5);
      slotText.setName(`slot${i}`);
      this.selectedDisplay.add(slotText);
    }
  }

  private createAutoSelectButton(): void {
    // Place left of the Selected Squad panel to avoid overlap.
    this.autoSelectButton = this.add.container(110, 665);
    
    const bg = this.add.graphics();
    bg.fillStyle(0x446644, 1);
    bg.fillRect(-80, -20, 160, 40);
    bg.lineStyle(2, 0x66aa66, 1);
    bg.strokeRect(-80, -20, 160, 40);
    this.autoSelectButton.add(bg);
    
    const text = this.add.text(0, 0, 'RANDOM [R]', {
      font: 'bold 16px Arial',
      color: '#ffffff',
    });
    text.setOrigin(0.5);
    this.autoSelectButton.add(text);
    
    // Make interactive
    const hitArea = this.add.rectangle(0, 0, 160, 40, 0x000000, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', () => this.autoSelectSquad());
    hitArea.on('pointerover', () => bg.clear().fillStyle(0x558855, 1).fillRect(-80, -20, 160, 40).lineStyle(2, 0x88cc88, 1).strokeRect(-80, -20, 160, 40));
    hitArea.on('pointerout', () => bg.clear().fillStyle(0x446644, 1).fillRect(-80, -20, 160, 40).lineStyle(2, 0x66aa66, 1).strokeRect(-80, -20, 160, 40));
    this.autoSelectButton.add(hitArea);
  }

  private createStartButton(): void {
    this.startButton = this.add.container(1080, 665);
    this.startButton.setVisible(false);
    
    const bg = this.add.graphics();
    bg.fillStyle(0x664444, 1);
    bg.fillRect(-100, -25, 200, 50);
    bg.lineStyle(3, 0xaa6666, 1);
    bg.strokeRect(-100, -25, 200, 50);
    this.startButton.add(bg);
    
    const text = this.add.text(0, 0, 'START BATTLE', {
      font: 'bold 20px Arial',
      color: '#ffffff',
    });
    text.setOrigin(0.5);
    this.startButton.add(text);
    
    // Make interactive
    const hitArea = this.add.rectangle(0, 0, 200, 50, 0x000000, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', () => this.startGame());
    hitArea.on('pointerover', () => bg.clear().fillStyle(0x885555, 1).fillRect(-100, -25, 200, 50).lineStyle(3, 0xcc8888, 1).strokeRect(-100, -25, 200, 50));
    hitArea.on('pointerout', () => bg.clear().fillStyle(0x664444, 1).fillRect(-100, -25, 200, 50).lineStyle(3, 0xaa6666, 1).strokeRect(-100, -25, 200, 50));
    this.startButton.add(hitArea);
  }

  private setupInput(): void {
    // Arrow keys for navigation
    this.input.keyboard!.on('keydown-LEFT', () => {
      this.navigateCards(-1);
    });
    
    this.input.keyboard!.on('keydown-RIGHT', () => {
      this.navigateCards(1);
    });
    
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
    });
  }

  private createBattlefieldPanel(): void {
    const panelX = 890;
    const panelY = 165;
    const panelW = 360;
    const panelH = 470;

    this.battlefieldPanel = this.add.container(panelX, panelY);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f1620, 0.75);
    bg.fillRoundedRect(0, 0, panelW, panelH, 12);
    bg.lineStyle(2, 0x2a3a4a, 0.9);
    bg.strokeRoundedRect(0, 0, panelW, panelH, 12);
    this.battlefieldPanel.add(bg);

    const title = this.add.text(panelW / 2, 12, 'BATTLEFIELD', {
      font: 'bold 18px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    });
    title.setOrigin(0.5, 0);
    this.battlefieldPanel.add(title);

    const sub1 = this.add.text(16, 54, 'MAP SIZE', {
      font: 'bold 12px Arial',
      color: '#b7c5d8',
    });
    sub1.setOrigin(0, 0);
    this.battlefieldPanel.add(sub1);

    // Size buttons
    const sizeButtons: { key: 'small' | 'medium' | 'large'; label: string; x: number }[] = [
      { key: 'small', label: 'SMALL', x: 16 },
      { key: 'medium', label: 'MED', x: 132 },
      { key: 'large', label: 'LARGE', x: 248 },
    ];

    for (const b of sizeButtons) {
      const btn = this.createOptionButton(b.x, 74, 96, 36, b.label, () => {
        this.mapSize = b.key;
        this.updateBattlefieldPanel();
      });
      this.mapSizeButtonBg[b.key] = btn.bg;
      this.battlefieldPanel.add(btn.bg);
      this.battlefieldPanel.add(btn.text);
      this.battlefieldPanel.add(btn.hit);
    }

    this.battlefieldInfoText = this.add.text(16, 116, '', {
      font: '11px Arial',
      color: '#d9e6ff',
    });
    this.battlefieldInfoText.setOrigin(0, 0);
    this.battlefieldPanel.add(this.battlefieldInfoText);

    const sub2 = this.add.text(16, 150, 'TERRAIN', {
      font: 'bold 12px Arial',
      color: '#b7c5d8',
    });
    sub2.setOrigin(0, 0);
    this.battlefieldPanel.add(sub2);

    const terrainButtons: { key: 'standard' | 'plains' | 'hills' | 'caves'; label: string; x: number; y: number }[] = [
      { key: 'standard', label: 'STANDARD', x: 16, y: 170 },
      { key: 'plains', label: 'PLAINS', x: 188, y: 170 },
      { key: 'hills', label: 'HILLS', x: 16, y: 216 },
      { key: 'caves', label: 'CAVES', x: 188, y: 216 },
    ];

    for (const b of terrainButtons) {
      const btn = this.createOptionButton(b.x, b.y, 156, 36, b.label, () => {
        this.terrainPreset = b.key;
        this.updateBattlefieldPanel();
      });
      this.terrainButtonBg[b.key] = btn.bg;
      this.battlefieldPanel.add(btn.bg);
      this.battlefieldPanel.add(btn.text);
      this.battlefieldPanel.add(btn.hit);
    }

    this.battlefieldTerrainText = this.add.text(16, 262, '', {
      font: '11px Arial',
      color: '#d9e6ff',
    });
    this.battlefieldTerrainText.setOrigin(0, 0);
    this.battlefieldPanel.add(this.battlefieldTerrainText);

    const sub3 = this.add.text(16, 284, 'OPPONENT', {
      font: 'bold 12px Arial',
      color: '#b7c5d8',
    });
    sub3.setOrigin(0, 0);
    this.battlefieldPanel.add(sub3);

    const opponentButtons: { key: 'ai' | 'hotseat'; label: string; x: number }[] = [
      { key: 'ai', label: 'VS AI', x: 16 },
      { key: 'hotseat', label: 'HOTSEAT', x: 188 },
    ];

    for (const b of opponentButtons) {
      const btn = this.createOptionButton(b.x, 304, 156, 36, b.label, () => {
        this.vsAI = b.key === 'ai';
        this.updateBattlefieldPanel();
      });
      this.opponentButtonBg[b.key] = btn.bg;
      this.battlefieldPanel.add(btn.bg);
      this.battlefieldPanel.add(btn.text);
      this.battlefieldPanel.add(btn.hit);
    }

    const previewLabel = this.add.text(16, 350, 'PREVIEW', {
      font: 'bold 12px Arial',
      color: '#b7c5d8',
    });
    previewLabel.setOrigin(0, 0);
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
      // subtle hover outline
      const g = bg;
      g.lineStyle(2, 0xffffff, 0.35);
      g.strokeRoundedRect(x, y, w, h, 10);
    });
    hit.on('pointerout', () => {
      // full redraw happens in updateBattlefieldPanel
      this.updateBattlefieldPanel();
    });

    return { bg, text, hit };
  }

  private updateBattlefieldPanel(): void {
    // Redraw buttons based on selection
    const drawButton = (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, selected: boolean): void => {
      g.clear();
      g.fillStyle(selected ? 0x2a4a2a : 0x1a2433, 1);
      g.fillRoundedRect(x, y, w, h, 10);
      g.lineStyle(2, selected ? 0x44ff44 : 0x2a3a4a, selected ? 1 : 0.9);
      g.strokeRoundedRect(x, y, w, h, 10);
    };

    // Map size buttons (positions must match createBattlefieldPanel)
    drawButton(this.mapSizeButtonBg.small!, 16, 74, 96, 36, this.mapSize === 'small');
    drawButton(this.mapSizeButtonBg.medium!, 132, 74, 96, 36, this.mapSize === 'medium');
    drawButton(this.mapSizeButtonBg.large!, 248, 74, 96, 36, this.mapSize === 'large');

    const sizePx = this.mapSize === 'small' ? 1920 : this.mapSize === 'large' ? 3200 : 2560;
    this.battlefieldInfoText.setText(`Width: ${sizePx}px   Height: 720px`);

    // Terrain buttons
    drawButton(this.terrainButtonBg.standard!, 16, 170, 156, 36, this.terrainPreset === 'standard');
    drawButton(this.terrainButtonBg.plains!, 188, 170, 156, 36, this.terrainPreset === 'plains');
    drawButton(this.terrainButtonBg.hills!, 16, 216, 156, 36, this.terrainPreset === 'hills');
    drawButton(this.terrainButtonBg.caves!, 188, 216, 156, 36, this.terrainPreset === 'caves');

    // Opponent buttons
    drawButton(this.opponentButtonBg.ai!, 16, 304, 156, 36, this.vsAI);
    drawButton(this.opponentButtonBg.hotseat!, 188, 304, 156, 36, !this.vsAI);

    const terrainLabel =
      this.terrainPreset === 'plains' ? 'Plains (smooth, few caves)' :
      this.terrainPreset === 'hills' ? 'Hills (steep, overhangs)' :
      this.terrainPreset === 'caves' ? 'Caves (more tunnels)' :
      'Standard (mixed)';
    this.battlefieldTerrainText.setText(terrainLabel);

    // Preview
    this.battlefieldPreview.clear();
    const px = 16;
    const py = 376;
    const pw = 328;
    const ph = 90;

    // Preview frame
    this.battlefieldPreview.fillStyle(0x0a0f16, 0.85);
    this.battlefieldPreview.fillRoundedRect(px, py, pw, ph, 12);
    this.battlefieldPreview.lineStyle(2, 0x2a3a4a, 0.9);
    this.battlefieldPreview.strokeRoundedRect(px, py, pw, ph, 12);

    // Simple terrain silhouette
    const baseY = py + ph * 0.72;
    const amp =
      this.terrainPreset === 'plains' ? 10 :
      this.terrainPreset === 'hills' ? 30 :
      this.terrainPreset === 'caves' ? 22 :
      20;

    this.battlefieldPreview.fillStyle(0x3d2817, 1);
    this.battlefieldPreview.beginPath();
    this.battlefieldPreview.moveTo(px + 10, py + ph - 12);
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const x = px + 10 + t * (pw - 20);
      const wobble = Math.sin(t * Math.PI * 2) * amp + Math.sin(t * Math.PI * 6) * (amp * 0.35);
      const y = baseY + wobble;
      this.battlefieldPreview.lineTo(x, y);
    }
    this.battlefieldPreview.lineTo(px + pw - 10, py + ph - 12);
    this.battlefieldPreview.closePath();
    this.battlefieldPreview.fillPath();

    // Caves hint
    if (this.terrainPreset === 'caves') {
      this.battlefieldPreview.fillStyle(0x000000, 0.35);
      this.battlefieldPreview.fillCircle(px + pw * 0.35, baseY + 14, 14);
      this.battlefieldPreview.fillCircle(px + pw * 0.62, baseY + 22, 18);
      this.battlefieldPreview.fillCircle(px + pw * 0.78, baseY + 10, 12);
    }

    // Size indicator bar
    const sizeRatio = sizePx / 3200;
    this.battlefieldPreview.fillStyle(0xffffff, 0.10);
    this.battlefieldPreview.fillRect(px + 18, py + ph - 22, pw - 36, 8);
    this.battlefieldPreview.fillStyle(0x66ffff, 0.35);
    this.battlefieldPreview.fillRect(px + 18, py + ph - 22, (pw - 36) * sizeRatio, 8);
  }

  private getCurrentTeam(): TeamSelection {
    return this.currentTeam === 'red' ? this.redTeam : this.blueTeam;
  }

  private navigateCards(direction: number): void {
    if (this.selectionComplete) return;
    
    const team = this.getCurrentTeam();
    team.currentIndex = (team.currentIndex + direction + this.orderedClasses.length) % this.orderedClasses.length;
    this.updateCardHighlights();
  }

  private toggleSelection(): void {
    if (this.selectionComplete) return;
    
    const team = this.getCurrentTeam();
    const soldierId = this.orderedClasses[team.currentIndex].id;
    
    const existingIndex = team.selected.indexOf(soldierId);
    
    if (existingIndex >= 0) {
      // Deselect
      team.selected.splice(existingIndex, 1);
    } else if (team.selected.length < 5) {
      // Select
      team.selected.push(soldierId);
    }
    
    this.updateCardHighlights();
    this.updateSelectedDisplay();
  }

  private autoSelectSquad(): void {
    if (this.selectionComplete) return;
    
    const team = this.getCurrentTeam();
    team.selected = [];
    
    // Randomly select 5 unique soldiers
    const available = [...this.orderedClasses.map(s => s.id)];
    while (team.selected.length < 5 && available.length > 0) {
      const randomIndex = Math.floor(Math.random() * available.length);
      team.selected.push(available.splice(randomIndex, 1)[0]);
    }
    
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
          this.teamIndicator.setColor(this.currentTeam === 'red' ? '#ff6666' : '#6699ff');
        }
      });
      return;
    }
    
    if (this.currentTeam === 'red') {
      // Move to blue team
      this.currentTeam = 'blue';
      this.teamIndicator.setText('BLUE TEAM - Choose 5 Soldiers');
      this.teamIndicator.setColor('#6699ff');
      this.blueTeam.currentIndex = 0;
      this.updateCardHighlights();
      this.updateSelectedDisplay();
    } else {
      // Both teams ready
      this.selectionComplete = true;
      this.startButton.setVisible(true);
      this.teamIndicator.setText('BOTH SQUADS READY!');
      this.teamIndicator.setColor('#44ff44');
    }
  }

  private startGame(): void {
    if (!this.selectionComplete) return;
    
    // Stop menu music
    SoundManager.stopMusic();
    
    // Pass selections to game scene
    this.scene.start('GameScene', {
      redSquad: this.redTeam.selected,
      blueSquad: this.blueTeam.selected,
      mapSize: this.mapSize,
      terrainPreset: this.terrainPreset,
      vsAI: this.vsAI,
    });
  }

  private updateCardHighlights(): void {
    const team = this.getCurrentTeam();
    
    this.soldierCards.forEach((card, index) => {
      const bg = card.getData('bg') as Phaser.GameObjects.Graphics;
      const soldier = this.orderedClasses[index];
      const isHighlighted = index === team.currentIndex;
      const selIndex = team.selected.indexOf(soldier.id);
      const isSelected = selIndex >= 0;
      const cardWidth = (card.getData('w') as number) || 115;
      const cardHeight = (card.getData('h') as number) || 160;
      
      bg.clear();
      
      if (isSelected) {
        bg.fillStyle(0x2a4a2a, 1);
        bg.fillRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight);
        bg.lineStyle(3, 0x44ff44, 1);
        bg.strokeRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight);
      } else if (isHighlighted) {
        bg.fillStyle(0x3a3a5a, 1);
        bg.fillRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight);
        bg.lineStyle(3, 0xffff00, 1);
        bg.strokeRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight);
      } else {
        bg.fillStyle(0x2a2a4a, 1);
        bg.fillRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight);
        bg.lineStyle(2, soldier.color, 0.5);
        bg.strokeRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight);
      }
      
      // Update selection number
      const selNum = card.getByName('selNum') as Phaser.GameObjects.Text;
      if (isSelected) {
        selNum.setText(`${selIndex + 1}`);
      } else {
        selNum.setText('');
      }
    });
  }

  private updateSelectedDisplay(): void {
    const team = this.getCurrentTeam();
    
    // Update slot displays
    for (let i = 0; i < 5; i++) {
      const slotText = this.selectedDisplay.getByName(`slot${i}`) as Phaser.GameObjects.Text;
      
      if (team.selected[i]) {
        const soldier = SOLDIER_CLASSES.find(s => s.id === team.selected[i]);
        if (soldier) {
          slotText.setText(soldier.name.substring(0, 8));
          slotText.setColor('#ffffff');
        }
      } else {
        slotText.setText(`[${i + 1}]`);
        slotText.setColor('#444466');
      }
    }
  }

  private createCamouflageBackground(): void {
    const graphics = this.add.graphics();
    graphics.setDepth(-10);

    graphics.fillStyle(0x1d241b, 1);
    graphics.fillRect(0, 0, 1280, 720);

    const stripes = [
      { color: 0x26311f, y: 0, h: 96 },
      { color: 0x323b29, y: 96, h: 64 },
      { color: 0x1a2119, y: 612, h: 108 },
    ];

    for (const stripe of stripes) {
      graphics.fillStyle(stripe.color, 1);
      graphics.fillRect(0, stripe.y, 1280, stripe.h);
    }

    const blocks = [
      { x: -40, y: 78, w: 420, h: 110, color: 0x3b442d },
      { x: 278, y: 30, w: 360, h: 84, color: 0x4b442d },
      { x: 748, y: 56, w: 310, h: 92, color: 0x2e3a29 },
      { x: 1036, y: 20, w: 320, h: 130, color: 0x51472f },
      { x: 54, y: 610, w: 280, h: 110, color: 0x2b3324 },
      { x: 360, y: 632, w: 390, h: 88, color: 0x403728 },
      { x: 838, y: 600, w: 360, h: 120, color: 0x2f3828 },
    ];

    for (const block of blocks) {
      graphics.fillStyle(block.color, 0.95);
      graphics.fillRect(block.x, block.y, block.w, block.h);
    }

    graphics.lineStyle(1, 0x506044, 0.28);
    for (let x = 0; x <= 1280; x += 32) {
      graphics.lineBetween(x, 0, x, 720);
    }
    for (let y = 0; y <= 720; y += 32) {
      graphics.lineBetween(0, y, 1280, y);
    }
  }

}
