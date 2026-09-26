import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Browser smoke tests: play the real game in Chromium and check the core controls still work
// (menu, right-drag pan, wheel zoom, keyboard pan, mouse aim + fire) at several display scales.
// Run with `npm run test:e2e` (first time on a new machine: `npx playwright install chromium`).

// Cloud dev containers ship a preinstalled Chromium; use it when present instead of downloading.
const bundledChromium = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const executablePath = existsSync(bundledChromium) ? bundledChromium : undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 720 },
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
