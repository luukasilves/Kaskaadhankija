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
 */

export interface RenderedNotice {
  title: string;
  /** plain text for the in-app log */
  body: string;
  /** inline-styled HTML for email */
  bodyHtml: string;
}

const FRAMEWORK =
  'raamleping „Eesti.ai koolitajate tellimine“ (riigihanke viitenumber 10567384)';

const SIGNATURE = 'Eesti.ai koolitusprogrammi tellimiskeskkond, Riigikantselei';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Compose the two renderings from one list of paragraphs. */
function compose(title: string, paragraphs: string[], link?: { url: string; label: string }): RenderedNotice {
  const body = paragraphs.join('\n\n') + (link ? `\n\n${link.label}: ${link.url}` : '');
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1c2530;max-width:640px">${paragraphs
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('')}${
    link
      ? `<p style="margin:24px 0"><a href="${escapeHtml(link.url)}" style="background:#14507d;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block">${escapeHtml(link.label)}</a></p>`
      : ''
  }<p style="margin-top:26px;color:#5a6673;font-size:13px">${SIGNATURE}</p></div>`;
  return { title, body, bodyHtml: html };
}

/** Bullet list rendered identically in both forms. */
function list(items: string[]): string {
  return items.map((item) => `· ${item}`).join('\n');
}

export interface RoundNoticeBase {
  roundCode: string;
  lotLabel: string;
  deadlineText: string;
  url: string;
}

/** [D-01] The round is published to every partner of the lot, at one instant. */
export function renderRoundPublished(
  input: RoundNoticeBase & {
    contactName: string;
    partnerName: string;
    trainingCount: number;
    trainingLines: string[];
    visibilityDynamic: boolean;
    decisionText: string;
  },
): RenderedNotice {
  return compose(
    `Uus koolitustellimuste voor ${input.roundCode} — vastamistähtaeg ${input.deadlineText}`,
    [
      `Lugupeetud ${input.contactName}`,
      `Riigikantselei esitab ${FRAMEWORK} alusel, hankeosas ${input.lotLabel}, ettevõttele ${input.partnerName} järgmised koolitused (${input.trainingCount}).`,
      list(input.trainingLines),
      `Palume märkida koolitused, mida olete valmis läbi viima, ja oma valik kinnitada hiljemalt ${input.deadlineText}. Soovi korral saate märkida ülempiiri („võtan vastu kuni N koolitust“).`,
      input.visibilityDynamic
        ? 'Voor on avatud kõigile hankeosa partneritele korraga. Kuni tähtajani näete oma valiku juures esialgset prognoosi: kas koolitus on saadaval, kas selle on märkinud eesõigusega partner ja mida te praeguse seisuga saaksite. Prognoos on esialgne ja võib muutuda kuni tähtajani.'
        : 'Voor on avatud kõigile hankeosa partneritele korraga. Jaotus selgub pärast vastamistähtaega.',
      `Koolitused jaotatakse rangelt raamlepingu järjestuse alusel — vastamise kiirus ei anna eelist. Kui te tähtajaks ei kinnita, loetakse see loobumiseks. Jaotuse kinnitame eeldatavasti ${input.decisionText}.`,
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
  return compose(
    `Kinnitus vastu võetud — voor ${input.roundCode}`,
    [
      `Lugupeetud ${input.contactName}`,
      `Kinnitame, et võtsime teie valiku vastu ${input.confirmedAtText}. Voorus ${input.roundCode} (${input.lotLabel}) märkisite järgmised koolitused:`,
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
  return compose(
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
  return compose(
    `Prognoos muutus — voor ${input.roundCode}`,
    [
      `Lugupeetud ${input.contactName}`,
      `Voorus ${input.roundCode} (${input.lotLabel}) ${direction} teie prognoositud koolituste arv: ${input.previousCount} → ${input.currentCount}. Põhjus on eesõigusega partnerite kinnituste muutumine.`,
      `Prognoos on esialgne ja võib muutuda kuni tähtajani ${input.deadlineText}. Soovi korral saate oma valikut täiendada.`,
    ],
    { url: input.url, label: 'Vaata oma valikut' },
  );
}

/** [D-05] Reminder 24 hours before the deadline. */
export function renderDeadlineReminder(
  input: RoundNoticeBase & { contactName: string; statusText: string; projectionText: string },
): RenderedNotice {
  return compose(
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

/** [D-06] Deadline extended, a training withdrawn, or the round cancelled. */
export function renderRoundChanged(
  input: RoundNoticeBase & { contactName: string; changeText: string; reason: string },
): RenderedNotice {
  return compose(
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
  return compose(`Voor ${input.roundCode} on tühistatud`, [
    `Lugupeetud ${input.contactName}`,
    `Teatame, et voor ${input.roundCode} (${input.lotLabel}) on tellija poolt tühistatud ja teie märkeid ei arvestata.`,
    input.reason ? `Põhjendus: ${input.reason}` : '',
  ].filter(Boolean));
}

/** [E-01] The partner was excluded because their framework membership was deactivated. */
export function renderParticipantExcluded(
  input: Omit<RoundNoticeBase, 'deadlineText'> & { contactName: string; reason: string },
): RenderedNotice {
  return compose(`Teid arvati voorust ${input.roundCode} välja`, [
    `Lugupeetud ${input.contactName}`,
    `Teatame, et teie osalus hankeosas ${input.lotLabel} on lõpetatud ja seetõttu ei arvestata teie märkeid voorus ${input.roundCode}.`,
    input.reason ? `Põhjendus: ${input.reason}` : '',
  ].filter(Boolean));
}

/** [D-07][T-05] The order — the operative call-off contract. */
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
  return compose(
    `Tellimus ${input.orderNumber} — olete määratud täitjana`,
    [
      `Lugupeetud ${input.contactName}`,
      `${FRAMEWORK} alusel, hankeosas ${input.lotLabel}, olete voorus ${input.roundCode} määratud täitjana järgmistele koolitustele. Ettevõte: ${input.partnerName}.`,
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
  return compose(
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
  return compose(
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
    orderLines: string[];
    leftoverCount: number;
  },
): RenderedNotice {
  return compose(
    `Voor ${input.roundCode} on kinnitatud`,
    [
      `Voor ${input.roundCode} (${input.lotLabel}) on kinnitatud ja tellimused loodud.`,
      list(input.orderLines),
      input.leftoverCount > 0
        ? `Jääk: ${input.leftoverCount} koolitus(t) ootab otsust.`
        : 'Jääki ei jäänud.',
    ],
    { url: input.url, label: 'Ava voor' },
  );
}

/** [E-05] A partner tried to act after the deadline; recorded for the buyer. */
export function renderLateActionRejected(
  input: Omit<RoundNoticeBase, 'deadlineText'> & { partnerName: string; attemptedAtText: string },
): RenderedNotice {
  return compose(`Hilinenud toiming voorus ${input.roundCode}`, [
    `Partner ${input.partnerName} üritas voorus ${input.roundCode} (${input.lotLabel}) toimingut teha pärast vastamistähtaega (${input.attemptedAtText}). Toiming lükati tagasi ja kanne on auditijäljes.`,
  ]);
}
