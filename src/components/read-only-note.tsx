/**
 * What a purchaser sees where an admin gets a form [R-01].
 *
 * A **hankija** runs the whole mini-procurement — rounds, uploads, publishing,
 * the review, the confirmation, the protocol — and reads every screen an admin
 * reads. Two things are not theirs: the framework agreement's own data [L-21]
 * and the team. Saying so in place of the panel is kinder than a disabled
 * button, which would leave them wondering whether the page had failed to load.
 */

export function ReadOnlyNote({
  what = 'Muudatused',
  className = '',
}: {
  /** what is admin-only here, e.g. "Raamhanke andmete muutmine" */
  what?: string;
  className?: string;
}) {
  return (
    <p
      data-testid="read-only-note"
      className={`kh-card p-4 text-[13px] text-[var(--color-muted)] ${className}`}
    >
      {what} on tellimismeeskonna admini õigus. Sul on <strong>hankija</strong> roll: voore saad
      teha algusest lõpuni, aga raamlepingu andmeid ja meeskonda muudab admin. Näed siin kõike,
      mida admin näeb.
    </p>
  );
}
