CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`target` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_blocks_owner` ON `blocks` (`owner`);--> statement-breakpoint
CREATE INDEX `idx_blocks_target` ON `blocks` (`target`);--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`sender` text NOT NULL,
	`recipient` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`sender`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_connections_sender` ON `connections` (`sender`);--> statement-breakpoint
CREATE INDEX `idx_connections_recipient` ON `connections` (`recipient`);--> statement-breakpoint
ALTER TABLE `profile_details` ADD `username` text;--> statement-breakpoint
ALTER TABLE `profile_details` ADD `visibility` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE `profile_details` ADD `skills` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `profile_details` ADD `looking_for` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_profile_username` ON `profile_details` (`username`);