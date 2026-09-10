/**
 * The framework data: identity, lots, ranking, contacts [L-21].
 *
 * Everything an admin can change about the procurement itself lives here, and
 * both ways of changing it — dropping a workbook in, or editing a field on the
 * Raamhange screen — call these same functions. That is deliberate: two paths
 * to the same state drift, and the whole point of the screen is to avoid
 * opening Excel for a typo.
 *
 * Every function audits with before/after, because the ranking and the contact
 * addresses decide who gets offered work and who can sign in. There is no
 * "quiet" edit.
 *
 * **The official contact is the login.** A lot's `contactEmail` is mirrored
 * into `partner_representatives` as a `framework`-sourced row, which is what
 * `partnerRecipients()` reads for the formal notices [D-10] and what the
 * sign-in looks up [L-08]. Rows carry where they came from, and whoever last
 * activated a row owns it: the sync only ever deactivates its own, so the
 * representatives sheet and the ranking cannot undo each other.
 */

import { and, desc, eq, inArray, like, ne, or, sql } from 'drizzle-orm';
import {
  auditEvents,
  frameworkSettings,
  lotPartners,
  lots,
  partnerRepresentatives,
  partners,
  rounds,
  users,
  type RepresentativeRole,
  type RepresentativeSource,
} from '@/db/schema';
import { DEFAULT_FRAMEWORK_IDENTITY, type FrameworkIdentity } from '@/domain/framework';
import type { LotRow } from '@/domain/framework-definition';
import { logAudit } from './audit';
import type { Ctx, Db, Tx } from './context';

type Reader = Tx | Db;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ------------------------------------------------------------------ *
 * identity
 * ------------------------------------------------------------------ */

/** Which framework this environment runs. Falls back to the real values. */
export function frameworkIdentity(tx: Reader): FrameworkIdentity {
  const row = tx.select().from(frameworkSettings).where(eq(frameworkSettings.id, 1)).get();
  if (!row) return DEFAULT_FRAMEWORK_IDENTITY;
  return {
    title: row.title,
    procurementReference: row.procurementReference,
    agreementReference: row.agreementReference,
    buyerName: row.buyerName,
    validUntil: row.validUntil,
  };
}

/** Returns whether anything actually changed, so a no-op leaves no audit row. */
export function updateFrameworkIdentity(ctx: Ctx, input: FrameworkIdentity): boolean {
  const before = frameworkIdentity(ctx.tx);
  const next: FrameworkIdentity = {
    title: input.title.trim(),
    procurementReference: input.procurementReference.trim(),
    agreementReference: input.agreementReference.trim(),
    buyerName: input.buyerName.trim(),
    validUntil: input.validUntil?.trim() || null,
  };
  if (!next.title) throw new Error('Raamlepingu nimetus on puudu.');
  if (!/^\d{4,12}$/.test(next.procurementReference)) {
    throw new Error('Riigihanke viitenumber on number, nt 10567384.');
  }
  if (!next.buyerName) throw new Error('Tellija nimi on puudu.');

  // Which fields moved, in the words the screen uses. The whole point of the
  // log is that a reader can see what changed [L-21]; a summary that reads the
  // same whichever field was edited would not tell them.
  const changed: string[] = [];
  const named: Array<[keyof FrameworkIdentity, string]> = [
    ['title', 'nimetus'],
    ['procurementReference', 'riigihanke viitenumber'],
    ['agreementReference', 'raamlepingu number'],
    ['buyerName', 'tellija'],
    ['validUntil', 'kehtib kuni'],
  ];
  for (const [field, label] of named) {
    if (before[field] === next[field]) continue;
    changed.push(`${label}: ${before[field] || '—'} → ${next[field] || '—'}`);
  }
  if (changed.length === 0) return false;

  ctx.tx
    .insert(frameworkSettings)
    .values({ id: 1, ...next, updatedAt: ctx.at })
    .onConflictDoUpdate({ target: frameworkSettings.id, set: { ...next, updatedAt: ctx.at } })
    .run();

  logAudit(ctx, {
    eventType: 'framework.updated',
    summary: `Raamhanke andmed muudetud — ${changed.join('; ')}`,
    before,
    after: next,
  });
  return true;
}

/* ------------------------------------------------------------------ *
 * lots
 * ------------------------------------------------------------------ */

/** Rounds that would be left without a lot; a lot with any of these stays. */
export function lotDeactivationBlockers(tx: Reader, lotId: string): string[] {
  return tx
    .select({ code: rounds.code })
    .from(rounds)
    .where(and(eq(rounds.lotId, lotId), inArray(rounds.status, ['draft', 'open', 'closed'])))
    .all()
    .map((r) => r.code);
}

export function deactivateLot(ctx: Ctx, lotId: string, reason: string): void {
  const lot = ctx.tx.select().from(lots).where(eq(lots.id, lotId)).get();
  if (!lot) throw new Error('Hankeosa ei leitud.');
  const blockers = lotDeactivationBlockers(ctx.tx, lotId);
  if (blockers.length > 0) {
    throw new Error(
      `Hankeosa ${lot.code} on veel voorudes (${blockers.join(', ')}) — lõpeta need enne.`,
    );
  }
  if (!lot.isActive) return;
  ctx.tx.update(lots).set({ isActive: false }).where(eq(lots.id, lotId)).run();
  logAudit(ctx, {
    eventType: 'lot.deactivated',
    summary: `Hankeosa ${lot.code} arvatud raamhankest välja${reason ? `: ${reason}` : ''}`,
    lotId,
    before: { isActive: true },
    after: { isActive: false, reason },
  });
}

type LotFields = Partial<typeof lots.$inferInsert> & { name: string; isActive: true };

/** The fields a lot row can set; `null` in the row means "leave as is". */
function lotFieldsFrom(row: LotRow): LotFields {
  const fields: LotFields = { name: row.name, isActive: true };
  if (row.description !== null) fields.description = row.description;
  if (row.responseDeadlineWorkingDays !== null) {
    fields.responseDeadlineWorkingDays = row.responseDeadlineWorkingDays;
  }
  if (row.deadlineLocalTime !== null) fields.deadlineLocalTime = row.deadlineLocalTime;
  if (row.reviewWorkingDays !== null) fields.reviewWorkingDays = row.reviewWorkingDays;
  if (row.workloadThreshold !== null) fields.workloadThreshold = row.workloadThreshold;
  if (row.defaultVisibilityMode !== null) fields.defaultVisibilityMode = row.defaultVisibilityMode;
  if (row.defaultCapOptions !== null) fields.defaultCapOptions = row.defaultCapOptions;
  if (row.thresholdNote !== null) fields.thresholdNote = row.thresholdNote;
  return fields;
}

export interface LotApplyReport {
  created: string[];
  updated: string[];
  unchanged: string[];
}

/**
 * Upsert lots by code. A lot the file does not mention is never touched, let
 * alone deleted: a ranking or a round may still point at it.
 */
export function applyLotRows(ctx: Ctx, rows: readonly LotRow[]): LotApplyReport {
  const report: LotApplyReport = { created: [], updated: [], unchanged: [] };
  for (const row of rows) {
    const existing = ctx.tx.select().from(lots).where(eq(lots.code, row.code)).get();
    const fields = lotFieldsFrom(row);

    if (!existing) {
      const id = crypto.randomUUID();
      ctx.tx.insert(lots).values({ id, code: row.code, createdAt: ctx.at, ...fields }).run();
      report.created.push(row.code);
      logAudit(ctx, {
        eventType: 'lot.created',
        summary: `Hankeosa ${row.code} — ${row.name} lisatud raamhankesse`,
        lotId: id,
        after: { code: row.code, ...fields },
      });
      continue;
    }

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      const current = (existing as Record<string, unknown>)[key];
      if (current !== value) {
        before[key] = current;
        after[key] = value;
      }
    }
    if (Object.keys(after).length === 0) {
      report.unchanged.push(row.code);
      continue;
    }
    ctx.tx.update(lots).set(fields).where(eq(lots.id, existing.id)).run();
    report.updated.push(row.code);
    logAudit(ctx, {
      eventType: 'lot.updated',
      summary: `Hankeosa ${row.code} andmed muudetud (${Object.keys(after).join(', ')})`,
      lotId: existing.id,
      before,
      after,
    });
  }
  return report;
}

/* ------------------------------------------------------------------ *
 * contacts as logins
 * ------------------------------------------------------------------ */

/**
 * Why this address cannot represent this company, or null when it can.
 *
 * The one place both the imports and the screen ask, so the answer — and its
 * wording — is the same everywhere.
 */
export function representativeCollision(
  tx: Reader,
  rawEmail: string,
  partnerId: string,
): string | null {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return 'vigane e-posti aadress';

  const buyer = tx
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${email}`, eq(users.isActive, true)))
    .get();
  if (buyer) return 'see aadress kuulub tellimismeeskonna kasutajale ja ei saa olla partneri esindaja';

  const elsewhere = tx
    .select({ partnerName: partners.name })
    .from(partnerRepresentatives)
    .innerJoin(partners, eq(partners.id, partnerRepresentatives.partnerId))
    .where(
      and(
        eq(partnerRepresentatives.email, email),
        eq(partnerRepresentatives.isActive, true),
        ne(partnerRepresentatives.partnerId, partnerId),
      ),
    )
    .get();
  if (elsewhere) {
    return `see aadress on juba aktiivne partneri ${elsewhere.partnerName} esindajana — lõpeta see esindus enne`;
  }
  return null;
}

export interface FrameworkContactSyncReport {
  created: string[];
  reactivated: string[];
  renamed: string[];
  deactivated: string[];
  skipped: Array<{ email: string; partnerName: string; reason: string }>;
}

/**
 * Make every active lot contact a sign-in, and retire the ones that no longer
 * are one.
 *
 * Deliberately never throws: a ranking import must not roll back because one
 * address happens to belong to somebody else. A refused address is reported and
 * the ranking still applies — the preview flagged it beforehand, and the
 * Raamhange screen shows "sisselogimine puudub" against that row afterwards.
 *
 * Lot membership decides, not lot activity: a partner with live orders in a
 * lot the buyer has since retired must still be able to sign in.
 */
export function syncFrameworkContacts(
  ctx: Ctx,
  scope: { partnerIds?: readonly string[] } = {},
): FrameworkContactSyncReport {
  const report: FrameworkContactSyncReport = {
    created: [],
    reactivated: [],
    renamed: [],
    deactivated: [],
    skipped: [],
  };

  const memberships = ctx.tx
    .select({
      partnerId: lotPartners.partnerId,
      partnerName: partners.name,
      rank: lotPartners.rank,
      contactName: lotPartners.contactName,
      contactEmail: lotPartners.contactEmail,
    })
    .from(lotPartners)
    .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
    .where(and(eq(lotPartners.isActive, true), eq(partners.isActive, true)))
    .all()
    .filter((m) => !scope.partnerIds || scope.partnerIds.includes(m.partnerId))
    .sort((a, b) => a.rank - b.rank);

  /** (partner, address) → the name to use, from the partner's best-ranked lot. */
  const desired = new Map<string, { partnerId: string; partnerName: string; email: string; name: string }>();
  const keyOf = (partnerId: string, email: string): string => `${partnerId}#${email}`;
  for (const membership of memberships) {
    const email = membership.contactEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) continue;
    const key = keyOf(membership.partnerId, email);
    if (!desired.has(key)) {
      desired.set(key, {
        partnerId: membership.partnerId,
        partnerName: membership.partnerName,
        email,
        name: membership.contactName.trim() || 'kontaktisik',
      });
    }
  }

  const existing = ctx.tx
    .select()
    .from(partnerRepresentatives)
    .all()
    .filter((row) => !scope.partnerIds || scope.partnerIds.includes(row.partnerId));

  /* 1. retire framework rows that are no longer a lot contact — first, so an
        address moving between companies does not trip the unique index */
  for (const row of existing) {
    if (row.source !== 'framework' || !row.isActive) continue;
    if (desired.has(keyOf(row.partnerId, row.email))) continue;
    ctx.tx
      .update(partnerRepresentatives)
      .set({ isActive: false, deactivatedAt: ctx.at, updatedAt: ctx.at })
      .where(eq(partnerRepresentatives.id, row.id))
      .run();
    report.deactivated.push(row.email);
    logAudit(ctx, {
      eventType: 'representative.synced_from_framework',
      summary: `${row.email} ei ole enam raamlepingu kontaktisik — sisselogimine lõpetatud`,
      before: { email: row.email, isActive: true },
      after: { action: 'deactivated', representativeId: row.id, partnerId: row.partnerId },
    });
  }

  /* 2. create, reactivate or rename the rows the contacts call for */
  const byKey = new Map(existing.map((row) => [keyOf(row.partnerId, row.email), row] as const));
  for (const [key, want] of desired) {
    const row = byKey.get(key);

    if (row?.isActive) {
      // Somebody else's row (an uploaded representative) keeps its own name.
      if (row.source === 'framework' && row.name !== want.name) {
        ctx.tx
          .update(partnerRepresentatives)
          .set({ name: want.name, updatedAt: ctx.at })
          .where(eq(partnerRepresentatives.id, row.id))
          .run();
        report.renamed.push(want.email);
        logAudit(ctx, {
          eventType: 'representative.synced_from_framework',
          summary: `Raamlepingu kontaktisiku nimi muudetud: ${want.email} — ${want.name}`,
          before: { name: row.name },
          after: { action: 'renamed', name: want.name, representativeId: row.id },
        });
      }
      continue;
    }

    const collision = representativeCollision(ctx.tx, want.email, want.partnerId);
    if (collision) {
      report.skipped.push({ email: want.email, partnerName: want.partnerName, reason: collision });
      continue;
    }

    if (row) {
      ctx.tx
        .update(partnerRepresentatives)
        .set({
          name: want.name,
          role: 'esindaja',
          source: 'framework',
          isActive: true,
          deactivatedAt: null,
          updatedAt: ctx.at,
        })
        .where(eq(partnerRepresentatives.id, row.id))
        .run();
      report.reactivated.push(want.email);
      logAudit(ctx, {
        eventType: 'representative.synced_from_framework',
        summary: `${want.email} on taas raamlepingu kontaktisik ja saab sisse logida`,
        after: { action: 'reactivated', representativeId: row.id, partnerId: want.partnerId },
      });
      continue;
    }

    const id = crypto.randomUUID();
    ctx.tx
      .insert(partnerRepresentatives)
      .values({
        id,
        partnerId: want.partnerId,
        name: want.name,
        email: want.email,
        role: 'esindaja',
        source: 'framework',
        phone: '',
        isActive: true,
        createdAt: ctx.at,
        updatedAt: ctx.at,
      })
      .run();
    report.created.push(want.email);
    logAudit(ctx, {
      eventType: 'representative.synced_from_framework',
      summary: `${want.partnerName}: raamlepingu kontaktisik ${want.name} (${want.email}) saab sisse logida`,
      after: { action: 'created', representativeId: id, partnerId: want.partnerId },
    });
  }

  return report;
}

/** True when the sync changed nothing at all — handy for an audit payload. */
export function syncChangedNothing(report: FrameworkContactSyncReport): boolean {
  return (
    report.created.length === 0 &&
    report.reactivated.length === 0 &&
    report.renamed.length === 0 &&
    report.deactivated.length === 0
  );
}

/* ------------------------------------------------------------------ *
 * memberships, edited one row at a time
 * ------------------------------------------------------------------ */

/** Add a company to a lot at the end of its ranking. */
export function addLotPartner(
  ctx: Ctx,
  input: {
    lotId: string;
    regCode: string;
    partnerName: string;
    contactName: string;
    contactEmail: string;
    unitPriceEur: number;
  },
): string {
  const lot = ctx.tx.select().from(lots).where(eq(lots.id, input.lotId)).get();
  if (!lot) throw new Error('Hankeosa ei leitud.');
  const regCode = input.regCode.trim();
  if (!/^\d{8}$/.test(regCode)) throw new Error('Registrikood on 8 numbrit.');
  const contactEmail = input.contactEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(contactEmail)) throw new Error('Kontaktisiku e-posti aadress on vigane.');
  const contactName = input.contactName.trim();
  if (contactName.length < 2) throw new Error('Kontaktisiku nimi on puudu.');
  if (!Number.isFinite(input.unitPriceEur) || input.unitPriceEur < 0) {
    throw new Error('Ühikhind peab olema null või suurem.');
  }

  let partner = ctx.tx.select().from(partners).where(eq(partners.regCode, regCode)).get();
  if (!partner) {
    const name = input.partnerName.trim();
    if (name.length < 2) throw new Error('Uue partneri nimi on puudu.');
    const id = crypto.randomUUID();
    ctx.tx
      .insert(partners)
      .values({ id, name, regCode, isActive: true, createdAt: ctx.at })
      .run();
    logAudit(ctx, {
      eventType: 'partner.created',
      summary: `Partner ${name} (${regCode}) lisatud`,
      after: { name, regCode },
    });
    partner = ctx.tx.select().from(partners).where(eq(partners.id, id)).get()!;
  }

  const existing = ctx.tx
    .select()
    .from(lotPartners)
    .where(and(eq(lotPartners.lotId, input.lotId), eq(lotPartners.partnerId, partner.id)))
    .get();
  if (existing?.isActive) {
    throw new Error(`${partner.name} on juba hankeosa ${lot.code} järjestuses.`);
  }

  const maxRank =
    ctx.tx
      .select({ value: sql<number>`coalesce(max(${lotPartners.rank}), 0)` })
      .from(lotPartners)
      .where(and(eq(lotPartners.lotId, input.lotId), eq(lotPartners.isActive, true)))
      .get()?.value ?? 0;
  const rank = maxRank + 1;
  const fields = {
    rank,
    contactName,
    contactEmail,
    unitPriceEur: input.unitPriceEur,
    isActive: true,
    deactivatedAt: null,
  };

  const lotPartnerId = existing?.id ?? crypto.randomUUID();
  if (existing) {
    ctx.tx.update(lotPartners).set(fields).where(eq(lotPartners.id, existing.id)).run();
  } else {
    ctx.tx
      .insert(lotPartners)
      .values({ id: lotPartnerId, lotId: input.lotId, partnerId: partner.id, createdAt: ctx.at, ...fields })
      .run();
  }

  logAudit(ctx, {
    eventType: 'partner.joined_lot',
    summary: `${partner.name} lisatud hankeosasse ${lot.code}, koht ${rank}`,
    lotId: input.lotId,
    lotPartnerId,
    after: { rank, contactName, contactEmail, unitPriceEur: input.unitPriceEur },
  });
  syncFrameworkContacts(ctx, { partnerIds: [partner.id] });
  return lotPartnerId;
}

/** Edit one membership's contact and price — the one-cell case. */
export function updateLotPartnerContact(
  ctx: Ctx,
  lotPartnerId: string,
  input: { contactName: string; contactEmail: string; unitPriceEur: number },
): void {
  const row = ctx.tx
    .select({
      id: lotPartners.id,
      lotId: lotPartners.lotId,
      partnerId: lotPartners.partnerId,
      lotCode: lots.code,
      partnerName: partners.name,
      contactName: lotPartners.contactName,
      contactEmail: lotPartners.contactEmail,
      unitPriceEur: lotPartners.unitPriceEur,
    })
    .from(lotPartners)
    .innerJoin(lots, eq(lots.id, lotPartners.lotId))
    .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
    .where(eq(lotPartners.id, lotPartnerId))
    .get();
  if (!row) throw new Error('Partneri osalust ei leitud.');

  const contactName = input.contactName.trim();
  const contactEmail = input.contactEmail.trim().toLowerCase();
  if (contactName.length < 2) throw new Error('Kontaktisiku nimi on puudu.');
  if (!EMAIL_RE.test(contactEmail)) throw new Error('Kontaktisiku e-posti aadress on vigane.');
  if (!Number.isFinite(input.unitPriceEur) || input.unitPriceEur < 0) {
    throw new Error('Ühikhind peab olema null või suurem.');
  }
  if (contactEmail !== row.contactEmail) {
    const collision = representativeCollision(ctx.tx, contactEmail, row.partnerId);
    // An address that cannot be a login must not become the official contact:
    // the notices would go somewhere the person cannot answer from.
    if (collision) throw new Error(`Kontaktisiku aadress ei sobi — ${collision}.`);
  }

  const before = {
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    unitPriceEur: row.unitPriceEur,
  };
  const after = { contactName, contactEmail, unitPriceEur: input.unitPriceEur };
  if (
    before.contactName === after.contactName &&
    before.contactEmail === after.contactEmail &&
    before.unitPriceEur === after.unitPriceEur
  ) {
    return;
  }

  ctx.tx.update(lotPartners).set(after).where(eq(lotPartners.id, lotPartnerId)).run();
  logAudit(ctx, {
    eventType: 'partner.contact_changed',
    summary: `${row.partnerName} (${row.lotCode}): kontaktisik ${contactName}, ${contactEmail}`,
    lotId: row.lotId,
    lotPartnerId,
    before,
    after,
  });
  syncFrameworkContacts(ctx, { partnerIds: [row.partnerId] });
}

/**
 * Swap a membership with its nearest active neighbour.
 *
 * Two ranks change, and the partial unique index on (lot, rank) among active
 * rows must hold after every statement — hence the negative parking, the same
 * trick the ranking import uses. Open rounds are untouched: each froze its own
 * ranking at publication [V-07].
 */
export function moveLotPartnerRank(ctx: Ctx, lotPartnerId: string, direction: 'up' | 'down'): void {
  const row = ctx.tx
    .select({
      id: lotPartners.id,
      lotId: lotPartners.lotId,
      rank: lotPartners.rank,
      isActive: lotPartners.isActive,
      partnerName: partners.name,
      lotCode: lots.code,
    })
    .from(lotPartners)
    .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
    .innerJoin(lots, eq(lots.id, lotPartners.lotId))
    .where(eq(lotPartners.id, lotPartnerId))
    .get();
  if (!row) throw new Error('Partneri osalust ei leitud.');
  if (!row.isActive) throw new Error('Lõpetatud osaluse kohta ei saa muuta.');

  const siblings = ctx.tx
    .select({ id: lotPartners.id, rank: lotPartners.rank, partnerId: lotPartners.partnerId })
    .from(lotPartners)
    .where(and(eq(lotPartners.lotId, row.lotId), eq(lotPartners.isActive, true)))
    .all()
    .sort((a, b) => a.rank - b.rank);

  const index = siblings.findIndex((s) => s.id === lotPartnerId);
  const neighbour = direction === 'up' ? siblings[index - 1] : siblings[index + 1];
  if (!neighbour) {
    throw new Error(direction === 'up' ? 'See partner on juba esimesel kohal.' : 'See partner on juba viimasel kohal.');
  }

  const mine = row.rank;
  const theirs = neighbour.rank;
  ctx.tx.update(lotPartners).set({ rank: -Math.abs(mine) - 1_000 }).where(eq(lotPartners.id, row.id)).run();
  ctx.tx.update(lotPartners).set({ rank: mine }).where(eq(lotPartners.id, neighbour.id)).run();
  ctx.tx.update(lotPartners).set({ rank: theirs }).where(eq(lotPartners.id, row.id)).run();

  logAudit(ctx, {
    eventType: 'partner.rank_changed',
    summary: `${row.partnerName}: hankeosas ${row.lotCode} koht ${theirs} (oli ${mine})`,
    lotId: row.lotId,
    lotPartnerId: row.id,
    before: { rank: mine },
    after: { rank: theirs, swappedWith: neighbour.id },
  });
  logAudit(ctx, {
    eventType: 'partner.rank_changed',
    summary: `Kohavahetuse tõttu: hankeosas ${row.lotCode} koht ${mine} (oli ${theirs})`,
    lotId: row.lotId,
    lotPartnerId: neighbour.id,
    before: { rank: theirs },
    after: { rank: mine, swappedWith: row.id },
  });
}

/* ------------------------------------------------------------------ *
 * representatives, edited one row at a time
 * ------------------------------------------------------------------ */

export function addRepresentative(
  ctx: Ctx,
  input: { partnerId: string; name: string; email: string; role: RepresentativeRole; phone: string },
): string {
  const partner = ctx.tx.select().from(partners).where(eq(partners.id, input.partnerId)).get();
  if (!partner) throw new Error('Partnerit ei leitud.');
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2) throw new Error('Esindaja nimi on puudu.');
  const collision = representativeCollision(ctx.tx, email, input.partnerId);
  if (collision) throw new Error(`Esindajat ei saa lisada — ${collision}.`);

  const existing = ctx.tx
    .select()
    .from(partnerRepresentatives)
    .where(
      and(eq(partnerRepresentatives.partnerId, input.partnerId), eq(partnerRepresentatives.email, email)),
    )
    .get();

  const source: RepresentativeSource = existing?.source === 'framework' ? 'framework' : 'manual';
  const fields = {
    name,
    role: input.role,
    phone: input.phone.trim(),
    source,
    isActive: true,
    deactivatedAt: null,
    updatedAt: ctx.at,
  };

  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    ctx.tx.update(partnerRepresentatives).set(fields).where(eq(partnerRepresentatives.id, id)).run();
  } else {
    ctx.tx
      .insert(partnerRepresentatives)
      .values({ id, partnerId: input.partnerId, email, createdAt: ctx.at, ...fields })
      .run();
  }

  logAudit(ctx, {
    eventType: existing ? 'representative.activated' : 'representative.created',
    summary: `${partner.name}: esindaja ${name} (${email}) saab sisse logida`,
    after: { representativeId: id, email, role: input.role, source },
  });
  return id;
}

export function updateRepresentative(
  ctx: Ctx,
  representativeId: string,
  input: { name: string; role: RepresentativeRole; phone: string },
): void {
  const row = ctx.tx
    .select()
    .from(partnerRepresentatives)
    .where(eq(partnerRepresentatives.id, representativeId))
    .get();
  if (!row) throw new Error('Esindajat ei leitud.');
  const name = input.name.trim();
  if (name.length < 2) throw new Error('Esindaja nimi on puudu.');

  const before = { name: row.name, role: row.role, phone: row.phone };
  const after = { name, role: input.role, phone: input.phone.trim() };
  if (before.name === after.name && before.role === after.role && before.phone === after.phone) return;

  ctx.tx
    .update(partnerRepresentatives)
    .set({ ...after, updatedAt: ctx.at })
    .where(eq(partnerRepresentatives.id, representativeId))
    .run();
  logAudit(ctx, {
    eventType: 'representative.updated',
    summary: `Esindaja ${name} (${row.email}) andmed muudetud`,
    before,
    after,
  });
}

/* ------------------------------------------------------------------ *
 * reading, for the screens
 * ------------------------------------------------------------------ */

export interface FrameworkLotView {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  blockers: string[];
  members: Array<{
    lotPartnerId: string;
    partnerId: string;
    partnerName: string;
    regCode: string;
    rank: number;
    contactName: string;
    contactEmail: string;
    unitPriceEur: number;
    isActive: boolean;
    /** whether the official contact can actually sign in, and why not */
    signIn: { active: boolean; reason: string };
  }>;
}

export function frameworkLots(tx: Reader): FrameworkLotView[] {
  const lotRows = tx.select().from(lots).all().sort((a, b) => a.code.localeCompare(b.code));
  const memberships = tx
    .select({
      lotPartnerId: lotPartners.id,
      lotId: lotPartners.lotId,
      partnerId: lotPartners.partnerId,
      partnerName: partners.name,
      regCode: partners.regCode,
      rank: lotPartners.rank,
      contactName: lotPartners.contactName,
      contactEmail: lotPartners.contactEmail,
      unitPriceEur: lotPartners.unitPriceEur,
      isActive: lotPartners.isActive,
    })
    .from(lotPartners)
    .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
    .all();

  const representatives = tx.select().from(partnerRepresentatives).all();
  const activeByKey = new Set<string>(
    representatives.filter((r) => r.isActive).map((r) => `${r.partnerId}#${r.email}`),
  );

  return lotRows.map((lot) => ({
    id: lot.id,
    code: lot.code,
    name: lot.name,
    description: lot.description,
    isActive: lot.isActive,
    blockers: lotDeactivationBlockers(tx, lot.id),
    members: memberships
      .filter((m) => m.lotId === lot.id)
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.rank - b.rank)
      .map((m) => {
        const email = m.contactEmail.trim().toLowerCase();
        const active = activeByKey.has(`${m.partnerId}#${email}`);
        return {
          ...m,
          signIn: {
            active,
            reason: active ? '' : representativeCollision(tx, email, m.partnerId) ?? 'sisselogimine puudub',
          },
        };
      }),
  }));
}

/** Active representatives of one company, for the Raamhange and Esindajad screens. */
export function representativesOf(tx: Reader, partnerId: string) {
  return tx
    .select()
    .from(partnerRepresentatives)
    .where(eq(partnerRepresentatives.partnerId, partnerId))
    .all()
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
}

/**
 * Framework-related audit rows, newest first — the „Muudatuste logi“ panel.
 *
 * Queried by event-type prefix straight from the indexed column, rather than
 * the way the audit page does it (newest thousand rows, filtered in JS): a
 * framework change from last month must not fall out of the list because a
 * busy round happened since.
 */
export function frameworkChangeLog(tx: Reader, limit = 40) {
  const prefixes = ['framework.', 'lot.', 'partner.', 'representative.', 'import.framework_imported'];
  return tx
    .select({
      id: auditEvents.id,
      occurredAt: auditEvents.occurredAt,
      actorLabel: auditEvents.actorLabel,
      viaLabel: auditEvents.viaLabel,
      eventType: auditEvents.eventType,
      summary: auditEvents.summary,
      before: auditEvents.before,
      after: auditEvents.after,
    })
    .from(auditEvents)
    .where(or(...prefixes.map((prefix) => like(auditEvents.eventType, `${prefix}%`))))
    .orderBy(desc(auditEvents.id))
    .limit(limit)
    .all();
}
