CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`user` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `project_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_group_member` ON `group_members` (`group_id`,`user`);--> statement-breakpoint
CREATE INDEX `idx_group_member_user` ON `group_members` (`user`);--> statement-breakpoint
CREATE TABLE `project_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`project`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_project_group_name` ON `project_groups` (`project`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `usage_preferences` (
	`owner` text PRIMARY KEY NOT NULL,
	`monthly_limit` integer DEFAULT 1000 NOT NULL,
	`alert_at` integer DEFAULT 80 NOT NULL,
	`alerts_enabled` integer DEFAULT 1 NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
