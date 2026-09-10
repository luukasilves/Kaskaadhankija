/**
 * The round protocol as a PDF [L-22].
 *
 * Rendered on demand from the stored protocol JSON, never from live tables — so
 * the fingerprint in the footer always names the data the document shows.
 *
 * Fonts: the three standard PDF families only (Helvetica for text, Courier for
 * codes), so nothing is embedded and the traced server bundle stays small. That
 * costs one thing: pdfkit writes standard fonts in WinAnsi, which covers Latin
 * and the quotes and dashes Estonian needs — õ ä ö ü š ž € „ “ – — · — but not
 * arrows, ✓ or ≥. `pdfSafeText` folds those to ASCII, and every string in the
 * document definition goes through it, so a glyph nobody thought about becomes
 * a readable substitute rather than mojibake.
 */

import pdfmake from 'pdfmake';
import type {
  Content,
  ContentTable,
  CustomTableLayout,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { formatDateTime, formatDateTimeShort, formatEur, formatIsoDay } from '@/domain/format';
import {
  ADJUSTMENT_KIND_LABELS,
  BID_KIND_LABELS,
  PROTOCOL_KIND_LABELS,
  TRACE_OUTCOME_LABELS,
  capText,
  fingerprint,
  protocolHeadline,
  respondingPartnerCount,
  type RoundProtocolData,
} from '@/domain/round-protocol';
import { NOTIFICATION_TYPE_LABELS } from '@/domain/round-statuses';
import { frameworkTitleLine } from '@/domain/framework';

/* ------------------------------------------------------------------ *
 * the singleton, configured once
 * ------------------------------------------------------------------ */

/**
 * The 14 fonts every PDF reader has. Also the allow-list for pdfmake's local
 * access policy: the only files this renderer may open are these `.afm`
 * metrics, which pdfkit ships. Everything else — a URL, a font path, an image
 * from disk — is refused, so a protocol can never pull in anything external.
 */
const STANDARD_FONTS = new Set([
  'Courier',
  'Courier-Bold',
  'Courier-Oblique',
  'Courier-BoldOblique',
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
  'Times-Roman',
  'Times-Bold',
  'Times-Italic',
  'Times-BoldItalic',
  'Symbol',
  'ZapfDingbats',
]);

pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((name: string) => STANDARD_FONTS.has(name));
pdfmake.addFonts({
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
  Courier: {
    normal: 'Courier',
    bold: 'Courier-Bold',
    italics: 'Courier-Oblique',
    bolditalics: 'Courier-BoldOblique',
  },
});

/* ------------------------------------------------------------------ *
 * WinAnsi safety
 * ------------------------------------------------------------------ */

/** Characters WinAnsi has at 0x80–0x9F, which Latin-1 does not. */
const WINANSI_EXTRAS = new Set(
  '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split('').map((ch) => ch.codePointAt(0) ?? 0),
);

/** Substitutes for the glyphs the app's screens use but WinAnsi lacks. */
const SUBSTITUTIONS: Record<string, string> = {
  '→': '->',
  '←': '<-',
  '↑': '^',
  '↓': 'v',
  '✓': '+',
  '✗': 'x',
  '◌': '·',
  '≥': '>=',
  '≤': '<=',
  '≠': '!=',
  '⌀': 'o',
  ' ': ' ',
};

function encodable(code: number): boolean {
  if (code === 0x0a || code === 0x0d || code === 0x09) return true;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return WINANSI_EXTRAS.has(code);
}

/**
 * Make a string printable with a standard PDF font.
 *
 * Applied to every string in the document definition rather than at each call
 * site, so a glyph that arrives from a partner's typing, a training title or a
 * future screen cannot come out as garbage.
 */
export function pdfSafeText(value: string): string {
  let out = '';
  for (const ch of value) {
    const replacement = SUBSTITUTIONS[ch];
    if (replacement !== undefined) {
      out += replacement;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    out += encodable(code) ? ch : '?';
  }
  return out;
}

/** Recursively fold every string of a document definition through `pdfSafeText`. */
function safeTree<T>(node: T): T {
  if (typeof node === 'string') return pdfSafeText(node) as unknown as T;
  if (Array.isArray(node)) return node.map(safeTree) as unknown as T;
  if (node instanceof Date) return node;
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) out[key] = safeTree(value);
    return out as T;
  }
  return node;
}

/* ------------------------------------------------------------------ *
 * small builders
 * ------------------------------------------------------------------ */

const DASH = '—';

/**
 * The page's usable width, in points, and the cell padding of the table layout
 * below. A4 is 595.28pt wide; a margin of 36 each side leaves this.
 *
 * Every table's widths are computed from this budget rather than written as
 * points, because a column set that adds up to more than the page does not
 * fail — pdfmake simply draws it off the paper, where nobody sees it until the
 * protocol is printed.
 */
const PAGE_MARGIN = 36;
const CONTENT_WIDTH = 595.28 - 2 * PAGE_MARGIN;
const CELL_PAD = 3;

/** Turn relative column weights into absolute widths that fit exactly. */
function fit(weights: readonly number[]): number[] {
  const padding = 2 * CELL_PAD * (weights.length - 1);
  const budget = CONTENT_WIDTH - padding;
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => (weight / total) * budget);
}

/** Horizontal rules only, and tighter padding than pdfmake's default. */
const TABLE_LAYOUT: CustomTableLayout = {
  hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: (i) => (i === 1 ? '#3d4854' : '#d7dde3'),
  paddingLeft: (i) => (i === 0 ? 0 : CELL_PAD),
  paddingRight: (i, node) =>
    i === (Array.isArray(node.table.widths) ? node.table.widths.length : 0) - 1 ? 0 : CELL_PAD,
  paddingTop: () => 2,
  paddingBottom: () => 2,
};

function instant(value: number | null | undefined): string {
  return typeof value === 'number' ? formatDateTime(value) : DASH;
}

function shortInstant(value: number | null | undefined): string {
  return typeof value === 'number' ? formatDateTimeShort(value) : DASH;
}

function heading(text: string): Content {
  return { text, style: 'h2', margin: [0, 14, 0, 5] };
}

function paragraph(text: string): Content {
  return { text, margin: [0, 0, 0, 4] };
}

/** A label/value list — the shape most of the protocol's facts take. */
function facts(rows: Array<[string, string]>): Content {
  return {
    table: {
      widths: fit([28, 72]),
      body: rows.map(([label, value]) => [
        { text: label, style: 'label' },
        { text: value || DASH },
      ]),
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 4],
  };
}

/**
 * A table with a repeated header row, safe across page breaks.
 *
 * `weights` are relative, not points: `fit` scales them to the page, so a
 * column set can be reshaped without anyone having to re-add the arithmetic.
 */
function table(
  headers: readonly string[],
  weights: readonly number[],
  rows: string[][],
  options: { empty?: string } = {},
): Content {
  if (rows.length === 0) {
    return paragraph(options.empty ?? 'Kandeid ei ole.');
  }
  const widths: ContentTable['table']['widths'] = fit(weights);
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths,
      body: [
        headers.map((text) => ({ text, style: 'th' })),
        ...rows.map((row) => row.map((cell) => ({ text: cell || DASH, style: 'td' }))),
      ],
    },
    layout: TABLE_LAYOUT,
    margin: [0, 0, 0, 6],
  };
}

function codeList(codes: readonly string[]): string {
  return codes.length > 0 ? codes.join(', ') : DASH;
}

/* ------------------------------------------------------------------ *
 * the document
 * ------------------------------------------------------------------ */

function buildDefinition(data: RoundProtocolData, hash: string): TDocumentDefinitions {
  const short = fingerprint(hash);
  const cancelled = data.kind === 'cancelled';

  const content: Content[] = [
    { text: PROTOCOL_KIND_LABELS[data.kind], style: 'h1' },
    { text: `${data.round.code} · ${data.lot.code} — ${data.lot.name}`, style: 'subtitle' },
    { text: frameworkTitleLine(data.framework), style: 'small', margin: [0, 0, 0, 2] },
    { text: `Tellija: ${data.framework.buyerName}`, style: 'small', margin: [0, 0, 0, 8] },
    { text: protocolHeadline(data), bold: true, margin: [0, 0, 0, 10] },

    heading('1. Vooru tingimused'),
    facts([
      ['Voor', data.round.code],
      ['Hankeosa', `${data.lot.code} — ${data.lot.name}`],
      ['Olek', data.round.status],
      ['Nähtavus', data.conditions.visibilityMode],
      ['Piirmäära liigid', data.conditions.capOptions],
      ['Koormuse künnis', `${data.conditions.workloadThreshold} koolitust`],
      ['Vastamisaeg', `${data.conditions.responseWorkingDays} tööpäeva`],
      ['Voor koostatud', `${instant(data.round.createdAt)} · ${data.round.createdBy}`],
      ...(data.round.originRoundCode
        ? ([['Eelmine voor (jääk)', data.round.originRoundCode]] as Array<[string, string]>)
        : []),
      ['Kavandatud avaldamine', instant(data.conditions.plannedPublishAt)],
      ['Kavandatud tähtaeg', instant(data.conditions.plannedDeadlineAt)],
      ['Avaldatud', `${instant(data.conditions.publishedAt)}${data.conditions.publishedBy ? ` · ${data.conditions.publishedBy}` : ''}`],
      ['Esialgne tähtaeg', instant(data.conditions.originalDeadlineAt)],
      ['Kehtinud tähtaeg', instant(data.conditions.deadlineAt)],
      ['Lõikehetk', instant(data.conditions.cutAt)],
      ['Otsus lubatud', instant(data.conditions.expectedDecisionAt)],
      ['Suletud', instant(data.conditions.closedAt)],
      ...(cancelled
        ? ([
            ['Tühistatud', instant(data.conditions.cancelledAt)],
            ['Tühistamise põhjus', data.conditions.cancelReason],
          ] as Array<[string, string]>)
        : ([
            [
              'Kinnitatud',
              `${instant(data.conditions.confirmedAt)}${data.conditions.confirmedBy ? ` · ${data.conditions.confirmedBy}` : ''}`,
            ],
          ] as Array<[string, string]>)),
      ...(data.conditions.note ? ([['Märkus', data.conditions.note]] as Array<[string, string]>) : []),
    ]),
  ];

  if (data.conditions.deadlineChanges.length > 0) {
    content.push(
      { text: 'Tähtaja pikendamised', style: 'h3', margin: [0, 6, 0, 4] },
      table(
        ['Muudetud', 'Endine tähtaeg', 'Uus tähtaeg', 'Põhjus', 'Kes'],
        [13, 13, 13, 44, 17],
        data.conditions.deadlineChanges.map((change) => [
          shortInstant(change.occurredAt),
          shortInstant(change.from),
          shortInstant(change.at),
          change.reason,
          change.by,
        ]),
      ),
    );
  }

  /* 2. trainings */
  const live = data.trainings.filter((t) => t.withdrawnAt === null);
  const withdrawn = data.trainings.filter((t) => t.withdrawnAt !== null);
  content.push(
    heading(`2. Vooru koolitused (${live.length})`),
    table(
      ['Kood', 'Nimetus', 'Kuupäev', 'Formaat', 'Maakond', 'Osalejaid', 'Keel'],
      [11, 33, 11, 11, 18, 10, 6],
      live.map((t) => [
        t.code,
        t.title,
        formatIsoDay(t.eventDate),
        t.workshopType,
        `${t.county}${t.locationText ? `, ${t.locationText}` : ''}`,
        String(t.participantCount),
        t.language,
      ]),
      { empty: 'Voorus ei olnud ühtki koolitust.' },
    ),
  );
  if (withdrawn.length > 0) {
    content.push(
      { text: `Voorust tagasi võetud (${withdrawn.length})`, style: 'h3', margin: [0, 6, 0, 4] },
      table(
        ['Kood', 'Nimetus', 'Tagasi võetud', 'Põhjus', 'Kes'],
        [11, 31, 14, 26, 18],
        withdrawn.map((t) => [
          t.code,
          t.title,
          shortInstant(t.withdrawnAt),
          t.withdrawnReason,
          t.withdrawnBy,
        ]),
      ),
    );
  }

  /* 3. participants */
  content.push(
    heading(`3. Osalejad järjestuses (${data.participants.length})`),
    paragraph(
      'Järjestus on avaldamise hetkel külmutatud: hilisemad raamlepingu muudatused seda vooru ei puuduta.',
    ),
    table(
      ['Koht', 'Partner', 'Registrikood', 'Kontaktisik', 'E-post', 'Ühikhind', 'Tulemus'],
      [5, 20, 11, 16, 24, 10, 14],
      data.participants.map((p) => [
        String(p.rank),
        p.partnerName,
        p.partnerRegCode,
        p.contactName,
        p.contactEmail,
        formatEur(p.unitPriceEur),
        p.excludedAt !== null
          ? `Arvati välja${p.excludedReason ? `: ${p.excludedReason}` : ''}`
          : p.outcomeAtClose
            ? (TRACE_OUTCOME_LABELS[p.outcomeAtClose] ?? p.outcomeAtClose)
            : DASH,
      ]),
    ),
  );

  /* 4. bids */
  content.push(
    heading(`4. Kinnitused (${data.bids.length})`),
    paragraph(
      `Kõik vooru jooksul tehtud kinnitused saabumise järjekorras; ${respondingPartnerCount(data)} partner(it) vastas. Siduv on iga partneri viimane kinnitus lõikehetkel — see on tabelis tähistatud.`,
    ),
    table(
      ['Nr', 'Aeg', 'Partner', 'Vastus', 'Piirmäär', 'Kes kinnitas', 'Siduv'],
      [4, 13, 19, 27, 11, 20, 6],
      data.bids.map((bid) => [
        String(bid.seq),
        shortInstant(bid.confirmedAt),
        `${bid.rank}. ${bid.partnerName}`,
        bid.kind === 'decline_all' ? BID_KIND_LABELS[bid.kind] : codeList(bid.marks),
        capText(bid.cap, bid.capKind),
        bid.actorLabel,
        bid.binding ? 'jah' : '',
      ]),
      { empty: 'Ükski partner ei kinnitanud voorus midagi.' },
    ),
    {
      text: 'Kinnituste tehnilised tõendid (IP-aadress ja brauser) on protokolli .xlsx lisas.',
      style: 'small',
      margin: [0, 0, 0, 4],
    },
  );

  /* 5. adjustments */
  content.push(
    heading(`5. Tellija kohandused (${data.adjustments.length})`),
    table(
      ['Aeg', 'Partner', 'Kohandus', 'Väärtus', 'Põhjendus', 'Kes', 'Kehtis'],
      [13, 18, 13, 8, 24, 16, 8],
      data.adjustments.map((a) => [
        shortInstant(a.createdAt),
        a.partnerName,
        ADJUSTMENT_KIND_LABELS[a.kind],
        a.capValue === null ? DASH : String(a.capValue),
        a.justification,
        a.createdBy,
        a.effective ? 'jah' : '',
      ]),
      { empty: 'Tellija ei kohandanud jaotust.' },
    ),
  );

  /* 6. allocation */
  content.push(heading('6. Jaotus'));
  if (cancelled) {
    content.push(
      paragraph(
        'Voor tühistati enne jaotuse kinnitamist, seega jaotust ei tehtud ja ükski koolitus ei ole selle vooru alusel määratud.',
      ),
    );
  } else {
    const changedCount = data.allocation.byTraining.filter((row) => row.changed).length;
    content.push(
      paragraph(
        changedCount === 0
          ? 'Lõplik jaotus vastab jaotusettepanekule — tellija kohandused seda ei muutnud.'
          : `Lõplik jaotus erineb jaotusettepanekust ${changedCount} koolituse osas; erinevused on allpool tähistatud.`,
      ),
      table(
        ['Koolitus', 'Jaotusettepanek', 'Lõplik jaotus', 'Muutus'],
        [16, 35, 35, 9],
        data.allocation.byTraining.map((row) => [
          row.trainingCode,
          row.proposed ?? 'jääk',
          row.final ?? 'jääk',
          row.changed ? 'jah' : '',
        ]),
      ),
      { text: 'Kaskaadi käik', style: 'h3', margin: [0, 6, 0, 4] },
      table(
        ['Koht', 'Partner', 'Tulemus', 'Soovis', 'Sai', 'Piirmäär'],
        [5, 19, 13, 26, 24, 13],
        data.allocation.trace.map((step) => [
          String(step.rank),
          step.partnerName,
          TRACE_OUTCOME_LABELS[step.outcome] ?? step.outcome,
          codeList(step.wanted),
          codeList(step.taken),
          step.limit === null && step.participantLimit === null
            ? DASH
            : step.capKind === 'participants'
              ? `${step.participantsTaken}/${step.participantLimit ?? DASH} osalejat`
              : `${step.taken.length}/${step.limit ?? DASH} koolitust`,
        ]),
      ),
      // Without this the „Soovis“ column is easy to misread: it is not what a
      // partner marked, but what was still free when their turn came.
      {
        text:
          'Veerg „Soovis“ näitab neid partneri kinnitatud märkeid, mis olid tema järjekorra saabudes veel vabad — eesõigusega partnerile juba läinud koolitust seal ei ole. „Piirmäär“ näitab võetut piirmäära suhtes.',
        style: 'small',
        margin: [0, 0, 0, 6],
      },
      paragraph(
        data.allocation.leftover.length === 0
          ? 'Jääki ei jäänud: iga koolitus leidis täitja.'
          : `Jääk (${data.allocation.leftover.length}): ${data.allocation.leftover.join(', ')}. Jääk ootab tellija otsust — uus voor või tühistamine.`,
      ),
    );
  }

  /* 7. orders */
  content.push(
    heading(`7. Tellimused (${data.orders.length})`),
    table(
      ['Number', 'Partner', 'Registrikood', 'Koolitused', 'Ühikhind', 'Kokku', 'Olek'],
      [14, 19, 11, 26, 10, 10, 10],
      data.orders.map((order) => [
        order.number,
        order.partnerName,
        order.partnerRegCode,
        codeList(order.trainingCodes),
        formatEur(order.unitPriceEur),
        formatEur(order.totalEur),
        order.status,
      ]),
      { empty: 'Tellimusi ei loodud.' },
    ),
  );

  /* 8. notices */
  content.push(
    heading(`8. Teated (${data.notices.length})`),
    paragraph(
      'Mis kellele saadeti. E-kirjade kättetoimetamise seisud on rakenduse teavituste logis, mitte protokollis: kirjad väljuvad pärast selle kande salvestamist.',
    ),
    table(
      ['Aeg', 'Saaja', 'Liik', 'Pealkiri'],
      [13, 20, 18, 49],
      data.notices.map((notice) => [
        shortInstant(notice.createdAt),
        notice.recipientName,
        NOTIFICATION_TYPE_LABELS[notice.type] ?? notice.type,
        notice.title,
      ]),
    ),
  );

  /* 9. audit */
  content.push(
    heading(`9. Auditijälg (${data.audit.length})`),
    table(
      ['Aeg', 'Sündmus', 'Kes', 'Kirjeldus'],
      [13, 19, 17, 51],
      data.audit.map((row) => [
        shortInstant(row.occurredAt),
        row.eventType,
        row.viaLabel ? `${row.actorLabel} (${row.viaLabel})` : row.actorLabel,
        row.summary,
      ]),
    ),
  );

  /* 10. the fingerprint */
  content.push(
    heading('10. Protokolli sõrmejälg'),
    paragraph(
      'Protokoll on koostatud salvestatud andmetest ja neid ei arvutata uuesti. Allolev SHA-256 räsi on nende andmete kohta; sama räsi on rakenduse auditijäljes kandena „protocol.generated“. Kui räsi lehe jalusel ja auditijäljes kattuvad, on see dokument muutmata.',
    ),
    facts([
      ['Protokolli liik', PROTOCOL_KIND_LABELS[data.kind]],
      ['Koostatud', `${instant(data.generatedAt)} · ${data.generatedBy}`],
      ['Andmestruktuuri versioon', String(data.schemaVersion)],
      [
        'Jaotusalgoritmi versioon',
        data.allocation.final ? String(data.allocation.final.algorithmVersion) : DASH,
      ],
    ]),
    { text: 'SHA-256', style: 'label', margin: [0, 4, 0, 1] },
    { text: hash, font: 'Courier', fontSize: 8.5 },
    {
      text: 'Protokolli kinnitamine toimub väljaspool rakendust. Rakendus kinnitust tagasi ei kanna.',
      style: 'small',
      margin: [0, 10, 0, 0],
    },
  );

  return {
    pageSize: 'A4',
    pageMargins: [PAGE_MARGIN, 44, PAGE_MARGIN, 46],
    info: {
      title: `${PROTOCOL_KIND_LABELS[data.kind]} ${data.round.code}`,
      author: data.framework.buyerName,
      subject: frameworkTitleLine(data.framework),
      creator: 'Kaskaadhankija',
      // The document is the protocol's rendering, so it is dated by the
      // protocol rather than by the moment somebody pressed download.
      creationDate: new Date(data.generatedAt),
    },
    defaultStyle: { font: 'Helvetica', fontSize: 9, lineHeight: 1.15 },
    styles: {
      h1: { fontSize: 17, bold: true, margin: [0, 0, 0, 2] },
      h2: { fontSize: 12, bold: true },
      h3: { fontSize: 10, bold: true },
      subtitle: { fontSize: 11, bold: true, margin: [0, 0, 0, 3] },
      label: { bold: true, color: '#3d4854' },
      small: { fontSize: 8, color: '#5a6673' },
      th: { bold: true, fontSize: 8.5, fillColor: '#eef2f6' },
      td: { fontSize: 8.5 },
    },
    content,
    footer: (currentPage: number, pageCount: number) => ({
      margin: [PAGE_MARGIN, 8, PAGE_MARGIN, 0],
      columns: [
        {
          text: `Kaskaadhankija · ${data.round.code} · sõrmejälg ${short}`,
          fontSize: 7.5,
          color: '#5a6673',
        },
        {
          text: `lk ${currentPage}/${pageCount}`,
          fontSize: 7.5,
          color: '#5a6673',
          alignment: 'right',
        },
      ],
    }),
  };
}

/** Render a stored protocol to PDF bytes. */
export async function buildProtocolPdf(
  data: RoundProtocolData,
  hash: string,
): Promise<Buffer> {
  const definition = safeTree(buildDefinition(data, hash));
  const buffer = await pdfmake.createPdf(definition).getBuffer();
  return Buffer.from(buffer);
}
