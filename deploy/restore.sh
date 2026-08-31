#!/usr/bin/env bash
# Product-testing pass, 2026-08-28, gap #8: the other half of a real
# backup — an untested backup is not a real backup, so this is also
# the script the go-live runbook's own "rehearsed rollback plan" (T-33,
# see progress.md's Go-Live Runbook artifact) should point at for the
# database-loss scenario specifically, rather than leaving "restore
# from backup" as a step with no actual command behind it.
#
# Usage:
#   RESTORE_DB_PASSWORD=... ./deploy/restore.sh path/to/backup.sql.gz
#
# By default this restores into RESTORE_DB_NAME (default: surestock) —
# the real database. For a drill (proving a backup actually works
# without touching real data), point RESTORE_DB_NAME at a throwaway
# database instead:
#   RESTORE_DB_NAME=surestock_restore_drill RESTORE_DB_PASSWORD=... ./deploy/restore.sh backup.sql.gz
#
# Environment variables (all but the password have sane defaults):
#   RESTORE_DB_HOST      default: 127.0.0.1
#   RESTORE_DB_PORT      default: 3306
#   RESTORE_DB_USER      default: root          (needs real DDL privileges to CREATE DATABASE and restore into it)
#   RESTORE_DB_PASSWORD  required, no default on purpose
#   RESTORE_DB_NAME      default: surestock
#   RESTORE_FORCE        set to "1" to skip the confirmation prompt (for scripted drills/CI, not for a human doing this by hand)

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: RESTORE_DB_PASSWORD=... $0 path/to/backup.sql.gz" >&2
  exit 1
fi
BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

DB_HOST="${RESTORE_DB_HOST:-127.0.0.1}"
DB_PORT="${RESTORE_DB_PORT:-3306}"
DB_USER="${RESTORE_DB_USER:-root}"
DB_NAME="${RESTORE_DB_NAME:-surestock}"

if [ -z "${RESTORE_DB_PASSWORD:-}" ]; then
  echo "ERROR: RESTORE_DB_PASSWORD is not set. Refusing to guess or default a database credential." >&2
  exit 1
fi

# This is genuinely destructive — restoring replaces whatever is
# currently in $DB_NAME with the backup's contents. No confirmation
# prompt here would be a real footgun for anyone running this against
# the actual production database name by habit.
if [ "${RESTORE_FORCE:-0}" != "1" ]; then
  echo "This will REPLACE the contents of database '$DB_NAME' on $DB_HOST:$DB_PORT with $BACKUP_FILE."
  read -r -p "Type the database name to confirm ('$DB_NAME'): " CONFIRM
  if [ "$CONFIRM" != "$DB_NAME" ]; then
    echo "Confirmation did not match — aborting, nothing was touched." >&2
    exit 1
  fi
fi

echo "Restoring $BACKUP_FILE into '$DB_NAME' on $DB_HOST:$DB_PORT ..."

MYSQL_PWD="$RESTORE_DB_PASSWORD" mysql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
  -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

gunzip -c "$BACKUP_FILE" | MYSQL_PWD="$RESTORE_DB_PASSWORD" mysql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" "$DB_NAME"

echo "Restore complete."
echo "Sanity check — real row counts in the restored database:"
# `rows` is a reserved word in MariaDB (ROWS, as in window-function
# frame syntax) — found the hard way running this drill for real, not
# assumed safe because it reads like an ordinary column alias.
MYSQL_PWD="$RESTORE_DB_PASSWORD" mysql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" "$DB_NAME" -e "
  SELECT 'location' AS \`table\`, COUNT(*) AS \`count\` FROM location
  UNION ALL SELECT 'user', COUNT(*) FROM user
  UNION ALL SELECT 'product', COUNT(*) FROM product
  UNION ALL SELECT 'sale', COUNT(*) FROM sale
  UNION ALL SELECT 'stock_movement', COUNT(*) FROM stock_movement;
"
