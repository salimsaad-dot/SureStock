-- Settings store (T-29): Location gains real, per-location columns for
-- Business Profile fields (email, logo URL) plus what used to be
-- hardcoded interim constants elsewhere in the codebase (discount
-- override threshold, till variance threshold, PIN lockout policy,
-- enabled payment methods, default reorder point/quantity).

ALTER TABLE `location`
  ADD COLUMN `email` VARCHAR(191) NULL,
  ADD COLUMN `logo_url` VARCHAR(191) NULL,
  ADD COLUMN `discount_override_threshold_percent` DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
  ADD COLUMN `till_variance_threshold` DECIMAL(12, 2) NOT NULL DEFAULT 20.00,
  ADD COLUMN `pin_lockout_attempts` INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN `pin_lockout_minutes` INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN `cash_enabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `mobile_money_enabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `card_enabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `account_enabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `default_reorder_point` DECIMAL(12, 3) NULL,
  ADD COLUMN `default_reorder_quantity` DECIMAL(12, 3) NULL;
