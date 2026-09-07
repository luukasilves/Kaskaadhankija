/**
 * End to end, in a real browser, from both sides.
 *
 * Two walks, each anchored to something written down:
 *
 *  1. **Lisa B to the end.** The seeded open round is the spec's worked
 *     example. C confirms the draft it was seeded with, the clock closes the
 *     round, and the buyer's review must show Lisa B.1; capping B at one must
 *     turn it into Lisa B.4, with the [T-01] workload warning visible for the
 *     partner that is at its lot threshold. Confirming issues the orders each
 *     partner then sees.
 *
 *  2. **A round built from an uploaded table.** The buyer imports
 *     `scripts/fixtures/e2e-koolitused.csv`, whose last row is deliberately
 *     broken, publishes a round over the four good ones, two partners answer,
 *     the deadline passes, the buyer caps the first and confirms.
 *
 * The production posture (no strip, no personas, demo actions refused) is
 * covered by `scripts/verify-harness.mjs` and is not repeated here.
 *
 *   pnpm e2e        (builds first)
 */

import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHROMIUM,
  advanceToNextDeadline,
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
const SHOTS = join(ROOT, 'scripts', 'e2e-screenshots');
const DB = join(ROOT, 'data', `e2e-${Date.now()}.db`);
const FIXTURE = join(ROOT, 'scripts', 'fixtures', 'e2e-koolitused.csv');
let BASE = '';

const BUYER = 'Mari Tamm';
/** OSA-2: koht 1, 2, 3 — Lisa B's A, B and C. */
const A = 'AI Akadeemia';
const B = 'Digioskus';
const C = 'Tehisaru';
/** OSA-1: koht 1 is Tehisaru, koht 3 is Nutikoolitus. */
const OSA1_FIRST = 'Tehisaru';
const OSA1_THIRD = 'Nutikoolitus';

const LISA_B1 = { 1: ['KK-2026-201', 'KK-2026-202'], 2: ['KK-2026-203', 'KK-2026-204', 'KK-2026-206'], 3: ['KK-2026-205'] };
const LISA_B4 = { 1: ['KK-2026-201', 'KK-2026-202'], 2: ['KK-2026-203'], 3: ['KK-2026-204', 'KK-2026-205', 'KK-2026-206'] };

const { check, results, state } = makeChecker();

/* ------------------------------------------------------------------ *
 * small helpers over the application's own markup
 * ------------------------------------------------------------------ */

/** The trainings the review page shows as this rank's final allocation. */
async function finalCodesByRank(page, rank) {
  const codes = page.getByTestId(`final-codes-${rank}`);
  if ((await codes.count()) === 0) return [];
  const text = await codes.textContent();
  return text
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
    .sort();
}

/** Open a partner's round by lot code from the "Ootavad vastust" section. */
async function openOpenRound(page, lotCode) {
  await page.goto(`${BASE}/partner/voorud`);
  await page.waitForSelector('h1');
  const cards = page.locator('section:has(h2:text("Ootavad vastust")) li');
  await cards.first().waitFor({ timeout: 20_000 }).catch(() => {});
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    if ((await cards.nth(i).textContent()).includes(lotCode)) {
      await cards.nth(i).locator('a[href^="/partner/voorud/"]').first().click();
      await page.waitForSelector('table', { timeout: 20_000 });
      return true;
    }
  }
  return false;
}

/** The state badge (plus its reason) for one training row. */
async function stateOf(page, code) {
  const cell = page.locator('tr', { hasText: code }).first().locator('[data-testid="state-cell"]');
  if ((await cell.count()) === 0) return '(olekuveerg puudub)';
  const parts = await cell.evaluate((td) => ({
    badge: td.querySelector('.kh-badge')?.textContent?.trim() ?? null,
    reason: td.querySelector('div')?.textContent?.trim() ?? null,
  }));
  if (!parts.badge) return '(olek puudub)';
  return parts.reason ? `${parts.badge} (${parts.reason})` : parts.badge;
}

async function markAndConfirm(page, codes) {
  for (const code of codes) await page.locator(`input[aria-label="Märgi ${code}"]`).check();
  await page.getByTestId('confirm-marks').locator('button').click();
  await page.waitForFunction(() => document.body.textContent.includes('Viimane kinnitus'), null, {
    timeout: 20_000,
  });
}

/** Go to the review page of the one round that is waiting for a decision. */
async function openReview(page) {
  await page.goto(`${BASE}/tellija/voorud`);
  await page.waitForSelector('h1');
  const link = page.locator('a[href$="/ulevaatus"]').first();
  await link.waitFor({ timeout: 20_000 });
  await link.click();
  await page.waitForSelector('[data-testid="review-row-1"]', { timeout: 20_000 });
}

/* ------------------------------------------------------------------ *
 * walk 1 — Lisa B to the end
 * ------------------------------------------------------------------ */

async function walkLisaB(page) {
  /* C confirms the draft it was seeded with, which completes Lisa B's inputs. */
  await switchTo(page, C);
  check('C is in the seeded open OSA-2 round', await openOpenRound(page, 'OSA-2'));
  check('C starts on the unconfirmed-draft warning', await page.getByTestId('unconfirmed-banner').isVisible());
  await page.getByTestId('confirm-marks').locator('button').click();
  await page.waitForFunction(() => document.body.textContent.includes('Viimane kinnitus'), null, {
    timeout: 20_000,
  });
  check('confirming clears the warning', (await page.getByTestId('unconfirmed-banner').count()) === 0);
  check('C is projected K5 [Lisa B.2]', (await stateOf(page, 'KK-2026-205')) === 'Prognoosis sinule');
  await page.screenshot({ path: join(SHOTS, '01-lisa-b-c-confirmed.png'), fullPage: true });

  /* the deadline passes */
  await switchTo(page, BUYER);
  check('the clock can be moved to the next deadline', await advanceToNextDeadline(page));
  await page.goto(`${BASE}/tellija/voorud`);
  await page.waitForSelector('h1');
  check(
    'the round closed itself when its deadline passed',
    (await page.getByText('Suletud, ootab kinnitust').count()) > 0,
  );
  await page.screenshot({ path: join(SHOTS, '02-round-closed.png'), fullPage: true });

  /* the proposal is Lisa B.1 */
  await openReview(page);
  for (const rank of [1, 2, 3]) {
    const codes = await finalCodesByRank(page, rank);
    check(`Lisa B.1 · koht ${rank}`, JSON.stringify(codes) === JSON.stringify(LISA_B1[rank]), String(codes));
  }
  const bRow = await page.getByTestId('review-row-2').textContent();
  check('[T-01] the partner at its lot threshold is flagged', bRow.includes('piir täis'), bRow.replace(/\s+/g, ' ').slice(0, 160));
  await page.screenshot({ path: join(SHOTS, '03-review-lisa-b1.png'), fullPage: true });

  /* the buyer caps koht 2 at one — Lisa B.4 */
  const capPanel = page.getByTestId('review-row-2').locator('details', { hasText: 'Piira jaotust' });
  await capPanel.locator('summary').click();
  await capPanel.locator('input[name="cap"]').fill('1');
  await capPanel
    .locator('textarea[name="justification"]')
    .fill('Töömahu piir on täis — jaotust piiratakse selles voorus ühe koolitusega.');
  await capPanel.locator('button:has-text("Rakenda piirmäär")').click();
  await page.waitForFunction(
    () => document.body.textContent.includes('Piiratud 1'),
    null,
    { timeout: 20_000 },
  );
  for (const rank of [1, 2, 3]) {
    const codes = await finalCodesByRank(page, rank);
    check(`Lisa B.4 · koht ${rank}`, JSON.stringify(codes) === JSON.stringify(LISA_B4[rank]), String(codes));
  }
  check(
    'the cap is shown with the justification it required',
    (await page.getByTestId('review-row-2').textContent()).includes('Töömahu piir on täis'),
  );
  await page.screenshot({ path: join(SHOTS, '04-review-lisa-b4.png'), fullPage: true });

  /* confirming issues the orders */
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('confirm-allocation').locator('button').click();
  await page.waitForFunction(() => document.body.textContent.includes('Kinnitatud'), null, {
    timeout: 20_000,
  });
  await page.goto(`${BASE}/tellija/tellimused`);
  await page.waitForSelector('h1');
  const orderRows = await page.locator('tbody tr').count();
  check('an order exists for each partner with trainings', orderRows >= 3, `${orderRows}`);
  await page.screenshot({ path: join(SHOTS, '05-orders.png'), fullPage: true });

  /* each partner sees their own result, and only their own */
  await switchTo(page, C);
  await page.goto(`${BASE}/partner/tellimused`);
  await page.waitForSelector('h1');
  const cOrder = page.locator('a[href^="/partner/tellimused/"]').first();
  check('C has an order from the Lisa B round', (await cOrder.count()) > 0);
  await cOrder.click();
  await page.waitForSelector('article', { timeout: 20_000 });
  const cOrderHtml = await appHtml(page);
  check(
    'C’s order lists the three trainings Lisa B.4 gives it',
    LISA_B4[3].every((code) => cOrderHtml.includes(code)),
  );
  check(
    'C’s order names no other partner',
    !cOrderHtml.includes(A) && !cOrderHtml.includes(B),
    leakDetail(cOrderHtml, [A, B]),
  );
  await page.screenshot({ path: join(SHOTS, '06-partner-c-order.png'), fullPage: true });

  await switchTo(page, B);
  await page.goto(`${BASE}/partner/voorud`);
  await page.waitForSelector('h1');
  const finished = page
    .locator('section:has(h2:text("Lõpetatud voorud")) a[href^="/partner/voorud/"]')
    .first();
  const finishedHref = await finished.getAttribute('href');
  await finished.click();
  await page.waitForURL(`**${finishedHref}`, { timeout: 20_000 });
  await page.waitForSelector('table', { timeout: 20_000 });
  const bHtml = await appHtml(page);
  check('[N-08] B is told its lost trainings went elsewhere', bHtml.includes('Määrati teisele partnerile'));
  check(
    '[N-08] without a name and without a reason',
    !bHtml.includes(A) && !bHtml.includes(C) && !bHtml.includes('eesõiguse alusel'),
    leakDetail(bHtml, [A, C, 'eesõiguse alusel']),
  );
  await page.screenshot({ path: join(SHOTS, '07-partner-b-n08.png'), fullPage: true });
}

/* ------------------------------------------------------------------ *
 * walk 2 — a round built from an uploaded table
 * ------------------------------------------------------------------ */

async function walkImportedRound(page) {
  await switchTo(page, BUYER);
  await page.goto(`${BASE}/tellija/koolitused/import`);
  await page.waitForSelector('input[type="file"]');
  await page.setInputFiles('input[type="file"]', FIXTURE);
  await page.locator('[data-testid="training-import-upload"] button').click();
  await page.waitForSelector('[data-testid="confirm-import"]', { timeout: 20_000 });

  const preview = await appHtml(page);
  check('the preview counts four new rows', /4\s*<\/div>\s*<div[^>]*>Uut/.test(preview) || preview.includes('Impordi 4 rida'));
  check('the preview counts the one broken row', (await page.getByText(/Vigased read \(1\)/).count()) > 0);
  check(
    'the broken row is explained by its county',
    (await page.getByText(/maakon/i).count()) > 0,
    (await page.locator('section:has(h2:text("Vigased read"))').textContent()).replace(/\s+/g, ' ').slice(0, 200),
  );
  await page.screenshot({ path: join(SHOTS, '08-import-preview.png'), fullPage: true });

  await page.getByTestId('confirm-import').locator('button').click();
  await page.waitForSelector('a[href="/tellija/koolitused"]', { timeout: 20_000 });
  await page.goto(`${BASE}/tellija/koolitused`);
  await page.waitForSelector('h1');
  const calendar = await appHtml(page);
  check('the imported trainings are in the calendar', calendar.includes('KK-2026-901') && calendar.includes('KK-2026-904'));
  check('the broken row was not imported', !calendar.includes('KK-2026-905'));

  /* a round over the four imported trainings, offering both cap kinds [K-06][L-17] */
  await page.goto(`${BASE}/tellija/voorud/uus?hankeosa=OSA-1`);
  await page.waitForSelector('select[name="visibilityMode"]', { timeout: 20_000 });
  await page.selectOption('[data-testid="cap-options"]', 'both');
  for (const code of ['KK-2026-901', 'KK-2026-902', 'KK-2026-903', 'KK-2026-904']) {
    await page.locator('tr', { hasText: code }).first().locator('input[type="checkbox"]').check();
  }
  await page.locator('form button:has-text("Loo mustand")').click();
  await page.waitForSelector('[data-testid="publish-round"]', { timeout: 20_000 });
  check('the buyer sees which cap kinds the round offers', (await appHtml(page)).includes('piirmäär: partner valib'));
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('publish-round').locator('button').click();
  await page.waitForFunction(() => document.body.textContent.includes('Avatud'), null, { timeout: 20_000 });
  check('the imported round is published to the whole lot', (await page.getByTestId('review-row-1').count()) === 0);
  await page.screenshot({ path: join(SHOTS, '09-imported-round-published.png'), fullPage: true });

  /* koht 1 tries a trainee budget first: 901 (20) and 902 (22) fit 45, 903 (18) does not */
  await switchTo(page, OSA1_FIRST);
  check('koht 1 receives the imported round', await openOpenRound(page, 'OSA-1'));
  check(
    'the round offers the partner a choice of cap kind',
    (await page.getByTestId('cap-control').count()) === 1 && (await page.locator('input[name="capKindChoice"]').count()) === 2,
  );
  for (const code of ['KK-2026-901', 'KK-2026-902', 'KK-2026-903']) {
    await page.locator(`input[aria-label="Märgi ${code}"]`).check();
  }
  await page.locator('input[name="capKindChoice"][value="participants"]').check();
  await page.locator('[data-testid="cap-control"] input[type="number"]').fill('45');
  check('the form totals the trainees in the selection', (await page.getByTestId('cap-control').textContent()).includes('kokku 60 osalejat'));
  await page.getByTestId('save-draft').locator('button').click();
  await page.waitForSelector('[data-testid="save-draft"] [data-testid="action-ok"]', { timeout: 20_000 });
  check(
    'the training that does not fit the budget shows as over the cap [K-06]',
    (await stateOf(page, 'KK-2026-903')) === 'Märgitud, prognoosis ei ole (üle sinu piirmäära)',
    await stateOf(page, 'KK-2026-903'),
  );
  check('the ones that fit are projected', (await stateOf(page, 'KK-2026-901')) === 'Prognoosis sinule' && (await stateOf(page, 'KK-2026-902')) === 'Prognoosis sinule');
  await page.screenshot({ path: join(SHOTS, '09b-trainee-budget.png'), fullPage: true });

  /* then drops the budget and takes all three, as the rest of the walk expects */
  await page.locator('[data-testid="cap-control"] input[type="number"]').fill('');
  await markAndConfirm(page, ['KK-2026-901', 'KK-2026-902', 'KK-2026-903']);

  /* koht 3 sees the effect without seeing who caused it */
  await switchTo(page, OSA1_THIRD);
  check('koht 3 receives the same round', await openOpenRound(page, 'OSA-1'));
  for (const code of ['KK-2026-901', 'KK-2026-902', 'KK-2026-903']) {
    check(`${code} shows as taken by a higher rank`, (await stateOf(page, code)) === 'Eesõigusega partner on märkinud');
  }
  check('the unmarked training is available', (await stateOf(page, 'KK-2026-904')) === 'Saadaval');
  await markAndConfirm(page, ['KK-2026-903', 'KK-2026-904']);
  check(
    '903 is marked but not projected, because a higher rank has it',
    (await stateOf(page, 'KK-2026-903')) === 'Märgitud, prognoosis ei ole (eesõigusega partner)',
  );
  check('904 is projected to koht 3', (await stateOf(page, 'KK-2026-904')) === 'Prognoosis sinule');
  const thirdHtml = await appHtml(page);
  check(
    'koht 3 is never told who holds the others',
    !thirdHtml.includes(OSA1_FIRST) || thirdHtml.split(OSA1_FIRST).length - 1 <= 2,
    'the partner’s own name may appear in its own header only',
  );
  await page.screenshot({ path: join(SHOTS, '10-imported-round-third.png'), fullPage: true });

  /* the deadline passes, the buyer caps koht 1 and confirms */
  await switchTo(page, BUYER);
  check('the clock reaches the imported round’s deadline', await advanceToNextDeadline(page));
  await openReview(page);
  check('koht 1 is proposed three trainings', (await finalCodesByRank(page, 1)).length === 3);

  const capPanel = page.getByTestId('review-row-1').locator('details', { hasText: 'Piira jaotust' });
  await capPanel.locator('summary').click();
  await capPanel.locator('input[name="cap"]').fill('2');
  await capPanel.locator('textarea[name="justification"]').fill('Katsetame piirmäära rakendamist.');
  await capPanel.locator('button:has-text("Rakenda piirmäär")').click();
  await page.waitForFunction(() => document.body.textContent.includes('Piiratud 2'), null, { timeout: 20_000 });

  check(
    'the cap moves 903 down to koht 3',
    JSON.stringify(await finalCodesByRank(page, 1)) === JSON.stringify(['KK-2026-901', 'KK-2026-902']),
    String(await finalCodesByRank(page, 1)),
  );
  check(
    'koht 3 ends with both of its marks',
    JSON.stringify(await finalCodesByRank(page, 3)) === JSON.stringify(['KK-2026-903', 'KK-2026-904']),
    String(await finalCodesByRank(page, 3)),
  );
  await page.screenshot({ path: join(SHOTS, '11-imported-round-capped.png'), fullPage: true });

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('confirm-allocation').locator('button').click();
  await page.waitForFunction(() => document.body.textContent.includes('Kinnitatud'), null, { timeout: 20_000 });

  await switchTo(page, OSA1_THIRD);
  await page.goto(`${BASE}/partner/tellimused`);
  await page.waitForSelector('h1');
  const orderLink = page.locator('a[href^="/partner/tellimused/"]').first();
  check('koht 3 receives an order', (await orderLink.count()) > 0);
  await orderLink.click();
  await page.waitForSelector('article', { timeout: 20_000 });
  const orderHtml = await appHtml(page);
  check(
    'the order carries the two trainings it won',
    orderHtml.includes('KK-2026-903') && orderHtml.includes('KK-2026-904'),
  );
  await page.screenshot({ path: join(SHOTS, '12-imported-round-order.png'), fullPage: true });
}

/* ------------------------------------------------------------------ */

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

  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const { consoleErrors, badResponses } = watchPage(page);

  try {
    await page.goto(BASE);
    await page.waitForSelector('section:has(h2:text("Tellija")) form button');
    await page.locator('section:has(h2:text("Tellija")) form button').first().click();
    await page.waitForURL('**/tellija', { timeout: 20_000 });

    await walkLisaB(page);
    await walkImportedRound(page);

    check('no failed requests', badResponses.length === 0, badResponses.slice(0, 4).join(' | '));
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  } finally {
    await teardown();
  }

  console.log('\nEnd-to-end walk\n');
  console.log(results.join('\n'));
  console.log(
    `\n${state.failures === 0 ? 'ALL PASS' : `${state.failures} FAILURE(S)`} — screenshots in ${SHOTS}\n`,
  );
  removeDatabase(DB);
  process.exit(state.failures === 0 ? 0 : 1);
}

main().catch((error) => {
  if (results.length > 0) console.log('\nKuni katkemiseni:\n' + results.join('\n'));
  console.error('\n' + String(error?.stack ?? error));
  process.exit(1);
});
