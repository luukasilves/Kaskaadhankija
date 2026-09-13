-- Volume orders as clusters of interchangeable groups [L-28] [V-09] [K-10].
--
-- The buyer asked to order "500 participants in Harju county, October to
-- December" rather than dated workshops. A cluster is stored as G identical
-- group rows in `trainings` — each an ordinary training whose date is a period
-- (`date_kind = 'period'`, the period in event_date/event_end), carrying the
-- cluster's code and its position in it. A round is of one kind, set by its
-- first training. The lot gets the framework's ceiling on one group (75 for a
-- workshop in the real agreement); the sample lots OSA-1 and OSA-2 carry it.
--
-- Additive only: every existing row reads as a dated training in a dated round.
ALTER TABLE `trainings` ADD `date_kind` text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE `trainings` ADD `cluster_code` text;--> statement-breakpoint
ALTER TABLE `trainings` ADD `group_index` integer;--> statement-breakpoint
CREATE INDEX `trainings_cluster_idx` ON `trainings` (`cluster_code`);--> statement-breakpoint
ALTER TABLE `rounds` ADD `kind` text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE `lots` ADD `max_participants_per_group` integer;--> statement-breakpoint
UPDATE `lots` SET `max_participants_per_group` = 75 WHERE `code` IN ('OSA-1', 'OSA-2');
