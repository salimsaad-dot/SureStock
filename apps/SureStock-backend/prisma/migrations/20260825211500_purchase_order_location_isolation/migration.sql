-- Found while fixing the Category/Supplier/Product/TaxRate isolation gap:
-- PurchaseOrder had no locationId at all, and GET /purchase-orders had no
-- scoping whatsoever — every shop's purchase orders, suppliers, and costs
-- were visible to any Manager/Owner, anywhere. Backfilled from each PO's
-- own lines (every line of a real PO always shares one location, by
-- construction — createPurchaseOrder only ever creates lines against the
-- creating user's own location), not a blanket single-shop assignment —
-- this database's real purchase orders already span multiple shops.

ALTER TABLE `purchase_order` ADD COLUMN `location_id` CHAR(36) NULL;

UPDATE `purchase_order` po
JOIN `purchase_order_line` pol ON pol.purchase_order_id = po.id
JOIN `product_variant` pv ON pv.id = pol.variant_id
SET po.location_id = pv.location_id
WHERE po.location_id IS NULL;

ALTER TABLE `purchase_order` MODIFY COLUMN `location_id` CHAR(36) NOT NULL;

CREATE INDEX `purchase_order_location_id_idx` ON `purchase_order`(`location_id`);

ALTER TABLE `purchase_order` ADD CONSTRAINT `purchase_order_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
