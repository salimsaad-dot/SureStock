-- T-27: stock takes gain a category reference for CATEGORY-scoped
-- counts (Doc 3 §4.2: "choose full shop or a category") — Doc 5's own
-- field list never named this column, an oversight this corrects. Also
-- a uniqueness guard so a variant can never appear twice on the same
-- stock take's line list.

ALTER TABLE `stock_take` ADD COLUMN `category_id` CHAR(36) NULL;
ALTER TABLE `stock_take` ADD CONSTRAINT `stock_take_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX `stock_take_line_stock_take_id_variant_id_key` ON `stock_take_line`(`stock_take_id`, `variant_id`);
