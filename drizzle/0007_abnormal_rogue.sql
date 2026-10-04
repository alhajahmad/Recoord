CREATE TABLE `project_api_usage` (
	`project` text NOT NULL,
	`day` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_project_api_usage` ON `project_api_usage` (`project`,`day`);--> statement-breakpoint
CREATE TABLE `project_policies` (
	`project` text PRIMARY KEY NOT NULL,
	`policy` text NOT NULL,
	`revision` integer NOT NULL,
	`change_id` text NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`project`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_policy_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`project`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_project_policy_events` ON `project_policy_events` (`project`,`created`);