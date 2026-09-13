-- A representative's own switch for informational e-mail [D-10] [L-27].
--
-- The play-through's verdict on the mail volume was „10 meili“. Formal notices
-- (publication, changes, the 24-hour reminder, the round's end) keep going out
-- to everyone; receipts, projection changes and the final summary are the
-- person's own to switch off. Default on: nobody loses a mail they did not
-- choose to lose. The in-app log has every notice either way.
ALTER TABLE `partner_representatives` ADD `notify_informational` integer DEFAULT true NOT NULL;
