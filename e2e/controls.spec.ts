import { expect, test, type Page } from '@playwright/test';

// End-to-end guards for controls that have regressed before. Each test boots the real game,
// deploys two random squads and drives it with real mouse / keyboard input.

type CamState = { left: number; width: number; zoom: number; dragging: boolean; follow: boolean; worldWidth: number };

const GAME = `game.scene.getScene('GameScene')`;

async function camState(page: Page): Promise<CamState> {
  return page.evaluate(`(() => {
    const s = ${GAME}; const c = s.cameras.main;
    return { left: c.worldView.x, width: c.worldView.width, zoom: c.zoom, dragging: s.isDraggingCamera,
      follow: !!c._follow, worldWidth: s.worldWidth };
  })()`);
}

/** Canvas-relative CSS position for a logical (1280x720) screen point. */
async function screenPoint(page: Page, lx: number, ly: number): Promise<{ x: number; y: number }> {
  const box = (await page.locator('canvas').boundingBox())!;
  return { x: box.x + (lx / 1280) * box.width, y: box.y + (ly / 720) * box.height };
}

/** Screen position of a world point under the main game camera. */
async function worldToScreen(page: Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  const box = (await page.locator('canvas').boundingBox())!;
  const p = await page.evaluate(`(() => { const c = ${GAME}.cameras.main;
    return { x: (${wx} - c.worldView.x) * c.zoom, y: (${wy} - c.worldView.y) * c.zoom, w: c.width, h: c.height }; })()`) as
    { x: number; y: number; w: number; h: number };
  return { x: box.x + (p.x / p.w) * box.width, y: box.y + (p.y / p.h) * box.height };
}

async function rightDrag(page: Page, from: { x: number; y: number }, dx: number): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'right' });
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (dx * i) / steps, from.y);
  }
  await page.mouse.up({ button: 'right' });
}

/** Keep dragging across the screen (as a player would) until the camera stops moving. */
async function dragToEdge(page: Page, direction: 'left' | 'right'): Promise<void> {
  const box = (await page.locator('canvas').boundingBox())!;
  const y = box.y + box.height * 0.5;
  const from = direction === 'left' ? box.x + box.width * 0.1 : box.x + box.width * 0.9;
  const dx = (direction === 'left' ? 1 : -1) * box.width * 0.8;
  let last = Number.NaN;
  for (let i = 0; i < 12; i++) {
    await rightDrag(page, { x: from, y }, dx);
    const left = (await camState(page)).left;
    if (Math.abs(left - last) < 0.5) return;
    last = left;
  }
}

/** Menu -> random squads -> deploy -> skip intro -> close briefing -> red (human) controls a soldier. */
async function startPlayerTurn(page: Page, scale: number): Promise<void> {
  await page.goto(`/?scale=${scale}`);
  await expect.poll(() => page.evaluate(() => (window as any).game?.scene?.isActive('MenuScene') ?? false)).toBe(true);

  for (const key of ['r', 'Enter', 'r', 'Enter', 'Enter']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
  await expect.poll(() => page.evaluate(() => (window as any).game.scene.isActive('GameScene'))).toBe(true);

  // Skip the intro, then dismiss the Operations briefing if it shows.
  await expect.poll(async () => {
    const done = await page.evaluate(`${GAME}.introDone`);
    if (!done) await page.keyboard.press('Space');
    return done;
  }, { timeout: 30_000 }).toBe(true);

  // Operations mode opens a faction briefing just after the intro; it is modal, so wait for it and
  // dismiss it with a click like a player would.
  if (await page.evaluate(`${GAME}.gameMode === 'expanded'`)) {
    await expect.poll(() => page.evaluate(`!!game.scene.getScene('UIScene').briefingContainer`)).toBe(true);
    const button = await screenPoint(page, 640, 558);
    await page.mouse.click(button.x, button.y);
    await expect.poll(() => page.evaluate(`!game.scene.getScene('UIScene').briefingContainer`)).toBe(true);
  }

  // Wait for red's (the human's) soldier selection; the AI may move first.
  await expect.poll(() => page.evaluate(`(() => { const s = ${GAME};
    return s.isSelectingCharacter && s.turnManager.getCurrentTeam() === 'red'; })()`),
  { timeout: 60_000, intervals: [500] }).toBe(true);

  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(`!${GAME}.isSelectingCharacter && !!${GAME}.currentSoldier`)).toBe(true);
  // Let the turn-start zoom tween and camera follow settle.
  await page.waitForTimeout(1500);
}

for (const scale of [1, 1.5, 2]) {
  test.describe(`display scale ${scale}`, () => {
    test('right-drag pans the camera and it stays where it is left', async ({ page }) => {
      test.setTimeout(240_000);
      await startPlayerTurn(page, scale);
      const centre = await screenPoint(page, 640, 360);
      const box = (await page.locator('canvas').boundingBox())!;

      // Drag the map left (look right).
      const before = await camState(page);
      await rightDrag(page, centre, -box.width * 0.3);
      const afterDrag = await camState(page);
      expect(afterDrag.dragging).toBe(false);
      expect(afterDrag.follow).toBe(false);
      if (before.left + before.width < before.worldWidth - 1) {
        expect(afterDrag.left).toBeGreaterThan(before.left + 50);
      }

      // The camera stays put after release (no snap back to the soldier).
      await page.waitForTimeout(800);
      expect((await camState(page)).left).toBeCloseTo(afterDrag.left, 0);

      // Both map edges are reachable.
      await dragToEdge(page, 'left');
      expect((await camState(page)).left).toBeCloseTo(0, 0);
      await dragToEdge(page, 'right');
      const end = await camState(page);
      expect(end.left + end.width).toBeCloseTo(end.worldWidth, 0);
    });
  });
}

test('mouse wheel zooms the battlefield', async ({ page }) => {
  await startPlayerTurn(page, 1.5);
  const centre = await screenPoint(page, 640, 360);
  await page.mouse.move(centre.x, centre.y);
  const before = (await camState(page)).zoom;
  await page.mouse.wheel(0, 400);
  await expect.poll(async () => (await camState(page)).zoom).toBeLessThan(before);
});

test('A / D keys pan the camera', async ({ page }) => {
  await startPlayerTurn(page, 1.5);
  // Start from the left edge so there is room to pan right.
  await dragToEdge(page, 'left');
  const before = (await camState(page)).left;
  await page.keyboard.down('d');
  await page.waitForTimeout(600);
  await page.keyboard.up('d');
  expect((await camState(page)).left).toBeGreaterThan(before + 20);
});

test('mouse aim: click and release fires a shot', async ({ page }) => {
  await startPlayerTurn(page, 1.5);
  const soldier = await page.evaluate(`(() => { const s = ${GAME}.currentSoldier; return { x: s.x, y: s.y }; })()`) as { x: number; y: number };
  const target = await worldToScreen(page, soldier.x + 120, soldier.y - 120);
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(`${GAME}.hasFired`)).toBe(true);
});

test('squad screen: clicking a card picks that unit', async ({ page }) => {
  await page.goto('/?scale=1.5');
  await expect.poll(() => page.evaluate(() => (window as any).game?.scene?.isActive('MenuScene') ?? false)).toBe(true);
  // Rifleman card (mid-range column, top row).
  const card = await screenPoint(page, 282, 258);
  await page.mouse.click(card.x, card.y);
  expect(await page.evaluate(() => (window as any).game.scene.getScene('MenuScene').redTeam.selected)).toEqual(['rifle']);
});
