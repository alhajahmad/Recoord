CREATE TABLE `profile_details` (
	`id` text PRIMARY KEY NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`photo` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
