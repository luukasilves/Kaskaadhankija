/**
 * The framework agreement this environment runs, and how it is written [L-21].
 *
 * Pure. The identity itself is a database row an admin can edit; everything
 * that puts it into a sentence lives here, so the wording of an order document
 * and of a notification cannot drift apart. It used to be two constants and
 * six hard-coded strings.
 */

export interface FrameworkIdentity {
  title: string;
  /** riigihanke viitenumber, e.g. "10567384" */
  procurementReference: string;
  /** the agreement's own number, when the buyer uses one */
  agreementReference: string;
  buyerName: string;
  /** ISO day, or null when open-ended */
  validUntil: string | null;
}

/**
 * The real values, public in the procurement register. Used as the fallback
 * when the row is somehow missing, and as what the migration seeds.
 */
export const DEFAULT_FRAMEWORK_IDENTITY: FrameworkIdentity = {
  title: 'Eesti.ai koolitajate tellimine',
  procurementReference: '10567384',
  agreementReference: '',
  buyerName: 'Riigikantselei',
  validUntil: '2027-12-31',
};

/** Mid-sentence: „… raamlepingu „X“ (riigihanke viitenumber N) alusel“. */
export function frameworkClause(framework: FrameworkIdentity): string {
  const parts = [`riigihanke viitenumber ${framework.procurementReference}`];
  if (framework.agreementReference) parts.push(`raamlepingu nr ${framework.agreementReference}`);
  return `raamleping „${framework.title}“ (${parts.join(', ')})`;
}

/** As a document's own reference line, e.g. on an order [T-05]. */
export function frameworkTitleLine(framework: FrameworkIdentity): string {
  const parts = [`riigihanke viitenumber ${framework.procurementReference}`];
  if (framework.agreementReference) parts.push(`raamlepingu nr ${framework.agreementReference}`);
  return `Raamleping „${framework.title}“, ${parts.join(', ')}`;
}

/** The compact form for a page header: „X · RHR N“. */
export function frameworkSubtitle(framework: FrameworkIdentity): string {
  return `${framework.title} · RHR ${framework.procurementReference}`;
}

/** How a notification signs off. */
export function frameworkSignature(framework: FrameworkIdentity): string {
  return `${framework.buyerName} — raamlepingu „${framework.title}“ tellimiskeskkond`;
}
