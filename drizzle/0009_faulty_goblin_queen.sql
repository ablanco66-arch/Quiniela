CREATE TABLE `square_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`square_id` integer NOT NULL,
	`season_name` text NOT NULL,
	`text` text NOT NULL,
	`status` text NOT NULL,
	`author_email` text NOT NULL,
	`author_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `square_notes_season_square_created_idx` ON `square_notes` (`season_name`,`square_id`,`created_at`,`id`);