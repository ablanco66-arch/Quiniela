CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`square_id` integer,
	`action` text NOT NULL,
	`actor_email` text NOT NULL,
	`actor_name` text NOT NULL,
	`actor_role` text NOT NULL,
	`previous_status` text DEFAULT '' NOT NULL,
	`new_status` text DEFAULT '' NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_created_at_idx` ON `activity` (`created_at`);--> statement-breakpoint
CREATE TABLE `members` (
	`email` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `squares` ADD `reserved_by_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `squares` ADD `reserved_by_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `squares` ADD `reserved_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `squares` ADD `paid_by_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `squares` ADD `paid_by_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `squares` ADD `paid_at` text DEFAULT '' NOT NULL;