-- AlterTable
ALTER TABLE `location` ADD COLUMN `notification_phone` VARCHAR(191) NULL,
    ADD COLUMN `notify_daily_summary_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `notify_low_stock_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `notify_till_variance_enabled` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `notification_log` (
    `id` CHAR(36) NOT NULL,
    `location_id` CHAR(36) NOT NULL,
    `type` ENUM('LOW_STOCK', 'TILL_VARIANCE', 'DAILY_SUMMARY', 'TEST') NOT NULL,
    `recipient_phone` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `status` ENUM('SENT', 'FAILED', 'NOT_CONFIGURED') NOT NULL,
    `provider_response` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_log_location_id_created_at_idx`(`location_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `notification_log` ADD CONSTRAINT `notification_log_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
