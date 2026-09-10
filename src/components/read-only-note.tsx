/**
 * What a buyer-team member sees where an admin gets a form [R-01].
 *
 * A member reads everything — rounds, confirmations, the audit trail, the
 * notification log — and changes nothing. Showing the note in place of the
 * panel says so before they look for a button, which a disabled button would
 * not: it would leave them wondering whether the page had failed to load.
 */

export function ReadOnlyNote({
  what = 'Muudatused',
  className = '',
}: {
  /** what is admin-only here, e.g. "Vooru avaldamine" */
  what?: string;
  className?: string;
}) {
  return (
    <p
      data-testid="read-only-note"
      className={`kh-card p-4 text-[13px] text-[var(--color-muted)] ${className}`}
    >
      {what} on tellimismeeskonna admini õigus. Sul on <strong>vaatleja</strong> roll: näed kõike,
      aga muuta ei saa.
    </p>
  );
}
