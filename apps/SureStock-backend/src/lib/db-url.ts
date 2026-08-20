import type { PoolConfig } from 'mariadb';

/**
 * @prisma/adapter-mariadb sits on top of the `mariadb` npm driver, whose
 * own connection-string parser only recognises the `mariadb://` scheme.
 * DATABASE_URL is deliberately kept as the standard `mysql://` form
 * instead — every other tool that will ever touch this database (the
 * mysql CLI, a GUI client, CI health checks) expects that scheme, and
 * Prisma's own CLI config (prisma.config.ts) accepts it natively. This
 * function is the one place that difference is bridged, so nothing else
 * in the codebase needs to know the adapter is fussy about the scheme.
 */
export function parseDatabaseUrl(databaseUrl: string): PoolConfig {
  const url = new URL(databaseUrl);

  if (!['mysql:', 'mariadb:'].includes(url.protocol)) {
    throw new Error(`DATABASE_URL must use the mysql:// scheme, got "${url.protocol}"`);
  }

  const database = url.pathname.replace(/^\//, '');
  if (!database) {
    throw new Error('DATABASE_URL must include a database name, e.g. mysql://user:pass@host:3306/surestock');
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    connectionLimit: 10,
    // Default is ~10s, which makes /health/ready hang that long against
    // a genuinely unreachable database instead of failing fast — bad for
    // an orchestrator deciding whether to route traffic here. Confirmed
    // by testing this exact endpoint against no database at all.
    connectTimeout: 3000,
  };
}
