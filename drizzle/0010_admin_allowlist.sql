-- One named admin [R-01] [L-08].
--
-- The test environment used to hand admin rights to anyone holding a mailbox at
-- `@riigikantselei.ee` or the tool team's domain, so the users table has
-- accumulated administrators nobody chose one by one. The allowlist shipped
-- with this migration is a single named address; this makes that true of the
-- rows as well as of future sign-ins.
--
-- Everyone demoted keeps a working account as a **hankija**: they run rounds
-- from start to finish and read the framework data and the team without
-- changing them. An admin re-promotes anyone who needs it on *Meeskond*.
--
-- Data only — no schema change. `users.role` keeps its stored values
-- ('admin','member'); `member` is the role the interface now calls Hankija.
--
-- On a fresh volume this is a no-op: `boot()` migrates before it seeds, so
-- there are no users yet and the seed then creates its own admin. If the named
-- address has no row here either, the deployment is briefly admin-less and the
-- first verified code from that address provisions one — which is why this must
-- never ship without the allowlist change that makes such a sign-in possible.
UPDATE `users`
   SET `role` = 'member'
 WHERE `role` = 'admin'
   AND lower(`email`) <> 'luukas.ilves@riigikantselei.ee';
