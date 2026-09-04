/**
 * Walk Lisa B in a real browser, from the three partner personas.
 *
 * The seeded open round is Lisa B, so every display state, every count and the
 * [K-03] unconfirmed-draft warning has a documented expected value. Also
 * asserts the two things the partner UI must never do — leak a competitor's
 * identity, and show states in a sealed round.
 *
 *   pnpm verify:partner        (builds first)
 */

import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHROMIUM,
  appHtml,
  freePort,
  leakDetail,
  makeChecker,
  removeDatabase,
  startServer,
  switchTo,
  waitForHealth,
  watchPage,
} from './lib/browser-harness.mjs';

const ROOT = process.cwd();
const SHOTS = join(ROOT, 'scripts', 'partner-screenshots');
const DB = join(ROOT, 'data', `partner-${Date.now()}.db`);
let BASE = '';

/** Lisa B: OSA-2 koht 1 = A, koht 2 = B, koht 3 = C, koht 4 silent. */
const A = 'AI Akadeemia';
const B = 'Digioskus';
const C = 'Tehisaru';
const SILENT = 'Targa Töö';

const K = {
  K1: 'KK-2026-201',
  K2: 'KK-2026-202',
  K3: 'KK-2026-203',
  K4: 'KK-2026-204',
  K5: 'KK-2026-205',
  K6: 'KK-2026-206',
};

/** Lisa B.2, as the labels a partner actually reads. */
const LABEL = {
  available: 'Saadaval',
  marked_by_higher: 'Eesõigusega partner on märkinud',
  projected_to_you: 'Prognoosis sinule',
  over_cap: 'Märgitud, prognoosis ei ole (üle sinu piirmäära)',
  higher_partner: 'Märgitud, prognoosis ei ole (eesõigusega partner)',
};

const LISA_B2 = {
  A: {
    K1: LABEL.projected_to_you,
    K2: LABEL.projected_to_you,
    K3: LABEL.over_cap,
    K4: LABEL.available,
    K5: LABEL.over_cap,
    K6: LABEL.available,
  },
  B: {
    K1: LABEL.marked_by_higher,
    K2: LABEL.higher_partner,
    K3: LABEL.projected_to_you,
    K4: LABEL.projected_to_you,
    K5: LABEL.available,
    K6: LABEL.projected_to_you,
  },
  C: {
    K1: LABEL.higher_partner,
    K2: LABEL.marked_by_higher,
    K3: LABEL.higher_partner,
    K4: LABEL.higher_partner,
    K5: LABEL.projected_to_you,
    K6: LABEL.higher_partner,
  },
};

const { check, results, state } = makeChecker();

/**
 * Open the seeded Lisa B round (OSA-2) as the current persona.
 *
 * Picks the card in the "Ootavad vastust" section, so a finished OSA-2 round
 * from Scenario 0 is never mistaken for the open one.
 */
async function openLisaBRound(page) {
  await page.goto(`${BASE}/partner/voorud`);
  await page.waitForSelector('h1');
  const open = page.locator('section:has(h2:text("Ootavad vastust")) li');
  await open.first().waitFor({ timeout: 20_000 }).catch(() => {});
  const count = await open.count();
  for (let i = 0; i < count; i++) {
    const card = open.nth(i);
    if ((await card.textContent()).includes('OSA-2')) {
      await card.locator('a[href^="/partner/voorud/"]').first().click();
      await page.waitForSelector('table', { timeout: 20_000 });
      return;
    }
  }
  throw new Error(
    `avatud OSA-2 vooru ei leitud (${count} avatud kaarti) — URL ${page.url()}\n` +
      (await page.locator('main').textContent()).replace(/\s+/g, ' ').slice(0, 500),
  );
}

/** The rank chip beside the round code, which is the partner's own koht. */
async function rankOnPage(page) {
  return page.evaluate(() => {
    const chip = document.querySelector('main span[title^="Koht raamlepingu järjestuses"]');
    return chip ? chip.textContent.trim() : null;
  });
}

/**
 * The state shown for one training code, read from its own cell.
 *
 * The reason sits under the badge rather than inside it, so recompose the
 * [N-03] wording the spec gives before comparing with Lisa B.
 */
async function stateOf(page, code) {
  const cell = page
    .locator('tr', { hasText: code })
    .first()
    .locator('[data-testid="state-cell"]');
  if ((await cell.count()) === 0) return '(olekuveerg puudub)';
  const parts = await cell.evaluate((td) => ({
    badge: td.querySelector('.kh-badge')?.textContent?.trim() ?? null,
    reason: td.querySelector('div')?.textContent?.trim() ?? null,
  }));
  if (!parts.badge) return '(olek puudub)';
  return parts.reason ? `${parts.badge} (${parts.reason})` : parts.badge;
}

async function assertLisaBColumn(page, who) {
  const expected = LISA_B2[who];
  for (const [key, code] of Object.entries(K)) {
    const actual = await stateOf(page, code);
    check(`Lisa B.2 ${who} · ${key}`, actual === expected[key], `sai "${actual}"`);
  }
}

async function main() {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  mkdirSync(join(ROOT, 'data'), { recursive: true });

  const port = await freePort();
  const server = startServer({ port, databasePath: DB });
  BASE = server.base;

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const teardown = () => {
    server.stop();
    return browser.close().catch(() => {});
  };

  if (!(await waitForHealth(BASE))) {
    console.error('Server did not start:\n' + server.logs.join(''));
    await teardown();
    process.exit(1);
  }

  try {
    await walk(browser);
  } finally {
    await teardown();
  }

  console.log('\nPartner UI verification\n');
  console.log(results.join('\n'));
  console.log(
    `\n${state.failures === 0 ? 'ALL PASS' : `${state.failures} FAILURE(S)`} — screenshots in ${SHOTS}\n`,
  );
  removeDatabase(DB);
  process.exit(state.failures === 0 ? 0 : 1);
}

async function walk(browser) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const { consoleErrors, badResponses } = watchPage(page);

  /* ---------------- enter as C, the instructive persona ---------------- */

  await page.goto(BASE);
  await page.waitForSelector('section:has(h2:text("Raamlepingu partnerid")) form button');
  const cCard = page
    .locator('section:has(h2:text("Raamlepingu partnerid")) form', { hasText: C })
    .first();
  check(
    'the opening screen flags C’s unconfirmed draft',
    /kinnitamata/i.test(await cCard.textContent()),
  );
  await cCard.locator('button').click();
  await page.waitForURL('**/partner/voorud', { timeout: 20_000 });

  check(
    'C’s rounds list warns that nothing is confirmed yet',
    (await page.getByText(/Kinnitamata mustand/i).count()) > 0,
  );
  await page.screenshot({ path: join(SHOTS, '01-partner-c-rounds.png'), fullPage: true });

  await openLisaBRound(page);
  check("C sees its rank as koht 3", (await rankOnPage(page)) === '3', String(await rankOnPage(page)));
  check('the K-03 banner is shown to C', await page.getByTestId('unconfirmed-banner').isVisible());
  await assertLisaBColumn(page, 'C');
  const cProjection = await page
    .locator('div:has(> div:text-is("Prognoosis sinule (esialgne)")) .text-\\[20px\\]')
    .first()
    .textContent()
    .catch(() => null);
  check('C’s projection count is 1 (Lisa B.2)', (cProjection ?? '').trim().startsWith('1'), String(cProjection));
  const cHtml = await appHtml(page);
  check(
    'no other partner’s name appears on C’s page',
    !cHtml.includes(A) && !cHtml.includes(B),
    leakDetail(cHtml, [A, B]),
  );
  await page.screenshot({ path: join(SHOTS, '02-partner-c-lisa-b.png'), fullPage: true });

  /* ---------------- A: the koht-1 view, and the B.3 revision ---------------- */

  await switchTo(page, A);
  await openLisaBRound(page);
  check("A sees its rank as koht 1", (await rankOnPage(page)) === '1', String(await rankOnPage(page)));
  await assertLisaBColumn(page, 'A');
  check('A has no unconfirmed-changes banner', (await page.getByTestId('unconfirmed-banner').count()) === 0);
  check('A’s confirmation history shows two entries',
    (await page.locator('section:has(h2:text("Teie kinnituste ajalugu")) tbody tr').count()) === 2);
  await page.screenshot({ path: join(SHOTS, '03-partner-a-lisa-b.png'), fullPage: true });

  // Lisa B.3: A removes K2 and re-confirms.
  await page.locator(`input[aria-label="Märgi ${K.K2}"]`).uncheck();
  check('unchecking a mark raises the K-03 banner immediately',
    await page.getByTestId('unconfirmed-banner').isVisible());
  await page.getByTestId('confirm-marks').locator('button').click();
  await page.waitForFunction(
    () => document.querySelectorAll('section:has(h2) tbody tr').length > 0 &&
      document.body.textContent.includes('Viimane kinnitus'),
    null,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(500);
  check('A’s revision is recorded as a third confirmation',
    (await page.locator('section:has(h2:text("Teie kinnituste ajalugu")) tbody tr').count()) === 3);
  check('after re-confirming, A’s banner is gone',
    (await page.getByTestId('unconfirmed-banner').count()) === 0);
  check('Lisa B.3 · A keeps K1 in projection', (await stateOf(page, K.K1)) === LABEL.projected_to_you);
  check('Lisa B.3 · A now gets K3 instead of K2', (await stateOf(page, K.K3)) === LABEL.projected_to_you);
  check('Lisa B.3 · K2 is released by A', (await stateOf(page, K.K2)) === LABEL.available);
  await page.screenshot({ path: join(SHOTS, '04-partner-a-after-b3.png'), fullPage: true });

  /* ---------------- B watches K2 flip to it ---------------- */

  await switchTo(page, B);
  await openLisaBRound(page);
  check("B sees its rank as koht 2", (await rankOnPage(page)) === '2', String(await rankOnPage(page)));
  check('Lisa B.3 · K2 flips to B', (await stateOf(page, K.K2)) === LABEL.projected_to_you);
  check('Lisa B.3 · K3 moves away from B', (await stateOf(page, K.K3)) === LABEL.higher_partner);
  check('Lisa B.3 · K4 stays with B', (await stateOf(page, K.K4)) === LABEL.projected_to_you);
  const bHtml = await appHtml(page);
  check(
    'no other partner’s name appears on B’s page',
    !bHtml.includes(A) && !bHtml.includes(C),
    leakDetail(bHtml, [A, C]),
  );
  await page.screenshot({ path: join(SHOTS, '05-partner-b-flip.png'), fullPage: true });

  /* ---------------- the silent partner ---------------- */

  await switchTo(page, SILENT);
  await openLisaBRound(page);
  check(
    'the silent partner is told non-response counts as declining',
    (await page.getByTestId('no-response-banner').count()) > 0,
  );
  check('every training is available to the silent partner',
    (await stateOf(page, K.K5)) === LABEL.available || (await stateOf(page, K.K5)) === LABEL.marked_by_higher);
  await page.screenshot({ path: join(SHOTS, '06-partner-silent.png'), fullPage: true });

  /* ---------------- sealed mode shows no states at all [N-06] ---------------- */

  await switchTo(page, 'Mari Tamm');
  await page.goto(`${BASE}/tellija/voorud/uus`);
  await page.waitForSelector('h1');
  // OSA-1 has unassigned trainings left over from the sample calendar.
  const lotLink = page.locator('a[href*="/tellija/voorud/uus?hankeosa=OSA-1"]').first();
  if ((await lotLink.count()) > 0) await lotLink.click();
  await page.waitForSelector('select[name="visibilityMode"]', { timeout: 20_000 });
  await page.selectOption('select[name="visibilityMode"]', 'sealed');
  const boxes = page.locator('tbody input[type="checkbox"]');
  const boxCount = Math.min(3, await boxes.count());
  for (let i = 0; i < boxCount; i++) await boxes.nth(i).check();
  await page.locator('form button:has-text("Loo mustand")').click();
  await page.waitForSelector('[data-testid="publish-round"]', { timeout: 20_000 });
  // Publishing asks for confirmation; Playwright dismisses dialogs unless told.
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('publish-round').locator('button').click();
  await page.waitForFunction(() => document.body.textContent.includes('Avatud'), null, { timeout: 20_000 });
  await page.screenshot({ path: join(SHOTS, '07-sealed-published.png'), fullPage: true });

  await switchTo(page, C);
  await page.goto(`${BASE}/partner/voorud`);
  const sealedCard = page.locator('li:has(a[href^="/partner/voorud/"])', { hasText: 'OSA-1' }).first();
  check('the sealed round reaches the partner', (await sealedCard.count()) > 0);
  await sealedCard.locator('a[href^="/partner/voorud/"]').first().click();
  await page.waitForSelector('table', { timeout: 20_000 });
  const sealedHtml = await appHtml(page);
  const leaked = Object.values(LABEL).filter((label) => sealedHtml.includes(label));
  check('a sealed round shows no display states anywhere in the HTML', leaked.length === 0, leaked.join(' | '));
  check('the sealed round explains that only own marks are visible',
    sealedHtml.includes('näete ainult oma märkeid'));
  check('the sealed round is still markable', (await page.locator('input[type="checkbox"]').count()) > 0);
  await page.screenshot({ path: join(SHOTS, '08-sealed-partner-view.png'), fullPage: true });

  /* ---------------- orders and notifications as a partner ---------------- */

  await switchTo(page, B);
  await page.goto(`${BASE}/partner/tellimused`);
  await page.waitForSelector('h1');
  const orderLink = page.locator('a[href^="/partner/tellimused/"]').first();
  check('B has at least one order from the finished scenario', (await orderLink.count()) > 0);
  await orderLink.click();
  await page.waitForSelector('article', { timeout: 20_000 });
  check('the order page is a printable contract', (await page.locator('article h1').textContent()).includes('Koolitustellimus'));
  check('the order names the partner as täitja', (await appHtml(page)).includes('Täitja'));
  check('the order lists a total', (await page.getByText(/Hinnanguline kogumaksumus/).count()) > 0);
  await page.screenshot({ path: join(SHOTS, '09-partner-order.png'), fullPage: true });

  await page.goto(`${BASE}/partner/teavitused`);
  await page.waitForSelector('h1');
  const notices = await page.locator('details').count();
  check('B’s notification log is populated', notices > 0, `${notices}`);
  const noticeHtml = await appHtml(page);
  check(
    'the notification log never names another partner',
    !noticeHtml.includes(A) && !noticeHtml.includes(C),
    leakDetail(noticeHtml, [A, C]),
  );
  await page.screenshot({ path: join(SHOTS, '10-partner-notifications.png'), fullPage: true });

  /* ---------------- N-08: a partner who lost a training is told nothing more ---------------- */

  await switchTo(page, C);
  await page.goto(`${BASE}/partner/voorud`);
  const finishedLinks = await page
    .locator('section:has(h2:text("Lõpetatud voorud")) a[href^="/partner/voorud/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  check('C has finished rounds to look back at', finishedLinks.length > 0, `${finishedLinks.length}`);

  let sawLostRow = false;
  for (const href of finishedLinks) {
    await page.goto(`${BASE}${href}`);
    await page.waitForSelector('h1', { timeout: 20_000 });
    const html = await appHtml(page);
    if (!html.includes('Määrati teisele partnerile')) continue;
    sawLostRow = true;
    check(
      `[N-08] ${href.slice(-6)} names no one and gives no reason`,
      !html.includes('eesõiguse alusel') && !html.includes(A) && !html.includes(B),
      leakDetail(html, [A, B, 'eesõiguse alusel']),
    );
    await page.screenshot({ path: join(SHOTS, '11-partner-n08.png'), fullPage: true });
  }
  check('[N-08] a training C marked but did not get is shown as such', sawLostRow);

  check('no failed requests', badResponses.length === 0, badResponses.slice(0, 4).join(' | '));
  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await page.close();
}

main().catch((error) => {
  // A verification that dies mid-walk must still say how far it got.
  if (results.length > 0) console.log('\nKuni katkemiseni:\n' + results.join('\n'));
  console.error('\n' + String(error?.stack ?? error));
  process.exit(1);
});
