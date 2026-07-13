CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`visitor_digits` text DEFAULT '' NOT NULL,
	`home_digits` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `squares` (
	`id` integer PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`participant` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
