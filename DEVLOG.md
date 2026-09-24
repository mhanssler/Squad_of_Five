# Squad of 5 - Development Log

> A turn-based artillery game with unique weapons and realistic physics

## Project Status: 🚧 In Development

---

## Changelog

### [0.0.11] - 2026-07-26
#### Added
- Two-frame faction/class stride animations with planted feet and restrained cadence.
- Silhouette-shaped light/dark contrast rims that keep soldiers readable over sky and terrain.
- Tested AI trajectory safety for first-unit interception and early terrain obstruction.

#### Changed
- AI rejects friendly direct fire, dangerous burst spread, unsafe explosive splash, and shots that bury themselves in terrain.
- Projectile collision resolves the nearest physical unit hit instead of depending on squad array order.
- Shot variance is kept only when the perturbed trajectory remains safe; the unsafe direct-fire fallback was removed.
- Shotgun, flamethrower, and slug classes are now exclusive to Small maps, including stale-data validation at match start.

---

### [0.0.10] - 2026-07-26
#### Added
- Seven visually distinct WWII-inspired factions: four Allied and three Axis.
- Random Axis-versus-Allies matchup generation with randomized red/blue side assignment.
- Seventy faction/class soldier texture variants with faction palettes, varied skin tones, period headgear, webbing, insignia, and accessories.
- Faction emblems, national callsigns, transport markings, parachute colors, HUD identity, tactical portraits, and faction-aware victory text.
- A contact-report reveal shown before both Basic and Operations matches.
- Automated coverage for faction roster integrity, matchup rules, random side assignment, and class texture aliases.

---

### [0.0.9] - 2026-07-12
#### Added
- **Basic and Operations rulesets**: Basic preserves the artillery duel; Operations adds a movement-driven signal victory.
- **Diggable tunnels**: `B` carves real traversable terrain in Operations mode, costs movement, and leaves the attack available. `Shift+B` builds the existing cover berm.
- **Signal relays**: three capturable battlefield objectives award points on capture and at the end of each round. First to 7 points wins; elimination remains valid.
- **Objective-aware AI**: AI squads sometimes reposition to contest relays instead of always taking a shot.
- **Situational chatter**: new quips for tunneling, failed digs, low health, near misses, ally losses, supplies, and relay captures.
- **Operations onboarding**: a deployment brief and live relay proximity states explain capture, contesting, and round scoring.
- **Readable supplies**: crates state whether they are instant, passive, or key-triggered; the HUD tracks armor and call-in charges.

#### Changed
- Soldiers now have breathing idles, action poses, improved walk/landing motion, ground shadows, and a clearer active-unit marker.
- Speech bubbles wrap, stagger around clustered squads, stay inside world bounds, and use team-colored outlines.
- The battlefield has layered night-sky silhouettes and a quieter tactical HUD with mode-specific controls.
- In-game music now responds to firing, explosions, and objective captures, with new dig and relay stingers.
- Movement distance is cumulative, so doubling back no longer refunds movement.
- Menu layout coverage now audits all 48 map, terrain, opponent, and ruleset permutations.
- Terrain collision ignores decorative grass and gravel, uses slope-limited stepping, and no longer lifts embedded soldiers up hills.
- Battle music now alternates arrangements and advances through maneuver, pressure, and finale phases.

### [0.0.8] - 2026-07-01
#### Changed (aim & movement feel, from playtest feedback)
- **Power charge slowed**: 65/s → 35/s (~2.6s to full). The fast charge made overshooting
  the intended power too easy; the down-cycle is slower too (85/s → 45/s).
- **Numeric power readout**: a "NN%" label appears above the power bar while charging, so
  precise power is judged by number instead of eyeballing a 50px bar.
- **Smoothed mouse aim**: the aim rotates toward the pointer at a capped 240°/s instead of
  snapping, ignores pointer positions within 26px of the soldier (where the angle used to
  flip wildly), and no longer follows the scrolling world while panning with A/D — panning
  used to drag your lined-up shot with it.
- **Weightier troop movement**: soldiers accelerate to speed (~0.25s) and brake to a stop
  instead of snapping; climbing slows them (down to ~45% on steep slopes) and downhill
  gives a small boost; airborne control is reduced; real falls end with a landing squash
  and dust kick.

### [0.0.7] - 2026-07-01
#### Fixed
- **Self-hit bug (major)**: projectiles spawned inside the shooter's own hit circle when
  aiming level or downward, so bullets/rockets instantly hit the firer — burst weapons
  could self-kill in one shot. Projectiles now know their shooter: bullets never collide
  with the firer, explosives ignore them for a 400ms spawn grace (a bad grenade bounce
  can still punish you).
- **Flamethrower self-burn**: the flame jet started inside the shooter's body and roasted
  them for up to ~70 HP every shot. The shooter is now excluded from flame damage.
- **Flamethrower one-shot kills**: overlapping flame-path damage points stacked 2-4x on
  the same soldier (200+ damage per pass). Each damage wave now hits each soldier at most
  once — a full burn deals up to 72, comparable to a grenade.
- **Bullet ground-splash self-damage**: bullets impacting terrain at the shooter's feet no
  longer chip the firer via their small splash radius (big explosives still self-damage).
- **AI walking off cliffs**: high-mobility AI units (SMG/shotgun/flamer) sprinted straight
  off cliffs and bottomless craters chasing targets, dying without firing. The AI now
  probes the ground ahead and stops at lethal drops.
- **Menu Enter-to-start**: after "BOTH SQUADS READY!", Enter now actually starts the
  battle (previously only the button worked, contradicting the README).
- Build errors from leftover half-finished code (unused class-ability fields).

#### Changed
- **Skippable intro**: SPACE/ENTER/ESC or click skips the bombardment + paradrop opening
  (it also auto-ends as soon as everyone has landed, instead of a fixed 15s wait). Restarting
  with N no longer costs 15 seconds. Skipping fast-forwards paratroopers to the ground and
  cancels the quote narration.
- **Power charge speed**: 18/s → 65/s (full charge ~1.4s instead of 5s). Release timing
  still matters — power cycles back down at 85/s.
- **Per-class walk animation**: walking no longer swaps every class to one generic walk
  texture. Classes keep their unique sprite and march with a procedural rock/bob plus
  footstep dust puffs.
- **Team-colored name labels**: red/blue names above soldiers so sides are readable at a
  glance (sprites themselves stay untinted).
- **Turn header during selection** now shows "X Team — choose a soldier" instead of the
  previous turn's stale text.
- **Burst weapon trims** (pacing + framerate; per-shot damage roughly preserved):
  rifle 30→15 rounds, SMG 50→25 (dmg 6→7), minigun 120→60 (dmg 3→4), carbine 20→12,
  pistol 12→8.

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

