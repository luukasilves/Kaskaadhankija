/**
 * Estonian email copy for the cascade.
 *
 * Lives in `domain/` deliberately: these are the texts that go to real
 * framework partners, the procurement team will review them, and the demo must
 * show byte-identical copy to what production sends. Inline styles only, since
 * mail clients ignore stylesheets.
 *
 * Note on rank: the offer email never tells a partner their position in the
 * cascade. Disclosing "you are third" would leak that others declined, and the
 * framework agreement does not require it.
 */

export interface OrderSummaryLines {
  workshopType: string;
  eventDates: string;
  location: string;
  participantCount: number;
  language: string;
  estimatedValue: string;
  extraNotes: string;
}

export interface OfferEmailInput {
  orderNumber: string;
  orderTitle: string;
  lotCode: string;
  lotName: string;
  contactName: string;
  partnerName: string;
  deadlineText: string;
  offerUrl: string;
  summary: OrderSummaryLines;
}

export interface RenderedEmail {
  subject: string;
  bodyHtml: string;
}

const FRAMEWORK_REFERENCE =
  'raamleping „Eesti.ai koolitajate tellimine“ (riigihanke viitenumber 10567384)';

const SIGNATURE = 'Eesti.ai koolitusprogrammi tellimiskeskkond<br />Riigikantselei';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shell(inner: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1c2530;max-width:640px">${inner}<p style="margin-top:28px;color:#5a6673;font-size:13px">${SIGNATURE}</p></div>`;
}

function detailRows(summary: OrderSummaryLines): string {
  const rows: Array<[string, string]> = [
    ['Koolituse formaat', summary.workshopType],
    ['Kuupäev', summary.eventDates],
    ['Asukoht', summary.location],
    ['Osalejate arv', String(summary.participantCount)],
    ['Keel', summary.language],
    ['Hinnanguline maksumus', summary.estimatedValue],
  ];
  if (summary.extraNotes.trim()) rows.push(['Lisainfo', summary.extraNotes]);

  const cells = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#5a6673;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(value)}</td></tr>`,
    )
    .join('');

  return `<table style="border-collapse:collapse;margin:18px 0">${cells}</table>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:26px 0"><a href="${escapeHtml(url)}" style="background:#14507d;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block">${escapeHtml(label)}</a></p>`;
}

/** The offer itself: sent to one framework partner, one cascade round. */
export function renderOfferEmail(input: OfferEmailInput): RenderedEmail {
  const subject = `Koolitustellimus ${input.orderNumber} — palume vastust hiljemalt ${input.deadlineText}`;

  const bodyHtml = shell(`
<p>Lugupeetud ${escapeHtml(input.contactName)}</p>
<p>Riigikantselei esitab ${FRAMEWORK_REFERENCE} alusel, hankeosas <strong>${escapeHtml(input.lotCode)} — ${escapeHtml(input.lotName)}</strong>, ettevõttele ${escapeHtml(input.partnerName)} järgmise koolitustellimuse.</p>
<p style="margin-bottom:0"><strong>${escapeHtml(input.orderNumber)} — ${escapeHtml(input.orderTitle)}</strong></p>
${detailRows(input.summary)}
<p>Palume tellimuse vastu võtta või sellest loobuda hiljemalt <strong>${escapeHtml(input.deadlineText)}</strong>.</p>
${button(input.offerUrl, 'Ava tellimus ja vasta')}
<p style="color:#5a6673;font-size:13px">Link on isiklik ja ühekordne. Kui te tähtajaks ei vasta, loetakse tellimus tagasi lükatuks ja see esitatakse raamlepingu järjestuses järgmisele partnerile.</p>`);

  return { subject, bodyHtml };
}

export interface AcceptedPartnerEmailInput {
  orderNumber: string;
  orderTitle: string;
  partnerName: string;
  contactName: string;
  buyerContact: string;
  summary: OrderSummaryLines;
}

/** Confirmation to the partner who accepted. */
export function renderAcceptedPartnerEmail(input: AcceptedPartnerEmailInput): RenderedEmail {
  return {
    subject: `Kinnitus: koolitustellimus ${input.orderNumber} on kinnitatud`,
    bodyHtml: shell(`
<p>Lugupeetud ${escapeHtml(input.contactName)}</p>
<p>Kinnitame, et koolitustellimus <strong>${escapeHtml(input.orderNumber)} — ${escapeHtml(input.orderTitle)}</strong> on ${FRAMEWORK_REFERENCE} alusel kinnitatud ettevõttele ${escapeHtml(input.partnerName)}.</p>
${detailRows(input.summary)}
<p>Tellimuse korraldusliku poole osas on kontaktisik ${escapeHtml(input.buyerContact)}.</p>`),
  };
}

export interface TeamEmailInput {
  orderNumber: string;
  orderTitle: string;
  partnerName: string;
  detail: string;
  orderUrl: string;
}

/** Internal notice: a partner accepted. */
export function renderAcceptedTeamEmail(input: TeamEmailInput): RenderedEmail {
  return {
    subject: `${input.orderNumber} määratud — ${input.partnerName}`,
    bodyHtml: shell(`
<p>Koolitustellimus <strong>${escapeHtml(input.orderNumber)} — ${escapeHtml(input.orderTitle)}</strong> on vastu võetud.</p>
<p>Partner: <strong>${escapeHtml(input.partnerName)}</strong><br />${escapeHtml(input.detail)}</p>
${button(input.orderUrl, 'Ava tellimus')}`),
  };
}

/** Internal notice: a partner declined and the cascade moved on. */
export function renderDeclinedTeamEmail(input: TeamEmailInput): RenderedEmail {
  return {
    subject: `${input.orderNumber} — ${input.partnerName} loobus`,
    bodyHtml: shell(`
<p>Koolitustellimuse <strong>${escapeHtml(input.orderNumber)} — ${escapeHtml(input.orderTitle)}</strong> puhul loobus partner <strong>${escapeHtml(input.partnerName)}</strong>.</p>
<p>${escapeHtml(input.detail)}</p>
${button(input.orderUrl, 'Ava tellimus')}`),
  };
}

export interface ExhaustedTeamEmailInput {
  orderNumber: string;
  orderTitle: string;
  lotName: string;
  attemptCount: number;
  orderUrl: string;
}

/** Internal alert: every partner in the lot declined, expired or was skipped. */
export function renderExhaustedTeamEmail(input: ExhaustedTeamEmailInput): RenderedEmail {
  return {
    subject: `${input.orderNumber} — partnerit ei leitud`,
    bodyHtml: shell(`
<p>Koolitustellimuse <strong>${escapeHtml(input.orderNumber)} — ${escapeHtml(input.orderTitle)}</strong> kaskaad on ammendunud: hankeosas ${escapeHtml(input.lotName)} ei võtnud tellimust vastu ükski raamlepingu partner (${input.attemptCount} pöördumist).</p>
<p>Võimalikud järgmised sammud: muuda tellimuse tingimusi ja käivita kaskaad uuesti, või määra täitja käsitsi koos põhjendusega.</p>
${button(input.orderUrl, 'Ava tellimus')}`),
  };
}

export interface CancelledPartnerEmailInput {
  orderNumber: string;
  orderTitle: string;
  contactName: string;
  reason: string;
}

/** Courtesy notice when an order is cancelled while a partner held a live offer. */
export function renderCancelledPartnerEmail(input: CancelledPartnerEmailInput): RenderedEmail {
  return {
    subject: `Koolitustellimus ${input.orderNumber} on tühistatud`,
    bodyHtml: shell(`
<p>Lugupeetud ${escapeHtml(input.contactName)}</p>
<p>Teatame, et koolitustellimus <strong>${escapeHtml(input.orderNumber)} — ${escapeHtml(input.orderTitle)}</strong> on tellija poolt tühistatud ja ootab teie vastust enam ei vaja.</p>
${input.reason.trim() ? `<p>Põhjus: ${escapeHtml(input.reason)}</p>` : ''}`),
  };
}
