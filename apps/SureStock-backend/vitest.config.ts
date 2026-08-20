import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Runs against its own database (surestock_test), never the dev one
    // — integration tests that insert real rows shouldn't pollute (or
    // race with) whatever data a developer happens to be looking at.
    setupFiles: ['./src/test/setup-env.ts'],
    // Vitest runs separate test files concurrently by default. That's
    // fine for pure unit tests, but these hit one real MariaDB instance
    // through a connection pool capped at 10 (db-url.ts) — concurrent
    // files were starving each other for connections, which showed up
    // as a genuine deadlock in an unrelated test the moment one file
    // started a heavy bulk-insert. Sequential is slower to run but
    // actually correct against a shared, contended resource.
    fileParallelism: false,
  },
});
