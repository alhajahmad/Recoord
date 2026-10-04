CREATE TABLE `developer_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project` text NOT NULL,
	`label` text NOT NULL,
	`prefix` text NOT NULL,
	`hash` text NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL,
	`last_used` integer,
	`revoked` integer,
	`rate_window` integer DEFAULT 0 NOT NULL,
	`read_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_developer_key_hash` ON `developer_keys` (`hash`);--> statement-breakpoint
CREATE INDEX `idx_developer_key_owner` ON `developer_keys` (`owner`);