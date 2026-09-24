# Squad of 5

Turn-based artillery tactics game built with Phaser 3, TypeScript, and Vite.

## Tech

- Phaser 3
- TypeScript
- Vite
- Vitest

## Requirements

- Node.js 22.12 or newer
- npm

The supported Node.js version is pinned in `.nvmrc`. With `nvm` installed, run:

```bash
nvm use
```

## Setup

```bash
npm ci
```

## Run (development)

```bash
npm run dev
```

Vite starts the development server at `http://localhost:3000` and opens it in the default browser.

## Build (production)

```bash
npm run build
```

The production build is written to `dist/`.

## Preview the production build

```bash
npm run preview
```

## Tests

Run the test suite once:

```bash
npm test
```

Run tests in watch mode while developing:

```bash
npm run test:watch
```

Generate a coverage report:

```bash
npm run test:coverage
```

## Type checking

```bash
npm run typecheck
```

Pull requests and pushes to `main` run install, type-check, test, and production-build checks through GitHub Actions.

## Controls

### Menu

- Left/Right: navigate soldiers
- Space: select/deselect
- R: random squad
- Enter: confirm team / start battle

### In game

- Space/Enter/Esc or click: skip the intro sequence
- Left/Right: move
- W/S: aim
- Space or Left Mouse Button: fire (hold to charge, release to shoot)
- Right Mouse Button drag: pan camera
- Mouse wheel: zoom
- G: grapple
- B: dig in
- H: heal
- Q: arm/put away a special weapon from a crate (Esc also puts it away)
- Space after firing: detonate the Kamikaze Goat early
- N: new game

## Battlefield

- **Wind** changes every turn (gauge at the top). It pushes grenades, rockets, mortars and demo charges, not bullets. When it's windy the aim preview only shows the start of the arc.
- **Explosive barrels** blow up when caught in a blast or shot, and can chain into each other.
- **Landmines** arm shortly after the battle starts. Walk near one and you get about a second to get clear.
- **Special weapon crates** arrive with supply drops: Cluster Bomb, Holy Grenade, Teleporter, Kamikaze Goat, or Sledgehammer. Each is single-use.
- **Veterancy**: kills promote a soldier to Veteran ★ (1 kill), Elite ★★ (2), then Hero ★★★ (4), for more damage, more movement, and armor at Hero.

## Notes

- Development notes live in `DEVLOG.md`.
