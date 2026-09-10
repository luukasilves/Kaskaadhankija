-- The round protocol [L-22].
--
-- One row per ended round, holding the whole document as canonical JSON plus
-- the SHA-256 of exactly that text. The PDF and the .xlsx annex are rendered
-- from this row on demand, so the fingerprint printed on the paper names the
-- data rather than the renderer that drew it.
--
-- Deliberately no append-only triggers: the audited hash is what makes a change
-- detectable, and a test environment must be able to delete a row to replay the
-- path that generates a protocol for a round that ended before this feature
-- existed.
CREATE TABLE `round_protocols` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`kind` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`content_json` text NOT NULL,
	`content_hash` text NOT NULL,
	`algorithm_version` integer,
	`generated_at` integer NOT NULL,
	`generated_by` text NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "kind_check" CHECK(kind in ('confirmed', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `round_protocols_round_unique` ON `round_protocols` (`round_id`);
