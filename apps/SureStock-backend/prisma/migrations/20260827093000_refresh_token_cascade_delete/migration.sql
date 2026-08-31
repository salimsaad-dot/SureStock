-- RefreshToken rows are session artifacts, not business records to
-- protect from their owner's deletion the way a sale/audit-log row is
-- — cascade them away if a user is ever hard-deleted, instead of
-- blocking the deletion (this schema's usual Restrict default).
ALTER TABLE `refresh_token` DROP FOREIGN KEY `refresh_token_user_id_fkey`;
ALTER TABLE `refresh_token` ADD CONSTRAINT `refresh_token_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
