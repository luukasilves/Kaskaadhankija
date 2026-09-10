/**
 * Audit logging [D-08].
 *
 * Always called with the same `tx` as the mutation it describes, so the record
 * and the change are one atomic fact. The table is append-only at the database
 * level (triggers), and there is deliberately no update or delete helper here.
 */

import { auditEvents } from '@/db/schema';
import type { Ctx } from './context';

/**
 * Event names, grouped by the section of the spec they belong to. Kept as a
 * union so a typo becomes a compile error and the audit log stays greppable.
 */
export type AuditEventType =
  // rounds [V]
  | 'round.created'
  | 'round.updated'
  | 'round.published'
  | 'round.deadline_extended'
  | 'round.training_withdrawn'
  | 'round.cancelled'
  | 'round.closed'
  | 'round.confirmed'
  | 'round.late_action_rejected'
  // partner answers [K]
  | 'marks.draft_saved'
  | 'marks.confirmed'
  | 'marks.declined_all'
  // buyer review [T]
  | 'adjustment.applied'
  | 'adjustment.cleared'
  | 'order.created'
  | 'order.training_cancelled'
  | 'order.partner_withdrew'
  | 'order.completed'
  // trainings
  | 'training.created'
  | 'training.updated'
  | 'training.cancelled'
  | 'training.completed'
  | 'training.leftover_reissued'
  | 'training.leftover_cancelled'
  // participants [E-01]
  | 'participant.excluded'
  // lots and partners
  | 'lot.config_changed'
  | 'partner.created'
  | 'partner.rank_changed'
  | 'partner.deactivated'
  | 'partner.activated'
  // representatives [R-02][D-10]
  | 'representative.created'
  | 'representative.updated'
  | 'representative.deactivated'
  | 'representative.activated'
  // buyer team [R-01]
  | 'team.member_added'
  | 'team.member_updated'
  // sign-in [L-08] — never the code itself
  | 'login.code_requested'
  | 'login.rate_limited'
  | 'login.succeeded'
  | 'login.failed'
  | 'login.locked'
  | 'login.signed_out'
  // imports
  | 'import.previewed'
  | 'import.trainings_imported'
  | 'import.partners_imported'
  | 'import.representatives_imported'
  | 'import.round_imported'
  | 'import.discarded';

export interface AuditInput {
  eventType: AuditEventType;
  /** one Estonian sentence, shown verbatim in the audit table */
  summary: string;
  lotId?: string | null;
  roundId?: string | null;
  trainingId?: string | null;
  lotPartnerId?: string | null;
  orderId?: string | null;
  before?: unknown;
  after?: unknown;
}

export function logAudit(ctx: Ctx, input: AuditInput): void {
  ctx.tx
    .insert(auditEvents)
    .values({
      occurredAt: ctx.at,
      actorType: ctx.actor.kind,
      actorId: ctx.actor.id,
      actorLabel: ctx.actor.label,
      viaUserId: ctx.actor.via?.userId ?? null,
      viaLabel: ctx.actor.via?.label ?? null,
      eventType: input.eventType,
      summary: input.summary,
      lotId: input.lotId ?? null,
      roundId: input.roundId ?? null,
      trainingId: input.trainingId ?? null,
      lotPartnerId: input.lotPartnerId ?? null,
      orderId: input.orderId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      ip: ctx.evidence.ip,
      ua: ctx.evidence.ua,
    })
    .run();
}
