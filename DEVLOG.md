# Squad of 5 - Development Log

> A turn-based artillery game with unique weapons and realistic physics

## Project Status: 🚧 In Development

---

## Changelog

### [0.0.6] - 2026-01-19
#### Added
- **Grappling Hook**: Press G to grapple in the aim direction
  - Uses aim angle and power to determine target location
  - Range: 150-300 pixels depending on power
  - Consumes all movement for the turn
  - Shows rope line while grappling
- **Military Speech Bubbles**: Characters now speak with classic military quips
  - On selection: "Yes sir!", "Locked and loaded!", "Reporting in!"
  - When firing: "Get some!", "Fire in the hole!", "Weapons free!"
  - When hit: "Medic!", "I'm hit!", "Taking fire!"
  - When dying: "Tell my wife...", "Avenge me...", "It's been an honor..."
  - When grappling: "Hook deployed!", "Going up!", "Wheee!"

#### Fixed
- **Terrain Collision**: Characters no longer float up on each turn
  - Fixed collision to only adjust position when falling (positive Y velocity)
  - Characters stay grounded properly on terrain surface
- **New Game Bug**: Pressing N no longer causes infinite loop/freeze
  - Added isResetting guard to prevent multiple simultaneous resets
  - Properly cancels all pending timers before reset
  - Clears all game state properly
- **Name Labels**: Character names now properly track movement
  - Names and weapon labels stay above character at all times
  - Speech bubbles also follow character position
- **Explosion Effect**: Explosions now properly remove terrain
  - Removed crater outline that was being left behind
  - Terrain cleanly disappears in explosion radius

### [0.0.5] - 2026-01-19
#### Added
- **Character Selection**: Players can now choose which character to use each turn
  - Tab/Arrow keys to browse available characters
  - Enter/Space to confirm selection
  - Number keys 1-5 for direct selection
  - Visual selection indicator (yellow arrow and circle)
- **Movement Limits**: Movement distance now limited by weapon weight
  - Grenade (light): 200 units
  - Rifle (medium-light): ~133 units
  - Shotgun (medium): 100 units
  - Sniper (medium-heavy): 80 units
  - Rocket (heavy): ~67 units
- **Movement Bar UI**: Shows remaining movement with color indication
- **New Game Feature**: Press N to regenerate terrain and start new game
- **Dynamic Terrain**: Each match generates unique terrain with seeded random
- **Independent Aiming**: W/S keys for aiming (completely separate from movement)
- **Projectile Camera Tracking**: 
  - Camera follows projectiles smoothly for slow/medium weapons
  - Quick pan for fast projectiles (sniper)

#### Changed
- Controls updated: W/S for aiming instead of Shift+Arrow keys
- Turn structure now includes character selection phase
- Terrain renders immediately (fixed visibility bug)

#### Fixed
- Terrain now visible from game start (was only showing after first shot)
- Aiming no longer conflicts with movement controls

### [0.0.4] - 2026-01-19
#### Added
- **Unique sprites for each weapon class:**
  - **Rifleman**: Standard soldier holding rifle diagonally across body
  - **Grenadier**: Soldier with arm raised, holding grenade, wearing bandana
  - **Rocketeer**: Heavy soldier with rocket launcher on shoulder, bulkier stance
  - **Shotgunner**: Soldier holding shotgun at hip level, wearing cap
  - **Sniper**: Crouched soldier with long rifle and scope, ghillie hood

#### Fixed
- Characters now spawn on terrain surface instead of falling from above
- Added `getSurfaceY()` method to Terrain class for proper placement

### [0.0.3] - 2026-01-19
#### Added
- **Expanded battlefield**: World is now 2560x720 (double width) with scrolling camera
- **Squad of 5**: Each team now has 5 unique soldiers with names:
  - Red Team: Sarge, Gunner, Boom, Buck, Ghost
  - Blue Team: Alpha, Bravo, Charlie, Delta, Echo
- **5 Unique Weapons** with realistic physics:
  - **Assault Rifle**: Fast, low-arc shots (low gravity)
  - **Grenade**: Arcing throw, bounces before exploding (normal gravity, 2s fuse)
  - **Rocket Launcher**: Powerful explosive with large blast radius
  - **Shotgun**: 5 pellets in spread pattern (high drag)
  - **Sniper Rifle**: High damage, nearly straight trajectory (very low gravity)
- **Battlefield Overview**: Camera zooms out at start of each game to show both teams
- **Projectile terrain collision**: Projectiles now explode on impact with terrain

#### Changed
- Renamed game to "Squad of 5"
- Background stars now cover entire battlefield (300+ stars)
- Weapon labels appear above active character
- Each soldier's weapon is assigned based on squad position

#### Fixed
- Projectiles now properly detect terrain collision instead of only bottom boundary
- Camera follows active character smoothly after overview

### [0.0.2] - 2026-01-19
#### Changed
- **Visual overhaul** based on reference image:
  - Background: Dark night sky with starry effect (150+ stars with varying brightness)
  - Terrain: Green grass layer on top with brown dirt below, minimalist grass blades
  - Characters: Stick figure army men style (helmet, body, arms, legs)
  - Team colors: Red team (#ff4444), Blue team (#4488ff)
- Health bars now only appear when a character takes damage (auto-hide after 3 seconds)
- Damage numbers show `-X` format with improved styling
- Smaller, more minimalist name labels

### [0.0.1] - 2026-01-19
#### Added
- Initial project setup with Phaser 3 + TypeScript + Vite
- Project documentation and tracking (DEVLOG.md)
- Core game structure:
  - **Scenes**: BootScene (loading), GameScene (gameplay), UIScene (HUD)
  - **Entities**: Worm (player characters), Projectile (bazooka shots)
  - **Systems**: Terrain (destructible), TurnManager (turn-based logic)
  - **Utils**: Math utilities for game calculations
- Placeholder sprite generation (worm, projectile, crosshair, explosion)
- Basic terrain generation with destructible canvas-based system
- Turn-based combat framework (Red vs Blue teams)
- Aiming and power charge system
- Explosion effects with terrain destruction and knockback
- Health bars and damage numbers
- Game over detection and restart

#### Fixed
- TypeScript compilation errors (readonly property, Color interpolation, unused variables)

---

## Known Issues

| ID | Status | Priority | Description | Date Reported |
|----|--------|----------|-------------|---------------|
| #001 | 🟡 Open | Low | Reference PDF needs review for design notes | 2026-01-19 |

---

## TODO / Roadmap

### Phase 1: Core Foundation
- [x] Project setup with Phaser.js
- [x] Basic game canvas and scene management
- [x] Simple terrain rendering
- [x] Character (worm) sprite and movement

### Phase 2: Physics & Terrain
- [x] Destructible terrain system
- [x] Gravity and collision detection
- [ ] Character walking on slopes (basic collision working)
- [x] Water/death zones

### Phase 3: Combat System
- [x] Turn-based system
- [x] Basic projectile (bazooka)
- [x] Aiming and power control
- [x] Explosion effects and terrain destruction

### Phase 4: Weapons & Polish
- [ ] Weapon selection UI
- [ ] Additional weapons (grenade, shotgun, etc.)
- [ ] Wind system
- [ ] Health bars and damage

### Phase 5: Game Modes
- [ ] Local multiplayer (hotseat)
- [ ] AI opponents
- [ ] Win/lose conditions

---

## Technical Notes

### Technology Stack
- **Engine**: Phaser 3.x
- **Language**: TypeScript
- **Build Tool**: Vite
- **Target Platform**: Web Browser (Desktop)

### Project Structure
```
SoF/
├── src/
│   ├── main.ts          # Entry point
│   ├── scenes/          # Game scenes
│   ├── entities/        # Game objects (worms, projectiles)
│   ├── systems/         # Core systems (physics, terrain, combat)
│   └── utils/           # Helper functions
├── assets/
│   ├── sprites/         # Character and object sprites
│   ├── terrain/         # Terrain textures
│   └── audio/           # Sound effects and music
├── docs/                # Documentation
├── reference/           # Reference materials
└── DEVLOG.md            # This file
```

---

## Session Log

### 2026-01-19
- Project initialized
- Created development tracking file
- Set up Phaser.js + TypeScript + Vite project structure
- Ready for core game development

