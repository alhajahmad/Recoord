CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`actor` text NOT NULL,
	`content` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`project`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`document` text,
	`author` text NOT NULL,
	`content` text NOT NULL,
	`mentions` text DEFAULT '[]' NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`project`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`author` text NOT NULL,
	`content` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`project`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`project`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`user` text NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`project`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`title` text NOT NULL,
	`assignee` text,
	`due` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`project`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
