-- Runs automatically on the compose `db` service's first startup (mounted
-- into /docker-entrypoint-initdb.d/). MARIADB_DATABASE/MARIADB_USER in
-- docker-compose.yml already create `surestock` and grant surestock_app
-- full rights on it — this adds the second database the test suite needs
-- (same dev/test separation as the local setup: `npm test` never touches
-- the "real" database), since the mariadb image's own env vars only ever
-- provision one database + grant automatically.
CREATE DATABASE IF NOT EXISTS surestock_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON surestock_test.* TO 'surestock_app'@'%';
FLUSH PRIVILEGES;
