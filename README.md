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

- Left/Right: move
- W/S: aim
- Space or Left Mouse Button: fire (hold to charge, release to shoot)
- Right Mouse Button drag: pan camera
- Mouse wheel: zoom
- G: grapple
- B: dig in
- H: heal
- N: new game

## Notes

- Development notes live in `DEVLOG.md`.
