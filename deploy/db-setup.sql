-- Product-testing pass, 2026-08-28, gap #7: a real, least-privilege
-- production database setup. This project's dev database (T-02) was
-- deliberately scoped too, but its runtime user got `GRANT ALL` for
-- local convenience, and its migration user was root itself — neither
-- is an acceptable production shape. Run this once, as an admin
-- (root-equivalent) connection, against a fresh production server.
--
-- Two users, not one, same reasoning as .env.example's own
-- DATABASE_URL/MIGRATE_DATABASE_URL split:
--   - surestock_app: what the running application actually connects as.
--     Real data-manipulation privileges (SELECT/INSERT/UPDATE/DELETE),
--     deliberately no schema-changing (DDL) or administrative ones —
--     this user could never CREATE/ALTER/DROP a table even if the
--     application code were somehow tricked into trying.
--   - surestock_migrate: what `prisma migrate deploy` connects as. Real
--     DDL privileges the app user must never have, but not CREATE
--     DATABASE/DROP DATABASE/SUPER/GRANT OPTION — `migrate deploy`
--     (unlike `migrate dev`, used only in local dev) never builds a
--     shadow database, so this user doesn't need the broader admin
--     privileges the dev setup's root connection was only ever using
--     for that one thing.
--
-- The append-only protection on `stock_movement` (T-02's triggers) needs
-- nothing extra here — triggers hold for every connection regardless of
-- privilege level, including these two users and any future admin tool,
-- confirmed directly while building T-02 (see that migration's own
-- comment for why a privilege-based REVOKE couldn't express this at all).

CREATE DATABASE IF NOT EXISTS surestock
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- `%` (any host) is the portable default for a script meant to be
-- adapted to an unknown topology — scope this to the real application
-- server's actual hostname/IP instead wherever that's known ahead of
-- time; it's a real hardening step beyond what this generic script can
-- assume for you.
CREATE USER IF NOT EXISTS 'surestock_app'@'%' IDENTIFIED BY 'REPLACE_WITH_A_REAL_RANDOM_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON surestock.* TO 'surestock_app'@'%';

CREATE USER IF NOT EXISTS 'surestock_migrate'@'%' IDENTIFIED BY 'REPLACE_WITH_A_DIFFERENT_REAL_RANDOM_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON surestock.* TO 'surestock_migrate'@'%';

FLUSH PRIVILEGES;

-- schema.prisma's own header comment: every DateTime column is stored
-- naive, so the server's session time zone must be UTC or timestamps
-- silently corrupt. Confirm this on the real production server before
-- pointing the app at it — .env.example's own DATABASE_URL comment
-- carries the same warning with the exact query to check.
-- SELECT @@global.time_zone, @@session.time_zone;

-- After running this: set DATABASE_URL to a `surestock_app` connection
-- string and MIGRATE_DATABASE_URL to a `surestock_migrate` one (see
-- .env.example) — never point either at this admin/root connection.
