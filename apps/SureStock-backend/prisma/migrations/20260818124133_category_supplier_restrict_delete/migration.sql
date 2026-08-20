-- Doc 6, T-05: "a category in use cannot be deleted." The Prisma
-- default for an optional relation (SET NULL) would let a delete
-- succeed by silently orphaning products to no category instead —
-- technically a successful delete, but not what the acceptance
-- criterion means. Supplier gets the same treatment for the same
-- reason, and to match purchase_order's existing RESTRICT on
-- supplier_id.
--
-- Hand-written, with the auto-generated diff's now-familiar spurious
-- statements (stock_movement's FK/index and a duplicate
-- purchase_order_line constraint add) removed — see the comment on
-- migration 20260818114945 for the full story on that quirk.
ALTER TABLE `product` DROP FOREIGN KEY `product_category_id_fkey`;
ALTER TABLE `product` DROP FOREIGN KEY `product_supplier_id_fkey`;

DROP INDEX `product_category_id_fkey` ON `product`;
DROP INDEX `product_supplier_id_fkey` ON `product`;

ALTER TABLE `product` ADD CONSTRAINT `product_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `product` ADD CONSTRAINT `product_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
