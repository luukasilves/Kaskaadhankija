/**
 * Import the partners' contractual representatives [R-02][D-10].
 *
 * The list decides two things: who receives a partner's formal notices, and who
 * may sign in for the company. Same two-step shape as the other imports — a
 * preview that stores the normalised rows with their diagnostics, then a
 * confirmation that writes them — and the same upsert discipline: identity is
 * (company, e-mail), so re-uploading a corrected sheet changes what it should
 * and nothing else.
 *
 * Two rules the database enforces and the preview explains ahead of time: an
 * address is active for at most one company (one person signs in as one
 * company), and a buyer-team address cannot double as a representative.
 */

import { and, eq } from 'drizzle-orm';
import {
  importBatches,
  partnerRepresentatives,
  partners,
  users,
  type ImportSummary,
} from '@/db/schema';
import {
  countRows,
  parseRepresentativeRows,
  type RepresentativeRow,
  type RowDiagnostic,
} from '@/domain/import-rows';
import { logAudit } from '../audit';
import type { Ctx } from '../context';
import type { ImportSource } from './trainings-import';

export interface StoredRepresentativeRow {
  rowNumber: number;
  value: RepresentativeRow | null;
  /** for the preview table; the file need not carry the name */
  partnerName: string;
  errors: RowDiagnostic[];
  warnings: RowDiagnostic[];
  action?: 'created' | 'updated' | 'error';
  note?: string;
}

export interface RepresentativeImportOptions {
  /** Deactivate a listed company's representatives who are absent from the file. */
  deactivateMissing: boolean;
}

export interface RepresentativePreviewResult {
  batchId: string;
  rows: StoredRepresentativeRow[];
  fileErrors: RowDiagnostic[];
  summary: ImportSummary;
  wouldDeactivate: Array<{ partnerName: string; name: string; email: string }>;
}

interface Payload {
  rows: StoredRepresentativeRow[];
  fileErrors: RowDiagnostic[];
}

function summarize(rows: StoredRepresentativeRow[]): ImportSummary {
  const counts = countRows(rows);
  return {
    total: counts.total,
    valid: counts.valid,
    created: 0,
    updated: 0,
    locked: 0,
    withErrors: counts.withErrors,
    withWarnings: counts.withWarnings,
  };
}

/**
 * The checks that need the database: a buyer-team address, or an address that
 * is active for a different company. Applied at preview and again at apply, so
 * a sheet confirmed later still meets the state it lands in.
 */
function checkAgainstDatabase(ctx: Ctx, rows: StoredRepresentativeRow[]): void {
  const buyerEmails = new Set(
    ctx.tx
      .select({ email: users.email })
      .from(users)
      .where(eq(users.isActive, true))
      .all()
      .map((u) => u.email.toLowerCase()),
  );
  const activeElsewhere = new Map(
    ctx.tx
      .select({
        email: partnerRepresentatives.email,
        regCode: partners.regCode,
        partnerName: partners.name,
      })
      .from(partnerRepresentatives)
      .innerJoin(partners, eq(partners.id, partnerRepresentatives.partnerId))
      .where(eq(partnerRepresentatives.isActive, true))
      .all()
      .map((r) => [r.email, r] as const),
  );

  for (const row of rows) {
    if (!row.value) continue;
    if (buyerEmails.has(row.value.email)) {
      row.errors.push({
        field: 'e_post',
        message: 'see aadress kuulub tellimismeeskonna kasutajale ja ei saa olla partneri esindaja',
      });
    }
    const holder = activeElsewhere.get(row.value.email);
    if (holder && holder.regCode !== row.value.regCode) {
      row.errors.push({
        field: 'e_post',
        message: `see aadress on juba aktiivne partneri ${holder.partnerName} esindajana — lõpeta see esindus enne`,
      });
    }
    if (row.errors.length > 0) row.value = null;
  }
}

export function previewRepresentativesImport(
  ctx: Ctx,
  input: {
    fileName: string;
    fileSize: number;
    source: ImportSource;
    rawRows: Array<Record<string, string>>;
    options: RepresentativeImportOptions;
  },
): RepresentativePreviewResult {
  const partnerRows = ctx.tx
    .select({ id: partners.id, regCode: partners.regCode, name: partners.name })
    .from(partners)
    .all();
  const partnerByReg = new Map(partnerRows.map((p) => [p.regCode, p] as const));

  const { rows, fileErrors } = parseRepresentativeRows(input.rawRows, {
    knownRegCodes: partnerRows.map((p) => p.regCode),
  });

  const stored: StoredRepresentativeRow[] = rows.map((row) => ({
    rowNumber: row.rowNumber,
    value: row.value,
    partnerName: row.value ? (partnerByReg.get(row.value.regCode)?.name ?? '') : '',
    errors: row.errors,
    warnings: row.warnings,
  }));
  checkAgainstDatabase(ctx, stored);
  const summary = summarize(stored);

  // Created versus updated, by (company, e-mail).
  const existing = ctx.tx
    .select({
      partnerId: partnerRepresentatives.partnerId,
      email: partnerRepresentatives.email,
      name: partnerRepresentatives.name,
      isActive: partnerRepresentatives.isActive,
      source: partnerRepresentatives.source,
    })
    .from(partnerRepresentatives)
    .all();
  const key = (partnerId: string, email: string) => `${partnerId}#${email}`;
  const existingKeys = new Set(existing.map((r) => key(r.partnerId, r.email)));

  const touchedPartnerIds = new Set<string>();
  const keptKeys = new Set<string>();
  for (const row of stored) {
    if (!row.value) continue;
    const partner = partnerByReg.get(row.value.regCode);
    if (!partner) continue;
    touchedPartnerIds.add(partner.id);
    const k = key(partner.id, row.value.email);
    keptKeys.add(k);
    if (existingKeys.has(k)) summary.updated += 1;
    else summary.created += 1;
  }

  const wouldDeactivate = input.options.deactivateMissing
    ? existing
        .filter(
          (r) =>
            r.isActive &&
            r.source !== 'framework' &&
            touchedPartnerIds.has(r.partnerId) &&
            !keptKeys.has(key(r.partnerId, r.email)),
        )
        .map((r) => ({
          partnerName: partnerRows.find((p) => p.id === r.partnerId)?.name ?? '',
          name: r.name,
          email: r.email,
        }))
    : [];

  const batchId = crypto.randomUUID();
  ctx.tx
    .insert(importBatches)
    .values({
      id: batchId,
      kind: 'representatives',
      fileName: input.fileName,
      fileSize: input.fileSize,
      source: input.source,
      status: 'previewed',
      rowsJson: { rows: stored, fileErrors } satisfies Payload,
      summary,
      options: input.options,
      actorId: ctx.actor.id,
      actorLabel: ctx.actor.label,
      createdAt: ctx.at,
    })
    .run();

  logAudit(ctx, {
    eventType: 'import.previewed',
    summary: `Esindajate import eelvaadatud: ${input.fileName} — ${summary.valid}/${summary.total} rida korras`,
    after: { batchId, fileName: input.fileName, summary },
  });

  return { batchId, rows: stored, fileErrors, summary, wouldDeactivate };
}

export function applyRepresentativesImport(
  ctx: Ctx,
  batchId: string,
): { summary: ImportSummary; rows: StoredRepresentativeRow[] } {
  const batch = ctx.tx.select().from(importBatches).where(eq(importBatches.id, batchId)).get();
  if (!batch) throw new Error('Importi ei leitud.');
  if (batch.kind !== 'representatives') throw new Error('Vale impordi tüüp.');
  if (batch.status !== 'previewed') throw new Error('See import on juba tehtud või kõrvale jäetud.');

  const payload = batch.rowsJson as Payload;
  const options = (batch.options ?? {}) as Partial<RepresentativeImportOptions>;
  const rows = payload.rows;

  const summary = applyRepresentativeRows(ctx, rows, {
    deactivateMissing: Boolean(options.deactivateMissing),
    batchId,
  });

  ctx.tx
    .update(importBatches)
    .set({
      status: 'imported',
      importedAt: ctx.at,
      rowsJson: { rows, fileErrors: payload.fileErrors } satisfies Payload,
      summary,
    })
    .where(eq(importBatches.id, batchId))
    .run();

  logAudit(ctx, {
    eventType: 'import.representatives_imported',
    summary: `Esindajad imporditud failist ${batch.fileName}: ${summary.created} uut, ${summary.updated} uuendatud${options.deactivateMissing ? ', puuduvad lõpetatud' : ''}`,
    after: { batchId, summary, deactivateMissing: Boolean(options.deactivateMissing) },
  });

  return { summary, rows };
}

/**
 * Write a set of representative rows.
 *
 * Shared with the framework workbook, whose „Esindajad“ sheet is the same list
 * in another file [L-21], so one address cannot be written two ways. Mutates
 * each row's `action`, which the preview page shows back, and re-checks the
 * database because the state may have moved since the preview.
 */
export function applyRepresentativeRows(
  ctx: Ctx,
  rows: StoredRepresentativeRow[],
  options: { deactivateMissing: boolean; batchId: string | null },
): ImportSummary {
  const batchId = options.batchId;
  checkAgainstDatabase(ctx, rows);
  const summary = summarize(rows);

  const partnerByReg = new Map(
    ctx.tx
      .select({ id: partners.id, regCode: partners.regCode, name: partners.name })
      .from(partners)
      .all()
      .map((p) => [p.regCode, p] as const),
  );

  const valid = rows.filter(
    (r): r is StoredRepresentativeRow & { value: RepresentativeRow } => r.value !== null,
  );
  const touchedPartnerIds = new Set(
    valid.map((r) => partnerByReg.get(r.value.regCode)?.id).filter((id): id is string => Boolean(id)),
  );
  const listedEmails = new Map<string, Set<string>>();
  for (const row of valid) {
    const partnerId = partnerByReg.get(row.value.regCode)?.id;
    if (!partnerId) continue;
    const set = listedEmails.get(partnerId) ?? new Set<string>();
    set.add(row.value.email);
    listedEmails.set(partnerId, set);
  }

  /* 1. deactivate the listed companies' representatives absent from the file,
        first, so an address moving within a company cannot trip the unique index */
  if (options.deactivateMissing) {
    for (const partnerId of touchedPartnerIds) {
      const current = ctx.tx
        .select()
        .from(partnerRepresentatives)
        .where(and(eq(partnerRepresentatives.partnerId, partnerId), eq(partnerRepresentatives.isActive, true)))
        .all();
      for (const rep of current) {
        if (listedEmails.get(partnerId)?.has(rep.email)) continue;
        // A lot's official contact is maintained by the framework data [L-21]:
        // this sheet lists extra people, so its absences say nothing about them.
        if (rep.source === 'framework') continue;
        ctx.tx
          .update(partnerRepresentatives)
          .set({ isActive: false, deactivatedAt: ctx.at, updatedAt: ctx.at })
          .where(eq(partnerRepresentatives.id, rep.id))
          .run();
        logAudit(ctx, {
          eventType: 'representative.deactivated',
          summary: `${rep.name} (${rep.email}) ei ole enam ${partnerByReg.get([...partnerByReg.values()].find((p) => p.id === partnerId)?.regCode ?? '')?.name ?? 'partneri'} esindaja — puudus imporditud loendist`,
          after: { representativeId: rep.id, partnerId },
        });
      }
    }
  }

  /* 2. upsert by (company, e-mail) */
  for (const row of valid) {
    const partner = partnerByReg.get(row.value.regCode);
    if (!partner) {
      row.action = 'error';
      row.note = 'partner puudub';
      continue;
    }
    const existing = ctx.tx
      .select()
      .from(partnerRepresentatives)
      .where(and(eq(partnerRepresentatives.partnerId, partner.id), eq(partnerRepresentatives.email, row.value.email)))
      .get();

    try {
      if (existing) {
        ctx.tx
          .update(partnerRepresentatives)
          .set({
            name: row.value.name,
            role: row.value.role,
            phone: row.value.phone,
            // Listing somebody explicitly makes them this sheet's to maintain,
            // even if they arrived as a lot's official contact [L-21].
            source: 'upload',
            isActive: true,
            deactivatedAt: null,
            importBatchId: batchId,
            updatedAt: ctx.at,
          })
          .where(eq(partnerRepresentatives.id, existing.id))
          .run();
        row.action = 'updated';
        summary.updated += 1;
        logAudit(ctx, {
          eventType: existing.isActive ? 'representative.updated' : 'representative.activated',
          summary: `${row.value.name} (${row.value.email}) — ${partner.name} ${row.value.role}`,
          after: { representativeId: existing.id, partnerId: partner.id, role: row.value.role },
        });
      } else {
        const id = crypto.randomUUID();
        ctx.tx
          .insert(partnerRepresentatives)
          .values({
            id,
            partnerId: partner.id,
            name: row.value.name,
            email: row.value.email,
            role: row.value.role,
            phone: row.value.phone,
            source: 'upload',
            isActive: true,
            importBatchId: batchId,
            createdAt: ctx.at,
            updatedAt: ctx.at,
          })
          .run();
        row.action = 'created';
        summary.created += 1;
        logAudit(ctx, {
          eventType: 'representative.created',
          summary: `${row.value.name} (${row.value.email}) lisatud partneri ${partner.name} ${row.value.role}ks`,
          after: { representativeId: id, partnerId: partner.id, role: row.value.role },
        });
      }
    } catch (error) {
      // The unique active-address index is the last line of defence.
      row.action = 'error';
      row.note = error instanceof Error ? error.message : 'salvestamine ebaõnnestus';
      summary.withErrors += 1;
      summary.valid -= 1;
    }
  }

  return summary;
}

/** Convenience for the seed: preview then apply in one call. */
export function importRepresentativesFromRows(
  ctx: Ctx,
  input: {
    fileName: string;
    fileSize: number;
    source: ImportSource;
    rawRows: Array<Record<string, string>>;
    options?: RepresentativeImportOptions;
  },
): { summary: ImportSummary; batchId: string } {
  const preview = previewRepresentativesImport(ctx, {
    ...input,
    options: input.options ?? { deactivateMissing: false },
  });
  if (preview.summary.valid === 0) {
    throw new Error(
      `Esindajate faili ei õnnestu lugeda: ${[...preview.fileErrors, ...preview.rows.flatMap((r) => r.errors)]
        .map((e) => e.message)
        .slice(0, 5)
        .join('; ')}`,
    );
  }
  const applied = applyRepresentativesImport(ctx, preview.batchId);
  return { summary: applied.summary, batchId: preview.batchId };
}

/** Switch one representative off or back on, from the Esindajad screen. */
export function setRepresentativeActive(ctx: Ctx, id: string, active: boolean): void {
  const rep = ctx.tx.select().from(partnerRepresentatives).where(eq(partnerRepresentatives.id, id)).get();
  if (!rep) throw new Error('Esindajat ei leitud.');
  if (rep.source === 'framework') {
    // Switching it off here would last until the next sync and no longer [L-21];
    // the way to end this sign-in is to change the lot's official contact.
    throw new Error('See on raamlepingu kontaktisik — teda hallatakse raamhanke andmetes, mitte siin.');
  }
  if (rep.isActive === active) return;
  if (active) {
    const holder = ctx.tx
      .select({ id: partnerRepresentatives.id })
      .from(partnerRepresentatives)
      .where(and(eq(partnerRepresentatives.email, rep.email), eq(partnerRepresentatives.isActive, true)))
      .get();
    if (holder) throw new Error('See e-posti aadress on juba aktiivne esindaja.');
  }
  ctx.tx
    .update(partnerRepresentatives)
    .set({ isActive: active, deactivatedAt: active ? null : ctx.at, updatedAt: ctx.at })
    .where(eq(partnerRepresentatives.id, id))
    .run();
  const partnerName =
    ctx.tx.select({ name: partners.name }).from(partners).where(eq(partners.id, rep.partnerId)).get()?.name ??
    'partner';
  logAudit(ctx, {
    eventType: active ? 'representative.activated' : 'representative.deactivated',
    summary: active
      ? `${rep.name} (${rep.email}) on taas partneri ${partnerName} esindaja`
      : `${rep.name} (${rep.email}) ei ole enam partneri ${partnerName} esindaja`,
    after: { representativeId: id, partnerId: rep.partnerId },
  });
}
