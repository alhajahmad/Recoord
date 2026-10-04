CREATE TABLE `direct_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`sender` text NOT NULL,
	`recipient` text NOT NULL,
	`content` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`sender`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_direct_sender` ON `direct_messages` (`sender`,`created`);--> statement-breakpoint
CREATE INDEX `idx_direct_recipient` ON `direct_messages` (`recipient`,`created`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`author` text NOT NULL,
	`content` text NOT NULL,
	`image` text DEFAULT '' NOT NULL,
	`video` text DEFAULT '' NOT NULL,
	`project_title` text DEFAULT '' NOT NULL,
	`work_link` text DEFAULT '' NOT NULL,
	`audience` text DEFAULT 'public' NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`author`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_posts_created` ON `posts` (`created`);--> statement-breakpoint
CREATE INDEX `idx_posts_author` ON `posts` (`author`);--> statement-breakpoint
CREATE TABLE `social_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`author` text NOT NULL,
	`target_type` text NOT NULL,
	`target` text NOT NULL,
	`content` text NOT NULL,
	`audience` text DEFAULT 'public' NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`author`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_social_comments_target` ON `social_comments` (`target_type`,`target`,`created`);