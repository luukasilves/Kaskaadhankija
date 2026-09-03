-- Append-only enforcement for the evidentiary tables. [D-08]
--
-- The audit log is primary evidence in a public procurement: order documents
-- are derived from it, never the other way round. Partner confirmations and the
-- buyer's discretionary adjustments are equally a matter of record. The
-- application has no code path that updates or deletes them; these triggers make
-- that a property of the database rather than a promise about the code.
--
-- Consequence for operations: rows cannot be corrected in place. A mistake is
-- superseded by a further row, and the demo-only "reset mock data" action
-- replaces the whole file rather than deleting rows.

CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'auditijalg on muutmatu: kannet ei saa muuta');
END;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'auditijalg on muutmatu: kannet ei saa kustutada');
END;
--> statement-breakpoint
CREATE TRIGGER confirmations_no_update
BEFORE UPDATE ON confirmations
BEGIN
  SELECT RAISE(ABORT, 'kinnitus on muutmatu: uus kinnitus lisatakse uue kandena');
END;
--> statement-breakpoint
CREATE TRIGGER confirmations_no_delete
BEFORE DELETE ON confirmations
BEGIN
  SELECT RAISE(ABORT, 'kinnitus on muutmatu: kannet ei saa kustutada');
END;
--> statement-breakpoint
CREATE TRIGGER buyer_adjustments_no_update
BEFORE UPDATE ON buyer_adjustments
BEGIN
  SELECT RAISE(ABORT, 'kohandus on muutmatu: muudatus lisatakse uue kandena');
END;
--> statement-breakpoint
CREATE TRIGGER buyer_adjustments_no_delete
BEFORE DELETE ON buyer_adjustments
BEGIN
  SELECT RAISE(ABORT, 'kohandus on muutmatu: kannet ei saa kustutada');
END;
