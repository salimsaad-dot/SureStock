-- PIN lockout tracking (Doc 6, T-03).
ALTER TABLE `user` ADD COLUMN `failed_pin_attempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `pin_locked_until` DATETIME(3) NULL;
