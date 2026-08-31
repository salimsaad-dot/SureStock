/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
import path from 'node:path';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = import.meta.dirname;

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // T-21: installable PWA shell. Precaches only the app's own built
    // assets (JS/CSS/the HTML shell) so the app can boot offline — API
    // calls are deliberately left alone (navigateFallbackDenylist below
    // plus no runtimeCaching entry for /api) since the real offline data
    // layer is the Dexie cache in src/lib/offline/, not a second,
    // independently-stale HTTP cache that could disagree with it.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'SureStock',
        short_name: 'SureStock',
        description: 'SureStock inventory and point-of-sale system',
        theme_color: '#7e14ff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        // SVG-only icons — the existing brand mark, not a dedicated
        // 192/512 PNG export (a real design task, not attempted here;
        // same honest gap as Product.imageUrl/Location.logoUrl having
        // no upload). Chromium/Firefox install prompts accept this;
        // iOS Safari's installability doesn't, a known limitation.
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  server: {
    // The backend does have a real CORS plugin now (2026-08-26), which
    // already allows any localhost origin outside production — this proxy
    // is kept anyway since same-origin in dev means one less moving part
    // to think about, not a workaround for a missing capability anymore.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    projects: [{
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
});