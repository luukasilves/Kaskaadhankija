/**
 * Vocabulary of the parallel cascade: statuses, their legal transitions, and
 * the Estonian labels the UI and notifications use.
 *
 * Pure, so the server, the tests and any future client agree on what a status
 * means. Mirrors sections M, V and N of `docs/kaskaadi-ariloogika.md`.
 */

import type { CapKind, NotProjectedReason, TrainingViewState } from './allocate';

/* ------------------------------------------------------------------ *
 * voor [V-02]
 * ------------------------------------------------------------------ */

export type RoundStatus = 'draft' | 'open' | 'closed' | 'confirmed' | 'cancelled';

export const ROUND_STATUS_LABELS: Record<RoundStatus, string> = {
  draft: 'Mustand',
  open: 'Avatud',
  closed: 'Suletud, ootab kinnitust',
  confirmed: 'Kinnitatud',
  cancelled: 'Tühistatud',
};

/**
 * [V-02]. Note there is deliberately no `closed → cancelled`: a closed round is
 * finished by confirming it, if necessary after skipping every partner so that
 * everything becomes jääk and is handled under [T-06]. Recorded as L-12.
 */
const ROUND_TRANSITIONS: Record<RoundStatus, readonly RoundStatus[]> = {
  draft: ['open', 'cancelled'],
  open: ['closed', 'cancelled'],
  closed: ['confirmed'],
  confirmed: [],
  cancelled: [],
};

export function canTransitionRound(from: RoundStatus, to: RoundStatus): boolean {
  return ROUND_TRANSITIONS[from].includes(to);
}

/** Only a draft round's contents may be edited freely. [V-04] */
export function isRoundEditable(status: RoundStatus): boolean {
  return status === 'draft';
}

export type VisibilityMode = 'dynamic' | 'sealed';

export const VISIBILITY_MODE_LABELS: Record<VisibilityMode, string> = {
  dynamic: 'Dünaamiline — partner näeb eesõigusega märgete mõju',
  sealed: 'Suletud — partner näeb ainult oma märkeid',
};

/* ------------------------------------------------------------------ *
 * koolitus
 * ------------------------------------------------------------------ */

export type TrainingStatus =
  | 'unassigned'
  | 'in_round'
  | 'leftover'
  | 'allocated'
  | 'completed'
  | 'cancelled';

export const TRAINING_STATUS_LABELS: Record<TrainingStatus, string> = {
  unassigned: 'Jaotamata',
  in_round: 'Voorus',
  leftover: 'Jääk — ootab otsust',
  allocated: 'Määratud',
  completed: 'Lõpetatud',
  cancelled: 'Tühistatud',
};

/** A training may enter a round only from these states. [E-09] */
export function canEnterRound(status: TrainingStatus): boolean {
  return status === 'unassigned' || status === 'leftover';
}

/** An import may overwrite a training only while nothing relies on it. [V-04] */
export function isTrainingImportable(status: TrainingStatus): boolean {
  return status === 'unassigned' || status === 'leftover';
}

/* ------------------------------------------------------------------ *
 * partneri vastus
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * tellija rollid [R-01]
 * ------------------------------------------------------------------ */

/**
 * The two buyer roles.
 *
 * `member` is the **purchaser**: they run the whole mini-procurement — rounds,
 * uploads, publishing, review, adjustments, confirmation, protocols — and see
 * every screen an admin sees. What they do not do is change the framework
 * agreement's own data or the team, and they cannot act as another participant.
 * `admin` is a purchaser who also administers those.
 *
 * The stored value stays `member` because that is what the row is — a member of
 * the buyer team rather than an administrator of it; this map is the word people
 * read.
 */
export const BUYER_ROLE_LABELS = { admin: 'Admin', member: 'Hankija' } as const;

export type BuyerRole = keyof typeof BUYER_ROLE_LABELS;

export type ParticipantOutcomeAtClose =
  | 'confirmed'
  | 'declined_all'
  | 'no_response'
  | 'excluded';

export const PARTICIPANT_OUTCOME_LABELS: Record<ParticipantOutcomeAtClose, string> = {
  confirmed: 'Kinnitas',
  declined_all: 'Loobus',
  no_response: 'Ei vastanud',
  excluded: 'Arvati välja',
};

export type ResponseState = 'none' | 'draft_only' | 'confirmed' | 'declined_all' | 'unconfirmed_changes';

/* ------------------------------------------------------------------ *
 * piirmäära liigid [K-06][L-17]
 * ------------------------------------------------------------------ */

/** Which cap kinds the buyer offers the partners in a round. */
export type CapOptions = 'none' | 'trainings' | 'participants' | 'both';

export const CAP_OPTIONS_VALUES: readonly CapOptions[] = ['none', 'trainings', 'participants', 'both'];

export const CAP_OPTIONS_LABELS: Record<CapOptions, string> = {
  none: 'Piirmäära ei kasutata',
  trainings: 'Koolituste arv („kuni N koolitust“)',
  participants: 'Osalejate arv kokku („kuni N osalejat“)',
  both: 'Partner valib: koolituste arv või osalejate arv',
};

/** The unit word after a cap value. */
export const CAP_KIND_LABELS: Record<CapKind, string> = {
  trainings: 'koolitust',
  participants: 'osalejat',
};

export function allowedCapKinds(options: CapOptions): CapKind[] {
  switch (options) {
    case 'none':
      return [];
    case 'trainings':
      return ['trainings'];
    case 'participants':
      return ['participants'];
    default:
      return ['trainings', 'participants'];
  }
}

export function isCapOptions(value: string): value is CapOptions {
  return (CAP_OPTIONS_VALUES as readonly string[]).includes(value);
}

/** "3 koolitust", "120 osalejat", or "—". */
export function capLabel(cap: number | null | undefined, kind: CapKind | null | undefined): string {
  if (cap === null || cap === undefined) return '—';
  return `${cap} ${CAP_KIND_LABELS[kind ?? 'trainings']}`;
}

/** Wording for the partner's own status while the round is open. [K-03] */
export const RESPONSE_STATE_LABELS: Record<ResponseState, string> = {
  none: 'Vastus puudub',
  draft_only: 'Kinnitamata mustand',
  confirmed: 'Kinnitatud',
  declined_all: 'Loobutud',
  unconfirmed_changes: 'Kinnitamata muudatused',
};

/* ------------------------------------------------------------------ *
 * neli kuvaolekut [N-03]
 * ------------------------------------------------------------------ */

export const TRAINING_VIEW_STATE_LABELS: Record<TrainingViewState, string> = {
  available: 'Saadaval',
  marked_by_higher: 'Eesõigusega partner on märkinud',
  projected_to_you: 'Prognoosis sinule',
  marked_not_projected: 'Märgitud, prognoosis ei ole',
};

const NOT_PROJECTED_REASON_LABELS: Record<NotProjectedReason, string> = {
  higher_partner: 'eesõigusega partner',
  over_cap: 'üle sinu piirmäära',
};

/** Full label including the reason suffix, e.g. "Märgitud, prognoosis ei ole (üle sinu piirmäära)". */
export function viewStateLabel(state: TrainingViewState, reason?: NotProjectedReason): string {
  const base = TRAINING_VIEW_STATE_LABELS[state];
  return reason ? `${base} (${NOT_PROJECTED_REASON_LABELS[reason]})` : base;
}

/**
 * The same label split in two, for the partner's table.
 *
 * The concatenated form is the wording [N-03] gives, but as one badge it is too
 * long for a table cell and gets clipped — which would hide the very column the
 * partner is there to read. Stacking the reason under the badge keeps both.
 */
export function viewStateParts(
  state: TrainingViewState,
  reason?: NotProjectedReason,
): { label: string; reason: string | null } {
  return {
    label: TRAINING_VIEW_STATE_LABELS[state],
    reason: reason ? NOT_PROJECTED_REASON_LABELS[reason] : null,
  };
}

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const ROUND_STATUS_TONES: Record<RoundStatus, StatusTone> = {
  draft: 'neutral',
  open: 'info',
  closed: 'warning',
  confirmed: 'success',
  cancelled: 'neutral',
};

export const TRAINING_STATUS_TONES: Record<TrainingStatus, StatusTone> = {
  unassigned: 'neutral',
  in_round: 'info',
  leftover: 'danger',
  allocated: 'success',
  completed: 'success',
  cancelled: 'neutral',
};

export const VIEW_STATE_TONES: Record<TrainingViewState, StatusTone> = {
  available: 'neutral',
  marked_by_higher: 'warning',
  projected_to_you: 'success',
  marked_not_projected: 'warning',
};

/* ------------------------------------------------------------------ *
 * sihtrühm — the "vertikaal" of the training programme
 * ------------------------------------------------------------------ */

export const TARGET_GROUPS = {
  kov: 'KOV ametnikud',
  riigiasutused: 'Riigiasutused',
  tervishoid: 'Tervishoid',
  haridus: 'Haridus',
  sotsiaal: 'Sotsiaalvaldkond',
  vaikeettevotjad: 'Väikeettevõtjad',
  muu: 'Muu',
} as const;

export type TargetGroup = keyof typeof TARGET_GROUPS;

export const TARGET_GROUP_KEYS = Object.keys(TARGET_GROUPS) as TargetGroup[];

/* ------------------------------------------------------------------ *
 * tellimus
 * ------------------------------------------------------------------ */

export type OrderStatus = 'active' | 'completed' | 'cancelled';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  active: 'Kehtiv',
  completed: 'Lõpetatud',
  cancelled: 'Tühistatud',
};

export type OrderKind = 'allocation' | 'manual';

export const ORDER_KIND_LABELS: Record<OrderKind, string> = {
  allocation: 'Kaskaadi jaotuse alusel',
  manual: 'Käsitsi määratud',
};

/** Round code, e.g. VOOR-2026-003. */
export function roundDisplayCode(year: number, seq: number): string {
  return `VOOR-${year}-${String(seq).padStart(3, '0')}`;
}

/** Training code, e.g. KK-2026-101. */
export function trainingDisplayCode(year: number, seq: number): string {
  return `KK-${year}-${String(seq).padStart(3, '0')}`;
}

/* ------------------------------------------------------------------ *
 * teavitused
 * ------------------------------------------------------------------ */

/**
 * Estonian names for the notification types [D-01…D-07].
 *
 * One map, used by both the buyer's full log and the partner's own log, so a
 * koolitaja and the tellija refer to the same message by the same name.
 */
export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  round_published: 'Voor avaldatud',
  confirmation_receipt: 'Kinnituse kviitung',
  decline_receipt: 'Loobumise kviitung',
  projection_changed: 'Prognoos muutus',
  reminder_24h: 'Meeldetuletus',
  round_changed: 'Vooru muudatus',
  round_cancelled: 'Voor tühistatud',
  participant_excluded: 'Partner arvati välja',
  order_issued: 'Tellimus väljastatud',
  allocated_elsewhere: 'Määrati teisele partnerile',
  buyer_round_closed: 'Voor sulgus',
  buyer_round_confirmed: 'Jaotus kinnitatud',
  late_action_rejected: 'Hilinenud toiming',
};

/** A partner representative's role [R-02]. */
export const REPRESENTATIVE_ROLE_LABELS: Record<string, string> = {
  esindaja: 'Lepinguline esindaja',
  asendaja: 'Asendaja',
};

/** What happened to one e-mail, per recipient [D-10]. */
export const EMAIL_DELIVERY_STATUS_LABELS: Record<string, string> = {
  queued: 'ootel',
  sent: 'saadetud',
  failed: 'saatmine ebaõnnestus',
  suppressed: 'ei saadetud — saaja ei ole lubatud saajate hulgas',
  skipped: 'e-kirja ei saadetud',
};
