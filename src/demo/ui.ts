/**
 * Demo UI: renders every screen into #app and wires interactions by delegation.
 *
 * Deliberately framework-free so the whole demo fits in one portable HTML file.
 * The real app renders the same screens as React server components; the layout
 * and copy here are the reference for those.
 */

import {
  formatDateTime,
  formatDateTimeShort,
  formatEur,
  formatEurCents,
  formatIsoDay,
  formatRemaining,
  isDeadlineUrgent,
} from '../domain/format';
import { cascadeOrder } from '../domain/select-next';
import {
  COUNTIES,
  DECLINE_REASON_LABELS,
  LANGUAGE_LABELS,
  OFFER_STATUS_LABELS,
  OFFER_STATUS_TONES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  WORKSHOP_TYPE_LABELS,
  isOrderEditable,
  type DeclineReason,
  type OrderStatus,
} from '../domain/statuses';
import type { EmailMessage, Lot, Offer, Order } from './model';
import * as store from './store';

/* ------------------------------------------------------------------ *
 * view state
 * ------------------------------------------------------------------ */

type View =
  | { name: 'dashboard' }
  | { name: 'orders' }
  | { name: 'order'; id: string }
  | { name: 'order-form'; id: string | null }
  | { name: 'lots' }
  | { name: 'lot'; id: string }
  | { name: 'partners' }
  | { name: 'audit' };

type Modal =
  | { name: 'offer'; token: string; declining: boolean; notice: string | null }
  | { name: 'start'; orderId: string }
  | { name: 'skip'; orderId: string }
  | { name: 'manual'; orderId: string }
  | { name: 'cancel'; orderId: string }
  | null;

let view: View = { name: 'dashboard' };
let modal: Modal = null;
let expandedEmails = new Set<string>();
let toastMessage: string | null = null;
let toastTimer: number | null = null;
let formError: string | null = null;

const root = () => document.getElementById('app') as HTMLElement;

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toast(message: string): void {
  toastMessage = message;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage = null;
    render();
  }, 4000);
}

function go(next: View): void {
  view = next;
  modal = null;
  formError = null;
  window.scrollTo({ top: 0 });
  render();
}

/* ------------------------------------------------------------------ *
 * small building blocks
 * ------------------------------------------------------------------ */

function badge(label: string, tone: string): string {
  return `<span class="badge badge-${tone}">${esc(label)}</span>`;
}

function orderBadge(status: OrderStatus): string {
  return badge(ORDER_STATUS_LABELS[status], ORDER_STATUS_TONES[status]);
}

function offerBadge(offer: Offer): string {
  const label = offer.isManual
    ? 'Määratud käsitsi'
    : OFFER_STATUS_LABELS[offer.status];
  return badge(label, OFFER_STATUS_TONES[offer.status]);
}

function lotLabel(lot: Lot | undefined): string {
  return lot ? `${lot.code} — ${lot.name}` : '—';
}

function eventDatesText(order: Order): string {
  return order.eventEnd
    ? `${formatIsoDay(order.eventStart)} – ${formatIsoDay(order.eventEnd)}`
    : formatIsoDay(order.eventStart);
}

function action(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([key, value]) => `data-${key}="${esc(value)}"`)
    .join(' ');
}

/* ------------------------------------------------------------------ *
 * chrome
 * ------------------------------------------------------------------ */

function topbar(): string {
  const nowMs = store.now();
  const offsetDays = Math.round(store.clockOffsetMs() / 86_400_000);
  const shifted = Math.abs(store.clockOffsetMs()) > 60_000;
  return `
<header class="topbar">
  <div class="brand">Kaskaadhankija <span class="demo-badge">NÄIDIS</span></div>
  <div class="topbar-spacer"></div>
  <div class="clock">
    <span class="clock-label">Näidise aeg</span>
    <span class="clock-value">${esc(formatDateTimeShort(nowMs))}</span>
    ${shifted ? `<span class="badge badge-warning">${offsetDays >= 0 ? '+' : ''}${offsetDays} p</span>` : ''}
    <button class="small" ${action({ act: 'clock', ms: String(3600_000) })} title="Keri aega 1 tund edasi">+1 h</button>
    <button class="small" ${action({ act: 'clock', ms: String(86_400_000) })} title="Keri aega 1 ööpäev edasi">+1 päev</button>
    <button class="small primary" ${action({ act: 'clock-deadline' })} title="Keri aega kuni järgmise vastamistähtaja möödumiseni">Järgmise tähtajani</button>
  </div>
  <button ${action({ act: 'reset' })} title="Kustuta kõik näidise andmed ja alusta algusest">Lähtesta näidis</button>
</header>`;
}

function sidenav(): string {
  const counts = {
    cascading: store.ordersByStatus('cascading').length,
    orders: store.allOrders().length,
    failed: store.ordersByStatus('failed').length,
  };
  const item = (name: View['name'], label: string, count?: number, extra = '') => {
    const active = view.name === name || (name === 'orders' && view.name === 'order');
    return `<a class="${active ? 'active' : ''}" ${action({ act: 'nav', view: name })}>${esc(label)}${
      count !== undefined ? `<span class="nav-count">${count}</span>` : ''
    }${extra}</a>`;
  };
  return `
<nav class="sidenav">
  ${item('dashboard', 'Töölaud', counts.cascading || undefined)}
  ${item('orders', 'Tellimused', counts.orders)}
  ${item('lots', 'Hankeosad')}
  ${item('partners', 'Partnerid')}
  ${item('audit', 'Auditilogi')}
  ${counts.failed > 0 ? `<div class="small" style="margin-top:10px;padding:0 10px;color:var(--danger);font-weight:650">${counts.failed} tellimus(t) ilma partnerita</div>` : ''}
</nav>`;
}

/* ------------------------------------------------------------------ *
 * dashboard
 * ------------------------------------------------------------------ */

function introCard(): string {
  if (store.getState().introDismissed) return '';
  return `
<div class="intro">
  <h2>Kuidas seda näidist kasutada</h2>
  <p class="small">See on <strong>tööseisundis näidis</strong> kaskaadi-minihanke protsessist raamlepingu „Eesti.ai koolitajate tellimine“ alusel. Kogu kaskaadiloogika, vastamistähtaegade arvutus (tööpäevad ja riigipühad) ning auditijälg töötavad päriselt. Simuleeritud on kaks asja: e-kirjad kuvatakse paremal <strong>partneri postkastis</strong> päris saatmise asemel, ja aja saab <strong>edasi kerida</strong>, et näha tähtaja möödumist.</p>
  <ol class="small">
    <li>Ava paremal postkastis ootel pakkumus ja vajuta <em>Ava partneri vaates</em> — näed täpselt seda lehte, mida näeb koolitaja.</li>
    <li>Loobu tellimusest — kaskaad liigub automaatselt järjestuses järgmisele partnerile ja saadab talle uue pakkumuse.</li>
    <li>Või vajuta ülal <em>Järgmise tähtajani</em> — pakkumus aegub vastuseta ja kaskaad liigub edasi ise.</li>
  </ol>
  <div class="btn-row" style="margin-top:10px">
    <button class="small" ${action({ act: 'dismiss-intro' })}>Sain aru, peida see</button>
  </div>
</div>`;
}

function dashboard(): string {
  const nowMs = store.now();
  const pending = store.allPendingOffers();
  const failed = store.ordersByStatus('failed');

  const stats: Array<[string, number]> = [
    ['Ettevalmistuses', store.ordersByStatus('draft').length],
    ['Kaskaad käib', store.ordersByStatus('cascading').length],
    ['Määratud', store.ordersByStatus('assigned').length],
    ['Partnerit ei leitud', failed.length],
  ];

  const pendingRows = pending
    .map((offer) => {
      const order = store.getOrder(offer.orderId);
      if (!order) return '';
      const lp = store.getLotPartner(offer.lotPartnerId);
      const urgent = offer.deadlineAt !== null && isDeadlineUrgent(nowMs, offer.deadlineAt);
      return `
<tr class="clickable" ${action({ act: 'open-order', id: order.id })}>
  <td class="nowrap strong">${esc(store.orderNumber(order))}</td>
  <td>${esc(order.title)}</td>
  <td class="nowrap">${esc(store.partnerNameForLotPartner(offer.lotPartnerId))} <span class="rank-chip">${lp?.rank ?? '?'}</span></td>
  <td class="nowrap mono">${offer.deadlineAt ? esc(formatDateTimeShort(offer.deadlineAt)) : '—'}</td>
  <td class="nowrap ${urgent ? 'error-text' : 'muted'}">${offer.deadlineAt ? esc(formatRemaining(nowMs, offer.deadlineAt)) : '—'}</td>
</tr>`;
    })
    .join('');

  return `
${introCard()}
<div class="page-head">
  <div>
    <h1>Töölaud</h1>
    <p class="subtitle">Raamleping „Eesti.ai koolitajate tellimine“ · riigihanke viitenumber 10567384</p>
  </div>
  <button class="primary" ${action({ act: 'new-order' })}>Uus koolitustellimus</button>
</div>

${failed.length > 0 ? `<div class="danger-banner">${failed.length} tellimuse kaskaad on ammendunud — ükski partner ei võtnud tellimust vastu. Muuda tingimusi ja käivita uuesti või määra täitja käsitsi.</div>` : ''}

<div class="stat-grid">
  ${stats.map(([label, value]) => `<div class="stat"><div class="stat-value">${value}</div><div class="stat-label">${esc(label)}</div></div>`).join('')}
</div>

<div class="card">
  <div class="card-head"><h2>Ootel pakkumused</h2><span class="muted small">${pending.length} tk</span></div>
  <div class="card-body tight">
    ${
      pending.length === 0
        ? '<div class="empty">Ükski pakkumus ei oota praegu vastust.</div>'
        : `<div class="table-wrap"><table>
            <thead><tr><th>Number</th><th>Tellimus</th><th>Partner</th><th>Vastamistähtaeg</th><th>Aega jäänud</th></tr></thead>
            <tbody>${pendingRows}</tbody></table></div>`
    }
  </div>
</div>

${partnerLoadCard()}`;
}

/** Volume balancing: how much work each ranked partner currently holds. */
function partnerLoadCard(): string {
  const blocks = store
    .getState()
    .lots.map((lot) => {
      const rows = store
        .lotPartnersFor(lot.id)
        .map((lp) => {
          const outcomes = store.offerOutcomeCounts(lp.id);
          const count = store.assignedCountFor(lp.id);
          const value = store.assignedValueFor(lp.id);
          return `
<tr>
  <td class="nowrap"><span class="rank-chip">${lp.rank}</span></td>
  <td>${esc(store.partnerNameForLotPartner(lp.id))}${lp.isActive ? '' : ' <span class="badge badge-neutral">passiivne</span>'}</td>
  <td class="num">${count}</td>
  <td class="num nowrap">${esc(formatEur(value))}</td>
  <td class="num muted">${outcomes.declined}</td>
  <td class="num muted">${outcomes.expired}</td>
  <td class="num muted">${outcomes.skipped}</td>
</tr>`;
        })
        .join('');
      return `
<h3 style="margin:14px 0 6px">${esc(lotLabel(lot))} <span class="muted small" style="font-weight:500">· ${lot.rankingMode === 'strict' ? 'range järjestus' : 'rotatsioon'}</span></h3>
<div class="table-wrap"><table>
  <thead><tr><th>Koht</th><th>Partner</th><th class="num">Määratud</th><th class="num">Maksumus</th><th class="num">Loobus</th><th class="num">Aegus</th><th class="num">Vahele</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>`;
    })
    .join('');

  return `
<div class="card">
  <div class="card-head"><h2>Partnerite koormus</h2><span class="muted small">mahu tasakaalustamiseks</span></div>
  <div class="card-body">${blocks}</div>
</div>`;
}

/* ------------------------------------------------------------------ *
 * orders
 * ------------------------------------------------------------------ */

function ordersList(): string {
  const orders = store.allOrders();
  const rows = orders
    .map((order) => {
      const lot = store.getLot(order.lotId);
      const assignee = order.assignedLotPartnerId
        ? store.partnerNameForLotPartner(order.assignedLotPartnerId)
        : '—';
      return `
<tr class="clickable" ${action({ act: 'open-order', id: order.id })}>
  <td class="nowrap strong">${esc(store.orderNumber(order))}</td>
  <td>${esc(order.title)}</td>
  <td class="nowrap small">${esc(lot?.code ?? '—')}</td>
  <td class="nowrap">${orderBadge(order.status)}</td>
  <td class="nowrap mono small">${esc(eventDatesText(order))}</td>
  <td class="small">${esc(assignee)}</td>
  <td class="num nowrap small">${esc(formatEur(order.estimatedValueEur))}</td>
</tr>`;
    })
    .join('');

  return `
<div class="page-head">
  <div><h1>Tellimused</h1><p class="subtitle">${orders.length} koolitustellimust</p></div>
  <button class="primary" ${action({ act: 'new-order' })}>Uus koolitustellimus</button>
</div>
<div class="card"><div class="card-body tight">
  ${
    orders.length === 0
      ? '<div class="empty">Tellimusi ei ole. Alusta uue koolitustellimuse loomisest.</div>'
      : `<div class="table-wrap"><table>
          <thead><tr><th>Number</th><th>Tellimus</th><th>Osa</th><th>Olek</th><th>Toimumine</th><th>Täitja</th><th class="num">Maksumus</th></tr></thead>
          <tbody>${rows}</tbody></table></div>`
  }
</div></div>`;
}

function orderDetail(id: string): string {
  const order = store.getOrder(id);
  if (!order) return '<div class="empty">Tellimust ei leitud.</div>';
  const lot = store.getLot(order.lotId);
  const offers = store.offersFor(order.id);
  const pending = store.pendingOfferFor(order.id);
  const nowMs = store.now();

  const buttons: string[] = [];
  if (order.status === 'draft') {
    buttons.push(`<button class="primary" ${action({ act: 'open-start', id: order.id })}>Alusta kaskaadi</button>`);
    buttons.push(`<button ${action({ act: 'edit-order', id: order.id })}>Muuda</button>`);
  }
  if (order.status === 'cascading') {
    if (lot?.allowSkip) {
      buttons.push(`<button ${action({ act: 'open-skip', id: order.id })}>Jäta partner vahele</button>`);
    }
    buttons.push(`<button ${action({ act: 'resend', id: order.id })}>Saada pakkumus uuesti</button>`);
    buttons.push(`<button ${action({ act: 'abort', id: order.id })}>Katkesta kaskaad</button>`);
  }
  if (order.status === 'failed') {
    buttons.push(`<button class="primary" ${action({ act: 'open-start', id: order.id })}>Käivita kaskaad uuesti</button>`);
  }
  if (order.status !== 'assigned' && order.status !== 'completed' && order.status !== 'cancelled') {
    buttons.push(`<button ${action({ act: 'open-manual', id: order.id })}>Määra käsitsi</button>`);
  }
  if (order.status === 'assigned') {
    buttons.push(`<button class="success" ${action({ act: 'complete', id: order.id })}>Märgi lõpetatuks</button>`);
  }
  if (order.status !== 'cancelled' && order.status !== 'completed') {
    buttons.push(`<button class="danger" ${action({ act: 'open-cancel', id: order.id })}>Tühista tellimus</button>`);
  }

  const details: Array<[string, string]> = [
    ['Hankeosa', lotLabel(lot)],
    ['Formaat', WORKSHOP_TYPE_LABELS[order.workshopType]],
    ['Toimumine', eventDatesText(order)],
    ['Asukoht', order.locationText.trim() ? `${order.county} — ${order.locationText}` : order.county],
    ['Osalejaid', String(order.participantCount)],
    ['Keel', LANGUAGE_LABELS[order.language]],
    ['Hinnanguline maksumus', formatEurCents(order.estimatedValueEur)],
    ['Loodud', `${formatDateTimeShort(order.createdAt)} · ${order.createdBy}`],
  ];
  if (order.assignedLotPartnerId && order.assignedAt) {
    details.push([
      'Täitja',
      `${store.partnerNameForLotPartner(order.assignedLotPartnerId)} (${formatDateTimeShort(order.assignedAt)})`,
    ]);
  }
  if (order.snapshot) {
    details.push([
      'Kaskaadi seaded',
      `${order.snapshot.responseDeadlineWorkingDays} tööpäeva kell ${order.snapshot.deadlineLocalTime} · ${order.snapshot.rankingMode === 'strict' ? 'range järjestus' : 'rotatsioon'} · ring ${order.currentRun}`,
    ]);
  }

  return `
<div class="page-head">
  <div>
    <div class="btn-row"><button class="link" ${action({ act: 'nav', view: 'orders' })}>← Tellimused</button></div>
    <h1 style="margin-top:6px">${esc(store.orderNumber(order))} — ${esc(order.title)}</h1>
    <p class="subtitle">${orderBadge(order.status)}
      ${pending && pending.deadlineAt ? ` <span class="${isDeadlineUrgent(nowMs, pending.deadlineAt) ? 'error-text' : 'muted'}">Ootab vastust: ${esc(store.partnerNameForLotPartner(pending.lotPartnerId))}, ${esc(formatRemaining(nowMs, pending.deadlineAt))}</span>` : ''}
    </p>
  </div>
</div>

${!isOrderEditable(order.status) && order.status === 'cascading' ? '<div class="warning-banner">Kaskaadi ajal ei saa tellimuse sisu muuta — partnerile saadetud e-kiri peab vastama salvestatud tellimusele. Muutmiseks katkesta kaskaad.</div>' : ''}

<div class="btn-row" style="margin-bottom:16px">${buttons.join('')}</div>

<div class="card">
  <div class="card-head"><h2>Tellimuse andmed</h2></div>
  <div class="card-body">
    <dl class="detail-list">
      ${details.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
    </dl>
    ${order.extraNotes.trim() ? `<p class="small" style="margin-top:12px"><span class="muted">Lisainfo:</span> ${esc(order.extraNotes)}</p>` : ''}
  </div>
</div>

<div class="card">
  <div class="card-head"><h2>Kaskaadi käik</h2><span class="muted small">auditijälg pöördumiste kaupa</span></div>
  <div class="card-body">${cascadeTimeline(order, offers)}</div>
</div>

${orderAuditCard(order.id)}`;
}

/** Round-by-round cascade history — the human-readable audit trail. */
function cascadeTimeline(order: Order, offers: Offer[]): string {
  if (offers.length === 0) {
    const upcoming = cascadeOrder(
      store.lotPartnersFor(order.lotId).map((lp) => ({
        lotPartnerId: lp.id,
        rank: lp.rank,
        isActive: lp.isActive,
        assignedCount: store.assignedCountFor(lp.id),
      })),
      store.getLot(order.lotId)?.rankingMode ?? 'strict',
    );
    return `
<p class="muted">Kaskaadi ei ole veel käivitatud. Käivitamisel esitatakse tellimus järjestuses esimesele partnerile:</p>
<ol class="small" style="margin:8px 0 0;padding-left:22px">
  ${upcoming.map((c) => `<li>${esc(store.partnerNameForLotPartner(c.lotPartnerId))}</li>`).join('')}
</ol>`;
  }

  const nowMs = store.now();
  let lastRun = -1;
  const items = offers
    .map((offer) => {
      const lp = store.getLotPartner(offer.lotPartnerId);
      const tone = OFFER_STATUS_TONES[offer.status];
      const meta: string[] = [];
      if (offer.sentAt) meta.push(`saadetud ${formatDateTimeShort(offer.sentAt)}`);
      if (offer.deadlineAt) meta.push(`tähtaeg ${formatDateTimeShort(offer.deadlineAt)}`);
      if (offer.respondedAt) meta.push(`vastus ${formatDateTimeShort(offer.respondedAt)}`);
      if (offer.status === 'pending' && offer.deadlineAt) {
        meta.push(formatRemaining(nowMs, offer.deadlineAt));
      }

      let note = '';
      if (offer.status === 'declined') {
        const reason = offer.declineReasonCode
          ? DECLINE_REASON_LABELS[offer.declineReasonCode]
          : 'põhjust ei märgitud';
        note = `<div class="timeline-note"><strong>Loobumise põhjus:</strong> ${esc(reason)}${offer.declineReasonText ? ` — ${esc(offer.declineReasonText)}` : ''}</div>`;
      } else if (offer.status === 'skipped') {
        note = `<div class="timeline-note"><strong>Vahelejätmise põhjendus:</strong> ${esc(offer.skipJustification)}</div>`;
      } else if (offer.isManual) {
        note = `<div class="timeline-note"><strong>Käsitsi määramise põhjendus:</strong> ${esc(offer.skipJustification)}</div>`;
      }

      const divider =
        offer.runNo !== lastRun
          ? `<div class="run-divider">Kaskaadi ring ${offer.runNo}</div>`
          : '';
      lastRun = offer.runNo;

      const openBtn =
        offer.status === 'pending'
          ? `<button class="small primary" ${action({ act: 'open-offer', token: offer.token })}>Ava partneri vaates</button>`
          : '';

      return `${divider}
<li class="timeline-item">
  <span class="timeline-dot ${tone}"></span>
  <div class="timeline-head">
    <span class="rank-chip">${lp?.rank ?? '?'}</span>
    <strong>${esc(store.partnerNameForLotPartner(offer.lotPartnerId))}</strong>
    ${offerBadge(offer)}
    ${openBtn}
  </div>
  <div class="timeline-meta">Pöördumine ${offer.roundNo}${meta.length ? ` · ${esc(meta.join(' · '))}` : ''}</div>
  ${note}
</li>`;
    })
    .join('');

  const tail =
    order.status === 'failed'
      ? '<li class="timeline-item"><span class="timeline-dot danger"></span><div class="timeline-head"><strong>Kaskaad ammendunud</strong></div><div class="timeline-meta">Järjestuses rohkem partnereid ei olnud.</div></li>'
      : '';

  return `<ul class="timeline">${items}${tail}</ul>`;
}

function orderAuditCard(orderId: string): string {
  const events = store.auditFor(orderId);
  return `
<div class="card">
  <div class="card-head"><h2>Sündmuste logi</h2><span class="muted small">${events.length} kannet</span></div>
  <div class="card-body tight">
    <div class="table-wrap"><table>
      <thead><tr><th>Aeg</th><th>Osaleja</th><th>Sündmus</th><th>Kirjeldus</th></tr></thead>
      <tbody>${events
        .map(
          (e) => `<tr>
            <td class="nowrap mono small">${esc(formatDateTimeShort(e.occurredAt))}</td>
            <td class="small nowrap">${esc(e.actorLabel)}</td>
            <td class="small nowrap"><code>${esc(e.eventType)}</code></td>
            <td class="small">${esc(e.summary)}</td>
          </tr>`,
        )
        .join('')}</tbody>
    </table></div>
  </div>
</div>`;
}

/* ------------------------------------------------------------------ *
 * order form
 * ------------------------------------------------------------------ */

function orderForm(id: string | null): string {
  const order = id ? store.getOrder(id) : null;
  const lots = store.getState().lots.filter((l) => l.isActive);
  const today = new Date(store.now()).toISOString().slice(0, 10);

  const value = {
    lotId: order?.lotId ?? lots[0]?.id ?? '',
    title: order?.title ?? '',
    workshopType: order?.workshopType ?? 'tootuba_1',
    eventStart: order?.eventStart ?? today,
    eventEnd: order?.eventEnd ?? '',
    county: order?.county ?? 'Harju maakond',
    locationText: order?.locationText ?? '',
    participantCount: order?.participantCount ?? 25,
    language: order?.language ?? 'et',
    estimatedValueEur: order?.estimatedValueEur ?? 0,
    extraNotes: order?.extraNotes ?? '',
  };

  return `
<div class="page-head">
  <div>
    <div class="btn-row"><button class="link" ${action({ act: order ? 'open-order' : 'nav', view: 'orders', id: order?.id ?? '' })}>← Tagasi</button></div>
    <h1 style="margin-top:6px">${order ? 'Muuda tellimust' : 'Uus koolitustellimus'}</h1>
    <p class="subtitle">${order ? esc(store.orderNumber(order)) : 'Tellimus luuakse ettevalmistuse olekus — kaskaad käivitatakse eraldi.'}</p>
  </div>
</div>

${formError ? `<div class="danger-banner">${esc(formError)}</div>` : ''}

<form class="card" id="order-form" ${action({ formact: 'save-order', id: order?.id ?? '' })}>
  <div class="card-body">
    <div class="form-grid">
      <div class="field full">
        <label for="f-title">Tellimuse nimetus</label>
        <input id="f-title" name="title" required maxlength="160" value="${esc(value.title)}" placeholder="nt Töötuba 1 Tartu linnavalitsuse teenistujatele" />
      </div>
      <div class="field">
        <label for="f-lot">Hankeosa</label>
        <select id="f-lot" name="lotId">
          ${lots.map((l) => `<option value="${esc(l.id)}" ${l.id === value.lotId ? 'selected' : ''}>${esc(lotLabel(l))}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="f-type">Formaat</label>
        <select id="f-type" name="workshopType">
          ${Object.entries(WORKSHOP_TYPE_LABELS).map(([k, label]) => `<option value="${esc(k)}" ${k === value.workshopType ? 'selected' : ''}>${esc(label)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="f-start">Toimumise kuupäev</label>
        <input id="f-start" name="eventStart" type="date" required value="${esc(value.eventStart)}" />
      </div>
      <div class="field">
        <label for="f-end">Lõppkuupäev <span class="muted">(kui mitmepäevane)</span></label>
        <input id="f-end" name="eventEnd" type="date" value="${esc(value.eventEnd)}" />
      </div>
      <div class="field">
        <label for="f-county">Maakond</label>
        <select id="f-county" name="county">
          ${COUNTIES.map((c) => `<option value="${esc(c)}" ${c === value.county ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="f-location">Asukoht või platvorm</label>
        <input id="f-location" name="locationText" maxlength="160" value="${esc(value.locationText)}" placeholder="nt tellija ruumid, MS Teams" />
      </div>
      <div class="field">
        <label for="f-count">Osalejate arv</label>
        <input id="f-count" name="participantCount" type="number" min="1" max="2000" required value="${esc(value.participantCount)}" />
      </div>
      <div class="field">
        <label for="f-lang">Keel</label>
        <select id="f-lang" name="language">
          ${Object.entries(LANGUAGE_LABELS).map(([k, label]) => `<option value="${esc(k)}" ${k === value.language ? 'selected' : ''}>${esc(label)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="f-value">Hinnanguline maksumus (€)</label>
        <input id="f-value" name="estimatedValueEur" type="number" min="0" step="0.01" required value="${esc(value.estimatedValueEur)}" />
        <span class="hint">Raamlepingu ühikhinna alusel. Näidises eeltäidetakse hankeosa esimese partneri hinnaga.</span>
      </div>
      <div class="field full">
        <label for="f-notes">Lisainfo partnerile</label>
        <textarea id="f-notes" name="extraNotes" maxlength="600" placeholder="Osalejate taust, erisoovid, tehnilised nõuded">${esc(value.extraNotes)}</textarea>
      </div>
    </div>
  </div>
  <div class="modal-foot">
    <button type="button" ${action({ act: order ? 'open-order' : 'nav', view: 'orders', id: order?.id ?? '' })}>Loobu</button>
    <button type="submit" class="primary">${order ? 'Salvesta muudatused' : 'Loo tellimus'}</button>
  </div>
</form>`;
}

/* ------------------------------------------------------------------ *
 * lots + partners
 * ------------------------------------------------------------------ */

function lotsList(): string {
  const rows = store
    .getState()
    .lots.map((lot) => {
      const partners = store.lotPartnersFor(lot.id);
      return `
<tr class="clickable" ${action({ act: 'open-lot', id: lot.id })}>
  <td class="nowrap strong">${esc(lot.code)}</td>
  <td>${esc(lot.name)}</td>
  <td class="num">${partners.filter((p) => p.isActive).length}</td>
  <td class="nowrap small">${lot.responseDeadlineWorkingDays} tööpäeva, kell ${esc(lot.deadlineLocalTime)}</td>
  <td class="nowrap small">${lot.rankingMode === 'strict' ? 'Range järjestus' : 'Rotatsioon'}</td>
</tr>`;
    })
    .join('');

  return `
<div class="page-head">
  <div><h1>Hankeosad</h1><p class="subtitle">Kaskaadi seaded on hankeosa kaupa — täpsed tingimused tuleb enne kasutuselevõttu raamlepingu alusdokumentidega kokku viia.</p></div>
</div>
<div class="card"><div class="card-body tight"><div class="table-wrap"><table>
  <thead><tr><th>Kood</th><th>Nimetus</th><th class="num">Partnereid</th><th>Vastamistähtaeg</th><th>Järjestus</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div></div></div>`;
}

function lotDetail(id: string): string {
  const lot = store.getLot(id);
  if (!lot) return '<div class="empty">Hankeosa ei leitud.</div>';
  const partners = store.lotPartnersFor(lot.id);

  const rows = partners
    .map((lp, index) => `
<tr>
  <td class="nowrap"><span class="rank-chip">${lp.rank}</span></td>
  <td>
    <div class="strong">${esc(store.partnerNameForLotPartner(lp.id))}</div>
    <div class="muted small">${esc(lp.contactName)} · ${esc(lp.contactEmail)}</div>
  </td>
  <td class="num nowrap">${esc(formatEurCents(lp.unitPriceEur))}</td>
  <td class="num">${store.assignedCountFor(lp.id)}</td>
  <td class="nowrap">${lp.isActive ? badge('Aktiivne', 'success') : badge('Passiivne', 'neutral')}</td>
  <td class="nowrap">
    <div class="btn-row">
      <button class="small" ${action({ act: 'move-partner', id: lp.id, dir: '-1' })} ${index === 0 ? 'disabled' : ''} title="Tõsta järjestuses ülespoole">↑</button>
      <button class="small" ${action({ act: 'move-partner', id: lp.id, dir: '1' })} ${index === partners.length - 1 ? 'disabled' : ''} title="Vii järjestuses allapoole">↓</button>
      <button class="small" ${action({ act: 'toggle-partner', id: lp.id })}>${lp.isActive ? 'Deaktiveeri' : 'Aktiveeri'}</button>
    </div>
  </td>
</tr>`)
    .join('');

  return `
<div class="page-head">
  <div>
    <div class="btn-row"><button class="link" ${action({ act: 'nav', view: 'lots' })}>← Hankeosad</button></div>
    <h1 style="margin-top:6px">${esc(lot.code)} — ${esc(lot.name)}</h1>
    <p class="subtitle">${esc(lot.description)}</p>
  </div>
</div>

<form class="card" id="lot-form" ${action({ formact: 'save-lot', id: lot.id })}>
  <div class="card-head"><h2>Kaskaadi seaded</h2></div>
  <div class="card-body">
    <div class="form-grid">
      <div class="field">
        <label for="l-days">Vastamistähtaeg (tööpäevades)</label>
        <input id="l-days" name="responseDeadlineWorkingDays" type="number" min="1" max="20" required value="${lot.responseDeadlineWorkingDays}" />
        <span class="hint">Saatmise päev ei lähe arvesse. Nädalavahetused ja riigipühad jäetakse vahele.</span>
      </div>
      <div class="field">
        <label for="l-time">Tähtaja kellaaeg (Tallinna aeg)</label>
        <input id="l-time" name="deadlineLocalTime" type="time" required value="${esc(lot.deadlineLocalTime)}" />
      </div>
      <div class="field">
        <label for="l-mode">Järjestuse reegel</label>
        <select id="l-mode" name="rankingMode">
          <option value="strict" ${lot.rankingMode === 'strict' ? 'selected' : ''}>Range järjestus (alati madalaim vaba koht)</option>
          <option value="rotation" ${lot.rankingMode === 'rotation' ? 'selected' : ''}>Rotatsioon (eelistab väiksema koormusega partnerit)</option>
        </select>
      </div>
      <div class="field">
        <label for="l-skip">Vahelejätmine lubatud</label>
        <select id="l-skip" name="allowSkip">
          <option value="yes" ${lot.allowSkip ? 'selected' : ''}>Jah — põhjendus on alati kohustuslik</option>
          <option value="no" ${lot.allowSkip ? '' : 'selected'}>Ei</option>
        </select>
      </div>
    </div>
    <p class="hint" style="margin-top:12px">Käimasolevaid kaskaade need muudatused ei mõjuta: iga tellimus kasutab käivitamise hetkel salvestatud seadeid.</p>
  </div>
  <div class="modal-foot"><button type="submit" class="primary">Salvesta seaded</button></div>
</form>

<div class="card">
  <div class="card-head"><h2>Raamlepingu partnerid järjestuses</h2><span class="muted small">järjestus pärineb hanke hindamistulemustest</span></div>
  <div class="card-body tight"><div class="table-wrap"><table>
    <thead><tr><th>Koht</th><th>Partner ja kontakt</th><th class="num">Ühikhind</th><th class="num">Määratud</th><th>Olek</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div></div>
</div>`;
}

function partnersList(): string {
  const rows = store
    .getState()
    .partners.map((partner) => {
      const memberships = store
        .getState()
        .lotPartners.filter((lp) => lp.partnerId === partner.id)
        .sort((a, b) => (store.getLot(a.lotId)?.code ?? '').localeCompare(store.getLot(b.lotId)?.code ?? ''));
      const chips = memberships
        .map(
          (lp) =>
            `<span class="badge badge-${lp.isActive ? 'info' : 'neutral'}">${esc(store.getLot(lp.lotId)?.code ?? '')} · koht ${lp.rank}</span>`,
        )
        .join(' ');
      const contact = memberships[0];
      const assigned = memberships.reduce((sum, lp) => sum + store.assignedCountFor(lp.id), 0);
      return `
<tr>
  <td><div class="strong">${esc(partner.name)}</div><div class="muted small">Registrikood ${esc(partner.regCode)}</div></td>
  <td class="small">${contact ? `${esc(contact.contactName)}<br /><span class="muted">${esc(contact.contactEmail)}</span>` : '—'}</td>
  <td>${chips}</td>
  <td class="num">${assigned}</td>
</tr>`;
    })
    .join('');

  return `
<div class="page-head">
  <div><h1>Partnerid</h1><p class="subtitle">Näidise partnerid on väljamõeldud. Päris raamlepingu partnerid ja järjestused sisestatakse pärast raamlepingute sõlmimist.</p></div>
</div>
<div class="card"><div class="card-body tight"><div class="table-wrap"><table>
  <thead><tr><th>Partner</th><th>Kontakt</th><th>Hankeosad ja kohad</th><th class="num">Määratud</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div></div></div>`;
}

/* ------------------------------------------------------------------ *
 * audit
 * ------------------------------------------------------------------ */

function auditPage(): string {
  const events = store.allAudit();
  const rows = events
    .map((e) => {
      const order = e.orderId ? store.getOrder(e.orderId) : null;
      return `
<tr>
  <td class="nowrap mono small">${esc(formatDateTimeShort(e.occurredAt))}</td>
  <td class="small nowrap">${esc(e.actorLabel)}</td>
  <td class="small nowrap"><code>${esc(e.eventType)}</code></td>
  <td class="small nowrap">${order ? `<button class="link" ${action({ act: 'open-order', id: order.id })}>${esc(store.orderNumber(order))}</button>` : '—'}</td>
  <td class="small">${esc(e.summary)}</td>
</tr>`;
    })
    .join('');

  return `
<div class="page-head">
  <div><h1>Auditilogi</h1><p class="subtitle">${events.length} kannet. Päris rakenduses on see tabel muutmatu — andmebaasi trigger keelab UPDATE ja DELETE.</p></div>
</div>
<div class="card"><div class="card-body tight"><div class="table-wrap"><table>
  <thead><tr><th>Aeg</th><th>Osaleja</th><th>Sündmus</th><th>Tellimus</th><th>Kirjeldus</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div></div></div>`;
}

/* ------------------------------------------------------------------ *
 * mailbox
 * ------------------------------------------------------------------ */

function mailbox(): string {
  const emails = store.allEmails();
  return `
<aside class="mailbox">
  <div class="mailbox-head">
    <h2>Partneri postkast</h2>
    <span class="badge badge-neutral">${emails.length}</span>
  </div>
  <p class="mailbox-hint">Näidis ei saada päris e-kirju. Kõik kirjad, mida rakendus saadaks, ilmuvad siia — nii koolitajatele kui tellimismeeskonnale.</p>
  ${emails.length === 0 ? '<div class="empty">Kirju veel ei ole.</div>' : emails.map(mailCard).join('')}
</aside>`;
}

function mailCard(email: EmailMessage): string {
  const open = expandedEmails.has(email.id);
  const offer = email.offerId ? store.getOffer(email.offerId) : undefined;
  const actionable = email.template === 'offer' && offer?.status === 'pending';
  return `
<div class="mail ${actionable ? 'actionable' : ''}">
  <div class="mail-head" ${action({ act: 'toggle-mail', id: email.id })}>
    <div class="mail-to">
      <span>${email.internal ? 'Tellimismeeskonnale' : esc(email.toName)}</span>
      <span class="mono">${esc(formatDateTimeShort(email.sentAt))}</span>
    </div>
    <div class="mail-subject">${esc(email.subject)}</div>
    ${email.internal ? '' : `<div class="mail-to"><span class="muted">${esc(email.toEmail)}</span></div>`}
  </div>
  ${open ? `<div class="mail-body">${email.bodyHtml}</div>` : ''}
  ${
    actionable
      ? `<div class="mail-actions">
          <button class="small primary" ${action({ act: 'open-offer', token: offer.token })}>Ava partneri vaates →</button>
          <button class="small" ${action({ act: 'toggle-mail', id: email.id })}>${open ? 'Peida kiri' : 'Näita kirja'}</button>
        </div>`
      : ''
  }
</div>`;
}

/* ------------------------------------------------------------------ *
 * modals
 * ------------------------------------------------------------------ */

function modalShell(title: string, body: string, foot: string, extraClass = ''): string {
  return `
<div class="modal-backdrop" ${action({ act: 'close-modal-bg' })}>
  <div class="modal ${extraClass}">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="small" ${action({ act: 'close-modal' })}>Sulge</button></div>
    ${body}
    ${foot}
  </div>
</div>`;
}

/** The partner-facing offer page, exactly as a koolitaja would see it. */
function offerModal(token: string, declining: boolean, notice: string | null): string {
  const offer = store.getOfferByToken(token);
  if (!offer) {
    return modalShell('Pakkumust ei leitud', '<div class="modal-body"><p>See link ei ole kehtiv.</p></div>', '');
  }
  const order = store.getOrder(offer.orderId);
  const lot = order ? store.getLot(order.lotId) : undefined;
  const lp = store.getLotPartner(offer.lotPartnerId);
  if (!order || !lot || !lp) {
    return modalShell('Pakkumust ei leitud', '<div class="modal-body"><p>See link ei ole kehtiv.</p></div>', '');
  }

  const banner = `<div class="offer-banner">NÄIDIS · nii näeb seda lehte raamlepingu partner ${esc(store.partnerNameForLotPartner(offer.lotPartnerId))}</div>`;

  const details: Array<[string, string]> = [
    ['Hankeosa', lotLabel(lot)],
    ['Formaat', WORKSHOP_TYPE_LABELS[order.workshopType]],
    ['Toimumine', eventDatesText(order)],
    ['Asukoht', order.locationText.trim() ? `${order.county} — ${order.locationText}` : order.county],
    ['Osalejaid', String(order.participantCount)],
    ['Keel', LANGUAGE_LABELS[order.language]],
    ['Hinnanguline maksumus', formatEurCents(order.estimatedValueEur)],
  ];

  const detailsHtml = `
<p class="strong" style="margin-bottom:4px">${esc(store.orderNumber(order))} — ${esc(order.title)}</p>
<dl class="detail-list" style="margin-top:12px">${details.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
${order.extraNotes.trim() ? `<p class="small" style="margin-top:12px"><span class="muted">Lisainfo:</span> ${esc(order.extraNotes)}</p>` : ''}`;

  // Terminal states: show what was recorded rather than letting them answer twice.
  if (offer.status !== 'pending') {
    const message =
      offer.status === 'accepted'
        ? 'Olete selle tellimuse vastu võtnud. Aitäh!'
        : offer.status === 'declined'
          ? 'Olete sellest tellimusest loobunud. Tellimus on esitatud raamlepingu järjestuses järgmisele partnerile.'
          : offer.status === 'expired'
            ? 'Vastamise tähtaeg on möödunud. Tellimus on esitatud raamlepingu järjestuses järgmisele partnerile.'
            : 'See pakkumus ei ole enam aktuaalne — tellija on selle tühistanud.';
    return modalShell(
      'Koolitustellimus',
      `${banner}<div class="modal-body">
        <div class="warning-banner">${esc(message)}</div>
        ${detailsHtml}
        <p class="hint" style="margin-top:14px">Olek: ${esc(OFFER_STATUS_LABELS[offer.status])}${offer.respondedAt ? ` · ${esc(formatDateTimeShort(offer.respondedAt))}` : ''}</p>
      </div>`,
      `<div class="modal-foot"><button ${action({ act: 'close-modal' })}>Sulge</button></div>`,
      'offer-page',
    );
  }

  const deadlineText = offer.deadlineAt ? formatDateTime(offer.deadlineAt) : '—';

  if (declining) {
    return modalShell(
      'Loobumine tellimusest',
      `${banner}<div class="modal-body">
        ${notice ? `<div class="danger-banner">${esc(notice)}</div>` : ''}
        <p>Palun märkige loobumise põhjus. Põhjus salvestatakse hanke auditijälge.</p>
        <form id="decline-form" ${action({ formact: 'submit-decline', token })}>
          ${Object.entries(DECLINE_REASON_LABELS)
            .map(
              ([key, label], index) => `
            <div class="radio-row">
              <input type="radio" id="dr-${esc(key)}" name="reason" value="${esc(key)}" ${index === 0 ? 'checked' : ''} />
              <label for="dr-${esc(key)}">${esc(label)}</label>
            </div>`,
            )
            .join('')}
          <div class="field" style="margin-top:10px">
            <label for="dr-text">Täpsustus <span class="muted">(vabatahtlik, „Muu põhjuse“ puhul kohustuslik)</span></label>
            <textarea id="dr-text" name="text" maxlength="400" placeholder="nt koolitajad on sel nädalal hõivatud"></textarea>
          </div>
        </form>
      </div>`,
      `<div class="modal-foot">
        <button ${action({ act: 'open-offer', token })}>Tagasi</button>
        <button class="danger" ${action({ act: 'submit-decline-btn', token })}>Kinnita loobumine</button>
      </div>`,
      'offer-page',
    );
  }

  return modalShell(
    'Koolitustellimus',
    `${banner}<div class="modal-body">
      ${notice ? `<div class="danger-banner">${esc(notice)}</div>` : ''}
      <p>Riigikantselei esitab teile raamlepingu „Eesti.ai koolitajate tellimine“ alusel järgmise koolitustellimuse.</p>
      ${detailsHtml}
      <p style="margin-top:16px">Palume vastata hiljemalt <strong>${esc(deadlineText)}</strong>.
        <span class="muted small">(${esc(formatRemaining(store.now(), offer.deadlineAt ?? 0))})</span></p>
      <p class="hint">Kui te tähtajaks ei vasta, loetakse tellimus tagasi lükatuks ja see esitatakse järjestuses järgmisele partnerile.</p>
    </div>`,
    `<div class="modal-foot">
      <button ${action({ act: 'start-decline', token })}>Loobun tellimusest</button>
      <button class="success" ${action({ act: 'accept-offer', token })}>Võtan tellimuse vastu</button>
    </div>`,
    'offer-page',
  );
}

function startModal(orderId: string): string {
  const order = store.getOrder(orderId);
  if (!order) return '';
  const lot = store.getLot(order.lotId);
  const candidates = cascadeOrder(
    store.lotPartnersFor(order.lotId).map((lp) => ({
      lotPartnerId: lp.id,
      rank: lp.rank,
      isActive: lp.isActive,
      assignedCount: store.assignedCountFor(lp.id),
    })),
    lot?.rankingMode ?? 'strict',
  );

  const rows = candidates
    .map(
      (c, index) => `
<tr>
  <td class="nowrap"><span class="rank-chip">${index + 1}</span></td>
  <td>${esc(store.partnerNameForLotPartner(c.lotPartnerId))}<div class="muted small">Määratud tellimusi: ${c.assignedCount}</div></td>
  <td class="nowrap">
    <label class="small" style="font-weight:500;display:flex;gap:6px;align-items:center">
      <input type="checkbox" style="width:auto" name="skip-${esc(c.lotPartnerId)}" ${index === 0 ? '' : ''} ${lot?.allowSkip ? '' : 'disabled'} />
      jäta vahele
    </label>
  </td>
  <td><input type="text" name="just-${esc(c.lotPartnerId)}" maxlength="200" placeholder="põhjendus (kohustuslik)" ${lot?.allowSkip ? '' : 'disabled'} /></td>
</tr>`,
    )
    .join('');

  return modalShell(
    order.status === 'failed' ? 'Käivita kaskaad uuesti' : 'Alusta kaskaadi',
    `<div class="modal-body">
      <p>Tellimus <strong>${esc(store.orderNumber(order))}</strong> esitatakse järjestuses esimesele partnerile. Vastamistähtaeg on
      <strong>${lot?.responseDeadlineWorkingDays} tööpäeva</strong> kella ${esc(lot?.deadlineLocalTime ?? '17:00')}-ni
      (${lot?.rankingMode === 'strict' ? 'range järjestus' : 'rotatsioon'}).</p>
      ${order.status === 'failed' ? '<div class="warning-banner">Eelmine kaskaadi ring ammendus. Uus ring algab uuesti esimesest kohast ja kõik varasemad pöördumised jäävad auditijälge alles.</div>' : ''}
      <p class="hint">Soovi korral saad partnereid enne alustamist vahele jätta — iga vahelejätmine nõuab põhjendust ja jääb auditijälge.</p>
      <form id="start-form">
        <div class="table-wrap"><table>
          <thead><tr><th>Järjekord</th><th>Partner</th><th>Vahele</th><th>Põhjendus</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </form>
    </div>`,
    `<div class="modal-foot">
      <button ${action({ act: 'close-modal' })}>Loobu</button>
      <button class="primary" ${action({ act: 'confirm-start', id: orderId })}>Käivita kaskaad</button>
    </div>`,
  );
}

function justificationModal(
  title: string,
  intro: string,
  confirmLabel: string,
  confirmAct: string,
  orderId: string,
  extra = '',
): string {
  return modalShell(
    title,
    `<div class="modal-body">
      <p>${intro}</p>
      ${extra}
      <div class="field"><label for="j-text">Põhjendus</label>
        <textarea id="j-text" maxlength="400" placeholder="Selgitus jääb hanke auditijälge"></textarea>
      </div>
    </div>`,
    `<div class="modal-foot">
      <button ${action({ act: 'close-modal' })}>Loobu</button>
      <button class="primary" ${action({ act: confirmAct, id: orderId })}>${esc(confirmLabel)}</button>
    </div>`,
  );
}

function manualModal(orderId: string): string {
  const order = store.getOrder(orderId);
  if (!order) return '';
  const options = store
    .lotPartnersFor(order.lotId)
    .filter((lp) => lp.isActive)
    .map((lp) => `<option value="${esc(lp.id)}">${esc(store.partnerNameForLotPartner(lp.id))} (koht ${lp.rank})</option>`)
    .join('');
  return justificationModal(
    'Määra täitja käsitsi',
    'Käsitsi määramine läheb kaskaadist mööda. Kasuta seda näiteks siis, kui kokkulepe sündis telefoni teel või kui kaskaad ammendus.',
    'Määra täitja',
    'confirm-manual',
    orderId,
    `<div class="field"><label for="m-partner">Partner</label><select id="m-partner">${options}</select></div>`,
  );
}

function renderModal(): string {
  if (!modal) return '';
  switch (modal.name) {
    case 'offer':
      return offerModal(modal.token, modal.declining, modal.notice);
    case 'start':
      return startModal(modal.orderId);
    case 'skip':
      return justificationModal(
        'Jäta partner vahele',
        `Praegu ootab vastust <strong>${esc(store.partnerNameForLotPartner(store.pendingOfferFor(modal.orderId)?.lotPartnerId ?? ''))}</strong>. Vahelejätmisel esitatakse tellimus kohe järgmisele partnerile.`,
        'Jäta vahele',
        'confirm-skip',
        modal.orderId,
      );
    case 'manual':
      return manualModal(modal.orderId);
    case 'cancel':
      return justificationModal(
        'Tühista tellimus',
        'Tellimus tühistatakse. Kui mõni partner ootab praegu vastust, saadetakse talle teade.',
        'Tühista tellimus',
        'confirm-cancel',
        modal.orderId,
      );
    default:
      return '';
  }
}

/* ------------------------------------------------------------------ *
 * render
 * ------------------------------------------------------------------ */

function mainContent(): string {
  switch (view.name) {
    case 'dashboard':
      return dashboard();
    case 'orders':
      return ordersList();
    case 'order':
      return orderDetail(view.id);
    case 'order-form':
      return orderForm(view.id);
    case 'lots':
      return lotsList();
    case 'lot':
      return lotDetail(view.id);
    case 'partners':
      return partnersList();
    case 'audit':
      return auditPage();
    default:
      return '';
  }
}

const FOOTNOTE = `
<div class="footnote">
  <strong>Kaskaadhankija — näidis.</strong> Kaskaadiloogika, tööpäevade ja riigipühade arvestus ning auditijälg töötavad päriselt;
  e-kirjade saatmine ja aja kulg on simuleeritud. Partnerite nimed ja kontaktid on väljamõeldud.
  Kaskaadi täpsed tingimused (vastamistähtaeg, vahelejätmise reeglid, järjestuse reegel) tuleb enne kasutuselevõttu
  raamlepingu alusdokumentidega kokku viia — need on hankeosa kaupa seadistatavad.
  Andmed püsivad ainult selles brauseris.
</div>`;

export function render(): void {
  store.expireOverdue();
  const html = `
${topbar()}
<div class="layout with-mailbox">
  ${sidenav()}
  <main>${mainContent()}${FOOTNOTE}</main>
  ${mailbox()}
</div>
${renderModal()}
${toastMessage ? `<div class="toast">${esc(toastMessage)}</div>` : ''}`;
  root().innerHTML = html;
}

/* ------------------------------------------------------------------ *
 * interactions
 * ------------------------------------------------------------------ */

function readOrderForm(): store.OrderInput | null {
  const form = document.getElementById('order-form') as HTMLFormElement | null;
  if (!form) return null;
  const get = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '';
  const title = get('title').trim();
  if (!title) {
    formError = 'Tellimuse nimetus on kohustuslik.';
    return null;
  }
  const eventStart = get('eventStart');
  const eventEnd = get('eventEnd');
  if (eventEnd && eventEnd < eventStart) {
    formError = 'Lõppkuupäev ei saa olla enne alguskuupäeva.';
    return null;
  }
  const participantCount = Number(get('participantCount'));
  if (!Number.isFinite(participantCount) || participantCount < 1) {
    formError = 'Osalejate arv peab olema vähemalt 1.';
    return null;
  }
  return {
    lotId: get('lotId'),
    title,
    workshopType: get('workshopType') as store.OrderInput['workshopType'],
    eventStart,
    eventEnd: eventEnd || null,
    county: get('county') as store.OrderInput['county'],
    locationText: get('locationText').trim(),
    participantCount,
    language: get('language') as store.OrderInput['language'],
    estimatedValueEur: Number(get('estimatedValueEur')) || 0,
    extraNotes: get('extraNotes').trim(),
  };
}

function collectPreSkips(orderId: string): store.PreSkip[] {
  const order = store.getOrder(orderId);
  if (!order) return [];
  const skips: store.PreSkip[] = [];
  for (const lp of store.lotPartnersFor(order.lotId)) {
    const box = document.querySelector<HTMLInputElement>(`input[name="skip-${lp.id}"]`);
    const just = document.querySelector<HTMLInputElement>(`input[name="just-${lp.id}"]`);
    if (box?.checked) {
      skips.push({ lotPartnerId: lp.id, justification: just?.value.trim() ?? '' });
    }
  }
  return skips;
}

function guard(fn: () => void): void {
  try {
    fn();
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Toiming ebaõnnestus');
  }
  render();
}

function handleAction(act: string, el: HTMLElement): void {
  const id = el.dataset.id ?? '';
  const token = el.dataset.token ?? '';

  switch (act) {
    case 'nav':
      go({ name: (el.dataset.view ?? 'dashboard') as View['name'] } as View);
      return;
    case 'open-order':
      if (id) go({ name: 'order', id });
      return;
    case 'open-lot':
      go({ name: 'lot', id });
      return;
    case 'new-order':
      go({ name: 'order-form', id: null });
      return;
    case 'edit-order':
      go({ name: 'order-form', id });
      return;
    case 'dismiss-intro':
      store.dismissIntro();
      render();
      return;

    case 'clock': {
      const expired = store.advanceClock(Number(el.dataset.ms ?? '0'));
      if (expired > 0) toast(`${expired} pakkumus(t) aegus vastuseta — kaskaad liikus edasi.`);
      render();
      return;
    }
    case 'clock-deadline': {
      const expired = store.advanceToNextDeadline();
      toast(
        expired > 0
          ? `${expired} pakkumus(t) aegus vastuseta — kaskaad liikus edasi.`
          : 'Ükski pakkumus ei oota praegu vastust.',
      );
      render();
      return;
    }
    case 'reset':
      if (window.confirm('Kustutada kõik näidise andmed ja alustada algusest?')) {
        store.resetDemo();
        expandedEmails = new Set();
        go({ name: 'dashboard' });
      }
      return;

    case 'toggle-mail':
      if (expandedEmails.has(id)) expandedEmails.delete(id);
      else expandedEmails.add(id);
      render();
      return;

    case 'open-offer':
      modal = { name: 'offer', token, declining: false, notice: null };
      render();
      return;
    case 'start-decline':
      modal = { name: 'offer', token, declining: true, notice: null };
      render();
      return;
    case 'accept-offer': {
      const result = store.respondToOffer(token, 'accept');
      if (result.ok) {
        modal = null;
        toast('Partner võttis tellimuse vastu — tellimus on määratud.');
      } else {
        modal = { name: 'offer', token, declining: false, notice: responseProblem(result.reason) };
      }
      render();
      return;
    }
    case 'submit-decline-btn':
      submitDecline(token);
      return;

    case 'open-start':
      modal = { name: 'start', orderId: id };
      render();
      return;
    case 'confirm-start':
      guard(() => {
        const skips = collectPreSkips(id);
        const missing = skips.find((s) => !s.justification);
        if (missing) throw new Error('Iga vahelejäetud partneri kohta tuleb märkida põhjendus.');
        store.startCascade(id, skips);
        modal = null;
        toast('Kaskaad käivitatud — pakkumus saadetud järjestuses esimesele partnerile.');
      });
      return;

    case 'open-skip':
      modal = { name: 'skip', orderId: id };
      render();
      return;
    case 'confirm-skip':
      guard(() => {
        const text = (document.getElementById('j-text') as HTMLTextAreaElement | null)?.value ?? '';
        store.skipCurrentOffer(id, text);
        modal = null;
        toast('Partner jäeti vahele — pakkumus liikus järgmisele.');
      });
      return;

    case 'open-manual':
      modal = { name: 'manual', orderId: id };
      render();
      return;
    case 'confirm-manual':
      guard(() => {
        const partnerId = (document.getElementById('m-partner') as HTMLSelectElement | null)?.value ?? '';
        const text = (document.getElementById('j-text') as HTMLTextAreaElement | null)?.value ?? '';
        store.manualAssign(id, partnerId, text);
        modal = null;
        toast('Täitja määratud käsitsi — põhjendus salvestati auditijälge.');
      });
      return;

    case 'open-cancel':
      modal = { name: 'cancel', orderId: id };
      render();
      return;
    case 'confirm-cancel':
      guard(() => {
        const text = (document.getElementById('j-text') as HTMLTextAreaElement | null)?.value ?? '';
        store.cancelOrder(id, text);
        modal = null;
        toast('Tellimus tühistatud.');
      });
      return;

    case 'abort':
      guard(() => {
        store.abortCascade(id);
        toast('Kaskaad katkestatud — tellimus on nüüd muudetav.');
      });
      return;
    case 'resend':
      guard(() => {
        store.resendCurrentOffer(id);
        toast('Pakkumus saadeti uuesti, vastamistähtaeg algas uuesti.');
      });
      return;
    case 'complete':
      guard(() => {
        store.completeOrder(id);
        toast('Tellimus märgitud lõpetatuks.');
      });
      return;

    case 'move-partner':
      store.moveLotPartner(id, Number(el.dataset.dir) as -1 | 1);
      render();
      return;
    case 'toggle-partner':
      store.toggleLotPartnerActive(id);
      render();
      return;

    case 'close-modal':
      modal = null;
      render();
      return;
    default:
      return;
  }
}

function responseProblem(reason: string): string {
  switch (reason) {
    case 'already_responded':
      return 'Sellele pakkumusele on juba vastatud.';
    case 'expired':
      return 'Vastamise tähtaeg on möödunud — tellimus liikus järjestuses järgmisele partnerile.';
    case 'cancelled':
      return 'See pakkumus ei ole enam aktuaalne.';
    default:
      return 'Pakkumust ei leitud.';
  }
}

function submitDecline(token: string): void {
  const reason = (document.querySelector('input[name="reason"]:checked') as HTMLInputElement | null)
    ?.value as DeclineReason | undefined;
  const text = (document.getElementById('dr-text') as HTMLTextAreaElement | null)?.value ?? '';
  if (reason === 'other' && !text.trim()) {
    modal = { name: 'offer', token, declining: true, notice: 'Palun täpsustage muud põhjust.' };
    render();
    return;
  }
  const result = store.respondToOffer(token, 'decline', reason ?? null, text);
  if (result.ok) {
    modal = null;
    const order = store.getOfferByToken(token)?.orderId;
    const next = order ? store.pendingOfferFor(order) : undefined;
    toast(
      next
        ? `Partner loobus — pakkumus saadeti järgmisele: ${store.partnerNameForLotPartner(next.lotPartnerId)}.`
        : 'Partner loobus — järjestuses rohkem partnereid ei olnud.',
    );
  } else {
    modal = { name: 'offer', token, declining: false, notice: responseProblem(result.reason) };
  }
  render();
}

export function attachHandlers(): void {
  document.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-act]');
    if (!target) return;
    const act = target.dataset.act;
    if (!act) return;
    // Clicking the backdrop closes; clicking inside the dialog must not.
    if (act === 'close-modal-bg') {
      if (event.target === target) {
        modal = null;
        render();
      }
      return;
    }
    event.preventDefault();
    handleAction(act, target);
  });

  document.addEventListener('submit', (event) => {
    const form = event.target as HTMLFormElement;
    event.preventDefault();
    const formAct = form.dataset.formact;

    if (formAct === 'save-order') {
      formError = null;
      const input = readOrderForm();
      if (!input) {
        render();
        return;
      }
      const id = form.dataset.id;
      guard(() => {
        if (id) {
          store.updateOrder(id, input);
          view = { name: 'order', id };
          toast('Tellimus salvestatud.');
        } else {
          const created = store.createOrder(input);
          view = { name: 'order', id: created.id };
          toast('Tellimus loodud. Järgmine samm: alusta kaskaadi.');
        }
      });
      return;
    }

    if (formAct === 'save-lot') {
      const id = form.dataset.id ?? '';
      const get = (name: string) =>
        (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '';
      guard(() => {
        const days = Number(get('responseDeadlineWorkingDays'));
        if (!Number.isInteger(days) || days < 1) {
          throw new Error('Vastamistähtaeg peab olema vähemalt 1 tööpäev.');
        }
        store.updateLotConfig(id, {
          responseDeadlineWorkingDays: days,
          deadlineLocalTime: get('deadlineLocalTime') || '17:00',
          rankingMode: get('rankingMode') as Lot['rankingMode'],
          allowSkip: get('allowSkip') === 'yes',
        });
        toast('Hankeosa kaskaadi seaded salvestatud.');
      });
      return;
    }

    if (formAct === 'submit-decline') {
      submitDecline(form.dataset.token ?? '');
      return;
    }
  });

  // Keep deadline countdowns and expiry live without a user action.
  window.setInterval(() => {
    if (!modal) render();
  }, 30_000);
}
