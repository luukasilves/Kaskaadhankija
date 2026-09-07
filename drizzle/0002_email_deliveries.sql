-- Per-recipient e-mail deliveries [D-10]. A notification keeps saying what a
-- recipient was told; what happened to each e-mail copy moves to one row per
-- recipient in `email_deliveries`, and the single-recipient columns leave
-- `notifications`.
--
-- The migrator runs this inside one transaction, where PRAGMA foreign_keys
-- cannot be switched off, so the order matters: the old e-mail record is parked
-- in a temporary table, `notifications` is rebuilt while `email_deliveries` is
-- still empty (a populated child table would make the DROP fail), and the parked
-- rows are then inserted as deliveries against the rebuilt table.
CREATE TABLE `email_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`notification_id` text NOT NULL,
	`to` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`last_attempt_at` integer,
	`sent_at` integer,
	`message_id` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "status_check" CHECK(status in ('queued', 'sent', 'failed', 'suppressed', 'skipped'))
);
--> statement-breakpoint
CREATE INDEX `email_deliveries_notification_idx` ON `email_deliveries` (`notification_id`);--> statement-breakpoint
CREATE INDEX `email_deliveries_status_idx` ON `email_deliveries` (`status`);--> statement-breakpoint
CREATE TEMP TABLE `__migrate_email` AS SELECT `id`, `email_to`, `email_status`, `email_error`, `email_sent_at`, `created_at` FROM `notifications` WHERE `email_to` <> '';--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_notifications` (
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
	FOREIGN KEY (`recipient_lot_partner_id`) REFERENCES `lot_partners`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recipient_kind_check" CHECK(recipient_kind in ('buyer', 'partner'))
);
--> statement-breakpoint
INSERT INTO `__new_notifications`("id", "created_at", "recipient_kind", "recipient_lot_partner_id", "type", "round_id", "order_id", "title", "body", "body_html", "read_at") SELECT "id", "created_at", "recipient_kind", "recipient_lot_partner_id", "type", "round_id", "order_id", "title", "body", "body_html", "read_at" FROM `notifications`;--> statement-breakpoint
DROP TABLE `notifications`;--> statement-breakpoint
ALTER TABLE `__new_notifications` RENAME TO `notifications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `notifications_recipient_idx` ON `notifications` (`recipient_kind`,`recipient_lot_partner_id`);--> statement-breakpoint
CREATE INDEX `notifications_round_idx` ON `notifications` (`round_id`);--> statement-breakpoint
CREATE INDEX `notifications_created_idx` ON `notifications` (`created_at`);--> statement-breakpoint
INSERT INTO `email_deliveries` (`id`, `notification_id`, `to`, `status`, `attempts`, `detail`, `last_attempt_at`, `sent_at`, `message_id`, `created_at`)
SELECT lower(hex(randomblob(16))), `id`, `email_to`,
	CASE `email_status` WHEN 'sent' THEN 'sent' WHEN 'failed' THEN 'failed' ELSE 'skipped' END,
	1, `email_error`, COALESCE(`email_sent_at`, `created_at`),
	CASE `email_status` WHEN 'sent' THEN `email_sent_at` ELSE NULL END, '', `created_at`
FROM `__migrate_email`;--> statement-breakpoint
DROP TABLE `__migrate_email`;
