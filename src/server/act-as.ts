/**
 * Who an admin can act as, in the test environment.
 *
 * There is no roster table: the list is simply the buyer team and the framework
 * partners, read from the tables the framework data put them in. While testing
 * those are the sample participants; once the real framework workbook is
 * uploaded they are the real ones, with no code change [L-21].
 *
 * Each card carries a live status line, so it is obvious before entering which
 * participant has something waiting — the rank-3 partner with unconfirmed
 * changes is the point of the seeded scenario.
 *
 * Reachable only in the test environment (`DEMO_MODE`), and only for an admin.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lotPartners, lots, partners, rounds, trainings, users } from '@/db/schema';
import { RESPONSE_STATE_LABELS } from '@/domain/round-statuses';
import { formatDateTimeShort, formatRemaining } from '@/domain/format';
import { currentTimeMs } from './clock';
import { latestConfirmation, participantsOf, responseStateFor } from './rounds/views';

export interface ActAsCard {
  /** cookie value: 'buyer:<id>' or 'partner:<id>' */
  key: string;
  kind: 'buyer' | 'partner';
  name: string;
  subtitle: string;
  /** e.g. ['OSA-2 · koht 1', 'OSA-3 · koht 3'] */
  chips: string[];
  /** live, per-round status lines */
  statusLines: string[];
}

export interface ActAsRoster {
  buyers: ActAsCard[];
  partners: ActAsCard[];
  nowMs: number;
}

export function listActAsRoster(): ActAsRoster {
  const db = getDb();
  const nowMs = currentTimeMs();

  /* ---------- buyer ---------- */

  const buyerRows = db.select().from(users).where(eq(users.isActive, true)).all();

  const roundRows = db
    .select({
      id: rounds.id,
      code: rounds.code,
      status: rounds.status,
      lotId: rounds.lotId,
      lotCode: lots.code,
      deadlineAt: rounds.deadlineAt,
      visibilityMode: rounds.visibilityMode,
    })
    .from(rounds)
    .innerJoin(lots, eq(lots.id, rounds.lotId))
    .all();

  const openRounds = roundRows.filter((r) => r.status === 'open');
  const closedRounds = roundRows.filter((r) => r.status === 'closed');
  const leftoverCount = db
    .select({ id: trainings.id })
    .from(trainings)
    .where(eq(trainings.status, 'leftover'))
    .all().length;

  const buyerStatus: string[] = [];
  buyerStatus.push(
    openRounds.length > 0
      ? `${openRounds.length} avatud voor${openRounds.length === 1 ? '' : 'u'}`
      : 'avatud voore ei ole',
  );
  if (closedRounds.length > 0) {
    buyerStatus.push(`${closedRounds.length} voor ootab jaotuse kinnitamist`);
  }
  if (leftoverCount > 0) {
    buyerStatus.push(`jääk: ${leftoverCount} koolitus(t) ootab otsust`);
  }

  const buyers: ActAsCard[] = buyerRows.map((row) => ({
    key: `buyer:${row.id}`,
    kind: 'buyer',
    name: row.name,
    subtitle: 'Riigikantselei tellimismeeskond',
    chips: [row.role === 'admin' ? 'Admin' : 'Liige'],
    statusLines: buyerStatus,
  }));

  /* ---------- partners ---------- */

  const partnerRows = db.select().from(partners).where(eq(partners.isActive, true)).all();

  const memberships = db
    .select({
      lotPartnerId: lotPartners.id,
      partnerId: lotPartners.partnerId,
      lotId: lotPartners.lotId,
      lotCode: lots.code,
      rank: lotPartners.rank,
      contactName: lotPartners.contactName,
    })
    .from(lotPartners)
    .innerJoin(lots, eq(lots.id, lotPartners.lotId))
    .where(eq(lotPartners.isActive, true))
    .all();

  // Participant rows for every open or closed round, once.
  const relevantRoundIds = [...openRounds, ...closedRounds].map((r) => r.id);
  const participantsByRound = new Map(
    relevantRoundIds.map((roundId) => [roundId, participantsOf(db, roundId)] as const),
  );

  const partnerCards: ActAsCard[] = partnerRows.map((partner) => {
    const mine = memberships
      .filter((m) => m.partnerId === partner.id)
      .sort((a, b) => a.lotCode.localeCompare(b.lotCode));
    const myLotPartnerIds = new Set(mine.map((m) => m.lotPartnerId));

    const statusLines: string[] = [];
    for (const round of [...openRounds, ...closedRounds]) {
      const participant = participantsByRound
        .get(round.id)
        ?.find((p) => myLotPartnerIds.has(p.lotPartnerId));
      if (!participant) continue;

      if (participant.excludedAt) {
        statusLines.push(`${round.code}: voorust välja arvatud`);
        continue;
      }
      if (round.status === 'closed') {
        statusLines.push(`${round.code}: tähtaeg möödus, tellija kinnitab jaotust`);
        continue;
      }

      const latest = latestConfirmation(db, round.id, participant.lotPartnerId);
      const state = responseStateFor(latest, participant.draftMarks, participant.draftCap, participant.draftCapKind);
      const remaining = round.deadlineAt ? formatRemaining(nowMs, round.deadlineAt) : '';
      const when = latest ? ` ${formatDateTimeShort(latest.confirmedAt)}` : '';
      statusLines.push(
        `${round.code} (koht ${participant.rankAtPublication}): ${RESPONSE_STATE_LABELS[state]}${
          state === 'confirmed' || state === 'declined_all' ? when : ''
        } · ${remaining}`,
      );
    }

    if (statusLines.length === 0) statusLines.push('avatud voore ei ole');

    return {
      key: `partner:${partner.id}`,
      kind: 'partner',
      name: partner.name,
      subtitle: mine[0]?.contactName ?? 'kontaktisik',
      chips: mine.map((m) => `${m.lotCode} · koht ${m.rank}`),
      statusLines,
    };
  });

  return { buyers, partners: partnerCards, nowMs };
}

/** Lightweight version for the strip's dropdown. */
export function listActAsOptions(): Array<{ key: string; group: string; label: string }> {
  const roster = listActAsRoster();
  return [
    ...roster.buyers.map((b) => ({ key: b.key, group: 'Tellija', label: b.name })),
    ...roster.partners.map((p) => ({
      key: p.key,
      group: 'Partnerid',
      label: p.chips.length > 0 ? `${p.name} — ${p.chips.join(', ')}` : p.name,
    })),
  ];
}

