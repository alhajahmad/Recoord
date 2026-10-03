CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`project`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_documents_owner_project` ON `documents` (`owner`,`project`);--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project` text,
	`content` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_drafts_owner_project` ON `drafts` (`owner`,`project`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`goal` text DEFAULT '' NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_projects_owner_updated` ON `projects` (`owner`,`updated`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `project` text;