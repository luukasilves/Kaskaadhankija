CREATE TABLE `app_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`clock_offset_ms` integer DEFAULT 0 NOT NULL,
	`seed_version` integer DEFAULT 0 NOT NULL,
	`seeded_at` integer,
	`last_jobs_run_at` integer,
	CONSTRAINT "app_state_single_row" CHECK("app_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurred_at` integer NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`actor_label` text NOT NULL,
	`event_type` text NOT NULL,
	`summary` text NOT NULL,
	`lot_id` text,
	`round_id` text,
	`training_id` text,
	`lot_partner_id` text,
	`order_id` text,
	`before` text,
	`after` text,
	`ip` text DEFAULT '' NOT NULL,
	`ua` text DEFAULT '' NOT NULL,
	CONSTRAINT "actor_type_check" CHECK(actor_type in ('buyer', 'partner', 'system', 'tester'))
);
--> statement-breakpoint
CREATE INDEX `audit_round_idx` ON `audit_events` (`round_id`);--> statement-breakpoint
CREATE INDEX `audit_training_idx` ON `audit_events` (`training_id`);--> statement-breakpoint
CREATE INDEX `audit_type_idx` ON `audit_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `audit_occurred_idx` ON `audit_events` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `buyer_adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`round_id` text NOT NULL,
	`lot_partner_id` text NOT NULL,
	`kind` text NOT NULL,
	`cap_value` integer,
	`justification` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_partner_id`) REFERENCES `lot_partners`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "kind_check" CHECK(kind in ('skip', 'cap', 'clear'))
);
--> statement-breakpoint
CREATE INDEX `buyer_adjustments_round_idx` ON `buyer_adjustments` (`round_id`);--> statement-breakpoint
CREATE TABLE `confirmations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`round_id` text NOT NULL,
	`lot_partner_id` text NOT NULL,
	`kind` text NOT NULL,
	`marks` text NOT NULL,
	`cap` integer,
	`confirmed_at` integer NOT NULL,
	`actor_label` text NOT NULL,
	`contact_email` text DEFAULT '' NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`ua` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'ui' NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_partner_id`) REFERENCES `lot_partners`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "kind_check" CHECK(kind in ('confirm', 'decline_all'))
);
--> statement-breakpoint
CREATE INDEX `confirmations_round_partner_idx` ON `confirmations` (`round_id`,`lot_partner_id`);--> statement-breakpoint
CREATE INDEX `confirmations_round_idx` ON `confirmations` (`round_id`);--> statement-breakpoint
CREATE TABLE `import_batches` (
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
	CONSTRAINT "kind_check" CHECK(kind in ('trainings', 'partners')),
	CONSTRAINT "source_check" CHECK(source in ('upload', 'seed', 'sample')),
	CONSTRAINT "status_check" CHECK(status in ('previewed', 'imported', 'discarded'))
);
--> statement-breakpoint
CREATE INDEX `import_batches_kind_idx` ON `import_batches` (`kind`,`status`);--> statement-breakpoint
CREATE TABLE `lot_partners` (
	`id` text PRIMARY KEY NOT NULL,
	`lot_id` text NOT NULL,
	`partner_id` text NOT NULL,
	`rank` integer NOT NULL,
	`contact_name` text NOT NULL,
	`contact_email` text NOT NULL,
	`unit_price_eur` real DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`deactivated_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lot_partners_lot_partner_unique` ON `lot_partners` (`lot_id`,`partner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lot_partners_lot_rank_unique` ON `lot_partners` (`lot_id`,`rank`) WHERE is_active = 1;--> statement-breakpoint
CREATE INDEX `lot_partners_lot_idx` ON `lot_partners` (`lot_id`);--> statement-breakpoint
CREATE TABLE `lots` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`response_deadline_working_days` integer DEFAULT 3 NOT NULL,
	`deadline_local_time` text DEFAULT '17:00' NOT NULL,
	`review_working_days` integer DEFAULT 2 NOT NULL,
	`workload_threshold` integer DEFAULT 25 NOT NULL,
	`default_visibility_mode` text DEFAULT 'dynamic' NOT NULL,
	`threshold_note` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "default_visibility_mode_check" CHECK(default_visibility_mode in ('dynamic', 'sealed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lots_code_unique` ON `lots` (`code`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`recipient_kind` text NOT NULL,
	`recipient_lot_partner_id` text,
	`type` text NOT NULL,
	`round_id` text,
	`order_id` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`body_html` text DEFAULT '' NOT NULL,
	`read_at` integer,
	`email_to` text DEFAULT '' NOT NULL,
	`email_status` text DEFAULT 'skipped' NOT NULL,
	`email_error` text DEFAULT '' NOT NULL,
	`email_sent_at` integer,
	FOREIGN KEY (`recipient_lot_partner_id`) REFERENCES `lot_partners`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recipient_kind_check" CHECK(recipient_kind in ('buyer', 'partner')),
	CONSTRAINT "email_status_check" CHECK(email_status in ('skipped', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_idx` ON `notifications` (`recipient_kind`,`recipient_lot_partner_id`);--> statement-breakpoint
CREATE INDEX `notifications_round_idx` ON `notifications` (`round_id`);--> statement-breakpoint
CREATE INDEX `notifications_created_idx` ON `notifications` (`created_at`);--> statement-breakpoint
CREATE TABLE `order_sequences` (
	`year` integer PRIMARY KEY NOT NULL,
	`last_seq` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_trainings` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`training_id` text NOT NULL,
	`unit_price_eur` real DEFAULT 0 NOT NULL,
	`cancelled_at` integer,
	`cancel_reason` text DEFAULT '' NOT NULL,
	`partner_withdrew_at` integer,
	`partner_withdraw_note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`training_id`) REFERENCES `trainings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_trainings_unique` ON `order_trainings` (`order_id`,`training_id`);--> statement-breakpoint
CREATE INDEX `order_trainings_order_idx` ON `order_trainings` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_year` integer NOT NULL,
	`order_seq` integer NOT NULL,
	`round_id` text NOT NULL,
	`lot_id` text NOT NULL,
	`lot_partner_id` text NOT NULL,
	`kind` text DEFAULT 'allocation' NOT NULL,
	`partner_confirmation_id` integer,
	`partner_confirmed_at` integer,
	`buyer_confirmed_at` integer NOT NULL,
	`buyer_confirmed_by` text NOT NULL,
	`justification` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`document_snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_partner_id`) REFERENCES `lot_partners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partner_confirmation_id`) REFERENCES `confirmations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "kind_check" CHECK(kind in ('allocation', 'manual')),
	CONSTRAINT "status_check" CHECK(status in ('active', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`order_year`,`order_seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_round_partner_unique` ON `orders` (`round_id`,`lot_partner_id`) WHERE kind = 'allocation';--> statement-breakpoint
CREATE INDEX `orders_round_idx` ON `orders` (`round_id`);--> statement-breakpoint
CREATE INDEX `orders_lot_partner_idx` ON `orders` (`lot_partner_id`);--> statement-breakpoint
CREATE TABLE `partners` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`reg_code` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `partners_reg_code_unique` ON `partners` (`reg_code`);--> statement-breakpoint
CREATE TABLE `round_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`lot_partner_id` text NOT NULL,
	`rank_at_publication` integer NOT NULL,
	`contact_name_snapshot` text NOT NULL,
	`contact_email_snapshot` text NOT NULL,
	`draft_marks` text DEFAULT '[]' NOT NULL,
	`draft_cap` integer,
	`draft_updated_at` integer,
	`excluded_at` integer,
	`excluded_reason` text DEFAULT '' NOT NULL,
	`outcome_at_close` text,
	`last_projection_count` integer,
	`last_projection_notified_at` integer,
	`reminder_sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_partner_id`) REFERENCES `lot_partners`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outcome_at_close_check" CHECK(outcome_at_close in ('confirmed', 'declined_all', 'no_response', 'excluded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `round_participants_unique` ON `round_participants` (`round_id`,`lot_partner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `round_participants_rank_unique` ON `round_participants` (`round_id`,`rank_at_publication`);--> statement-breakpoint
CREATE INDEX `round_participants_round_idx` ON `round_participants` (`round_id`);--> statement-breakpoint
CREATE INDEX `round_participants_lot_partner_idx` ON `round_participants` (`lot_partner_id`);--> statement-breakpoint
CREATE TABLE `round_sequences` (
	`year` integer PRIMARY KEY NOT NULL,
	`last_seq` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `round_trainings` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`training_id` text NOT NULL,
	`added_at` integer NOT NULL,
	`withdrawn_at` integer,
	`withdrawn_reason` text DEFAULT '' NOT NULL,
	`withdrawn_by` text,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`training_id`) REFERENCES `trainings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `round_trainings_unique` ON `round_trainings` (`round_id`,`training_id`);--> statement-breakpoint
CREATE INDEX `round_trainings_round_idx` ON `round_trainings` (`round_id`);--> statement-breakpoint
CREATE INDEX `round_trainings_training_idx` ON `round_trainings` (`training_id`);--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`lot_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`visibility_mode` text DEFAULT 'dynamic' NOT NULL,
	`workload_threshold_snapshot` integer DEFAULT 25 NOT NULL,
	`response_working_days_snapshot` integer DEFAULT 3 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`published_at` integer,
	`deadline_at` integer,
	`expected_decision_at` integer,
	`closed_at` integer,
	`proposal_snapshot` text,
	`final_snapshot` text,
	`confirmed_at` integer,
	`confirmed_by` text,
	`cancelled_at` integer,
	`cancel_reason` text DEFAULT '' NOT NULL,
	`origin_round_id` text,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "status_check" CHECK(status in ('draft', 'open', 'closed', 'confirmed', 'cancelled')),
	CONSTRAINT "visibility_mode_check" CHECK(visibility_mode in ('dynamic', 'sealed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rounds_code_unique` ON `rounds` (`code`);--> statement-breakpoint
CREATE INDEX `rounds_status_idx` ON `rounds` (`status`);--> statement-breakpoint
CREATE INDEX `rounds_lot_idx` ON `rounds` (`lot_id`);--> statement-breakpoint
CREATE INDEX `rounds_deadline_idx` ON `rounds` (`deadline_at`);--> statement-breakpoint
CREATE TABLE `trainings` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`lot_id` text NOT NULL,
	`title` text NOT NULL,
	`workshop_type` text NOT NULL,
	`event_date` text NOT NULL,
	`event_end` text,
	`county` text NOT NULL,
	`location_text` text DEFAULT '' NOT NULL,
	`target_group` text NOT NULL,
	`participant_count` integer NOT NULL,
	`language` text NOT NULL,
	`estimated_value_eur` real DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'unassigned' NOT NULL,
	`current_round_id` text,
	`leftover_from_round_id` text,
	`allocated_lot_partner_id` text,
	`order_id` text,
	`completed_at` integer,
	`cancelled_at` integer,
	`cancel_reason` text DEFAULT '' NOT NULL,
	`import_batch_id` text,
	`created_at` integer NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "status_check" CHECK(status in ('unassigned', 'in_round', 'leftover', 'allocated', 'completed', 'cancelled')),
	CONSTRAINT "workshop_type_check" CHECK(workshop_type in ('tootuba_1', 'tootuba_2', 'suursundmus', 'muu')),
	CONSTRAINT "language_check" CHECK(language in ('et', 'ru', 'en'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trainings_code_unique` ON `trainings` (`code`);--> statement-breakpoint
CREATE INDEX `trainings_status_idx` ON `trainings` (`status`);--> statement-breakpoint
CREATE INDEX `trainings_lot_idx` ON `trainings` (`lot_id`);--> statement-breakpoint
CREATE INDEX `trainings_round_idx` ON `trainings` (`current_round_id`);--> statement-breakpoint
CREATE INDEX `trainings_allocated_idx` ON `trainings` (`allocated_lot_partner_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "role_check" CHECK(role in ('admin', 'member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);