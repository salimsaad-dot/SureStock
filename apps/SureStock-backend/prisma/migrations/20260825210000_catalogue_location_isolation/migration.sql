-- Doc 6 T-30 follow-up: Category/Supplier/Product/TaxRate were global
-- across every shop. Backfill target is smoke-loc-0000000000000000000001
-- (smoke-owner's shop) — the only location in this database with real
-- catalogue data as of this migration; every other location is a
-- disposable E2E/Debug/Load-test fixture that creates its own products
-- fresh via the API and never references category/supplier/taxRate.

-- AlterTable: add nullable first, backfill, then tighten to NOT NULL —
-- a plain NOT NULL ADD COLUMN would fail outright against these
-- already-populated tables.
ALTER TABLE `category` ADD COLUMN `location_id` CHAR(36) NULL;
ALTER TABLE `supplier` ADD COLUMN `location_id` CHAR(36) NULL;
ALTER TABLE `product` ADD COLUMN `location_id` CHAR(36) NULL;
ALTER TABLE `tax_rate` ADD COLUMN `location_id` CHAR(36) NULL;

UPDATE `category` SET `location_id` = 'smoke-loc-0000000000000000000001' WHERE `location_id` IS NULL;
UPDATE `supplier` SET `location_id` = 'smoke-loc-0000000000000000000001' WHERE `location_id` IS NULL;
UPDATE `product` SET `location_id` = 'smoke-loc-0000000000000000000001' WHERE `location_id` IS NULL;
UPDATE `tax_rate` SET `location_id` = 'smoke-loc-0000000000000000000001' WHERE `location_id` IS NULL;

ALTER TABLE `category` MODIFY COLUMN `location_id` CHAR(36) NOT NULL;
ALTER TABLE `supplier` MODIFY COLUMN `location_id` CHAR(36) NOT NULL;
ALTER TABLE `product` MODIFY COLUMN `location_id` CHAR(36) NOT NULL;
ALTER TABLE `tax_rate` MODIFY COLUMN `location_id` CHAR(36) NOT NULL;

-- CreateIndex
CREATE INDEX `category_location_id_idx` ON `category`(`location_id`);
CREATE INDEX `supplier_location_id_idx` ON `supplier`(`location_id`);
CREATE INDEX `product_location_id_idx` ON `product`(`location_id`);
CREATE INDEX `tax_rate_location_id_idx` ON `tax_rate`(`location_id`);

-- AddForeignKey
ALTER TABLE `category` ADD CONSTRAINT `category_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `supplier` ADD CONSTRAINT `supplier_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `tax_rate` ADD CONSTRAINT `tax_rate_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `product` ADD CONSTRAINT `product_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Barcode uniqueness: was global (a real UPC recurring across two
-- independent shops would collide), now per-location like sku already was.
DROP INDEX `product_variant_barcode_key` ON `product_variant`;
CREATE UNIQUE INDEX `product_variant_barcode_location_id_key` ON `product_variant`(`barcode`, `location_id`);
