/**
 * The persona roster for the test harness.
 *
 * Powers both the opening screen and the strip's dropdown. Each persona card
 * carries a live status line, so a tester can tell *before* entering which
 * persona has something interesting to do — "kinnitamata muudatused" on the
 * rank-3 partner is the whole point of the seeded scenario.
 *
 * Demo-only: nothing here is reachable when DEMO_MODE is off.
 */

import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { lotPartners, lots, partners, rounds, trainings, users } from '@/db/schema';
import { RESPONSE_STATE_LABELS } from '@/domain/round-statuses';
import { formatDateTimeShort, formatRemaining } from '@/domain/format';
import { readClock } from './clock';
import { latestConfirmation, participantsOf, responseStateFor } from './rounds/views';

export interface PersonaCard {
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

export interface PersonaRoster {
  buyers: PersonaCard[];
  partners: PersonaCard[];
  nowMs: number;
}

export function listPersonas(): PersonaRoster {
  const db = getDb();
  const { nowMs } = readClock(db);

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

  const buyers: PersonaCard[] = buyerRows.map((row) => ({
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

  const partnerCards: PersonaCard[] = partnerRows.map((partner) => {
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
export function listPersonaOptions(): Array<{ key: string; group: string; label: string }> {
  const roster = listPersonas();
  return [
    ...roster.buyers.map((b) => ({ key: b.key, group: 'Tellija', label: b.name })),
    ...roster.partners.map((p) => ({
      key: p.key,
      group: 'Partnerid',
      label: p.chips.length > 0 ? `${p.name} — ${p.chips.join(', ')}` : p.name,
    })),
  ];
}

/** Earliest pending deadline, for the strip's "Järgmise tähtajani" button. */
export function nextDeadlineMs(): number | null {
  const db = getDb();
  const open = db
    .select({ deadlineAt: rounds.deadlineAt })
    .from(rounds)
    .where(inArray(rounds.status, ['open']))
    .all()
    .map((r) => r.deadlineAt)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);
  return open[0] ?? null;
}
