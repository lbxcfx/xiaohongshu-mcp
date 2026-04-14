ALTER TABLE `users` ADD `xhsUserId` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `xhsNickname` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `avatar` text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `xhs_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountKey` varchar(128) NOT NULL,
	`xhsUserId` varchar(128),
	`nickname` varchar(255),
	`avatar` text,
	`status` enum('unknown','logged_in','expired') NOT NULL DEFAULT 'unknown',
	`cookiesPath` text,
	`loginStatePath` text,
	`browserUserDataDir` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `xhs_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `xhsAccountId` int;
