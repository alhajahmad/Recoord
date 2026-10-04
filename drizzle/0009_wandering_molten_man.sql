CREATE TABLE `billing_preferences` (
	`owner` text PRIMARY KEY NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`purchase_order` text DEFAULT '' NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `key_governance` (
	`owner` text PRIMARY KEY NOT NULL,
	`creation_disabled` integer DEFAULT 0 NOT NULL,
	`max_lifetime_days` integer DEFAULT 30 NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `request_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project` text,
	`key_id` text,
	`source` text NOT NULL,
	`status` integer NOT NULL,
	`duration` integer NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_request_metrics_owner_created` ON `request_metrics` (`owner`,`created`);--> statement-breakpoint
CREATE INDEX `idx_request_metrics_project` ON `request_metrics` (`project`);