CREATE TABLE `login_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed_at` integer,
	`request_ip` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_codes_email_idx` ON `login_codes` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `login_codes_ip_idx` ON `login_codes` (`request_ip`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`ua` text DEFAULT '' NOT NULL,
	`revoked_at` integer,
	CONSTRAINT "subject_kind_check" CHECK(subject_kind in ('buyer', 'representative'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_subject_idx` ON `sessions` (`subject_kind`,`subject_id`);