import { defineConfig, devices } from '@playwright/test';

/**
 * T-32: "Playwright covers sale, refund, receive, and stock take;
 * offline scenarios scripted." Distinct from the existing
 * Storybook/Vitest browser-mode Playwright driver (vite.config.ts),
 * which mounts one component/story at a time — this drives real
 * multi-page flows (login → nav → checkout → receipt) against the
 * actual running app and backend.
 *
 * Requires both dev servers already running (`npm run dev` in
 * SureStock-backend, `npm run dev:web` here) and XAMPP MariaDB up —
 * same standing requirement as every other real-backend test in this
 * project. `reuseExistingServer` means it won't try to start a second
 * frontend dev server on top of one you already have open.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Same reasoning as the backend's own vitest.config.ts (`fileParallelism:
  // false`): every spec hits the same real, connection-pool-limited MariaDB
  // instance through one shared backend process — sequential is the safer
  // default here even though the one real flake hit during development
  // turned out to be a test-selector bug (see receive.spec.ts/refund.spec.ts's
  // own comments), not actual cross-spec interference.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    // vite.config.ts pins no dev port, so Vite picks whatever's free
    // starting at 5173 — this has drifted to 5183 before on this
    // machine. If `npm run test:e2e` times out waiting for a server,
    // check which port `npm run dev` actually landed on and update
    // this (and webServer.url below) to match, rather than assuming.
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
