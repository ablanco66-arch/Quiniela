CREATE TABLE `nfl_result_tracking` (
	`game_id` integer PRIMARY KEY NOT NULL,
	`provider_game_id` integer,
	`scheduled_date` text DEFAULT '' NOT NULL,
	`provider_status` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`observed_visitor_score` integer,
	`observed_home_score` integer,
	`first_final_at` text DEFAULT '' NOT NULL,
	`confirmed_at` text DEFAULT '' NOT NULL,
	`last_checked_at` text DEFAULT '' NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`flyers_ready` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `nfl_result_tracking_state_date_idx` ON `nfl_result_tracking` (`state`,`scheduled_date`);