/**
 * The real flow, end to end, in a browser.
 *
 * Three walks, each proving something the unit tests cannot:
 *
 *  1. **A cascade from an uploaded round file to a signed protocol.** The admin
 *     signs in, lands on the act-as screen, uploads a round workbook, publishes
 *     it with a window of about a minute, answers as two partners through
 *     act-as and as a third with that partner's *own* sign-in code, waits the
 *     deadline out, reviews, caps one partner, confirms — and downloads the
 *     protocol. Nothing is simulated: real time, real codes, real files.
 *
 *  2. **What a partner may see.** The seeded open round is the spec's Lisa B
 *     example, so the four training states and the [N-04] no-identity-leak rule
 *     are checked there, against a round nobody has to close.
 *
 *  3. **An empty environment set up by hand.** A second server on a database
 *     that was never seeded: the admin signs in through the domain rule, uploads
 *     `naidis-raamhange.xlsx` and the calendar, and gets a working framework —
 *     which is the proof that the seed and the admin's own path are one path.
 *
 * The sign-in rules themselves are `verify-auth.mjs`, the framework editing
 * `verify-admin.mjs`, the protocol's documents `verify-protocol.mjs`.
 *
 *   pnpm e2e        (builds first)
 */

import ExcelJS from 'exceljs';
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  CHROMIUM,
  appHtml,
  freePort,
  leakDetail,
  makeChecker,
  pickActAs,
  publishWithShortDeadline,
  removeDatabase,
  signInAs,
  signInAsAdmin,
  startServer,
  switchTo,
  waitForHealth,
  waitOutDeadline,
  watchPage,
} from './lib/browser-harness.mjs';

const ROOT = process.cwd();
const SHOTS = join(ROOT, 'scripts', 'e2e-screenshots');
const SEEDED_DB = join(ROOT, 'data', `e2e-${Date.now()}.db`);
const EMPTY_DB = join(ROOT, 'data', `e2e-empty-${Date.now()}.db`);
const SCRATCH = [];

const { check, note, results, state } = makeChecker();

/* Who is who in the seeded framework data. */
const BUYER = 'Mari Tamm';
/** OSA-1, in rank order. */
const OSA1 = [
  { name: 'Tehisaru Koolitus', email: 'jaan.kask@tehisaru-naidis.ee' },
  { name: 'AI Akadeemia', email: 'liis.magi@ai-akadeemia-naidis.ee' },
  { name: 'Nutikoolitus', email: 'kadri.lepik@nutikoolitus-naidis.ee' },
];
/**
 * The trainings walk 1 offers. Codes of its own rather than seeded ones: the
 * round workbook creates or updates trainings by code [L-20], so the walk does
 * not have to know which of the sample calendar's rows are still free.
 */
const WALK1_CODES = ['KK-2026-150', 'KK-2026-151', 'KK-2026-152'];
/** OSA-2's seeded open round — the spec's Lisa B. */
const LISA_B_LOT = 'OSA-2';

/* ------------------------------------------------------------------ *
 * helpers over the application's own markup
 * ------------------------------------------------------------------ */

/** The state badge (plus its reason) for one training row on a partner page. */
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

/** The trainings the review page shows as this rank's final allocation. */
async function finalCodesByRank(page, rank) {
  const codes = page.getByTestId(`final-codes-${rank}`);
  if ((await codes.count()) === 0) return [];
  return (await codes.textContent())
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
    .sort();
}

/** Open a partner's open round in a lot, from their own round list. */
async function openOpenRound(page, base, lotCode) {
  await page.goto(`${base}/partner/voorud`);
  await page.waitForSelector('h1');
  const cards = page.locator('section:has(h2:text("Ootavad vastust")) li');
  await cards.first().waitFor({ timeout: 20_000 }).catch(() => {});
  for (let i = 0; i < (await cards.count()); i++) {
    if ((await cards.nth(i).textContent()).includes(lotCode)) {
      await cards.nth(i).locator('a[href^="/partner/voorud/"]').first().click();
      await page.waitForSelector('table', { timeout: 20_000 });
      return true;
    }
  }
  return false;
}

async function markAndConfirm(page, codes) {
  for (const code of codes) await page.locator(`input[aria-label="Märgi ${code}"]`).check();
  await page.getByTestId('confirm-marks').locator('button').click();
  await page.waitForFunction(() => document.body.textContent.includes('Viimane kinnitus'), null, {
    timeout: 20_000,
  });
}

/**
 * Write a round workbook the way the downloadable template lays it out [L-20].
 *
 * The „Koolitused“ sheet is the calendar-import layout, so a row describes a
 * training fully — that is what lets one file both create the trainings and
 * put them in a round.
 */
async function writeRoundWorkbook(path, fields, codes) {
  const lotCode = fields.find(([field]) => field === 'hankeosa')[1];
  const headers = [
    'kood',
    'hankeosa',
    'nimetus',
    'formaat',
    'kuupaev',
    'lopp_kuupaev',
    'maakond',
    'asukoht',
    'sihtruhm',
    'osalejate_arv',
    'keel',
    'hinnanguline_maksumus',
    'markused',
  ];

  const workbook = new ExcelJS.Workbook();
  const voor = workbook.addWorksheet('Voor');
  voor.addRow(['väli', 'väärtus']);
  for (const [field, value] of fields) voor.addRow([field, value]);

  const koolitused = workbook.addWorksheet('Koolitused');
  koolitused.addRow(headers);
  codes.forEach((code, index) => {
    koolitused.addRow([
      code,
      lotCode,
      `E2E koolitus ${index + 1}`,
      'Töötuba 1',
      // Well clear of today, so a run in any month stays in the future.
      `${10 + index}.12.2026`,
      '',
      'Harju maakond',
      'Tellija ruumid',
      'Riigiasutused',
      String(20 + index * 5),
      'et',
      '1450',
      '',
    ]);
  });

  await workbook.xlsx.writeFile(path);
  SCRATCH.push(path);
  return path;
}

async function uploadRound(page, base, file) {
  await page.goto(`${base}/tellija/voorud/import`);
  await page.waitForSelector('[data-testid="round-import-upload"]', { timeout: 20_000 });
  await page.setInputFiles('input[type="file"]', file);
  await page.locator('[data-testid="round-import-upload"] button').click();
  await page.waitForSelector('[data-testid="round-import-summary"]', { timeout: 30_000 });
}

/* ------------------------------------------------------------------ *
 * walk 1 — upload, publish, answer, close, review, confirm, protocol
 * ------------------------------------------------------------------ */

async function walkFullCascade(page, server) {
  const base = server.base;

  /* the front door: a code, then the act-as screen [L-08] */
  await signInAsAdmin(page, server);
  const cards = page.locator('[data-testid="act-as-card"]');
  const cardCount = await cards.count();
  check(
    'the act-as screen lists the team and the framework partners',
    cardCount >= 7,
    `${cardCount} kaarti`,
  );
  const cardText = await page.locator('main').textContent();
  check('including the seeded admin', cardText.includes(BUYER));
  check('and the partners the framework data created', OSA1.every((p) => cardText.includes(p.name)));
  await page.screenshot({ path: join(SHOTS, '01-act-as.png'), fullPage: true });

  await pickActAs(page, BUYER);

  /* a round from a workbook [L-20] */
  const file = await writeRoundWorkbook(
    join(ROOT, 'data', `e2e-voor-${Date.now()}.xlsx`),
    [
      ['hankeosa', 'OSA-1'],
      ['nahtavus', 'dünaamiline'],
      ['piirmaara_valikud', 'mõlemad'],
      ['markus', 'E2E: kaskaad üleslaaditud failist'],
    ],
    WALK1_CODES,
  );
  await uploadRound(page, base, file);
  check(
    'the preview reports the round the file describes',
    (await page.getByTestId('round-import-summary').textContent()).includes('OSA-1'),
  );
  await page.getByTestId('confirm-round-import').locator('button').click();
  await page.waitForURL(/\/tellija\/voorud\/[0-9a-f-]+$/, { timeout: 20_000 });
  const roundUrl = page.url();
  const draft = await appHtml(page);
  check('the upload yields a draft, not a published round', draft.includes('Mustand'));
  check('the draft holds the file’s trainings', WALK1_CODES.every((code) => draft.includes(code)));
  await page.screenshot({ path: join(SHOTS, '02-draft-from-file.png'), fullPage: true });

  /* published with a real, short window [L-23] */
  const deadlineMs = await publishWithShortDeadline(page);
  note(`vastamistähtaeg ${new Date(deadlineMs).toISOString()} — oodatakse päris aega`);
  check('publishing is a separate act in the application', (await appHtml(page)).includes('Avatud'));
  await page.screenshot({ path: join(SHOTS, '03-published.png'), fullPage: true });

  /* rank 1 answers through act-as, with a trainee budget [K-06] */
  await switchTo(page, OSA1[0].name);
  check('rank 1 receives the round', await openOpenRound(page, base, 'OSA-1'));
  check(
    'the round offers a choice of cap kind, as the file asked',
    (await page.locator('input[name="capKindChoice"]').count()) === 2,
  );
  await markAndConfirm(page, [WALK1_CODES[0], WALK1_CODES[1]]);
  check('rank 1 is projected both of its marks', (await stateOf(page, WALK1_CODES[0])) === 'Prognoosis sinule');

  /* rank 2 answers with its own sign-in code, not through act-as [L-08] */
  const partnerContext = await page.context().browser().newContext();
  const partnerPage = await partnerContext.newPage();
  watchPage(partnerPage);
  const landing = await signInAs(partnerPage, server, OSA1[1].email);
  check(
    'a partner’s own address signs in straight to their own area',
    landing.startsWith('/partner'),
    landing,
  );
  check('and finds the round', await openOpenRound(partnerPage, base, 'OSA-1'));
  check(
    'rank 2 sees the higher rank has taken two, without being told who',
    (await stateOf(partnerPage, WALK1_CODES[0])) === 'Eesõigusega partner on märkinud',
    await stateOf(partnerPage, WALK1_CODES[0]),
  );
  const rank2Html = await appHtml(partnerPage);
  check(
    '[N-04] and is never told which partner that is',
    !rank2Html.includes(OSA1[0].name) && !rank2Html.includes(OSA1[2].name),
    leakDetail(rank2Html, [OSA1[0].name, OSA1[2].name]),
  );
  await markAndConfirm(partnerPage, [WALK1_CODES[1], WALK1_CODES[2]]);
  check(
    'a mark a higher rank already holds is marked but not projected',
    (await stateOf(partnerPage, WALK1_CODES[1])) === 'Märgitud, prognoosis ei ole (eesõigusega partner)',
    await stateOf(partnerPage, WALK1_CODES[1]),
  );
  check(
    'the one nobody above marked is projected to rank 2',
    (await stateOf(partnerPage, WALK1_CODES[2])) === 'Prognoosis sinule',
  );
  await partnerPage.screenshot({ path: join(SHOTS, '04-partner-own-login.png'), fullPage: true });
  await partnerContext.close();

  /* rank 3 declines outright [K-05] */
  await switchTo(page, OSA1[2].name);
  check('rank 3 receives the round too', await openOpenRound(page, base, 'OSA-1'));
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('decline-all').locator('button').click();
  await page.waitForFunction(() => document.body.textContent.includes('Loobu'), null, { timeout: 20_000 });

  /* the deadline passes in real time and a page load closes the round */
  await switchTo(page, BUYER);
  await waitOutDeadline(page, base, deadlineMs);
  await page.goto(roundUrl);
  await page.waitForSelector('h1');
  check(
    'the round closed itself once its deadline had passed',
    (await appHtml(page)).includes('Suletud, ootab kinnitust'),
    (await page.locator('main').textContent()).replace(/\s+/g, ' ').slice(0, 120),
  );
  await page.screenshot({ path: join(SHOTS, '05-closed.png'), fullPage: true });

  /* review, one cap, confirm [T-02][T-04] */
  await page.goto(`${roundUrl}/ulevaatus`);
  await page.waitForSelector('[data-testid="review-row-1"]', { timeout: 20_000 });
  check(
    'the proposal gives rank 1 its two marks',
    JSON.stringify(await finalCodesByRank(page, 1)) === JSON.stringify([WALK1_CODES[0], WALK1_CODES[1]]),
    String(await finalCodesByRank(page, 1)),
  );

  const capPanel = page.getByTestId('review-row-1').locator('details', { hasText: 'Piira jaotust' });
  await capPanel.locator('summary').click();
  await capPanel.locator('input[name="cap"]').fill('1');
  await capPanel.locator('textarea[name="justification"]').fill('E2E: piirame esimest ühe koolitusega.');
  await capPanel.locator('button:has-text("Rakenda piirmäär")').click();
  await page.waitForFunction(() => document.body.textContent.includes('Piiratud 1'), null, {
    timeout: 20_000,
  });
  check(
    'the cap moves the second training down the cascade [T-03]',
    (await finalCodesByRank(page, 1)).length === 1 && (await finalCodesByRank(page, 2)).includes(WALK1_CODES[1]),
    `1: ${await finalCodesByRank(page, 1)} · 2: ${await finalCodesByRank(page, 2)}`,
  );
  await page.screenshot({ path: join(SHOTS, '06-review-capped.png'), fullPage: true });

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('confirm-allocation').locator('button').click();
  await page.waitForFunction(() => document.body.textContent.includes('Kinnitatud'), null, {
    timeout: 20_000,
  });

  /* the protocol exists the moment the round is confirmed [L-22] */
  check('the review page links to the protocol', (await page.getByTestId('protocol-link').count()) > 0);
  await page.getByTestId('protocol-link').click();
  await page.waitForURL(/\/protokoll$/, { timeout: 20_000 });
  const hash = (await page.getByTestId('protocol-hash').innerText()).trim();
  check('the protocol names its own SHA-256', /^[0-9a-f]{64}$/.test(hash), hash);

  const [pdf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('protocol-pdf').click(),
  ]);
  check(
    'the protocol PDF downloads for this round',
    /^vooru-protokoll-VOOR-\d{4}-\d{3}\.pdf$/.test(pdf.suggestedFilename()),
    pdf.suggestedFilename(),
  );
  const [xlsx] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('protocol-xlsx').click(),
  ]);
  check(
    'and so does the .xlsx annex',
    /^vooru-protokoll-VOOR-\d{4}-\d{3}\.xlsx$/.test(xlsx.suggestedFilename()),
    xlsx.suggestedFilename(),
  );
  await page.screenshot({ path: join(SHOTS, '07-protocol.png'), fullPage: true });

  /* and each partner sees its own order, and only its own [N-08] */
  await switchTo(page, OSA1[1].name);
  await page.goto(`${base}/partner/tellimused`);
  await page.waitForSelector('h1');
  const order = page.locator('a[href^="/partner/tellimused/"]').first();
  check('rank 2 receives an order', (await order.count()) > 0);
  await order.click();
  await page.waitForSelector('article', { timeout: 20_000 });
  const orderHtml = await appHtml(page);
  check('the order names no other partner', !orderHtml.includes(OSA1[0].name) && !orderHtml.includes(OSA1[2].name), leakDetail(orderHtml, [OSA1[0].name, OSA1[2].name]));
  await page.screenshot({ path: join(SHOTS, '08-partner-order.png'), fullPage: true });
}

/* ------------------------------------------------------------------ *
 * walk 2 — what a partner may see, on the seeded Lisa B round
 * ------------------------------------------------------------------ */

async function walkPartnerVisibility(page, server) {
  const base = server.base;

  /* Lisa B's koht 3 has a saved but unconfirmed draft in the seed [K-03] */
  await switchTo(page, 'Tehisaru');
  check('koht 3 is in the seeded open OSA-2 round', await openOpenRound(page, base, LISA_B_LOT));
  check(
    '[K-03] an unconfirmed draft is shouted about, because it does not count',
    await page.getByTestId('unconfirmed-banner').isVisible(),
  );
  const before = await appHtml(page);
  check(
    '[N-04] the round never names another partner',
    !before.includes('AI Akadeemia') && !before.includes('Digioskus'),
    leakDetail(before, ['AI Akadeemia', 'Digioskus']),
  );
  check(
    '[N-04] nor how many partners there are',
    !/\b(4|neli) partner/i.test(before),
  );
  await page.screenshot({ path: join(SHOTS, '09-lisa-b-draft.png'), fullPage: true });

  /* confirming turns the draft into the binding answer [Lisa B.2] */
  await page.getByTestId('confirm-marks').locator('button').click();
  await page.waitForFunction(() => document.body.textContent.includes('Viimane kinnitus'), null, {
    timeout: 20_000,
  });
  check('confirming clears the warning', (await page.getByTestId('unconfirmed-banner').count()) === 0);
  check(
    '[Lisa B.2] koht 3 is projected KK-2026-205',
    (await stateOf(page, 'KK-2026-205')) === 'Prognoosis sinule',
    await stateOf(page, 'KK-2026-205'),
  );
  // Koht 3 marked KK-2026-201 itself, and a higher rank holds it — so the row
  // says both, which is the state that actually needs explaining [N-03].
  check(
    '[Lisa B.2] its own mark on a training a higher rank holds says so',
    (await stateOf(page, 'KK-2026-201')) === 'Märgitud, prognoosis ei ole (eesõigusega partner)',
    await stateOf(page, 'KK-2026-201'),
  );

  /* the buyer's matrix shows the same round — by id, so there is no doubt
     which round is being looked at [J-05][N-01] */
  const roundId = new URL(page.url()).pathname.split('/').pop();
  await switchTo(page, BUYER);
  await page.goto(`${base}/tellija/voorud/${roundId}`);
  await page.waitForSelector('h1', { timeout: 20_000 });
  const matrix = await appHtml(page);
  check(
    'the buyer sees every partner of the lot in the matrix [N-01]',
    matrix.includes('AI Akadeemia') && matrix.includes('Digioskus') && matrix.includes('Tehisaru'),
    (await page.locator('h1').textContent()),
  );
  // [N-01] is "everything, live": the buyer reads each partner's answer, which
  // is the one thing the partner screens deliberately hide from each other.
  check(
    'and what each of them has answered [N-01]',
    matrix.includes('Kinnitatud'),
    matrix.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').match(/.{0,80}Kinnita.{0,40}/)?.[0] ?? 'ükski olek ei olnud näha',
  );
  // [V-03] OSA-2's threshold is 4, and the round is frozen against it — a later
  // edit of the lot cannot reach a published round, so the figure that applies
  // is the one on the round.
  check(
    'and the configuration the round is frozen against [V-03]',
    (await page.getByTestId('frozen-threshold').innerText()).trim() === '4 koolitust',
    await page.getByTestId('frozen-threshold').innerText(),
  );
  await page.screenshot({ path: join(SHOTS, '10-buyer-matrix.png'), fullPage: true });
}

/* ------------------------------------------------------------------ *
 * walk 3 — an empty environment, set up by an admin
 * ------------------------------------------------------------------ */

/** Migrate a database and stamp the seed as done, so nothing is pre-loaded. */
function emptyDatabase(path) {
  removeDatabase(path);
  const run = spawnSync('npx', ['tsx', 'scripts/prepare-empty-db.ts'], {
    env: { ...process.env, DATABASE_PATH: path },
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    console.error(run.stdout, run.stderr);
    throw new Error('could not prepare an empty database');
  }
}

async function walkEmptyEnvironment(browser) {
  emptyDatabase(EMPTY_DB);
  const port = await freePort();
  const server = startServer({ port, databasePath: EMPTY_DB });
  const base = server.base;

  try {
    if (!(await waitForHealth(base))) {
      console.error(server.logs.join(''));
      throw new Error('the empty-volume server did not become healthy');
    }
    const health = await (await fetch(`${base}/api/health`)).json();
    check(
      'an unseeded volume really is empty',
      health.data?.lots === 0 && health.data?.partners === 0,
      JSON.stringify(health.data),
    );

    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    watchPage(page);

    /* nobody is listed, so the domain rule is the only way in [L-08] */
    await signInAs(page, server, 'uus.admin@naidis.riigikantselei.ee');
    await page.goto(`${base}/tellija/raamhange`);
    await page.waitForSelector('h1', { timeout: 20_000 });
    check(
      'the framework screen says the data is missing rather than failing',
      (await page.locator('main').textContent()).length > 0,
    );

    /* the framework workbook — the same file the seed loads [L-21] */
    await page.goto(`${base}/tellija/raamhange/import`);
    await page.waitForSelector('[data-testid="framework-upload"]', { timeout: 20_000 });
    // The drop zone submits as soon as a file is chosen, so there is nothing
    // left to click — clicking would race the POST already in flight.
    await page.setInputFiles('input[type="file"]', join(ROOT, 'seed', 'naidis-raamhange.xlsx'));
    await page.waitForURL(/\/raamhange\/import\?batch=/, { timeout: 30_000 });
    check(
      'the framework import can be confirmed',
      (await page.getByTestId('framework-import-blocked').count()) === 0,
      (await page.locator('main').textContent()).replace(/\s+/g, ' ').slice(0, 200),
    );
    await page.getByTestId('confirm-framework-import').locator('button').click();
    await page.waitForSelector('[data-testid="action-ok"], h1', { timeout: 30_000 });

    await page.goto(`${base}/tellija/raamhange`);
    await page.waitForSelector('h1', { timeout: 20_000 });
    const framework = await page.locator('main').textContent();
    check('the four lots arrived', ['OSA-1', 'OSA-2', 'OSA-3', 'OSA-4'].every((c) => framework.includes(c)));
    check('with the ranking and its contacts', framework.includes('Tehisaru Koolitus') && framework.includes('jaan.kask@tehisaru-naidis.ee'));
    const after = await (await fetch(`${base}/api/health`)).json();
    check(
      'and the counts prove it',
      after.data?.lots === 4 && after.data?.partners === 6,
      JSON.stringify(after.data),
    );
    await page.screenshot({ path: join(SHOTS, '11-empty-framework-loaded.png'), fullPage: true });

    /* the contact the file carried is now a sign-in [L-21] */
    const partnerContext = await browser.newContext();
    const partnerPage = await partnerContext.newPage();
    const landing = await signInAs(partnerPage, server, 'jaan.kask@tehisaru-naidis.ee');
    check(
      'the framework contact can sign in as that partner',
      landing.startsWith('/partner'),
      landing,
    );
    await partnerContext.close();

    /* the calendar, then a round from the sample workbook */
    await page.goto(`${base}/tellija/koolitused/import`);
    await page.waitForSelector('input[type="file"]', { timeout: 20_000 });
    await page.setInputFiles('input[type="file"]', join(ROOT, 'seed', 'naidis-koolituskalender.xlsx'));
    await page.locator('[data-testid="training-import-upload"] button').click();
    await page.waitForSelector('[data-testid="confirm-import"]', { timeout: 30_000 });
    await page.getByTestId('confirm-import').locator('button').click();
    await page.waitForSelector('a[href="/tellija/koolitused"]', { timeout: 30_000 });

    await uploadRound(page, base, join(ROOT, 'seed', 'naidis-voor.xlsx'));
    check(
      'the sample round workbook is accepted on the environment it belongs to',
      !(await page.locator('[data-testid="confirm-round-import"] button').isDisabled()),
      (await page.getByTestId('round-import-summary').textContent()).replace(/\s+/g, ' ').slice(0, 200),
    );
    await page.getByTestId('confirm-round-import').locator('button').click();
    await page.waitForURL(/\/tellija\/voorud\/[0-9a-f-]+$/, { timeout: 20_000 });
    check('which yields a draft round', (await appHtml(page)).includes('Mustand'));
    await page.screenshot({ path: join(SHOTS, '12-empty-round-draft.png'), fullPage: true });

    await context.close();
  } finally {
    server.stop();
    removeDatabase(EMPTY_DB);
  }
}

/* ------------------------------------------------------------------ */

function seed(path) {
  removeDatabase(path);
  const run = spawnSync('npx', ['tsx', 'src/db/seed.ts'], {
    env: { ...process.env, DATABASE_PATH: path },
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    console.error(run.stdout, run.stderr);
    throw new Error('seed failed');
  }
}

async function main() {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  mkdirSync(join(ROOT, 'data'), { recursive: true });

  seed(SEEDED_DB);
  const port = await freePort();
  const server = startServer({ port, databasePath: SEEDED_DB });
  const browser = await chromium.launch({ executablePath: CHROMIUM });

  try {
    if (!(await waitForHealth(server.base))) {
      console.error('Server did not start:\n' + server.logs.join(''));
      throw new Error('server did not become healthy');
    }

    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1500, height: 1000 },
    });
    const page = await context.newPage();
    const { consoleErrors, badResponses } = watchPage(page);

    await walkFullCascade(page, server);
    await walkPartnerVisibility(page, server);

    check('no failed requests', badResponses.length === 0, badResponses.slice(0, 4).join(' | '));
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    await context.close();

    await walkEmptyEnvironment(browser);
  } finally {
    await browser.close().catch(() => {});
    server.stop();
    removeDatabase(SEEDED_DB);
    for (const file of SCRATCH) rmSync(file, { force: true });
  }

  console.log('\nEnd-to-end walk\n' + results.join('\n'));
  console.log(
    `\n${state.failures === 0 ? 'ALL PASS' : `${state.failures} FAILURE(S)`} — screenshots in ${SHOTS}\n`,
  );
  process.exit(state.failures === 0 ? 0 : 1);
}

main().catch((error) => {
  if (results.length > 0) console.log('\nKuni katkemiseni:\n' + results.join('\n'));
  console.error('\n' + String(error?.stack ?? error));
  process.exit(1);
});
