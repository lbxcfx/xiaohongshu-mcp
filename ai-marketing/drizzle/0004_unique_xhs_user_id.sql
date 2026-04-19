UPDATE `users` SET `xhsUserId` = NULL WHERE `xhsUserId` LIKE 'xhs-client-%';--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_xhsUserId_unique` UNIQUE(`xhsUserId`);--> statement-breakpoint
