#!/usr/bin/env bash
# Product-testing pass, 2026-08-28, gap #8: a real disaster-recovery
# backup for the whole database instance — distinct from, and not a
# replacement for, the in-app "Backup & Data" tab (T-31,
# data-export.service.ts). That one is a curated, per-shop CSV export
# for an Owner, deliberately scoped that way because a literal whole-
# database dump exposed through the app would leak every other shop's
# data to whoever clicked the button. This script is the opposite case
# on purpose: a genuine whole-instance dump for the person who actually
# operates the server, run from a shell with real database credentials,
# never wired into the app or exposed over HTTP to anyone.
#
# Usage:
#   BACKUP_DB_PASSWORD=... ./deploy/backup.sh
#
# Environment variables (all but the password have sane defaults):
#   BACKUP_DB_HOST      default: 127.0.0.1
#   BACKUP_DB_PORT      default: 3306
#   BACKUP_DB_USER      default: root          (needs real dump privileges — see deploy/db-setup.sql; the scoped surestock_app/surestock_migrate users deliberately don't have them)
#   BACKUP_DB_PASSWORD  required, no default on purpose — never bake a real credential into this file or its defaults
#   BACKUP_DB_NAME      default: surestock
#   BACKUP_DIR          default: ./backups
#   BACKUP_RETENTION_DAYS  default: 14 — older dumps are deleted after a successful new one, never before (see below)
#
# Scheduling: this script has no scheduler of its own — same honest gap
# every other "needs to run periodically" feature in this project has
# (the Notifications tab's daily summary, most notably) has already hit
# and documented the same way. Wire it to a real one, e.g. a crontab
# line on the actual production host:
#   0 2 * * * BACKUP_DB_PASSWORD=... /path/to/deploy/backup.sh >> /var/log/surestock-backup.log 2>&1

set -euo pipefail

DB_HOST="${BACKUP_DB_HOST:-127.0.0.1}"
DB_PORT="${BACKUP_DB_PORT:-3306}"
DB_USER="${BACKUP_DB_USER:-root}"
DB_NAME="${BACKUP_DB_NAME:-surestock}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [ -z "${BACKUP_DB_PASSWORD:-}" ]; then
  echo "ERROR: BACKUP_DB_PASSWORD is not set. Refusing to guess or default a database credential." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"
TMP_FILE="${OUT_FILE}.partial"

echo "Backing up '$DB_NAME' from $DB_HOST:$DB_PORT to $OUT_FILE ..."

# --single-transaction: a consistent snapshot without locking every
# table for the duration (the ledger tables in particular are written
# to constantly — a lock-based dump would be a real availability
# problem, not just a slow one). --routines/--triggers: this schema's
# own append-only triggers on stock_movement (T-02) are exactly the
# kind of object a lazy dump forgets and only notices missing during a
# real restore, which is far too late to find out.
MYSQL_PWD="$BACKUP_DB_PASSWORD" mysqldump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --hex-blob \
  "$DB_NAME" | gzip > "$TMP_FILE"

# Written to a .partial name and only renamed to the real name once
# gzip's own exit code confirms the whole pipeline actually succeeded —
# a backup file that exists but is truncated because mysqldump died
# partway through is worse than no file at all: it looks like a real
# backup right up until the moment someone actually needs to restore it.
mv "$TMP_FILE" "$OUT_FILE"
echo "Backup complete: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

# Retention cleanup runs *after* a confirmed-successful new backup, not
# before — so a failed backup run never deletes the last known-good one.
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "Deleted $DELETED backup(s) older than $RETENTION_DAYS days."
fi
