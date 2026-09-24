import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { VisualTestScene } from './scenes/VisualTestScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  backgroundColor: '#0a0a1a', // Dark night sky
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 500 },
      debug: false, // Set to true for debugging
    },
  },
  scene: [BootScene, MenuScene, GameScene, UIScene, VisualTestScene],
  pixelArt: false,
  // Off on purpose: soldiers are drawn as a sprite plus two slightly larger outline layers, and
  // snapping each layer to whole pixels separately made the outlines jitter while standing still.
  roundPixels: false,
};

const game = new Phaser.Game(config);

// Expose for debugging/automation (e.g. driving the game from devtools).
(window as any).game = game;
