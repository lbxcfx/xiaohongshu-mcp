CREATE TABLE `materials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`scriptId` int,
	`type` enum('real_person','digital_avatar','before_after','other') NOT NULL,
	`title` varchar(255) NOT NULL,
	`fileUrl` text,
	`thumbnailUrl` text,
	`tags` json,
	`bodyPart` varchar(128),
	`treatmentType` varchar(128),
	`style` varchar(128),
	`status` enum('uploading','processing','ready','failed') NOT NULL DEFAULT 'uploading',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `materials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_adaptations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`scriptId` int NOT NULL,
	`platform` enum('xiaohongshu','douyin','instagram','tiktok','youtube') NOT NULL,
	`title` text,
	`caption` text,
	`hashtags` json,
	`adaptedContent` text,
	`formatNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platform_adaptations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `positionings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`industry` varchar(128),
	`track` varchar(128),
	`monetizationMethod` varchar(128),
	`targetAudience` text,
	`personaType` varchar(128),
	`analysisResult` json,
	`positioningRecommendation` text,
	`viralAccountInsights` json,
	`status` enum('pending','analyzing','completed','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `positionings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`industry` varchar(128),
	`platform` varchar(128),
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scripts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`topicId` int,
	`analysisId` int,
	`title` varchar(512) NOT NULL,
	`hookType` enum('camp_split','anti_cognition','curiosity'),
	`hookContent` text,
	`mainContent` text,
	`endingContent` text,
	`fullScript` text,
	`platform` varchar(64),
	`duration` int,
	`status` enum('draft','review','approved','produced') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scripts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `topic_hub_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`type` enum('trending','viral_post','high_conversion','manual') NOT NULL,
	`platform` varchar(64),
	`title` varchar(512) NOT NULL,
	`content` text,
	`url` text,
	`engagementScore` int,
	`tags` json,
	`isSelected` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `topic_hub_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(512) NOT NULL,
	`description` text,
	`topicType` enum('persona','traffic','marketing') NOT NULL,
	`viralPotential` enum('high','medium','low') DEFAULT 'medium',
	`rationale` text,
	`status` enum('draft','selected','in_production','published') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `topics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `usage_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int,
	`module` varchar(64) NOT NULL,
	`action` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `usage_stats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `viral_analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`topicId` int,
	`referenceContent` text,
	`contentUrl` text,
	`contentFormat` varchar(128),
	`videoType` varchar(128),
	`shootingStyle` text,
	`environment` text,
	`wardrobe` text,
	`personaStyle` text,
	`emotionTone` text,
	`contentStructure` text,
	`scriptArchitecture` text,
	`viralFormula` text,
	`conversionFormula` text,
	`fullAnalysis` json,
	`status` enum('pending','analyzing','completed','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `viral_analyses_id` PRIMARY KEY(`id`)
);
