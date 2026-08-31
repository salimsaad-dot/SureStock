-- PurchaseOrder switches from a stored `order_number` string to a real
-- DB-assigned AUTO_INCREMENT sequence (`order_seq`) so PO numbers can be
-- genuinely sequential (PO-1024, PO-1023...), unlike receipts, which are
-- deliberately non-sequential id fragments. The display string
-- (`PO-${1000 + orderSeq}`) is computed at serialization time, not
-- stored. Table is empty (Purchasing has no code yet), so no backfill.

ALTER TABLE `purchase_order`
  DROP COLUMN `order_number`,
  ADD COLUMN `order_seq` INTEGER NOT NULL AUTO_INCREMENT UNIQUE;
