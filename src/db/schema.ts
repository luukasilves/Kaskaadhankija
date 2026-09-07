/**
 * Database schema — SQLite via drizzle.
 *
 * Mirrors the entities of `docs/kaskaadi-ariloogika.md` field for field. Rule
 * IDs in comments point at the rule a column exists to serve.
 *
 * Conventions:
 *  - ids are UUID text; every entity the spec names also carries a human code
 *  - timestamps are plain integer epoch milliseconds (the domain and
 *    `format.ts` both take numbers, so no driver-side date mapping)
 *  - booleans are integers with `mode: 'boolean'`
 *  - "enums" are text columns typed by a TS union and constrained by CHECK
 *  - blobs that are always read whole are JSON text columns
 *  - `confirmations`, `buyer_adjustments` and `audit_events` are append-only,
 *    enforced by triggers in the custom migration [D-08]
 */

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type {
  OrderKind,
  OrderStatus,
  ParticipantOutcomeAtClose,
  RoundStatus,
  TargetGroup,
  TrainingStatus,
  VisibilityMode,
} from '../domain/round-statuses';
import type { County, OrderLanguage, WorkshopType } from '../domain/statuses';
import type { AllocationInput, AllocationResult } from '../domain/allocate';

const uuid = () => text().$defaultFn(() => crypto.randomUUID());

/** Every "enum" column gets a CHECK so bad data cannot enter outside the app. */
const oneOf = (column: string, values: readonly string[]) =>
  check(`${column}_check`, sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(', ')})`));

/* ------------------------------------------------------------------ *
 * users (buyer team)
 * ------------------------------------------------------------------ */

export const users = sqliteTable(
  'users',
  {
    id: uuid().primaryKey(),
    name: text().notNull(),
    email: text().notNull(),
    role: text().$type<'admin' | 'member'>().notNull().default('member'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email), oneOf('role', ['admin', 'member'])],
);

/* ------------------------------------------------------------------ *
 * lots (hankeosad) — cascade configuration lives here
 * ------------------------------------------------------------------ */

export const lots = sqliteTable(
  'lots',
  {
    id: uuid().primaryKey(),
    /** OSA-1 … OSA-4 */
    code: text().notNull(),
    name: text().notNull(),
    description: text().notNull().default(''),
    /** [V-03] default response window, in Estonian working days */
    responseDeadlineWorkingDays: integer('response_deadline_working_days').notNull().default(3),
    /** [V-03] Tallinn wall-clock time the deadline falls at, 'HH:MM' */
    deadlineLocalTime: text('deadline_local_time').notNull().default('17:00'),
    /** [T-07][L-09] how long the buyer expects to take over the review */
    reviewWorkingDays: integer('review_working_days').notNull().default(2),
    /** [T-03] warning level only — never acts on its own */
    workloadThreshold: integer('workload_threshold').notNull().default(25),
    /** [N-03][N-06] */
    defaultVisibilityMode: text('default_visibility_mode')
      .$type<VisibilityMode>()
      .notNull()
      .default('dynamic'),
    /** set when the threshold is a deliberately low test value */
    thresholdNote: text('threshold_note').notNull().default(''),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('lots_code_unique').on(t.code),
    oneOf('default_visibility_mode', ['dynamic', 'sealed']),
  ],
);

/* ------------------------------------------------------------------ *
 * partners and their per-lot framework membership
 * ------------------------------------------------------------------ */

export const partners = sqliteTable(
  'partners',
  {
    id: uuid().primaryKey(),
    name: text().notNull(),
    /** äriregistrikood, 8 digits */
    regCode: text('reg_code').notNull(),
    notes: text().notNull().default(''),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('partners_reg_code_unique').on(t.regCode)],
);

/**
 * One partner's membership of one lot, carrying the rank from the tender
 * evaluation. This is the row the cascade actually ranks.
 */
export const lotPartners = sqliteTable(
  'lot_partners',
  {
    id: uuid().primaryKey(),
    lotId: text('lot_id')
      .notNull()
      .references(() => lots.id),
    partnerId: text('partner_id')
      .notNull()
      .references(() => partners.id),
    /** 1 = highest priority [J-04] */
    rank: integer().notNull(),
    contactName: text('contact_name').notNull(),
    contactEmail: text('contact_email').notNull(),
    unitPriceEur: real('unit_price_eur').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    deactivatedAt: integer('deactivated_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('lot_partners_lot_partner_unique').on(t.lotId, t.partnerId),
    // [E-08] ranks are unique among active members, so ties cannot occur.
    // Partial, so deactivating a partner frees their rank.
    uniqueIndex('lot_partners_lot_rank_unique')
      .on(t.lotId, t.rank)
      .where(sql`is_active = 1`),
    index('lot_partners_lot_idx').on(t.lotId),
  ],
);

/**
 * The people who may act for a partner company: its contractual representatives
 * and their deputies, from the list the buyer uploads. They receive the formal
 * notices [D-10] and they are who can sign in for the company [R-02]. Scoped to
 * the company, not to a lot; the lot membership keeps the framework-agreement
 * contact as evidence and as the fallback recipient.
 */
export const partnerRepresentatives = sqliteTable(
  'partner_representatives',
  {
    id: uuid().primaryKey(),
    partnerId: text('partner_id')
      .notNull()
      .references(() => partners.id),
    name: text().notNull(),
    /** lowercased; unique among active representatives */
    email: text().notNull(),
    role: text().$type<RepresentativeRole>().notNull().default('esindaja'),
    phone: text().notNull().default(''),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    deactivatedAt: integer('deactivated_at'),
    importBatchId: text('import_batch_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    // One person signs in as one company: an address is active for at most one.
    uniqueIndex('partner_representatives_email_active_unique')
      .on(t.email)
      .where(sql`is_active = 1`),
    index('partner_representatives_partner_idx').on(t.partnerId),
    oneOf('role', ['esindaja', 'asendaja']),
  ],
);

export type RepresentativeRole = 'esindaja' | 'asendaja';

/* ------------------------------------------------------------------ *
 * trainings (koolituskalender)
 * ------------------------------------------------------------------ */

export const trainings = sqliteTable(
  'trainings',
  {
    id: uuid().primaryKey(),
    /** KK-2026-101 — stable across re-imports, so [E-09] identity survives */
    code: text().notNull(),
    lotId: text('lot_id')
      .notNull()
      .references(() => lots.id),
    title: text().notNull(),
    workshopType: text('workshop_type').$type<WorkshopType>().notNull(),
    /** ISO day, 'YYYY-MM-DD' */
    eventDate: text('event_date').notNull(),
    eventEnd: text('event_end'),
    county: text().$type<County>().notNull(),
    locationText: text('location_text').notNull().default(''),
    /** the programme's "vertikaal" */
    targetGroup: text('target_group').$type<TargetGroup>().notNull(),
    participantCount: integer('participant_count').notNull(),
    language: text().$type<OrderLanguage>().notNull(),
    estimatedValueEur: real('estimated_value_eur').notNull().default(0),
    notes: text().notNull().default(''),
    status: text().$type<TrainingStatus>().notNull().default('unassigned'),
    /** the open round this training currently sits in [E-09] */
    currentRoundId: text('current_round_id'),
    /** set when a round left it unallocated [T-06] */
    leftoverFromRoundId: text('leftover_from_round_id'),
    allocatedLotPartnerId: text('allocated_lot_partner_id'),
    orderId: text('order_id'),
    completedAt: integer('completed_at'),
    cancelledAt: integer('cancelled_at'),
    cancelReason: text('cancel_reason').notNull().default(''),
    /** provenance of an imported row */
    importBatchId: text('import_batch_id'),
    createdAt: integer('created_at').notNull(),
    createdBy: text('created_by').notNull().default(''),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('trainings_code_unique').on(t.code),
    index('trainings_status_idx').on(t.status),
    index('trainings_lot_idx').on(t.lotId),
    index('trainings_round_idx').on(t.currentRoundId),
    index('trainings_allocated_idx').on(t.allocatedLotPartnerId),
    oneOf('status', [
      'unassigned',
      'in_round',
      'leftover',
      'allocated',
      'completed',
      'cancelled',
    ]),
    oneOf('workshop_type', ['tootuba_1', 'tootuba_2', 'suursundmus', 'muu']),
    oneOf('language', ['et', 'ru', 'en']),
  ],
);

/* ------------------------------------------------------------------ *
 * rounds (voorud)
 * ------------------------------------------------------------------ */

/** Frozen input + result of one allocation run [J-03]. */
export interface AllocationSnapshot {
  input: AllocationInput;
  result: AllocationResult;
  computedAt: number;
  algorithmVersion: number;
}

export const rounds = sqliteTable(
  'rounds',
  {
    id: uuid().primaryKey(),
    /** VOOR-2026-003 */
    code: text().notNull(),
    lotId: text('lot_id')
      .notNull()
      .references(() => lots.id),
    status: text().$type<RoundStatus>().notNull().default('draft'),
    visibilityMode: text('visibility_mode').$type<VisibilityMode>().notNull().default('dynamic'),
    /** [V-03] config frozen at publication, so later lot edits cannot change a live round */
    workloadThresholdSnapshot: integer('workload_threshold_snapshot').notNull().default(25),
    responseWorkingDaysSnapshot: integer('response_working_days_snapshot').notNull().default(3),
    note: text().notNull().default(''),
    publishedAt: integer('published_at'),
    deadlineAt: integer('deadline_at'),
    /** [T-07] when partners are told to expect the decision */
    expectedDecisionAt: integer('expected_decision_at'),
    closedAt: integer('closed_at'),
    /** [V-06] the proposal, frozen at the deadline */
    proposalSnapshot: text('proposal_snapshot', { mode: 'json' }).$type<AllocationSnapshot>(),
    /** [T-04] the final allocation, after buyer adjustments */
    finalSnapshot: text('final_snapshot', { mode: 'json' }).$type<AllocationSnapshot>(),
    confirmedAt: integer('confirmed_at'),
    confirmedBy: text('confirmed_by'),
    cancelledAt: integer('cancelled_at'),
    cancelReason: text('cancel_reason').notNull().default(''),
    /** set when this round was created from another round's jääk [T-06] */
    originRoundId: text('origin_round_id'),
    createdAt: integer('created_at').notNull(),
    createdBy: text('created_by').notNull(),
  },
  (t) => [
    uniqueIndex('rounds_code_unique').on(t.code),
    index('rounds_status_idx').on(t.status),
    index('rounds_lot_idx').on(t.lotId),
    index('rounds_deadline_idx').on(t.deadlineAt),
    oneOf('status', ['draft', 'open', 'closed', 'confirmed', 'cancelled']),
    oneOf('visibility_mode', ['dynamic', 'sealed']),
  ],
);

/**
 * Which trainings a round covers. A withdrawn row stays for the record; the
 * allocation input simply excludes it [V-04]. A training's rows across rounds
 * are its history [E-09].
 */
export const roundTrainings = sqliteTable(
  'round_trainings',
  {
    id: uuid().primaryKey(),
    roundId: text('round_id')
      .notNull()
      .references(() => rounds.id),
    trainingId: text('training_id')
      .notNull()
      .references(() => trainings.id),
    addedAt: integer('added_at').notNull(),
    withdrawnAt: integer('withdrawn_at'),
    withdrawnReason: text('withdrawn_reason').notNull().default(''),
    withdrawnBy: text('withdrawn_by'),
  },
  (t) => [
    uniqueIndex('round_trainings_unique').on(t.roundId, t.trainingId),
    index('round_trainings_round_idx').on(t.roundId),
    index('round_trainings_training_idx').on(t.trainingId),
  ],
);

/**
 * One partner's participation in one round. Created for **every** active
 * partner of the lot at publication — there is no way to invite a subset
 * [V-01]. `rankAtPublication` is the V-03/V-07 ranking snapshot.
 */
export const roundParticipants = sqliteTable(
  'round_participants',
  {
    id: uuid().primaryKey(),
    roundId: text('round_id')
      .notNull()
      .references(() => rounds.id),
    lotPartnerId: text('lot_partner_id')
      .notNull()
      .references(() => lotPartners.id),
    /** [V-07] rank frozen at publication */
    rankAtPublication: integer('rank_at_publication').notNull(),
    /** [D-09] contact as of publication, kept as evidence */
    contactNameSnapshot: text('contact_name_snapshot').notNull(),
    contactEmailSnapshot: text('contact_email_snapshot').notNull(),
    /** [K-02] the partner's editable draft; only confirmations bind */
    draftMarks: text('draft_marks', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    draftCap: integer('draft_cap'),
    draftUpdatedAt: integer('draft_updated_at'),
    /** [E-01] deactivated mid-round */
    excludedAt: integer('excluded_at'),
    excludedReason: text('excluded_reason').notNull().default(''),
    /** [K-08] stored at close, so non-response is a recorded outcome */
    outcomeAtClose: text('outcome_at_close').$type<ParticipantOutcomeAtClose>(),
    /** [D-04] rate limiting for projection-change notices */
    lastProjectionCount: integer('last_projection_count'),
    lastProjectionNotifiedAt: integer('last_projection_notified_at'),
    /** [D-05] */
    reminderSentAt: integer('reminder_sent_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('round_participants_unique').on(t.roundId, t.lotPartnerId),
    uniqueIndex('round_participants_rank_unique').on(t.roundId, t.rankAtPublication),
    index('round_participants_round_idx').on(t.roundId),
    index('round_participants_lot_partner_idx').on(t.lotPartnerId),
    oneOf('outcome_at_close', ['confirmed', 'declined_all', 'no_response', 'excluded']),
  ],
);

/**
 * Append-only record of partner answers [K-02][K-09]. The binding one is the
 * latest at or before the cut [K-04]; the autoincrement id breaks a
 * same-millisecond tie, which the virtual test clock makes reachable.
 */
export const confirmations = sqliteTable(
  'confirmations',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    roundId: text('round_id')
      .notNull()
      .references(() => rounds.id),
    lotPartnerId: text('lot_partner_id')
      .notNull()
      .references(() => lotPartners.id),
    kind: text().$type<'confirm' | 'decline_all'>().notNull(),
    marks: text({ mode: 'json' }).$type<string[]>().notNull(),
    /** [K-06] "võtan vastu kuni N koolitust" */
    cap: integer(),
    confirmedAt: integer('confirmed_at').notNull(),
    actorLabel: text('actor_label').notNull(),
    contactEmail: text('contact_email').notNull().default(''),
    ip: text().notNull().default(''),
    ua: text().notNull().default(''),
    source: text().$type<'ui' | 'seed'>().notNull().default('ui'),
  },
  (t) => [
    index('confirmations_round_partner_idx').on(t.roundId, t.lotPartnerId),
    index('confirmations_round_idx').on(t.roundId),
    oneOf('kind', ['confirm', 'decline_all']),
  ],
);

/**
 * Append-only record of the buyer's discretionary adjustments [T-02]. The
 * effective adjustment per partner is the latest row unless it is a `clear`.
 * Justification is mandatory for skip and cap, enforced in the engine.
 */
export const buyerAdjustments = sqliteTable(
  'buyer_adjustments',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    roundId: text('round_id')
      .notNull()
      .references(() => rounds.id),
    lotPartnerId: text('lot_partner_id')
      .notNull()
      .references(() => lotPartners.id),
    kind: text().$type<'skip' | 'cap' | 'clear'>().notNull(),
    capValue: integer('cap_value'),
    justification: text().notNull().default(''),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('buyer_adjustments_round_idx').on(t.roundId),
    oneOf('kind', ['skip', 'cap', 'clear']),
  ],
);

/* ------------------------------------------------------------------ *
 * orders (tellimused) — the call-off contract [T-05]
 * ------------------------------------------------------------------ */

/** Everything the printable order shows, frozen at confirmation. */
export interface OrderDocument {
  frameworkReference: string;
  lotCode: string;
  lotName: string;
  roundCode: string;
  partnerName: string;
  partnerRegCode: string;
  contactName: string;
  contactEmail: string;
  trainings: Array<{
    code: string;
    title: string;
    workshopType: string;
    eventDate: string;
    eventEnd: string | null;
    county: string;
    locationText: string;
    participantCount: number;
    language: string;
    unitPriceEur: number;
  }>;
  totalEur: number;
  partnerConfirmedAt: number | null;
  buyerConfirmedAt: number;
  buyerConfirmedBy: string;
}

export const orders = sqliteTable(
  'orders',
  {
    id: uuid().primaryKey(),
    orderYear: integer('order_year').notNull(),
    orderSeq: integer('order_seq').notNull(),
    roundId: text('round_id')
      .notNull()
      .references(() => rounds.id),
    lotId: text('lot_id')
      .notNull()
      .references(() => lots.id),
    lotPartnerId: text('lot_partner_id')
      .notNull()
      .references(() => lotPartners.id),
    kind: text().$type<OrderKind>().notNull().default('allocation'),
    /** [T-05] the confirmation that binds the partner to this order */
    partnerConfirmationId: integer('partner_confirmation_id').references(() => confirmations.id),
    partnerConfirmedAt: integer('partner_confirmed_at'),
    buyerConfirmedAt: integer('buyer_confirmed_at').notNull(),
    buyerConfirmedBy: text('buyer_confirmed_by').notNull(),
    /** required for a manual assignment [T-06b] */
    justification: text().notNull().default(''),
    status: text().$type<OrderStatus>().notNull().default('active'),
    documentSnapshot: text('document_snapshot', { mode: 'json' }).$type<OrderDocument>().notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('orders_number_unique').on(t.orderYear, t.orderSeq),
    // One allocation order per partner per round — the double-confirm backstop.
    uniqueIndex('orders_round_partner_unique')
      .on(t.roundId, t.lotPartnerId)
      .where(sql`kind = 'allocation'`),
    index('orders_round_idx').on(t.roundId),
    index('orders_lot_partner_idx').on(t.lotPartnerId),
    oneOf('kind', ['allocation', 'manual']),
    oneOf('status', ['active', 'completed', 'cancelled']),
  ],
);

export const orderTrainings = sqliteTable(
  'order_trainings',
  {
    id: uuid().primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    trainingId: text('training_id')
      .notNull()
      .references(() => trainings.id),
    unitPriceEur: real('unit_price_eur').notNull().default(0),
    /** [E-07] buyer cancelled this training after confirmation */
    cancelledAt: integer('cancelled_at'),
    cancelReason: text('cancel_reason').notNull().default(''),
    /** [E-07] partner withdrew after confirmation — for contract follow-up */
    partnerWithdrewAt: integer('partner_withdrew_at'),
    partnerWithdrawNote: text('partner_withdraw_note').notNull().default(''),
  },
  (t) => [
    uniqueIndex('order_trainings_unique').on(t.orderId, t.trainingId),
    index('order_trainings_order_idx').on(t.orderId),
  ],
);

/* ------------------------------------------------------------------ *
 * audit and notifications
 * ------------------------------------------------------------------ */

/**
 * Append-only event log [D-08]. Primary evidence: order documents are derived
 * from it, never the other way round. Triggers block UPDATE and DELETE.
 */
export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    /** virtual clock instant, so test-mode entries are internally consistent */
    occurredAt: integer('occurred_at').notNull(),
    actorType: text('actor_type').$type<'buyer' | 'partner' | 'system' | 'tester'>().notNull(),
    actorId: text('actor_id'),
    actorLabel: text('actor_label').notNull(),
    eventType: text('event_type').notNull(),
    /** Estonian one-liner shown in the audit table */
    summary: text().notNull(),
    lotId: text('lot_id'),
    roundId: text('round_id'),
    trainingId: text('training_id'),
    lotPartnerId: text('lot_partner_id'),
    orderId: text('order_id'),
    /** [D-08] enne/pärast */
    before: text({ mode: 'json' }),
    after: text({ mode: 'json' }),
    ip: text().notNull().default(''),
    ua: text().notNull().default(''),
  },
  (t) => [
    index('audit_round_idx').on(t.roundId),
    index('audit_training_idx').on(t.trainingId),
    index('audit_type_idx').on(t.eventType),
    index('audit_occurred_idx').on(t.occurredAt),
    oneOf('actor_type', ['buyer', 'partner', 'system', 'tester']),
  ],
);

export type NotificationType =
  | 'round_published'
  | 'confirmation_receipt'
  | 'decline_receipt'
  | 'projection_changed'
  | 'reminder_24h'
  | 'round_changed'
  | 'round_cancelled'
  | 'participant_excluded'
  | 'order_issued'
  | 'allocated_elsewhere'
  | 'buyer_round_closed'
  | 'buyer_round_confirmed'
  | 'late_action_rejected';

/**
 * In-app notification log — the primary channel, and the record of what each
 * recipient was told. What happened to the e-mail copies lives per recipient in
 * `email_deliveries`.
 */
export const notifications = sqliteTable(
  'notifications',
  {
    id: uuid().primaryKey(),
    createdAt: integer('created_at').notNull(),
    recipientKind: text('recipient_kind').$type<'buyer' | 'partner'>().notNull(),
    recipientLotPartnerId: text('recipient_lot_partner_id').references(() => lotPartners.id),
    type: text().$type<NotificationType>().notNull(),
    roundId: text('round_id'),
    orderId: text('order_id'),
    title: text().notNull(),
    body: text().notNull(),
    bodyHtml: text('body_html').notNull().default(''),
    readAt: integer('read_at'),
  },
  (t) => [
    index('notifications_recipient_idx').on(t.recipientKind, t.recipientLotPartnerId),
    index('notifications_round_idx').on(t.roundId),
    index('notifications_created_idx').on(t.createdAt),
    oneOf('recipient_kind', ['buyer', 'partner']),
  ],
);

export type EmailDeliveryStatus = 'queued' | 'sent' | 'failed' | 'suppressed' | 'skipped';

/**
 * One e-mail to one recipient of one notification [D-10]. Created as `queued`
 * inside the notifying transaction; the outcome of each attempt is written back
 * afterwards, on wall-clock time. `suppressed` is the test environment's
 * allowlist refusing an address; `skipped` is the absence of a transport.
 */
export const emailDeliveries = sqliteTable(
  'email_deliveries',
  {
    id: uuid().primaryKey(),
    notificationId: text('notification_id')
      .notNull()
      .references(() => notifications.id),
    to: text().notNull(),
    status: text().$type<EmailDeliveryStatus>().notNull().default('queued'),
    attempts: integer().notNull().default(0),
    /** the server's response, the error, or the rule that stopped it */
    detail: text().notNull().default(''),
    lastAttemptAt: integer('last_attempt_at'),
    sentAt: integer('sent_at'),
    messageId: text('message_id').notNull().default(''),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('email_deliveries_notification_idx').on(t.notificationId),
    index('email_deliveries_status_idx').on(t.status),
    oneOf('status', ['queued', 'sent', 'failed', 'suppressed', 'skipped']),
  ],
);

/* ------------------------------------------------------------------ *
 * imports
 * ------------------------------------------------------------------ */

export type ImportKind = 'trainings' | 'partners' | 'representatives';

export interface ImportSummary {
  total: number;
  valid: number;
  created: number;
  updated: number;
  locked: number;
  withErrors: number;
  withWarnings: number;
}

/**
 * A previewed or completed import. Parsed rows are stored server-side so the
 * file is uploaded once and the preview can be confirmed later.
 */
export const importBatches = sqliteTable(
  'import_batches',
  {
    id: uuid().primaryKey(),
    kind: text().$type<ImportKind>().notNull(),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size').notNull().default(0),
    source: text().$type<'upload' | 'seed' | 'sample'>().notNull().default('upload'),
    status: text().$type<'previewed' | 'imported' | 'discarded'>().notNull().default('previewed'),
    /** normalised rows plus per-row diagnostics */
    rowsJson: text('rows_json', { mode: 'json' }).notNull(),
    summary: text({ mode: 'json' }).$type<ImportSummary>().notNull(),
    options: text({ mode: 'json' }).notNull().default(sql`'{}'`),
    actorId: text('actor_id'),
    actorLabel: text('actor_label').notNull(),
    createdAt: integer('created_at').notNull(),
    importedAt: integer('imported_at'),
  },
  (t) => [
    index('import_batches_kind_idx').on(t.kind, t.status),
    oneOf('kind', ['trainings', 'partners', 'representatives']),
    oneOf('source', ['upload', 'seed', 'sample']),
    oneOf('status', ['previewed', 'imported', 'discarded']),
  ],
);

/* ------------------------------------------------------------------ *
 * app state — one row
 * ------------------------------------------------------------------ */

/**
 * Single-row table holding the virtual clock offset. Every engine `now()` reads
 * it, so one transaction sees one consistent instant. Always 0 in production.
 */
export const appState = sqliteTable(
  'app_state',
  {
    id: integer().primaryKey(),
    clockOffsetMs: integer('clock_offset_ms').notNull().default(0),
    seedVersion: integer('seed_version').notNull().default(0),
    seededAt: integer('seeded_at'),
    lastJobsRunAt: integer('last_jobs_run_at'),
  },
  (t) => [check('app_state_single_row', sql`${t.id} = 1`)],
);

/* ------------------------------------------------------------------ *
 * order numbering
 * ------------------------------------------------------------------ */

/** Per-year sequence for KH-YYYY-NNNN, incremented inside the write transaction. */
export const orderSequences = sqliteTable(
  'order_sequences',
  {
    year: integer().notNull(),
    lastSeq: integer('last_seq').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.year] })],
);

/** Per-year sequence for VOOR-YYYY-NNN. */
export const roundSequences = sqliteTable(
  'round_sequences',
  {
    year: integer().notNull(),
    lastSeq: integer('last_seq').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.year] })],
);
