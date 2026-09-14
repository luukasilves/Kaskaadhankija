-- Who was really at the keyboard.
--
-- In the test environment a signed-in admin can act as a participant [L-08].
-- The event belongs to that participant — it is their marks, their lot — but
-- the trail has to be able to name the colleague who did it. Two nullable
-- columns, so the append-only triggers on this table are untouched: a plain
-- ADD COLUMN never rebuilds the table.
ALTER TABLE `audit_events` ADD `via_user_id` text;--> statement-breakpoint
ALTER TABLE `audit_events` ADD `via_label` text;
