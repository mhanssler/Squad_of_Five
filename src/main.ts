import Phaser from 'phaser';
import { Soldier } from './entities/Soldier';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { installEpicMusic } from './utils/EpicMusicManager';
import { SoundManager } from './utils/SoundManager';
import { installVisualEnhancements } from './utils/VisualEnhancementManager';

// Preserve the existing scene and sound-effect API while replacing the simple
// oscillator soundtrack with the layered cinematic playlist.
installEpicMusic(SoundManager);

// Add secondary motion, recoil, hit and landing reactions, shadows, class gear
// detail, atmospheric depth and richer battlefield effects without changing
// the core game rules.
installVisualEnhancements(Soldier, GameScene);

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
  scene: [BootScene, MenuScene, GameScene, UIScene],
  pixelArt: false,
  roundPixels: true,
};

new Phaser.Game(config);
