DROP INDEX `activity_created_at_idx`;--> statement-breakpoint
CREATE INDEX `activity_created_id_idx` ON `activity` (`created_at`,`id`);--> statement-breakpoint
DROP INDEX `season_archives_archived_at_idx`;--> statement-breakpoint
CREATE INDEX `season_archives_archived_id_idx` ON `season_archives` (`archived_at`,`id`);--> statement-breakpoint
CREATE INDEX `members_name_active_approval_idx` ON `members` (`name`,`active`,`approval_status`);