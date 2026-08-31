-- T-23: a review queue for offline-sync sales that either committed with
-- a flagged negative-stock line, or failed validation entirely and need
-- a human decision. Distinct from audit_log — this has resolution state
-- (resolved_at/resolved_by/resolution_note), audit_log is pure history.

CREATE TABLE `review_queue_item` (
    `id` CHAR(36) NOT NULL,
    `type` ENUM('NEGATIVE_STOCK', 'SYNC_VALIDATION_FAILURE') NOT NULL,
    `sale_id` CHAR(36) NULL,
    `variant_id` CHAR(36) NULL,
    `reason` TEXT NOT NULL,
    `details` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved_at` DATETIME(3) NULL,
    `resolved_by` CHAR(36) NULL,
    `resolution_note` TEXT NULL,

    INDEX `review_queue_item_resolved_at_idx`(`resolved_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `review_queue_item` ADD CONSTRAINT `review_queue_item_sale_id_fkey` FOREIGN KEY (`sale_id`) REFERENCES `sale`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `review_queue_item` ADD CONSTRAINT `review_queue_item_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `product_variant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `review_queue_item` ADD CONSTRAINT `review_queue_item_resolved_by_fkey` FOREIGN KEY (`resolved_by`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
