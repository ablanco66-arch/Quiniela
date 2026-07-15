CREATE TABLE `season_archives` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_name` text NOT NULL,
	`square_price` integer NOT NULL,
	`game_prize` integer NOT NULL,
	`games_json` text NOT NULL,
	`squares_json` text NOT NULL,
	`results_json` text NOT NULL,
	`visitor_digits` text DEFAULT '' NOT NULL,
	`home_digits` text DEFAULT '' NOT NULL,
	`archived_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `season_archives_archived_at_idx` ON `season_archives` (`archived_at`);--> statement-breakpoint
ALTER TABLE `settings` ADD `season_name` text DEFAULT '2026' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `square_price` integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `game_prize` integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `games_json` text DEFAULT '[]' NOT NULL;