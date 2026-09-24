# Squad of 5

Turn-based artillery tactics game built with Phaser 3, TypeScript, and Vite.

## Tech

- Phaser 3
- TypeScript
- Vite
- Vitest

## Requirements

- Node.js 22.12+ (see `.nvmrc`). Older versions such as Node 18 cannot run the current Vite and Vitest.

## Setup

```powershell
npm ci
```

## Run (dev)

```powershell
npm run dev
```

Vite will start a dev server (see the terminal output for the local URL; default is `http://localhost:3000`).

## Build (production)

```powershell
npm run build
```

Outputs static files to `dist/`.

## Preview (production build locally)

```powershell
npm run preview
```

## Tests

```powershell
npm test
```

## Controls

Menu:

- Left/Right: navigate soldiers
- Space: select/deselect
- R: random squad
- Enter: confirm team / start battle

In-game (high level):

- Space/Enter/Esc or click: skip the intro sequence
- Left/Right: move
- W/S: adjust aim; hold Shift for fine adjustment
- Mouse: set the angle around the active soldier
- Space or Left Mouse Button: hold to charge and release to shoot; full power fires automatically
- Right Mouse Button drag: pan camera
- Mouse wheel: zoom
- G: grapple
- B: build cover in Basic mode; dig a tunnel in Operations mode
- Shift+B: build cover in Operations mode (costs 90 movement, blocks 60% of blast damage and knockback)
- H: heal
- X: target an available airstrike
- C: deploy an available howitzer
- Q: arm / put away a special weapon from a crate (Esc also puts it away)
- Space after firing: detonate the Kamikaze Goat early
- N: new game

## Battlefield

- **Wind** changes every turn (gauge under the turn banner). It pushes grenades, rockets, mortars and demo charges, but not bullets.
- **Explosive barrels** go off when caught in a blast or shot, and can chain. **Landmines** give you about a second to get clear.
- **Special weapon crates** (a quarter of supply drops): Cluster Bomb, Holy Grenade, Teleporter, Kamikaze Goat, Sledgehammer. Each is single-use.
- **Veterancy**: kills promote a soldier to Veteran ★ (1 kill), Elite ★★ (2), then Hero ★★★ (4), for more damage, more movement, and armor at Hero.
- The line above the movement bar shows whether Tunnel / Cover / Heal are ready right now, or what's stopping them.

## Rulesets

- **Basic**: the original last-squad-standing artillery battle with a complete trajectory and impact guide.
- **Operations**: adds terrain tunneling and three signal relays, while long shots progressively use a range estimate instead of an exact impact marker. Capture relays by ending an action inside their marked radius; captures and held relays earn signal points. First to 7 wins, or eliminate the opposing squad.
- **Map roster rule**: shotgun, flamethrower, and slug specialists are available on Small maps only. Medium and Large maps reserve squad slots for mid-, long-, and support-range classes.

## Factions

Every new match randomly pairs one Allied force with one Axis force, then randomly assigns them to the red and blue battlefield sides. The Allied roster includes the United States Army, British Commonwealth, Soviet Red Army, and Free French Forces. The Axis roster includes the German Wehrmacht, Imperial Japanese Army, and Royal Italian Army.

Faction identity changes soldier names, uniform and equipment palettes, skin-tone variation, helmet silhouettes, insignia, transport markings, parachutes, HUD labels, and the opening contact report. Weapon classes retain consistent silhouettes across every faction so their combat role remains readable.

Tunnel digging costs movement but does not consume the soldier's attack. Each soldier can carve up to two tunnel sections per turn.

Cover costs 90 movement and does not consume the soldier's attack. Aim toward the threat before building; terrain between a blast and the soldier blocks 60% of damage and knockback.

Supply crates identify their effect in the world and the active soldier's supplies remain visible in the lower HUD. Medkits apply immediately, armor passively absorbs 65% of incoming damage until depleted, and airstrike/howitzer charges are used with `X`/`C`.

## Notes

- Development notes live in `DEVLOG.md`.
