CREATE TABLE `partner_representatives` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'esindaja' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`deactivated_at` integer,
	`import_batch_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "role_check" CHECK(role in ('esindaja', 'asendaja'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `partner_representatives_email_active_unique` ON `partner_representatives` (`email`) WHERE is_active = 1;--> statement-breakpoint
CREATE INDEX `partner_representatives_partner_idx` ON `partner_representatives` (`partner_id`);--> statement-breakpoint
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
	CONSTRAINT "kind_check" CHECK(kind in ('trainings', 'partners', 'representatives')),
	CONSTRAINT "source_check" CHECK(source in ('upload', 'seed', 'sample')),
	CONSTRAINT "status_check" CHECK(status in ('previewed', 'imported', 'discarded'))
);
--> statement-breakpoint
INSERT INTO `__new_import_batches`("id", "kind", "file_name", "file_size", "source", "status", "rows_json", "summary", "options", "actor_id", "actor_label", "created_at", "imported_at") SELECT "id", "kind", "file_name", "file_size", "source", "status", "rows_json", "summary", "options", "actor_id", "actor_label", "created_at", "imported_at" FROM `import_batches`;--> statement-breakpoint
DROP TABLE `import_batches`;--> statement-breakpoint
ALTER TABLE `__new_import_batches` RENAME TO `import_batches`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `import_batches_kind_idx` ON `import_batches` (`kind`,`status`);