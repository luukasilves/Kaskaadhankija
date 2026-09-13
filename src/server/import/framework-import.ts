/**
 * The framework-data workbook [L-21]: one file, four sheets, one transaction.
 *
 * What the buyer receives when the tender concludes is a table, so this is how
 * the framework gets into the system — and it is the same file an admin
 * downloads filled in, edits and drops back. The screen can change every one of
 * these things field by field too; both call the same writers in
 * `../framework.ts`, so the two paths cannot drift.
 *
 * All-or-nothing, like the round scheme [L-20]: a ranking with a hole in it is
 * not a ranking, and half a lot's settings is worse than none. The preview says
 * exactly what would change — including who would lose their place and who is
 * about to lose the ability to sign in — and nothing is written until the buyer
 * confirms what they saw.
 *
 * Order inside the transaction is deliberate: identity, then lots (so a lot the
 * same file creates can be referenced by the ranking), then the ranking, then
 * the extra representatives, and the contact sync last — after which every
 * official contact is a login again and nobody else is [L-21]. Ranking before
 * representatives is what lets one file both replace a contact and keep the
 * previous one listed: by the time the Esindajad sheet is applied, the person
 * is no longer the contact, so listing them counts.
 *
 * „The file is the whole truth“ is the buyer's call, made on the preview: a
 * workbook this system wrote carries a marker, and dropping it back pre-selects
 * retiring what it leaves out; the preview lists every consequence either way.
 */

import { and, eq } from 'drizzle-orm';
import {
  importBatches,
  lotPartners,
  lots,
  partnerRepresentatives,
  partners,
  type ImportSummary,
} from '@/db/schema';
import type { FrameworkIdentity } from '@/domain/framework';
import {
  parseFrameworkSheet,
  parseLotRows,
  type LotRow,
} from '@/domain/framework-definition';
import {
  countRows,
  parsePartnerRows,
  parseRepresentativeRows,
  type RawRow,
  type RowDiagnostic,
} from '@/domain/import-rows';
import { logAudit } from '../audit';
import type { Ctx } from '../context';
import {
  applyLotRows,
  contactKey,
  currentContacts,
  deactivateLot,
  frameworkIdentity,
  lotDeactivationBlockers,
  syncFrameworkContacts,
  updateFrameworkIdentity,
  type FrameworkContactSyncReport,
  type LotApplyReport,
} from '../framework';
import {
  annotatePartnerPreview,
  applyPartnerRows,
  checkPartnerContacts,
  openRoundParticipantCount,
  type PartnerPreviewAnnotation,
  type StoredPartnerRow,
} from './partners-import';
import {
  applyRepresentativeRows,
  type StoredRepresentativeRow,
} from './representatives-import';
import type { ImportSource } from './trainings-import';

export interface FrameworkImportOptions {
  /**
   * Retire what the file leaves out: lot members absent from the ranking, lots
   * absent from the Hankeosad sheet, listed representatives absent from the
   * Esindajad sheet. Decided on the preview, where its consequences are
   * listed; pre-set from `fullWorkbook`, and the confirmation may override it.
   */
  deactivateMissing: boolean;
  /** the file carried this system's own marker — it is a complete download */
  fullWorkbook?: boolean;
}

/** What the upload does to who can sign in [L-21] — shown before anything is written. */
export interface ContactChangePlan {
  /** active sign-ins the file ends: no longer a contact and not (or no longer) listed */
  wouldRetire: Array<{ partnerName: string; name: string; email: string; onlyIfDeactivating: boolean }>;
  /** contact addresses with no active sign-in yet */
  wouldCreate: Array<{ partnerName: string; name: string; email: string }>;
  /** a replaced contact who stays the contact of the company's other lots */
  keptElsewhere: Array<{ partnerName: string; email: string; lotCodes: string[] }>;
}

export interface StoredLotRow {
  rowNumber: number;
  value: LotRow | null;
  errors: RowDiagnostic[];
  warnings: RowDiagnostic[];
  action?: 'created' | 'updated' | 'unchanged';
}

export interface FrameworkSheets {
  raamleping?: RawRow[];
  hankeosad?: RawRow[];
  partnerid: RawRow[];
  esindajad?: RawRow[];
}

export interface FrameworkImportPayload {
  framework: {
    present: boolean;
    value: FrameworkIdentity | null;
    current: FrameworkIdentity;
    errors: RowDiagnostic[];
  };
  lots: {
    present: boolean;
    rows: StoredLotRow[];
    fileErrors: RowDiagnostic[];
    /** lots the file leaves out, with the rounds that stop them being retired */
    toDeactivate: Array<{ code: string; name: string; blockedBy: string[] }>;
  };
  partners: {
    rows: StoredPartnerRow[];
    fileErrors: RowDiagnostic[];
  } & PartnerPreviewAnnotation;
  representatives: {
    present: boolean;
    rows: StoredRepresentativeRow[];
    fileErrors: RowDiagnostic[];
    /** listed people of the covered companies the sheet leaves out */
    wouldUnlist?: Array<{ partnerName: string; name: string; email: string; staysAsContact: boolean }>;
  };
  /** absent from batches previewed before v2.6 */
  contacts?: ContactChangePlan;
}

export interface FrameworkPreviewResult extends FrameworkImportPayload {
  batchId: string;
  summary: ImportSummary;
  canApply: boolean;
}

export interface FrameworkApplyResult {
  summary: ImportSummary;
  framework: { changed: boolean };
  lots: LotApplyReport & { deactivated: string[]; kept: string[] };
  partners: { created: number; updated: number };
  representatives: ImportSummary | null;
  contacts: FrameworkContactSyncReport;
}

/** Nothing may be written from a file with a single bad row [L-21]. */
function decideCanApply(payload: FrameworkImportPayload): boolean {
  if (payload.framework.present && (payload.framework.errors.length > 0 || !payload.framework.value)) {
    return false;
  }
  if (payload.lots.present) {
    if (payload.lots.fileErrors.length > 0) return false;
    if (payload.lots.rows.length === 0) return false;
    if (payload.lots.rows.some((row) => row.value === null)) return false;
  }
  if (payload.partners.rows.length === 0) return false;
  if (payload.partners.rows.some((row) => row.value === null)) return false;
  if (payload.representatives.present) {
    if (payload.representatives.rows.some((row) => row.value === null)) return false;
  }
  return true;
}

/** Listed people of the covered companies that the Esindajad sheet leaves out. */
function listedAbsentFrom(
  ctx: Ctx,
  storedReps: readonly StoredRepresentativeRow[],
  coveredRegCodes: ReadonlySet<string>,
): NonNullable<FrameworkImportPayload['representatives']['wouldUnlist']> {
  const onSheet = new Set(
    storedReps.filter((row) => row.value).map((row) => `${row.value!.regCode}#${row.value!.email}`),
  );
  const contacts = currentContacts(ctx.tx);
  return ctx.tx
    .select({
      partnerId: partnerRepresentatives.partnerId,
      partnerName: partners.name,
      regCode: partners.regCode,
      name: partnerRepresentatives.name,
      email: partnerRepresentatives.email,
    })
    .from(partnerRepresentatives)
    .innerJoin(partners, eq(partners.id, partnerRepresentatives.partnerId))
    .where(and(eq(partnerRepresentatives.isActive, true), eq(partnerRepresentatives.isListed, true)))
    .all()
    .filter((row) => coveredRegCodes.has(row.regCode) && !onSheet.has(`${row.regCode}#${row.email}`))
    .map((row) => ({
      partnerName: row.partnerName,
      name: row.name,
      email: row.email,
      staysAsContact: contacts.has(contactKey(row.partnerId, row.email)),
    }));
}

/**
 * Who could sign in after this file, compared with who can now [L-21].
 *
 * Replays the two facts over the file's ranking: a membership the file rewrites
 * takes the file's contact, one it leaves alone keeps its own, and one it drops
 * from a lot it covers goes only when the buyer retires the missing. Listing
 * follows the Esindajad sheet when there is one. Nothing here is written — the
 * apply recomputes everything through the writers.
 */
export function planContactChanges(
  ctx: Ctx,
  storedPartners: readonly StoredPartnerRow[],
  storedReps: readonly StoredRepresentativeRow[] | null,
): ContactChangePlan {
  const existing = ctx.tx
    .select({
      lotCode: lots.code,
      regCode: partners.regCode,
      partnerName: partners.name,
      contactName: lotPartners.contactName,
      contactEmail: lotPartners.contactEmail,
    })
    .from(lotPartners)
    .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
    .innerJoin(lots, eq(lots.id, lotPartners.lotId))
    .where(and(eq(lotPartners.isActive, true), eq(partners.isActive, true)))
    .all()
    .map((m) => ({ ...m, contactEmail: m.contactEmail.trim().toLowerCase() }));

  const fileRows = storedPartners
    .map((row) => row.value)
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .map((value) => ({
      lotCode: value.lotCode,
      regCode: value.regCode,
      partnerName: value.partnerName,
      contactName: value.contactName,
      contactEmail: value.contactEmail.trim().toLowerCase(),
    }));
  const touchedLots = new Set(fileRows.map((row) => row.lotCode));
  const inFile = new Set(fileRows.map((row) => `${row.lotCode}#${row.regCode}`));
  const partnerNames = new Map<string, string>([
    ...existing.map((m) => [m.regCode, m.partnerName] as const),
    ...fileRows.map((row) => [row.regCode, row.partnerName] as const),
  ]);

  type Contact = { name: string; lotCodes: string[] };
  const futureContacts = (deactivating: boolean): Map<string, Contact> => {
    const memberships = [
      ...existing.filter(
        (m) => !touchedLots.has(m.lotCode) || (!deactivating && !inFile.has(`${m.lotCode}#${m.regCode}`)),
      ),
      ...fileRows,
    ];
    const map = new Map<string, Contact>();
    for (const m of memberships) {
      const key = `${m.regCode}#${m.contactEmail}`;
      const known = map.get(key);
      if (known) known.lotCodes.push(m.lotCode);
      else map.set(key, { name: m.contactName, lotCodes: [m.lotCode] });
    }
    return map;
  };
  const contactsKeep = futureContacts(false);
  const contactsRetire = futureContacts(true);

  const onSheet = new Set(
    (storedReps ?? []).filter((row) => row.value).map((row) => `${row.value!.regCode}#${row.value!.email}`),
  );
  const coveredRegCodes = new Set([
    ...fileRows.map((row) => row.regCode),
    ...(storedReps ?? []).map((row) => row.value?.regCode).filter((code): code is string => Boolean(code)),
  ]);

  const activeRows = ctx.tx
    .select({
      regCode: partners.regCode,
      partnerName: partners.name,
      name: partnerRepresentatives.name,
      email: partnerRepresentatives.email,
      isListed: partnerRepresentatives.isListed,
    })
    .from(partnerRepresentatives)
    .innerJoin(partners, eq(partners.id, partnerRepresentatives.partnerId))
    .where(eq(partnerRepresentatives.isActive, true))
    .all();

  const activeAfter = (row: (typeof activeRows)[number], deactivating: boolean): boolean => {
    const key = `${row.regCode}#${row.email}`;
    const contacts = deactivating ? contactsRetire : contactsKeep;
    if (contacts.has(key)) return true;
    if (onSheet.has(key)) return true;
    if (!row.isListed) return false;
    // Listed today; with the option on, a covered company's sheet is the whole list.
    return !(deactivating && storedReps !== null && coveredRegCodes.has(row.regCode));
  };

  const wouldRetire: ContactChangePlan['wouldRetire'] = [];
  for (const row of activeRows) {
    if (!activeAfter(row, false)) {
      wouldRetire.push({ partnerName: row.partnerName, name: row.name, email: row.email, onlyIfDeactivating: false });
    } else if (!activeAfter(row, true)) {
      wouldRetire.push({ partnerName: row.partnerName, name: row.name, email: row.email, onlyIfDeactivating: true });
    }
  }

  const activeKeys = new Set(activeRows.map((row) => `${row.regCode}#${row.email}`));
  const wouldCreate: ContactChangePlan['wouldCreate'] = [];
  for (const [key, contact] of contactsKeep) {
    if (activeKeys.has(key)) continue;
    const [regCode, email] = key.split('#') as [string, string];
    wouldCreate.push({ partnerName: partnerNames.get(regCode) ?? regCode, name: contact.name, email });
  }

  const keptElsewhere: ContactChangePlan['keptElsewhere'] = [];
  const seen = new Set<string>();
  for (const m of existing) {
    const replacement = fileRows.find((row) => row.lotCode === m.lotCode && row.regCode === m.regCode);
    if (!replacement || replacement.contactEmail === m.contactEmail) continue;
    const key = `${m.regCode}#${m.contactEmail}`;
    const still = contactsKeep.get(key);
    if (!still || seen.has(key)) continue;
    seen.add(key);
    keptElsewhere.push({ partnerName: m.partnerName, email: m.contactEmail, lotCodes: [...still.lotCodes].sort() });
  }

  return { wouldRetire, wouldCreate, keptElsewhere };
}

export function previewFrameworkImport(
  ctx: Ctx,
  input: {
    fileName: string;
    fileSize: number;
    source: ImportSource;
    sheets: FrameworkSheets;
    options: FrameworkImportOptions;
  },
): FrameworkPreviewResult {
  /* 1. the framework's own identity */
  const hasFrameworkSheet = (input.sheets.raamleping?.length ?? 0) > 0;
  const framework = hasFrameworkSheet
    ? parseFrameworkSheet(input.sheets.raamleping!)
    : { value: null, errors: [] as RowDiagnostic[] };

  /* 2. the lots */
  const hasLotSheet = (input.sheets.hankeosad?.length ?? 0) > 0;
  const parsedLots = hasLotSheet
    ? parseLotRows(input.sheets.hankeosad!)
    : { rows: [], fileErrors: [] as RowDiagnostic[] };
  const storedLots: StoredLotRow[] = parsedLots.rows.map((row) => ({
    rowNumber: row.rowNumber,
    value: row.value,
    errors: row.errors,
    warnings: row.warnings,
  }));

  const existingLots = ctx.tx.select().from(lots).all();
  const fileLotCodes = new Set(
    storedLots.map((row) => row.value?.code).filter((code): code is string => Boolean(code)),
  );
  const newLotCodes = new Set(
    [...fileLotCodes].filter((code) => !existingLots.some((lot) => lot.code === code)),
  );
  for (const row of storedLots) {
    if (!row.value) continue;
    row.action = newLotCodes.has(row.value.code) ? 'created' : 'updated';
  }

  // Computed whether or not the option is on: the preview shows what the
  // toggle would do, and the apply reads the option it was confirmed with.
  const toDeactivate =
    hasLotSheet
      ? existingLots
          .filter((lot) => lot.isActive && !fileLotCodes.has(lot.code))
          .map((lot) => ({
            code: lot.code,
            name: lot.name,
            blockedBy: lotDeactivationBlockers(ctx.tx, lot.id),
          }))
      : [];

  /* 3. the ranking — lots this same file creates count as known */
  const knownLotCodes = [
    ...new Set([...existingLots.map((lot) => lot.code), ...fileLotCodes]),
  ];
  const parsedPartners = parsePartnerRows(input.sheets.partnerid ?? [], { knownLotCodes });
  const storedPartners: StoredPartnerRow[] = parsedPartners.rows.map((row) => ({
    rowNumber: row.rowNumber,
    value: row.value,
    errors: row.errors,
    warnings: row.warnings,
  }));
  checkPartnerContacts(ctx, storedPartners);
  const partnerFileErrors = [...parsedPartners.fileErrors];
  if (!hasLotSheet && storedPartners.some((row) => row.errors.some((e) => e.field === 'hankeosa'))) {
    partnerFileErrors.push({
      message:
        'Mõnda hankeosa ei tunta. Kui tegemist on uue hankeosaga, lisa see lehele „Hankeosad“; muidu kontrolli koodi.',
    });
  }
  const annotation = annotatePartnerPreview(ctx, storedPartners, newLotCodes);

  /* 4. the extra representatives — a company this same file introduces counts */
  const hasRepresentativeSheet = (input.sheets.esindajad?.length ?? 0) > 0;
  const knownRegCodes = [
    ...new Set([
      ...ctx.tx.select({ regCode: partners.regCode }).from(partners).all().map((row) => row.regCode),
      ...storedPartners
        .map((row) => row.value?.regCode)
        .filter((code): code is string => Boolean(code)),
    ]),
  ];
  const parsedReps = hasRepresentativeSheet
    ? parseRepresentativeRows(input.sheets.esindajad!, { knownRegCodes })
    : { rows: [], fileErrors: [] as RowDiagnostic[] };
  const partnerNameByReg = new Map<string, string>([
    ...ctx.tx
      .select({ regCode: partners.regCode, name: partners.name })
      .from(partners)
      .all()
      .map((row) => [row.regCode, row.name] as const),
    // A company the ranking sheet introduces has no row yet, but it does have
    // a name — and the preview table is easier to read with it.
    ...storedPartners
      .map((row) => row.value)
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .map((value) => [value.regCode, value.partnerName] as const),
  ]);
  const storedReps: StoredRepresentativeRow[] = parsedReps.rows.map((row) => ({
    rowNumber: row.rowNumber,
    value: row.value,
    partnerName: row.value ? partnerNameByReg.get(row.value.regCode) ?? '' : '',
    errors: row.errors,
    warnings: row.warnings,
  }));

  const coveredRegCodes = new Set([
    ...storedPartners.map((row) => row.value?.regCode).filter((code): code is string => Boolean(code)),
    ...storedReps.map((row) => row.value?.regCode).filter((code): code is string => Boolean(code)),
  ]);
  const wouldUnlist = hasRepresentativeSheet
    ? listedAbsentFrom(ctx, storedReps, coveredRegCodes)
    : [];

  const contacts = planContactChanges(ctx, storedPartners, hasRepresentativeSheet ? storedReps : null);

  const counts = countRows(storedPartners);
  const summary: ImportSummary = {
    total: counts.total,
    valid: counts.valid,
    created: annotation.created,
    updated: annotation.updated,
    locked: 0,
    withErrors: counts.withErrors,
    withWarnings: counts.withWarnings,
  };

  const payload: FrameworkImportPayload = {
    framework: {
      present: hasFrameworkSheet,
      value: framework.value,
      current: frameworkIdentity(ctx.tx),
      errors: framework.errors,
    },
    lots: {
      present: hasLotSheet,
      rows: storedLots,
      fileErrors: parsedLots.fileErrors,
      toDeactivate,
    },
    partners: { rows: storedPartners, fileErrors: partnerFileErrors, ...annotation },
    representatives: {
      present: hasRepresentativeSheet,
      rows: storedReps,
      fileErrors: parsedReps.fileErrors,
      wouldUnlist,
    },
    contacts,
  };

  const batchId = crypto.randomUUID();
  ctx.tx
    .insert(importBatches)
    .values({
      id: batchId,
      kind: 'framework',
      fileName: input.fileName,
      fileSize: input.fileSize,
      source: input.source,
      status: 'previewed',
      rowsJson: payload,
      summary,
      options: input.options,
      actorId: ctx.actor.id,
      actorLabel: ctx.actor.label,
      createdAt: ctx.at,
    })
    .run();

  logAudit(ctx, {
    eventType: 'import.previewed',
    summary: `Raamhanke andmete import eelvaadatud: ${input.fileName} — ${summary.valid}/${summary.total} järjestuse rida korras`,
    after: { batchId, fileName: input.fileName, summary },
  });

  return { batchId, summary, canApply: decideCanApply(payload), ...payload };
}

export function applyFrameworkImport(
  ctx: Ctx,
  batchId: string,
  decision: { deactivateMissing?: boolean } = {},
): FrameworkApplyResult {
  const batch = ctx.tx.select().from(importBatches).where(eq(importBatches.id, batchId)).get();
  if (!batch) throw new Error('Importi ei leitud.');
  if (batch.kind !== 'framework') throw new Error('Vale impordi tüüp.');
  if (batch.status !== 'previewed') throw new Error('See import on juba tehtud või kõrvale jäetud.');

  const payload = batch.rowsJson as FrameworkImportPayload;
  const options = (batch.options ?? {}) as Partial<FrameworkImportOptions>;
  // The preview pre-set the option; the confirmation is where it is decided.
  const deactivateMissing = decision.deactivateMissing ?? Boolean(options.deactivateMissing);

  // The state may have moved since the preview; re-check rather than trust it.
  checkPartnerContacts(ctx, payload.partners.rows);
  if (!decideCanApply(payload)) {
    throw new Error(
      'Raamhanke andmeid ei saa importida: paranda eelvaates näidatud vead ja laadi fail uuesti.',
    );
  }

  /* 1. identity */
  const frameworkChanged =
    payload.framework.present && payload.framework.value
      ? updateFrameworkIdentity(ctx, payload.framework.value)
      : false;

  /* 2. lots, before the ranking that may reference a new one */
  const lotRows = payload.lots.rows
    .map((row) => row.value)
    .filter((value): value is LotRow => value !== null);
  const lotReport = applyLotRows(ctx, lotRows);

  const deactivated: string[] = [];
  const kept: string[] = [];
  for (const candidate of deactivateMissing ? payload.lots.toDeactivate : []) {
    const lot = ctx.tx.select().from(lots).where(eq(lots.code, candidate.code)).get();
    if (!lot) continue;
    const blockers = lotDeactivationBlockers(ctx.tx, lot.id);
    if (blockers.length > 0) {
      // Refused rather than fatal: the rest of the file is still correct, and
      // the reason is on the screen afterwards.
      kept.push(`${candidate.code} (${blockers.join(', ')})`);
      continue;
    }
    deactivateLot(ctx, lot.id, 'puudus raamhanke andmete failist');
    deactivated.push(candidate.code);
  }

  /* 3. the ranking */
  const partnersWritten = applyPartnerRows(ctx, payload.partners.rows, { deactivateMissing });

  /* 4. the people listed in their own right — the ranking has been applied,
        so a contact this file replaced can be kept by listing them here */
  const coveredPartnerIds = ctx.tx
    .select({ id: partners.id, regCode: partners.regCode })
    .from(partners)
    .all()
    .filter((p) => payload.partners.rows.some((row) => row.value?.regCode === p.regCode))
    .map((p) => p.id);
  const representatives = payload.representatives.present
    ? applyRepresentativeRows(ctx, payload.representatives.rows, {
        deactivateMissing,
        batchId,
        coversPartnerIds: coveredPartnerIds,
      })
    : null;

  /* 5. and now every official contact is a login again — and nobody who is
        neither a contact nor listed [L-21] */
  const contacts = syncFrameworkContacts(ctx);

  const summary: ImportSummary = {
    total: payload.partners.rows.length,
    valid: payload.partners.rows.filter((row) => row.value !== null).length,
    created: partnersWritten.created,
    updated: partnersWritten.updated,
    locked: 0,
    withErrors: payload.partners.rows.filter((row) => row.errors.length > 0).length,
    withWarnings: payload.partners.rows.filter((row) => row.warnings.length > 0).length,
  };

  ctx.tx
    .update(importBatches)
    .set({
      status: 'imported',
      importedAt: ctx.at,
      rowsJson: payload,
      summary,
      options: { ...options, deactivateMissing },
    })
    .where(eq(importBatches.id, batchId))
    .run();

  const report: FrameworkApplyResult = {
    summary,
    framework: { changed: frameworkChanged },
    lots: { ...lotReport, deactivated, kept },
    partners: partnersWritten,
    representatives,
    contacts,
  };

  logAudit(ctx, {
    eventType: 'import.framework_imported',
    summary:
      `Raamhanke andmed imporditud failist ${batch.fileName}: ` +
      `${lotReport.created.length} uut hankeosa, ${summary.created} uut ja ${summary.updated} uuendatud partneri kohta` +
      `${contacts.created.length > 0 ? `, ${contacts.created.length} uut sisselogimist` : ''}` +
      `${contacts.deactivated.length > 0 ? `, ${contacts.deactivated.length} sisselogimist lõpetatud` : ''}`,
    after: {
      batchId,
      deactivateMissing,
      ...report,
      openRoundParticipantsUnchanged: openRoundParticipantCount(ctx),
    },
  });

  return report;
}

/** Convenience for the seed: preview then apply in one call. */
export function importFrameworkFromSheets(
  ctx: Ctx,
  input: {
    fileName: string;
    fileSize: number;
    source: ImportSource;
    sheets: FrameworkSheets;
    options?: FrameworkImportOptions;
  },
): FrameworkApplyResult {
  const preview = previewFrameworkImport(ctx, {
    ...input,
    options: input.options ?? { deactivateMissing: false },
  });
  if (!preview.canApply) {
    const problems = [
      ...preview.framework.errors.map((e) => e.message),
      ...preview.lots.fileErrors.map((e) => e.message),
      ...preview.lots.rows.flatMap((row) => row.errors.map((e) => `hankeosad rida ${row.rowNumber}: ${e.message}`)),
      ...preview.partners.fileErrors.map((e) => e.message),
      ...preview.partners.rows.flatMap((row) => row.errors.map((e) => `partnerid rida ${row.rowNumber}: ${e.message}`)),
      ...preview.representatives.rows.flatMap((row) => row.errors.map((e) => `esindajad rida ${row.rowNumber}: ${e.message}`)),
    ];
    throw new Error(`Raamhanke andmete faili ei õnnestu lugeda: ${problems.join('; ')}`);
  }
  return applyFrameworkImport(ctx, preview.batchId, { deactivateMissing: input.options?.deactivateMissing });
}
