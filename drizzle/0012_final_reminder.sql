-- The personal summary two hours before the deadline [D-11].
--
-- One more timestamp on the participant row, beside the 24-hour reminder's:
-- when the final summary went out, or when it was deliberately skipped because
-- the partner's latest confirmation already fell inside the window. Nullable,
-- additive; every existing participant simply has not had one.
ALTER TABLE `round_participants` ADD `final_reminder_sent_at` integer;
