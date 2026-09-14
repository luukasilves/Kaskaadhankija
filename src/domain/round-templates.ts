/**
 * Estonian notification copy for the parallel cascade — section D of
 * `docs/kaskaadi-ariloogika.md`.
 *
 * Pure functions returning `{ title, body, bodyHtml }`. The in-app notification
 * log renders `body`; SMTP, when configured, sends `bodyHtml`. Keeping both from
 * one source means the log a partner reads and the mail they received cannot
 * say different things.
 *
 * These texts go to real framework partners once the tool is live, so the
 * procurement team reviews them here.
 *
 * Which framework they name is **data**, not a constant [L-21]: every notice
 * input carries a `framework`, so the same texts serve whichever agreement the
 * environment is configured for, and the wording of an order document and of a
 * notice cannot drift apart.
 */

import { UNIT_WORDS, type UnitWords } from './clusters';
import { frameworkClause, frameworkSignature, type FrameworkIdentity } from './framework';

export interface RenderedNotice {
  title: string;
  /** plain text for the in-app log */
  body: string;
  /** inline-styled HTML for email */
  bodyHtml: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * One block of a notice: a paragraph, or a list that is rendered one item per
 * line in both forms. Lists used to be pre-joined strings; in HTML the newlines
 * collapsed and a partner's workshops ran together in one paragraph [D-01].
 */
export type NoticeBlock = string | { list: readonly string[] };

const HTML_LIST_STYLE = 'margin:0 0 1em;padding-left:1.2em';
const HTML_ITEM_STYLE = 'margin:0 0 6px';

/** The text form of a list — unchanged from before lists were blocks. */
function listText(items: readonly string[]): string {
  return items.map((item) => `· ${item}`).join('\n');
}

function blockText(block: NoticeBlock): string {
  return typeof block === 'string' ? block : listText(block.list);
}

function blockHtml(block: NoticeBlock): string {
  if (typeof block === 'string') return `<p>${escapeHtml(block)}</p>`;
  return `<ul style="${HTML_LIST_STYLE}">${block.list
    .map((item) => `<li style="${HTML_ITEM_STYLE}">${escapeHtml(item)}</li>`)
    .join('')}</ul>`;
}

function isEmptyBlock(block: NoticeBlock): boolean {
  return typeof block === 'string' ? block === '' : block.list.length === 0;
}

/** Compose the two renderings from one list of blocks. Empty blocks are skipped. */
export function composeNotice(
  title: string,
  blocks: readonly NoticeBlock[],
  link?: { url: string; label: string },
  framework?: FrameworkIdentity,
): RenderedNotice {
  const kept = blocks.filter((block) => !isEmptyBlock(block));
  const signature = framework ? frameworkSignature(framework) : '';
  const body = kept.map(blockText).join('\n\n') + (link ? `\n\n${link.label}: ${link.url}` : '');
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1c2530;max-width:640px">${kept
    .map(blockHtml)
    .join('')}${
    link
      ? `<p style="margin:24px 0"><a href="${escapeHtml(link.url)}" style="background:#14507d;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block">${escapeHtml(link.label)}</a></p>`
      : ''
  }${
    signature
      ? `<p style="margin-top:26px;color:#5a6673;font-size:13px">${escapeHtml(signature)}</p>`
      : ''
  }</div>`;
  return { title, body, bodyHtml: html };
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** A list block — one item per line in text and in HTML. */
function list(items: readonly string[]): NoticeBlock {
  return { list: items };
}

export interface RoundNoticeBase {
  roundCode: string;
  lotLabel: string;
  deadlineText: string;
  url: string;
  /** which framework agreement this notice is issued under [L-21] */
  framework: FrameworkIdentity;
  /**
   * [V-09] „koolitust“ in a dated round, „rühma“ in a cluster round. Absent
   * means a dated round, so every existing notice reads exactly as before.
   */
  unit?: UnitWords;
}

const unitOf = (input: { unit?: UnitWords }): UnitWords => input.unit ?? UNIT_WORDS.fixed;

/** [D-01] The round is published to every partner of the lot, at one instant. */
export function renderRoundPublished(
  input: RoundNoticeBase & {
    contactName: string;
    partnerName: string;
    trainingCount: number;
    trainingLines: string[];
    visibilityDynamic: boolean;
    /** which cap kinds this round offers [K-06][L-17] */
    capOptionsText: string;
    decisionText: string;
    /**
     * [L-28] In a cluster round, what is offered instead of „järgmised
     * koolitused (N)“ — e.g. „järgmise mahulise tellimuse (1 klaster, 10 rühma)“.
     */
    offerText?: string;
  },
): RenderedNotice {
  const unit = unitOf(input);
  return composeNotice(
    `Uus koolitustellimuste voor ${input.roundCode} — vastamistähtaeg ${input.deadlineText}`,
    [
      `Lugupeetud ${input.contactName}`,
      `${input.framework.buyerName} esitab ${frameworkClause(input.framework)} alusel, hankeosas ${input.lotLabel}, ettevõttele ${input.partnerName} ${input.offerText ?? `järgmised koolitused (${input.trainingCount})`}.`,
      list(input.trainingLines),
      input.unit && input.unit !== UNIT_WORDS.fixed
        ? `Palume märkida iga klastri juures, mitu rühma olete valmis läbi viima, ja oma valik kinnitada hiljemalt ${input.deadlineText}. Rühmad on omavahel vahetatavad: loeb, mitu rühma te võtate, mitte millised; toimumisajad perioodi sees lepitakse kokku pärast jaotust. ${input.capOptionsText}`
        : `Palume märkida koolitused, mida olete valmis läbi viima, ja oma valik kinnitada hiljemalt ${input.deadlineText}. ${input.capOptionsText}`,
      input.visibilityDynamic
        ? `Voor on avatud kõigile hankeosa partneritele korraga. Kuni tähtajani näete oma valiku juures esialgset prognoosi: kas ${unit.one} on saadaval, kas selle on märkinud eesõigusega partner ja mida te praeguse seisuga saaksite. Prognoos on esialgne ja võib muutuda kuni tähtajani.`
        : 'Voor on avatud kõigile hankeosa partneritele korraga. Jaotus selgub pärast vastamistähtaega.',
      `${capitalise(unit.many)} jaotatakse rangelt raamlepingu järjestuse alusel — vastamise kiirus ei anna eelist. Kui te tähtajaks ei kinnita, loetakse see loobumiseks. Jaotuse kinnitame eeldatavasti ${input.decisionText}.`,
    ],
    { url: input.url, label: 'Ava voor ja märgi koolitused' },
  );
}

/** [D-02] Receipt for a confirmation — the partner's written record. */
export function renderConfirmationReceipt(
  input: RoundNoticeBase & {
    contactName: string;
    confirmedAtText: string;
    trainingLines: string[];
    capText: string;
    projectionText: string;
  },
): RenderedNotice {
  return composeNotice(
    `Kinnitus vastu võetud — voor ${input.roundCode}`,
    [
      `Lugupeetud ${input.contactName}`,
      `Kinnitame, et võtsime teie valiku vastu ${input.confirmedAtText}. Voorus ${input.roundCode} (${input.lotLabel}) märkisite järgmised ${unitOf(input).many}:`,
      list(input.trainingLines),
      input.capText,
      input.projectionText,
      `Saate oma valikut muuta ja uuesti kinnitada kuni ${input.deadlineText}. Siduv on viimane kinnitus enne tähtaega.`,
    ],
    { url: input.url, label: 'Ava voor' },
  );
}

/** [D-03] Receipt for an explicit decline. */
export function renderDeclineReceipt(
  input: RoundNoticeBase & { contactName: string; confirmedAtText: string },
): RenderedNotice {
  return composeNotice(
    `Loobumine registreeritud — voor ${input.roundCode}`,
    [
      `Lugupeetud ${input.contactName}`,
      `Registreerisime ${input.confirmedAtText}, et loobute voorus ${input.roundCode} (${input.lotLabel}) pakutud koolitustest.`,
      `Kui soovite otsust muuta, saate seda teha kuni ${input.deadlineText}.`,
    ],
    { url: input.url, label: 'Ava voor' },
  );
}

/** [D-04] The partner's projection changed because a higher rank confirmed or revised. */
export function renderProjectionChanged(
  input: RoundNoticeBase & { contactName: string; previousCount: number; currentCount: number },
): RenderedNotice {
  const direction = input.currentCount > input.previousCount ? 'suurenes' : 'vähenes';
  const unit = unitOf(input);
  return composeNotice(
    `Prognoos muutus — voor ${input.roundCode}`,
    [
      `Lugupeetud ${input.contactName}`,
      `Voorus ${input.roundCode} (${input.lotLabel}) ${direction} teie prognoositud ${unit.ofMany} arv: ${input.previousCount} → ${input.currentCount}. Põhjus on eesõigusega partnerite kinnituste muutumine.`,
      `Prognoos on esialgne ja võib muutuda kuni tähtajani ${input.deadlineText}. Soovi korral saate oma valikut täiendada.`,
    ],
    { url: input.url, label: 'Vaata oma valikut' },
  );
}

/** [D-05] Reminder 24 hours before the deadline. */
export function renderDeadlineReminder(
  input: RoundNoticeBase & { contactName: string; statusText: string; projectionText: string },
): RenderedNotice {
  return composeNotice(
    `Meeldetuletus: voor ${input.roundCode} sulgub ${input.deadlineText}`,
    [
      `Lugupeetud ${input.contactName}`,
      `Voor ${input.roundCode} (${input.lotLabel}) sulgub ${input.deadlineText}.`,
      input.statusText,
      input.projectionText,
      'Tähtajaks kinnitamata valikut ei arvestata — loevad ainult kinnitatud märked.',
    ],
    { url: input.url, label: 'Ava voor' },
  );
}

/**
 * [D-11] The personal summary two hours before the deadline, for a partner who
 * has confirmed: their confirmed choice, the trainings the projection gives
 * them now, and their marks that would go elsewhere — each with its [N-03]
 * reason. Names nobody [N-04].
 */
export function renderFinalSummary(
  input: RoundNoticeBase & {
    contactName: string;
    remainingText: string;
    confirmedText: string;
    projectedLines: string[];
    lostLines: string[];
    /** [L-28] groups projected, when the lines are clusters rather than trainings */
    projectedCount?: number;
  },
): RenderedNotice {
  const unit = unitOf(input);
  // In a cluster round a line is a cluster, so the count is passed in.
  const projectedCount = input.projectedCount ?? input.projectedLines.length;
  return composeNotice(
    `Lõppkokkuvõte: voor ${input.roundCode} sulgub ${input.deadlineText}`,
    [
      `Lugupeetud ${input.contactName}`,
      `Voor ${input.roundCode} (${input.lotLabel}) sulgub ${input.deadlineText} (${input.remainingText}). ${input.confirmedText}`,
      input.projectedLines.length > 0
        ? `Praeguse seisuga prognoositakse teile ${projectedCount} ${unit.partitive}:`
        : `Praeguse seisuga ei prognoosita teile sellest voorust ühtegi ${unit.partitive}.`,
      list(input.projectedLines),
      input.lostLines.length > 0 ? `Teie märgitud ${unit.many}, mis praeguse seisuga läheksid mujale:` : '',
      list(input.lostLines),
      'Prognoos on esialgne ja võib muutuda kuni tähtajani. Kui soovite valikut muuta, kinnitage see enne tähtaega — loevad ainult kinnitatud märked.',
    ],
    { url: input.url, label: 'Ava voor' },
  );
}

/** [D-06] Deadline extended, a training withdrawn, or the round cancelled. */
export function renderRoundChanged(
  input: RoundNoticeBase & { contactName: string; changeText: string; reason: string },
): RenderedNotice {
  return composeNotice(
    `Muudatus voorus ${input.roundCode}`,
    [
      `Lugupeetud ${input.contactName}`,
      `Voorus ${input.roundCode} (${input.lotLabel}) on tehtud muudatus: ${input.changeText}`,
      input.reason ? `Põhjendus: ${input.reason}` : '',
      `Vastamistähtaeg on ${input.deadlineText}.`,
    ].filter(Boolean),
    { url: input.url, label: 'Ava voor' },
  );
}

export function renderRoundCancelled(
  input: Omit<RoundNoticeBase, 'deadlineText'> & { contactName: string; reason: string },
): RenderedNotice {
  return composeNotice(`Voor ${input.roundCode} on tühistatud`, [
    `Lugupeetud ${input.contactName}`,
    `Teatame, et voor ${input.roundCode} (${input.lotLabel}) on tellija poolt tühistatud ja teie märkeid ei arvestata.`,
    input.reason ? `Põhjendus: ${input.reason}` : '',
  ].filter(Boolean));
}

/** [E-01] The partner was excluded because their framework membership was deactivated. */
export function renderParticipantExcluded(
  input: Omit<RoundNoticeBase, 'deadlineText'> & { contactName: string; reason: string },
): RenderedNotice {
  return composeNotice(`Teid arvati voorust ${input.roundCode} välja`, [
    `Lugupeetud ${input.contactName}`,
    `Teatame, et teie osalus hankeosas ${input.lotLabel} on lõpetatud ja seetõttu ei arvestata teie märkeid voorus ${input.roundCode}.`,
    input.reason ? `Põhjendus: ${input.reason}` : '',
  ].filter(Boolean));
}

/**
 * [D-12] The round ended: the partner's own answer and the provisional outcome
 * of the closing allocation. The decision is made outside the application for
 * now [L-25], so this is the last word the partner gets from here about the
 * round — and it says plainly that it is not an order.
 */
export function renderRoundClosedPartner(
  input: RoundNoticeBase & {
    contactName: string;
    answerText: string;
    predictedLines: string[];
    /** [L-28] groups predicted, when the lines are clusters rather than trainings */
    predictedCount?: number;
  },
): RenderedNotice {
  const unit = unitOf(input);
  const predictedCount = input.predictedCount ?? input.predictedLines.length;
  return composeNotice(
    `Voor ${input.roundCode} on lõppenud — täname vastamast`,
    [
      `Lugupeetud ${input.contactName}`,
      `Vooru ${input.roundCode} (${input.lotLabel}) vastamisaeg lõppes ${input.deadlineText}. ${input.answerText}`,
      input.predictedLines.length > 0
        ? `Esialgse jaotuse järgi läheks teile ${predictedCount} ${unit.partitive}:`
        : `Esialgse jaotuse järgi ei läheks teile sellest voorust ühtegi ${unit.partitive}.`,
      list(input.predictedLines),
      `See on esialgne tulemus, mitte tellimus. ${input.framework.buyerName} vaatab jaotuse üle ja võtab tulemuse kinnitamiseks teiega eraldi ühendust.`,
    ],
    { url: input.url, label: 'Ava voor' },
  );
}

/**
 * [D-07][T-05] The order — the operative call-off contract.
 *
 * **Suspended** [L-25]: nothing sends this for now; see `issueOrders`.
 */
export function renderOrderIssued(
  input: Omit<RoundNoticeBase, 'deadlineText'> & {
    contactName: string;
    partnerName: string;
    orderNumber: string;
    trainingLines: string[];
    totalText: string;
    partnerConfirmedAtText: string;
    buyerConfirmedAtText: string;
    buyerContact: string;
  },
): RenderedNotice {
  return composeNotice(
    `Tellimus ${input.orderNumber} — olete määratud täitjana`,
    [
      `Lugupeetud ${input.contactName}`,
      `${capitalise(frameworkClause(input.framework))} alusel, hankeosas ${input.lotLabel}, olete voorus ${input.roundCode} määratud täitjana järgmistele koolitustele. Ettevõte: ${input.partnerName}.`,
      list(input.trainingLines),
      input.totalText,
      `Teie kinnitus on registreeritud ${input.partnerConfirmedAtText} ja tellija kinnitas jaotuse ${input.buyerConfirmedAtText}. Käesolev tellimus on raamlepingu alusel käsitletav hankelepinguna.`,
      `Korralduslikes küsimustes on kontaktisik ${input.buyerContact}.`,
    ],
    { url: input.url, label: 'Ava tellimus' },
  );
}

/**
 * [D-07][N-08] Marked trainings that went to somebody else.
 *
 * The wording is deliberately neutral — "määrati teisele partnerile" — and never
 * names a partner or gives a reason. A training can also move because the buyer
 * exercised the workload right, and that must not be disclosed either.
 */
export function renderAllocatedElsewhere(
  input: Omit<RoundNoticeBase, 'deadlineText'> & {
    contactName: string;
    trainingLines: string[];
    allocatedCount: number;
  },
): RenderedNotice {
  return composeNotice(
    `Voor ${input.roundCode} on kinnitatud`,
    [
      `Lugupeetud ${input.contactName}`,
      input.allocatedCount > 0
        ? `Voor ${input.roundCode} (${input.lotLabel}) on kinnitatud. Teile määratud koolitused leiate eraldi tellimuse teatest.`
        : `Voor ${input.roundCode} (${input.lotLabel}) on kinnitatud. Teile ei määratud sellest voorust koolitusi.`,
      'Järgmised teie märgitud koolitused määrati teisele partnerile:',
      list(input.trainingLines),
      'Täname osalemise eest. Järgmistes voorudes saate uuesti märkida.',
    ],
    { url: input.url, label: 'Ava voor' },
  );
}

/* ------------------------------------------------------------------ *
 * internal notices to the buyer team
 * ------------------------------------------------------------------ */

export function renderBuyerRoundClosed(
  input: Omit<RoundNoticeBase, 'deadlineText'> & {
    confirmedCount: number;
    declinedCount: number;
    noResponseCount: number;
    allocatedCount: number;
    leftoverCount: number;
  },
): RenderedNotice {
  return composeNotice(
    `Voor ${input.roundCode} sulgus — jaotusettepanek ootab kinnitust`,
    [
      `Voor ${input.roundCode} (${input.lotLabel}) sulgus ja jaotusettepanek on külmutatud.`,
      list([
        `kinnitas: ${input.confirmedCount}`,
        `loobus: ${input.declinedCount}`,
        `ei vastanud: ${input.noResponseCount}`,
        `ettepanekus jaotatud: ${input.allocatedCount}`,
        `jääk: ${input.leftoverCount}`,
      ]),
      input.leftoverCount > 0
        ? 'Jäägiks jäänud koolitused vajavad pärast kinnitamist eraldi otsust: uus voor, käsitsi määramine või tühistamine.'
        : 'Kõik vooru koolitused said ettepanekus täitja.',
    ],
    { url: input.url, label: 'Ava ülevaatus' },
  );
}

export function renderBuyerRoundConfirmed(
  input: Omit<RoundNoticeBase, 'deadlineText'> & {
    /** one line per partner with an allocation: rank, name, count */
    allocationLines: string[];
    leftoverCount: number;
    /** [L-22] where the signable record of this round is picked up */
    protocolUrl: string;
  },
): RenderedNotice {
  return composeNotice(
    `Voor ${input.roundCode} on kinnitatud — protokoll on valmis`,
    [
      `Vooru protokoll (PDF ja .xlsx lisa) on allalaadimiseks siin: ${input.protocolUrl}`,
      `Voor ${input.roundCode} (${input.lotLabel}) on kinnitatud. Lõplik jaotus partnerite kaupa:`,
      list(input.allocationLines),
      input.leftoverCount > 0
        ? `Jääk: ${input.leftoverCount} koolitus(t) ootab otsust.`
        : 'Jääki ei jäänud.',
      'Partneritele ei ole kinnitamisest teadet saadetud: otsus ja tellimus vormistatakse väljaspool rakendust. Partnerid said vooru sulgumisel kokkuvõtte oma esialgsest tulemusest.',
    ],
    { url: input.url, label: 'Ava voor' },
  );
}

/** [E-05] A partner tried to act after the deadline; recorded for the buyer. */
export function renderLateActionRejected(
  input: Omit<RoundNoticeBase, 'deadlineText'> & { partnerName: string; attemptedAtText: string },
): RenderedNotice {
  return composeNotice(`Hilinenud toiming voorus ${input.roundCode}`, [
    `Partner ${input.partnerName} üritas voorus ${input.roundCode} (${input.lotLabel}) toimingut teha pärast vastamistähtaega (${input.attemptedAtText}). Toiming lükati tagasi ja kanne on auditijäljes.`,
  ]);
}
