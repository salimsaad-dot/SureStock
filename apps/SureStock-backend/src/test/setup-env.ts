import 'dotenv/config';

// Runs before any test file's own imports, so this wins the race against
// env.ts's own `dotenv/config` call — dotenv never overwrites a variable
// that's already set, so setting DATABASE_URL here first is what
// actually redirects the app at the test database instead of dev.
process.env.NODE_ENV = 'test';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is not set — add it to .env (see .env.example). ' +
      'Tests refuse to guess a connection string rather than risk running against dev data.',
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
