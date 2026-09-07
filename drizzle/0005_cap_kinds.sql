ALTER TABLE `confirmations` ADD `cap_kind` text DEFAULT 'trainings' NOT NULL;--> statement-breakpoint
ALTER TABLE `lots` ADD `default_cap_options` text DEFAULT 'trainings' NOT NULL;--> statement-breakpoint
ALTER TABLE `round_participants` ADD `draft_cap_kind` text DEFAULT 'trainings' NOT NULL;--> statement-breakpoint
ALTER TABLE `rounds` ADD `cap_options` text DEFAULT 'trainings' NOT NULL;