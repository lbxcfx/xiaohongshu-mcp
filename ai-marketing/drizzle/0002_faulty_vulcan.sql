CREATE TABLE `material_publications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`materialId` int NOT NULL,
	`scriptId` int,
	`platform` enum('xiaohongshu') NOT NULL,
	`status` enum('draft','publishing','published','failed') NOT NULL DEFAULT 'draft',
	`title` text,
	`content` text,
	`tags` json,
	`visibility` varchar(32),
	`postId` varchar(128),
	`errorMessage` text,
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `material_publications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `topic_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`hubItemId` int NOT NULL,
	`title` varchar(512) NOT NULL,
	`rationale` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `topic_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `materials` ADD `seedanceTaskId` varchar(128);--> statement-breakpoint
ALTER TABLE `materials` ADD `referenceImageUrl` text;--> statement-breakpoint
ALTER TABLE `materials` ADD `prompt` text;--> statement-breakpoint
ALTER TABLE `scripts` ADD `topicPlanId` int;--> statement-breakpoint
ALTER TABLE `scripts` ADD `hubItemId` int;