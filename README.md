# Squad of 5

Turn-based artillery tactics game built with Phaser 3, TypeScript, and Vite.

## Tech

- Phaser 3
- TypeScript
- Vite
- Vitest

## Requirements

- Node.js 18+ (tested with Node v18.x)

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

