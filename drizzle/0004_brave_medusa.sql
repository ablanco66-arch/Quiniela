CREATE TABLE `game_results` (
	`game_id` integer PRIMARY KEY NOT NULL,
	`visitor_score` integer NOT NULL,
	`home_score` integer NOT NULL,
	`updated_by_email` text DEFAULT '' NOT NULL,
	`updated_by_name` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
