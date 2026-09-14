-- The framework procurement becomes data [L-21].
--
-- Three things: the framework's own identity (name, reference number, buyer)
-- as a single row; where a representative row came from, which decides who may
-- switch it off; and the window a round's scheme file asked for [L-20].
--
-- The identity row is inserted **here** rather than by the seed, because a
-- database that has already seeded never seeds again — a migration is the only
-- thing that reaches every existing volume. The values are the real, public
-- ones; an admin can edit them on the Raamhange screen.
--
-- `import_batches` is rebuilt to widen its `kind` CHECK, exactly as 0006 did.
-- The table has no foreign keys in either direction and no triggers, so the
-- rebuild is safe inside the migrator's single transaction.
CREATE TABLE `framework_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`procurement_reference` text NOT NULL,
	`agreement_reference` text DEFAULT '' NOT NULL,
	`buyer_name` text NOT NULL,
	`valid_until` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT "framework_settings_single_row" CHECK("framework_settings"."id" = 1)
);--> statement-breakpoint
INSERT OR IGNORE INTO `framework_settings`
  (`id`, `title`, `procurement_reference`, `agreement_reference`, `buyer_name`, `valid_until`, `updated_at`)
VALUES
  (1, 'Eesti.ai koolitajate tellimine', '10567384', '', 'Riigikantselei', '2027-12-31', CAST(strftime('%s', 'now') AS integer) * 1000);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'upload' NOT NULL,
	`status` text DEFAULT 'previewed' NOT NULL,
	`rows_json` text NOT NULL,
	`summary` text NOT NULL,
	`options` text DEFAULT '{}' NOT NULL,
	`actor_id` text,
	`actor_label` text NOT NULL,
	`created_at` integer NOT NULL,
	`imported_at` integer,
	CONSTRAINT "kind_check" CHECK(kind in ('trainings', 'partners', 'representatives', 'round', 'framework')),
	CONSTRAINT "source_check" CHECK(source in ('upload', 'seed', 'sample')),
	CONSTRAINT "status_check" CHECK(status in ('previewed', 'imported', 'discarded'))
);
--> statement-breakpoint
INSERT INTO `__new_import_batches`("id", "kind", "file_name", "file_size", "source", "status", "rows_json", "summary", "options", "actor_id", "actor_label", "created_at", "imported_at") SELECT "id", "kind", "file_name", "file_size", "source", "status", "rows_json", "summary", "options", "actor_id", "actor_label", "created_at", "imported_at" FROM `import_batches`;--> statement-breakpoint
DROP TABLE `import_batches`;--> statement-breakpoint
ALTER TABLE `__new_import_batches` RENAME TO `import_batches`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `import_batches_kind_idx` ON `import_batches` (`kind`,`status`);--> statement-breakpoint
ALTER TABLE `partner_representatives` ADD `source` text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE `rounds` ADD `planned_publish_at` integer;--> statement-breakpoint
ALTER TABLE `rounds` ADD `planned_deadline_at` integer;