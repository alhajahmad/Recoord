CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_owner_updated` ON `conversations` (`owner`,`updated`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`conversation`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation_created` ON `messages` (`conversation`,`created`);--> statement-breakpoint
CREATE TABLE `quotas` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL
);
