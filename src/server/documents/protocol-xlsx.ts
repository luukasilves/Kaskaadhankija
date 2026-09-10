/**
 * The round protocol's .xlsx annex [L-22].
 *
 * The PDF is the document a person signs; this is the same facts in a form
 * someone can sort, filter and total. Two differences, both deliberate:
 *
 *  - the technical evidence of each confirmation (IP address, browser) lives
 *    **only** here, so it is available for a dispute without being printed on a
 *    document that circulates [D-09];
 *  - the first sheet leads with the protocol's SHA-256, so a downloaded annex
 *    can be matched back to the PDF that was signed.
 *
 * Built from the stored protocol JSON, like the PDF, so both views can only
 * disagree about layout.
 */

import { formatDateTime, formatDateTimeShort, formatIsoDay } from '@/domain/format';
import {
  ADJUSTMENT_KIND_LABELS,
  BID_KIND_LABELS,
  PROTOCOL_KIND_LABELS,
  TRACE_OUTCOME_LABELS,
  capText,
  protocolHeadline,
  type RoundProtocolData,
} from '@/domain/round-protocol';
import { NOTIFICATION_TYPE_LABELS } from '@/domain/round-statuses';
import { frameworkTitleLine } from '@/domain/framework';
import { buildWorkbook, type WorkbookSheet } from '@/server/import/xlsx';

const DASH = '—';

function instant(value: number | null | undefined): string {
  return typeof value === 'number' ? formatDateTime(value) : '';
}

function shortInstant(value: number | null | undefined): string {
  return typeof value === 'number' ? formatDateTimeShort(value) : '';
}

function eur(amount: number): string {
  // A plain decimal rather than a formatted one: this column is meant to be
  // summed in Excel, so it must parse as a number in an Estonian locale.
  return amount.toFixed(2).replace('.', ',');
}

/** A two-column key/value sheet — the annex's own header. */
function keyValueSheet(name: string, rows: Array<[string, string]>): WorkbookSheet {
  return {
    name,
    headers: ['väli', 'väärtus'],
    rows: rows.map(([field, value]) => ({ väli: field, väärtus: value })),
  };
}

function sheet(
  name: string,
  headers: readonly string[],
  rows: ReadonlyArray<Record<string, string>>,
): WorkbookSheet {
  return { name, headers, rows };
}

export async function buildProtocolXlsx(
  data: RoundProtocolData,
  hash: string,
): Promise<Buffer> {
  const sheets: WorkbookSheet[] = [];

  sheets.push(
    keyValueSheet('Tingimused', [
      ['SHA-256', hash],
      ['protokolli liik', PROTOCOL_KIND_LABELS[data.kind]],
      ['koostatud', instant(data.generatedAt)],
      ['koostaja', data.generatedBy],
      ['andmestruktuuri versioon', String(data.schemaVersion)],
      ['', ''],
      ['raamleping', frameworkTitleLine(data.framework)],
      ['tellija', data.framework.buyerName],
      ['voor', data.round.code],
      ['hankeosa', `${data.lot.code} — ${data.lot.name}`],
      ['kokkuvõte', protocolHeadline(data)],
      ['olek', data.round.status],
      ['', ''],
      ['nähtavus', data.conditions.visibilityMode],
      ['piirmäära liigid', data.conditions.capOptions],
      ['koormuse künnis', String(data.conditions.workloadThreshold)],
      ['vastamisaeg tööpäevades', String(data.conditions.responseWorkingDays)],
      ['märkus', data.conditions.note],
      ['', ''],
      ['voor koostatud', instant(data.round.createdAt)],
      ['koostaja', data.round.createdBy],
      ['eelmine voor (jääk)', data.round.originRoundCode ?? ''],
      ['kavandatud avaldamine', instant(data.conditions.plannedPublishAt)],
      ['kavandatud tähtaeg', instant(data.conditions.plannedDeadlineAt)],
      ['avaldatud', instant(data.conditions.publishedAt)],
      ['avaldaja', data.conditions.publishedBy],
      ['esialgne tähtaeg', instant(data.conditions.originalDeadlineAt)],
      ['kehtinud tähtaeg', instant(data.conditions.deadlineAt)],
      ['lõikehetk', instant(data.conditions.cutAt)],
      ['otsus lubatud', instant(data.conditions.expectedDecisionAt)],
      ['suletud', instant(data.conditions.closedAt)],
      ['kinnitatud', instant(data.conditions.confirmedAt)],
      ['kinnitaja', data.conditions.confirmedBy],
      ['tühistatud', instant(data.conditions.cancelledAt)],
      ['tühistamise põhjus', data.conditions.cancelReason],
    ]),
  );

  if (data.conditions.deadlineChanges.length > 0) {
    sheets.push(
      sheet(
        'Tähtaja muudatused',
        ['muudetud', 'endine_tahtaeg', 'uus_tahtaeg', 'pohjus', 'kes'],
        data.conditions.deadlineChanges.map((change) => ({
          muudetud: shortInstant(change.occurredAt),
          endine_tahtaeg: shortInstant(change.from),
          uus_tahtaeg: shortInstant(change.at),
          pohjus: change.reason,
          kes: change.by,
        })),
      ),
    );
  }

  sheets.push(
    sheet(
      'Koolitused',
      [
        'kood',
        'nimetus',
        'kuupaev',
        'lopp',
        'formaat',
        'maakond',
        'asukoht',
        'osalejaid',
        'keel',
        'tagasi_voetud',
        'pohjus',
        'kes',
      ],
      data.trainings.map((t) => ({
        kood: t.code,
        nimetus: t.title,
        kuupaev: formatIsoDay(t.eventDate),
        lopp: t.eventEnd ? formatIsoDay(t.eventEnd) : '',
        formaat: t.workshopType,
        maakond: t.county,
        asukoht: t.locationText,
        osalejaid: String(t.participantCount),
        keel: t.language,
        tagasi_voetud: shortInstant(t.withdrawnAt),
        pohjus: t.withdrawnReason,
        kes: t.withdrawnBy,
      })),
    ),
    sheet(
      'Osalejad',
      [
        'koht',
        'partner',
        'registrikood',
        'kontaktisik',
        'e_post',
        'uhikhind',
        'tulemus',
        'valja_arvatud',
        'pohjus',
      ],
      data.participants.map((p) => ({
        koht: String(p.rank),
        partner: p.partnerName,
        registrikood: p.partnerRegCode,
        kontaktisik: p.contactName,
        e_post: p.contactEmail,
        uhikhind: eur(p.unitPriceEur),
        tulemus: p.outcomeAtClose
          ? (TRACE_OUTCOME_LABELS[p.outcomeAtClose] ?? p.outcomeAtClose)
          : '',
        valja_arvatud: shortInstant(p.excludedAt),
        pohjus: p.excludedReason,
      })),
    ),
    // The only place IP and browser appear — evidence for a dispute, kept off
    // the printed document [D-09].
    sheet(
      'Kinnitused',
      [
        'nr',
        'aeg',
        'koht',
        'partner',
        'toiming',
        'margitud_koolitused',
        'piirmaar',
        'kes_kinnitas',
        'e_post',
        'siduv',
        'ip',
        'brauser',
        'kinnituse_id',
      ],
      data.bids.map((bid) => ({
        nr: String(bid.seq),
        aeg: instant(bid.confirmedAt),
        koht: String(bid.rank),
        partner: bid.partnerName,
        toiming: BID_KIND_LABELS[bid.kind],
        margitud_koolitused: bid.kind === 'decline_all' ? '' : bid.marks.join(', '),
        piirmaar: capText(bid.cap, bid.capKind),
        kes_kinnitas: bid.actorLabel,
        e_post: bid.contactEmail,
        siduv: bid.binding ? 'jah' : '',
        ip: bid.ip,
        brauser: bid.ua,
        kinnituse_id: String(bid.confirmationId),
      })),
    ),
    sheet(
      'Kohandused',
      ['aeg', 'partner', 'kohandus', 'vaartus', 'pohjendus', 'kes', 'kehtis'],
      data.adjustments.map((a) => ({
        aeg: instant(a.createdAt),
        partner: a.partnerName,
        kohandus: ADJUSTMENT_KIND_LABELS[a.kind],
        vaartus: a.capValue === null ? '' : String(a.capValue),
        pohjendus: a.justification,
        kes: a.createdBy,
        kehtis: a.effective ? 'jah' : '',
      })),
    ),
    sheet(
      'Jaotus',
      ['koolitus', 'jaotusettepanek', 'loplik_jaotus', 'muutus'],
      data.allocation.byTraining.map((row) => ({
        koolitus: row.trainingCode,
        jaotusettepanek: row.proposed ?? 'jääk',
        loplik_jaotus: row.final ?? 'jääk',
        muutus: row.changed ? 'jah' : '',
      })),
    ),
    sheet(
      'Kaskaadi käik',
      ['koht', 'partner', 'tulemus', 'soovis', 'sai', 'piirmaar', 'osalejaid', 'kinnituse_id'],
      data.allocation.trace.map((step) => ({
        koht: String(step.rank),
        partner: step.partnerName,
        tulemus: TRACE_OUTCOME_LABELS[step.outcome] ?? step.outcome,
        soovis: step.wanted.join(', '),
        sai: step.taken.join(', '),
        piirmaar: step.limit === null ? '' : String(step.limit),
        osalejaid:
          step.capKind === 'participants'
            ? `${step.participantsTaken}/${step.participantLimit ?? ''}`
            : String(step.participantsTaken),
        kinnituse_id: step.usedConfirmationId === null ? '' : String(step.usedConfirmationId),
      })),
    ),
    sheet(
      'Jääk',
      ['koolitus'],
      data.allocation.leftover.map((code) => ({ koolitus: code })),
    ),
    sheet(
      'Tellimused',
      [
        'number',
        'partner',
        'registrikood',
        'koolitused',
        'uhikhind',
        'kokku',
        'partner_kinnitas',
        'tellija_kinnitas',
        'kinnitaja',
        'olek',
      ],
      data.orders.map((order) => ({
        number: order.number,
        partner: order.partnerName,
        registrikood: order.partnerRegCode,
        koolitused: order.trainingCodes.join(', '),
        uhikhind: eur(order.unitPriceEur),
        kokku: eur(order.totalEur),
        partner_kinnitas: instant(order.partnerConfirmedAt),
        tellija_kinnitas: instant(order.buyerConfirmedAt),
        kinnitaja: order.buyerConfirmedBy,
        olek: order.status,
      })),
    ),
    sheet(
      'Teated',
      ['aeg', 'saaja', 'saaja_liik', 'liik', 'pealkiri'],
      data.notices.map((notice) => ({
        aeg: instant(notice.createdAt),
        saaja: notice.recipientName,
        saaja_liik: notice.recipientKind === 'buyer' ? 'tellija' : 'partner',
        liik: NOTIFICATION_TYPE_LABELS[notice.type] ?? notice.type,
        pealkiri: notice.title,
      })),
    ),
    sheet(
      'Auditijälg',
      ['id', 'aeg', 'sundmus', 'kes', 'tegutses_kaudu', 'kirjeldus'],
      data.audit.map((row) => ({
        id: String(row.id),
        aeg: instant(row.occurredAt),
        sundmus: row.eventType,
        kes: row.actorLabel,
        tegutses_kaudu: row.viaLabel ?? '',
        kirjeldus: row.summary,
      })),
    ),
    keyValueSheet('Selgitus', [
      [
        'mis see on',
        `${PROTOCOL_KIND_LABELS[data.kind]} — vooru ${data.round.code} protokolli lisa. Allkirjastatav dokument on PDF; see fail sisaldab sama sisu tabelitena.`,
      ],
      [
        'sõrmejälg',
        `Lehel „Tingimused“ olev SHA-256 on protokolli andmete räsi. Sama räsi on PDF-i jalusel (esimesed 16 märki: ${hash.slice(0, 16)}) ja rakenduse auditijäljes kandena „protocol.generated“.`,
      ],
      [
        'kinnitused',
        'Leht „Kinnitused“ sisaldab kõiki vooru jooksul tehtud kinnitusi saabumise järjekorras. Siduv on iga partneri viimane kinnitus lõikehetkel — veerg „siduv“. IP-aadress ja brauser on siin tõendina; PDF-is neid ei ole.',
      ],
      [
        'kättetoimetamine',
        'E-kirjade kättetoimetamise seisud ei ole protokollis: kirjad väljuvad pärast protokolli salvestamist. Need on rakenduse teavituste logis.',
      ],
      [
        'kinnitamine',
        'Protokolli kinnitatakse väljaspool rakendust. Rakendus kinnitust tagasi ei kanna.',
      ],
      ['tühi lahter', `Tühi lahter tähendab, et andmed puuduvad; ${DASH} ei kasutata.`],
    ]),
  );

  return buildWorkbook(sheets);
}
