-- A contact change retires the previous contact [L-21] [L-18].
--
-- Until now a representative row recorded where it came from (`source`) and the
-- contact sync retired only rows it had created itself. Anyone the Esindajad
-- sheet ever listed became `upload`-owned — and the seed lists every lot
-- contact — so on every real volume a replaced contact stayed active: still
-- mailed, still able to sign in as the company. Activity is now decided by two
-- independent facts: the address is a lot's *current* contact (derived from the
-- ranking on every change), or the buyer *listed* the person in their own right
-- while they were not the contact. This column stores the second fact.
--
-- Repair: every active row that is not the current contact of one of its
-- company's active memberships must be listed, or the next sync would retire
-- it. A replaced contact the old rule stranded is indistinguishable here from a
-- deputy the buyer meant to keep, so it is listed too — and now shows the
-- „Lõpeta esindus“ switch on Esindajad, where an admin retires it in one click.
-- Current contacts stay unlisted: their activity follows the ranking.
ALTER TABLE `partner_representatives` ADD `is_listed` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `partner_representatives`
   SET `is_listed` = 1
 WHERE `is_active` = 1
   AND NOT EXISTS (
     SELECT 1
       FROM `lot_partners` lp
       JOIN `partners` p ON p.`id` = lp.`partner_id`
      WHERE lp.`partner_id` = `partner_representatives`.`partner_id`
        AND lp.`is_active` = 1
        AND p.`is_active` = 1
        AND lower(trim(lp.`contact_email`)) = `partner_representatives`.`email`
   );
