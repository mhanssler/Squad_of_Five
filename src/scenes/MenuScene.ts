import Phaser from 'phaser';
import { SoundManager } from '../utils/SoundManager';

// All available soldier classes with their specialties
export interface SoldierClass {
  id: string;
  name: string;
  weapon: string;
  description: string;
  color: number;
}

export const SOLDIER_CLASSES: SoldierClass[] = [
  { id: 'rifle', name: 'Rifleman', weapon: 'Assault Rifle', description: 'Balanced fighter with fast, accurate shots', color: 0xffd700 },
  { id: 'grenade', name: 'Grenadier', weapon: 'Grenade', description: 'Lobbed explosives that bounce', color: 0x32cd32 },
  { id: 'rocket', name: 'Rocketeer', weapon: 'Rocket Launcher', description: 'Heavy explosives, large blast radius', color: 0xff6347 },
  { id: 'shotgun', name: 'Shotgunner', weapon: 'Shotgun', description: 'Spread fire, devastating up close', color: 0xc0c0c0 },
  { id: 'sniper', name: 'Sniper', weapon: 'Sniper Rifle', description: 'Long range, high damage precision', color: 0x00ced1 },
  { id: 'mortar', name: 'Mortar', weapon: 'Mortar', description: 'High arc indirect fire support', color: 0xffa500 },
  { id: 'flamer', name: 'Flamer', weapon: 'Flamethrower', description: 'Short range area denial', color: 0xff4500 },
  { id: 'pistol', name: 'Medic', weapon: 'Pistol', description: 'Light weapon, high mobility', color: 0x98fb98 },
  { id: 'smg', name: 'Scout', weapon: 'SMG', description: 'Fast movement, rapid fire', color: 0x87ceeb },
  { id: 'minigun', name: 'Heavy', weapon: 'Minigun', description: 'Slow but sustained firepower', color: 0xa9a9a9 },
];

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
    this.cameras.main.setBackgroundColor('#4a5c3e'); // Base olive drab
    
    // Create camouflage pattern with irregular blobs
    this.createCamouflageBackground();
    
    // Title
    this.titleText = this.add.text(640, 40, 'SQUAD OF FIVE', {
      font: 'bold 48px Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6,
    });
    this.titleText.setOrigin(0.5);
    
    // Subtitle
    this.add.text(640, 90, 'SELECT YOUR SQUAD', {
      font: '24px Arial',
      color: '#aaaaaa',
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

    const groups: {
      id: 'close' | 'mid' | 'long' | 'support';
      title: string;
      color: number;
      soldierIds: string[];
      rect: { x: number; y: number; w: number; h: number }; // top-left
      layout: { cols: number; tileW: number; tileH: number; gapX: number; gapY: number; padX: number; padY: number; scale?: number };
    }[] = [
      {
        id: 'close',
        title: 'CLOSE RANGE',
        color: 0xff9966,
        soldierIds: ['shotgun', 'flamer'],
        rect: { x: 40, y: 175, w: 390, h: 205 },
        // Move the two close-range tiles down a bit to give the header breathing room.
        layout: { cols: 2, tileW: 170, tileH: 92, gapX: 14, gapY: 12, padX: 10, padY: 35 },
      },
      {
        id: 'mid',
        title: 'MID RANGE',
        color: 0x66ddff,
        soldierIds: ['rifle', 'smg', 'grenade', 'minigun'],
        rect: { x: 445, y: 175, w: 395, h: 205 },
        // Shrink proportionally so the two-row grid never overlaps.
        layout: { cols: 2, tileW: 185, tileH: 85, gapX: 14, gapY: 2, padX: 10, padY: 30, scale: 0.87 },
      },
      {
        id: 'long',
        title: 'LONG RANGE',
        color: 0xffdd66,
        soldierIds: ['sniper', 'rocket', 'mortar'],
        rect: { x: 40, y: 390, w: 540, h: 205 },
        // Slight proportional shrink for better padding within the section.
        layout: { cols: 3, tileW: 170, tileH: 92, gapX: 10, gapY: 12, padX: 10, padY: 34, scale: 0.92 },
      },
      {
        id: 'support',
        title: 'SUPPORT',
        color: 0x98fb98,
        soldierIds: ['pistol'],
        rect: { x: 595, y: 390, w: 245, h: 205 },
        layout: { cols: 1, tileW: 225, tileH: 92, gapX: 10, gapY: 12, padX: 10, padY: 34 },
      },
    ];

    // Order cards by group. (If new classes are added later, they can be placed into a group explicitly.)
    this.orderedClasses = groups
      .flatMap(g => g.soldierIds)
      .map(id => byId.get(id))
      .filter(Boolean) as SoldierClass[];

    // Left panel framing (soldiers)
    const frame = this.add.graphics();
    frame.fillStyle(0x0f1620, 0.65);
    frame.fillRoundedRect(30, 165, 830, 440, 12);
    frame.lineStyle(2, 0x2a3a4a, 0.9);
    frame.strokeRoundedRect(30, 165, 830, 440, 12);

    // Create tiles within group sections
    let globalIndex = 0;
    for (const g of groups) {
      const sectionBg = this.add.graphics();
      sectionBg.fillStyle(0x121b26, 0.75);
      sectionBg.fillRoundedRect(g.rect.x, g.rect.y, g.rect.w, g.rect.h, 10);
      sectionBg.lineStyle(2, g.color, 0.35);
      sectionBg.strokeRoundedRect(g.rect.x, g.rect.y, g.rect.w, g.rect.h, 10);

      const header = this.add.text(g.rect.x + 12, g.rect.y + 10, g.title, {
        font: 'bold 12px Arial',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      });
      header.setOrigin(0, 0);

      g.soldierIds.forEach((id, idxInGroup) => {
        const soldier = byId.get(id);
        if (!soldier) return;

        const col = idxInGroup % g.layout.cols;
        const row = Math.floor(idxInGroup / g.layout.cols);
        const x = g.rect.x + g.layout.padX + col * (g.layout.tileW + g.layout.gapX) + g.layout.tileW / 2;
        const y = g.rect.y + g.layout.padY + row * (g.layout.tileH + g.layout.gapY) + g.layout.tileH / 2;
        const cardWidth = g.layout.tileW;
        const cardHeight = g.layout.tileH;

        const card = this.add.container(x, y);

        // Card background (compact tile)
        const bg = this.add.graphics();
        bg.fillStyle(0x1a2433, 1);
        bg.fillRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 10);
        bg.lineStyle(2, soldier.color, 0.5);
        bg.strokeRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 10);
        card.add(bg);

        // Left icon
        const icon = this.add.graphics();
        icon.fillStyle(soldier.color, 1);
        icon.fillCircle(-cardWidth / 2 + 28, 0, 18);
        icon.fillStyle(0x000000, 0.25);
        icon.fillCircle(-cardWidth / 2 + 28, 0, 10);
        card.add(icon);

        const nameText = this.add.text(-cardWidth / 2 + 52, -18, soldier.name.toUpperCase(), {
          font: 'bold 12px Arial',
          color: '#ffffff',
        });
        nameText.setOrigin(0, 0);
        card.add(nameText);

        const weaponText = this.add.text(-cardWidth / 2 + 52, -2, soldier.weapon, {
          font: '10px Arial',
          color: '#b7c5d8',
        });
        weaponText.setOrigin(0, 0);
        card.add(weaponText);

        const descText = this.add.text(-cardWidth / 2 + 52, 14, soldier.description, {
          font: '9px Arial',
          color: '#7f90a8',
          wordWrap: { width: cardWidth - 70 },
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

        const scale = g.layout.scale ?? 1;
        if (scale !== 1) {
          card.setScale(scale);
        }

        this.soldierCards.push(card);
        globalIndex++;
      });
    }
  }

  private createSelectedDisplay(): void {
    // Keep selection UI under the soldier grid (left side)
    // Moved down + slightly right so it doesn't overlap the soldier frame or the Random button.
    this.selectedDisplay = this.add.container(545, 665);
    
    // Background panel
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.9);
    bg.fillRoundedRect(-300, -50, 600, 100, 10);
    bg.lineStyle(2, 0x444466, 1);
    bg.strokeRoundedRect(-300, -50, 600, 100, 10);
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
      slot.fillStyle(0x333355, 1);
      slot.fillRoundedRect(slotX - 35, -15, 70, 50, 5);
      slot.lineStyle(1, 0x555577, 1);
      slot.strokeRoundedRect(slotX - 35, -15, 70, 50, 5);
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
    bg.fillRoundedRect(-80, -20, 160, 40, 8);
    bg.lineStyle(2, 0x66aa66, 1);
    bg.strokeRoundedRect(-80, -20, 160, 40, 8);
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
    hitArea.on('pointerover', () => bg.clear().fillStyle(0x558855, 1).fillRoundedRect(-80, -20, 160, 40, 8).lineStyle(2, 0x88cc88, 1).strokeRoundedRect(-80, -20, 160, 40, 8));
    hitArea.on('pointerout', () => bg.clear().fillStyle(0x446644, 1).fillRoundedRect(-80, -20, 160, 40, 8).lineStyle(2, 0x66aa66, 1).strokeRoundedRect(-80, -20, 160, 40, 8));
    this.autoSelectButton.add(hitArea);
  }

  private createStartButton(): void {
    this.startButton = this.add.container(1080, 665);
    this.startButton.setVisible(false);
    
    const bg = this.add.graphics();
    bg.fillStyle(0x664444, 1);
    bg.fillRoundedRect(-100, -25, 200, 50, 10);
    bg.lineStyle(3, 0xaa6666, 1);
    bg.strokeRoundedRect(-100, -25, 200, 50, 10);
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
    hitArea.on('pointerover', () => bg.clear().fillStyle(0x885555, 1).fillRoundedRect(-100, -25, 200, 50, 10).lineStyle(3, 0xcc8888, 1).strokeRoundedRect(-100, -25, 200, 50, 10));
    hitArea.on('pointerout', () => bg.clear().fillStyle(0x664444, 1).fillRoundedRect(-100, -25, 200, 50, 10).lineStyle(3, 0xaa6666, 1).strokeRoundedRect(-100, -25, 200, 50, 10));
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
        bg.fillRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 10);
        bg.lineStyle(3, 0x44ff44, 1);
        bg.strokeRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 10);
      } else if (isHighlighted) {
        bg.fillStyle(0x3a3a5a, 1);
        bg.fillRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 10);
        bg.lineStyle(3, 0xffff00, 1);
        bg.strokeRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 10);
      } else {
        bg.fillStyle(0x2a2a4a, 1);
        bg.fillRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 10);
        bg.lineStyle(2, soldier.color, 0.5);
        bg.strokeRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 10);
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
    
    // Extend pattern beyond viewport to cover any borders
    const padding = 200;
    const areaWidth = 1280 + padding * 2;
    const areaHeight = 720 + padding * 2;
    const offsetX = -padding;
    const offsetY = -padding;
    
    // Fill base color for extended area
    graphics.fillStyle(0x4a5c3e, 1);
    graphics.fillRect(offsetX, offsetY, areaWidth, areaHeight);
    
    // WW2 camouflage colors
    const colors = [
      0x3d4a2d, // Dark olive
      0x5c6b4a, // Medium olive
      0x6b5c3e, // Brown
      0x4a3d2d, // Dark brown
      0x7a6b4a, // Tan/khaki
      0x2d3a24, // Very dark green
    ];
    
    // Create large irregular blobs for the camo pattern
    for (let i = 0; i < 80; i++) {
      const x = offsetX + Math.random() * areaWidth;
      const y = offsetY + Math.random() * areaHeight;
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      graphics.fillStyle(color, 0.9);
      
      // Create irregular blob shape using multiple overlapping ellipses
      const baseSize = 80 + Math.random() * 120;
      const numEllipses = 3 + Math.floor(Math.random() * 4);
      
      for (let j = 0; j < numEllipses; j++) {
        const blobOffsetX = (Math.random() - 0.5) * baseSize * 0.6;
        const blobOffsetY = (Math.random() - 0.5) * baseSize * 0.6;
        const width = baseSize * (0.5 + Math.random() * 0.5);
        const height = baseSize * (0.3 + Math.random() * 0.4);
        const rotation = Math.random() * Math.PI;
        
        // Draw rotated ellipse by using multiple points
        this.drawRotatedEllipse(graphics, x + blobOffsetX, y + blobOffsetY, width, height, rotation);
      }
    }
    
    // Add smaller detail blobs
    for (let i = 0; i < 60; i++) {
      const x = offsetX + Math.random() * areaWidth;
      const y = offsetY + Math.random() * areaHeight;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const size = 30 + Math.random() * 50;
      
      graphics.fillStyle(color, 0.85);
      this.drawRotatedEllipse(graphics, x, y, size, size * 0.6, Math.random() * Math.PI);
    }
    
    // Add subtle texture with small spots
    for (let i = 0; i < 150; i++) {
      const x = offsetX + Math.random() * areaWidth;
      const y = offsetY + Math.random() * areaHeight;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const size = 5 + Math.random() * 15;
      
      graphics.fillStyle(color, 0.5);
      graphics.fillCircle(x, y, size);
    }
  }

  private drawRotatedEllipse(graphics: Phaser.GameObjects.Graphics, cx: number, cy: number, width: number, height: number, rotation: number): void {
    const points: { x: number; y: number }[] = [];
    const segments = 12;
    
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const px = Math.cos(angle) * width / 2;
      const py = Math.sin(angle) * height / 2;
      
      // Rotate point
      const rotatedX = px * Math.cos(rotation) - py * Math.sin(rotation);
      const rotatedY = px * Math.sin(rotation) + py * Math.cos(rotation);
      
      points.push({ x: cx + rotatedX, y: cy + rotatedY });
    }
    
    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.closePath();
    graphics.fillPath();
  }
}
