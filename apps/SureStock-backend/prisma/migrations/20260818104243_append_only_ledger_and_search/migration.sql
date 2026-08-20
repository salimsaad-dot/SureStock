-- Two rules that Prisma's schema language can't express, both promised
-- in prisma/schema.prisma's comments.

-- 1. stock_movement is append-only. The application must never issue an
--    UPDATE or DELETE against it — a wrong movement is corrected with a
--    new, opposite movement, never by editing history.
--
--    Correction to the plan noted in schema.prisma: a privilege-based
--    REVOKE (the original plan, and how this is done in Postgres)
--    cannot express this in MySQL/MariaDB. Privileges there are
--    additive across scopes only — a table-level REVOKE can never carve
--    a narrower exception out of a broader database-level GRANT ALL,
--    it can only remove a privilege that was itself granted at that
--    same table level. Confirmed directly: after
--    `GRANT ALL ON surestock.*` to the app user, UPDATE and DELETE on
--    stock_movement kept succeeding no matter what was subsequently
--    revoked at the table level.
--
--    Triggers are the mechanism that actually works, and they're
--    stronger than the originally planned REVOKE anyway: they hold for
--    every connection, including root and any future admin tool, until
--    someone explicitly drops the trigger — a deliberate, logged,
--    harder-to-do-by-accident action.
-- No DELIMITER wrapper: that's a `mysql` CLI-client-only parsing aid for
-- interactive sessions, not real SQL — Prisma sends this file straight
-- to the server over the protocol, where the semicolons inside the
-- trigger body are unambiguous.
CREATE TRIGGER stock_movement_no_update
BEFORE UPDATE ON stock_movement
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'stock_movement is append-only: correct a wrong movement with a new, opposite movement — never edit one in place.';
END;

CREATE TRIGGER stock_movement_no_delete
BEFORE DELETE ON stock_movement
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'stock_movement is append-only: correct a wrong movement with a new, opposite movement — never delete one.';
END;

-- 2. Product search index.
--    Correction to the plan noted in schema.prisma: this database is
--    actually MariaDB 10.4 (confirmed via `SELECT VERSION()`), not
--    MySQL 8 — and MariaDB does not ship MySQL's `ngram` full-text
--    parser plugin at all, so the typo-tolerant substitute proposed
--    there doesn't exist on this engine. What's added here is a plain
--    FULLTEXT index, which gives fast whole-word search but NOT
--    single-character typo tolerance (Doc 6, T-07: "a one-character
--    typo still matches" is not met by this index).
--
--    This is not a launch blocker: at the documented catalogue size
--    (≤5,000 SKUs), a full scan is already sub-150ms with no index at
--    all, so nothing is slow. What's missing is specifically fuzzy
--    matching. If that's needed before a dedicated search service is
--    worth adding, the pragmatic fix is an application-side Levenshtein
--    comparison over the small candidate set this FULLTEXT/LIKE query
--    already narrows down — not a database feature.
ALTER TABLE product ADD FULLTEXT INDEX product_name_fulltext (name);
