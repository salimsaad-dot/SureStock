-- DropForeignKey
ALTER TABLE `stock_movement` DROP FOREIGN KEY `stock_movement_variant_id_fkey`;

-- DropIndex
DROP INDEX `stock_movement_variant_id_occurred_at_idx` ON `stock_movement`;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `avatar_url` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `stock_movement_variant_id_occurred_at_idx` ON `stock_movement`(`variant_id`, `occurred_at` DESC);

-- AddForeignKey
ALTER TABLE `stock_take` ADD CONSTRAINT `stock_take_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- RedefineIndex
CREATE UNIQUE INDEX `purchase_order_order_seq_key` ON `purchase_order`(`order_seq`);
DROP INDEX `order_seq` ON `purchase_order`;
