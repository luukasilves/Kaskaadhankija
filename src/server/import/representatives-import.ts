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
 *
 * What this sheet writes is the second of the two facts that make a row active
 * [L-21]: the buyer **listed** the person in their own right. A lot's current
 * contact is a representative by the ranking already, so listing them updates
 * role and phone and nothing else — otherwise every contact the sheet ever
 * named would survive being replaced, which is the bug the v2.6 spec fixed.
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
import { contactKey, currentContacts, syncFrameworkContacts } from '../framework';
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
      isListed: partnerRepresentatives.isListed,
    })
    .from(partnerRepresentatives)
    .all();
  const key = contactKey;
  const existingKeys = new Set(existing.map((r) => key(r.partnerId, r.email)));
  const contacts = currentContacts(ctx.tx);

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

  // Absence from the sheet ends a listing, and a listing was all that kept an
  // unlisted-by-ranking person active; a current contact stays either way.
  const wouldDeactivate = input.options.deactivateMissing
    ? existing
        .filter(
          (r) =>
            r.isActive &&
            touchedPartnerIds.has(r.partnerId) &&
            !keptKeys.has(key(r.partnerId, r.email)) &&
            !contacts.has(key(r.partnerId, r.email)),
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
  // A current contact the sheet named gets no row from the sheet — the ranking
  // owns that sign-in — so make sure it exists [L-21].
  syncFrameworkContacts(ctx, { partnerIds: touchedPartnerIdsOf(ctx, rows) });

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

/** The companies a set of rows names, by id. */
function touchedPartnerIdsOf(ctx: Ctx, rows: readonly StoredRepresentativeRow[]): string[] {
  const partnerByReg = new Map(
    ctx.tx.select({ id: partners.id, regCode: partners.regCode }).from(partners).all().map((p) => [p.regCode, p.id]),
  );
  return [
    ...new Set(
      rows
        .map((row) => (row.value ? partnerByReg.get(row.value.regCode) : undefined))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

/**
 * Write a set of representative rows.
 *
 * Shared with the framework workbook, whose „Esindajad“ sheet is the same list
 * in another file [L-21], so one address cannot be written two ways. Mutates
 * each row's `action`, which the preview page shows back, and re-checks the
 * database because the state may have moved since the preview.
 *
 * Writes only the listing: a person the sheet names who is not a current
 * contact becomes (or stays) listed and active; a current contact gets their
 * role and phone and keeps following the ranking. With `deactivateMissing`,
 * absence from the sheet clears the listing of the covered companies' people —
 * which retires everyone the listing alone was keeping.
 */
export function applyRepresentativeRows(
  ctx: Ctx,
  rows: StoredRepresentativeRow[],
  options: {
    deactivateMissing: boolean;
    batchId: string | null;
    /**
     * Companies whose absent people count as missing even when the sheet has
     * no row for them at all — the framework workbook covers every company on
     * its Partnerid sheet. A sheet on its own covers only the companies it names.
     */
    coversPartnerIds?: readonly string[];
  },
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
  const partnerNameById = new Map([...partnerByReg.values()].map((p) => [p.id, p.name] as const));
  const contacts = currentContacts(ctx.tx);

  const valid = rows.filter(
    (r): r is StoredRepresentativeRow & { value: RepresentativeRow } => r.value !== null,
  );
  const touchedPartnerIds = new Set([
    ...valid.map((r) => partnerByReg.get(r.value.regCode)?.id).filter((id): id is string => Boolean(id)),
    ...(options.coversPartnerIds ?? []),
  ]);
  const listedEmails = new Map<string, Set<string>>();
  for (const row of valid) {
    const partnerId = partnerByReg.get(row.value.regCode)?.id;
    if (!partnerId) continue;
    const set = listedEmails.get(partnerId) ?? new Set<string>();
    set.add(row.value.email);
    listedEmails.set(partnerId, set);
  }

  /* 1. end the listings the sheet no longer carries — first, so an address
        moving within a company cannot trip the unique index */
  if (options.deactivateMissing) {
    for (const partnerId of touchedPartnerIds) {
      const current = ctx.tx
        .select()
        .from(partnerRepresentatives)
        .where(and(eq(partnerRepresentatives.partnerId, partnerId), eq(partnerRepresentatives.isActive, true)))
        .all();
      const partnerName = partnerNameById.get(partnerId) ?? 'partneri';
      for (const rep of current) {
        if (listedEmails.get(partnerId)?.has(rep.email)) continue;
        if (!rep.isListed) continue; // active by the ranking alone: nothing of ours to end
        const staysAsContact = contacts.has(contactKey(partnerId, rep.email));
        ctx.tx
          .update(partnerRepresentatives)
          .set(
            staysAsContact
              ? { isListed: false, updatedAt: ctx.at }
              : { isActive: false, isListed: false, deactivatedAt: ctx.at, updatedAt: ctx.at },
          )
          .where(eq(partnerRepresentatives.id, rep.id))
          .run();
        logAudit(ctx, {
          eventType: staysAsContact ? 'representative.updated' : 'representative.deactivated',
          summary: staysAsContact
            ? `${rep.name} (${rep.email}) puudus imporditud loendist — jääb ${partnerName} esindajaks raamlepingu kontaktisikuna`
            : `${rep.name} (${rep.email}) ei ole enam ${partnerName} esindaja — puudus imporditud loendist`,
          after: { representativeId: rep.id, partnerId, isListed: false },
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
    const contact = contacts.get(contactKey(partner.id, row.value.email));

    try {
      if (contact) {
        // The current contact represents the company by the ranking [L-21];
        // the sheet contributes role and phone, never a listing that would
        // outlive the next contact change.
        row.action = 'updated';
        row.note = `raamlepingu kontaktisik (${contact.lotCodes.join(', ')}) — esindus tuleb järjestusest`;
        summary.updated += 1;
        if (existing) {
          const changed = existing.role !== row.value.role || existing.phone !== row.value.phone;
          if (changed) {
            ctx.tx
              .update(partnerRepresentatives)
              .set({ role: row.value.role, phone: row.value.phone, importBatchId: batchId, updatedAt: ctx.at })
              .where(eq(partnerRepresentatives.id, existing.id))
              .run();
            logAudit(ctx, {
              eventType: 'representative.updated',
              summary: `${row.value.name} (${row.value.email}) — ${partner.name} raamlepingu kontaktisik, roll ja telefon loendist`,
              before: { role: existing.role, phone: existing.phone },
              after: { representativeId: existing.id, partnerId: partner.id, role: row.value.role, phone: row.value.phone },
            });
          }
        }
        // No row yet: the sync that follows every membership write creates it.
        continue;
      }

      if (existing) {
        ctx.tx
          .update(partnerRepresentatives)
          .set({
            name: row.value.name,
            role: row.value.role,
            phone: row.value.phone,
            isActive: true,
            isListed: true,
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
          after: { representativeId: existing.id, partnerId: partner.id, role: row.value.role, isListed: true },
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
            isListed: true,
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
          after: { representativeId: id, partnerId: partner.id, role: row.value.role, isListed: true },
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

/**
 * Switch one representative off or back on, from the Esindajad screen.
 *
 * Both directions act on the listing [L-21]: off clears it (and the row, since
 * nothing else keeps it), on sets it — which is also how a retired contact
 * becomes a representative in their own right. A current contact cannot be
 * switched off here: their sign-in follows the ranking, and the way to end it
 * is to change the lot's contact.
 */
export function setRepresentativeActive(ctx: Ctx, id: string, active: boolean): void {
  const rep = ctx.tx.select().from(partnerRepresentatives).where(eq(partnerRepresentatives.id, id)).get();
  if (!rep) throw new Error('Esindajat ei leitud.');
  const contact = currentContacts(ctx.tx, [rep.partnerId]).get(contactKey(rep.partnerId, rep.email));
  if (!active && contact) {
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
    .set(
      active
        ? { isActive: true, isListed: !contact, deactivatedAt: null, updatedAt: ctx.at }
        : { isActive: false, isListed: false, deactivatedAt: ctx.at, updatedAt: ctx.at },
    )
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
    after: { representativeId: id, partnerId: rep.partnerId, isListed: active && !contact },
  });
}

