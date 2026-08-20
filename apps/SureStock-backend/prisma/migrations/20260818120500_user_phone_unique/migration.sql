-- Hand-written: `prisma migrate dev` refuses to run non-interactively
-- once it detects a warning-worthy change (a new UNIQUE constraint,
-- here — harmless since `user` is currently empty, but it still wants a
-- confirmation prompt this environment can't answer). Naming follows
-- Prisma's own convention (see `user_email_key` in the init migration).
ALTER TABLE `user` ADD UNIQUE INDEX `user_phone_key` (`phone`);
