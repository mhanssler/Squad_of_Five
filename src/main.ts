import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { VisualTestScene } from './scenes/VisualTestScene';
import { TouchControlsScene } from './scenes/TouchControlsScene';

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
  // Multi-touch: fingers on buttons plus one on the battlefield (pinch needs two).
  input: { activePointers: 4 },
  // TouchControls is last so it draws (and takes touches) above everything else.
  scene: [BootScene, MenuScene, GameScene, UIScene, VisualTestScene, TouchControlsScene],
  pixelArt: false,
  // Off on purpose: soldiers are drawn as a sprite plus two slightly larger outline layers, and
  // snapping each layer to whole pixels separately made the outlines jitter while standing still.
  roundPixels: false,
};

const game = new Phaser.Game(config);

// Expose for debugging/automation (e.g. driving the game from devtools).
(window as any).game = game;
