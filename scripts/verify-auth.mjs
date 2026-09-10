/**
 * Sign-in by e-mail code, in a real browser [L-08].
 *
 * The server runs with EMAIL_DEV_MODE, so the code is printed to its log
 * instead of sent, and the script reads it from there — the only place it ever
 * appears, since sign-in mail bypasses the notification log.
 *
 * Two servers, because the two postures differ in exactly one thing: in the
 * test environment a buyer **admin** lands on the act-as screen and can look at
 * the tool as any participant while staying signed in; in production there is
 * no such screen and everyone lands in their own area. Nobody, in either, gets
 * anywhere without a session.
 *
 *   node scripts/verify-auth.mjs     (after pnpm build)
 */

import Database from 'better-sqlite3';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUYER_DOMAIN,
  CHROMIUM,
  codeFor,
  codesPrintedFor,
  enterCode,
  freePort,
  makeChecker,
  publishWithShortDeadline,
  removeDatabase,
  requestCode,
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
const { check, note, results, state } = makeChecker();

const REPRESENTATIVE = 'jaan.kask@tehisaru-naidis.ee';
const DEPUTY = 'mari.mets@tehisaru-naidis.ee';
const BUYER = 'mari.tamm@naidis.riigikantselei.ee';
const STRANGER = 'keegi@mujal-naidis.ee';
/**
 * In no list at all — admitted only by the admin allowlist [L-08]. The test
 * environment allowlists their whole domain, the production walk allowlists
 * this one address, so the same person tests both shapes.
 */
const NEWCOMER = 'kirke.kask@naidis.riigikantselei.ee';

/** Wait until the sign-in error names the expected text, or give up after 20 s. */
async function errorSays(page, text) {
  return page
    .waitForFunction(
      (needle) => document.querySelector('[data-testid="sign-in-error"]')?.textContent?.includes(needle) ?? false,
      text,
      { timeout: 20_000 },
    )
    .then(() => true)
    .catch(() => false);
}

/** Poll the database until the predicate holds, or give up after 10 s. */
async function untilRow(dbPath, email, predicate) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const row = codeRow(dbPath, email);
    if (predicate(row)) return row;
    await new Promise((r) => setTimeout(r, 200));
  }
  return codeRow(dbPath, email);
}

/** The latest code row for an address, read straight from the database. */
function codeRow(dbPath, email) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db
      .prepare('select attempts, consumed_at as consumedAt from login_codes where email = ? order by created_at desc, rowid desc limit 1')
      .get(email);
  } finally {
    db.close();
  }
}

async function headerText(page) {
  return (await page.locator('header').first().textContent()) ?? '';
}

async function testEnvironment(browser) {
  note('Testkeskkond: sisselogimine ja teise osalejana tegutsemine');
  const port = await freePort();
  const DB = join(ROOT, 'data', `auth-demo-${Date.now()}.db`);
  const server = startServer({ port, databasePath: DB });
  const BASE = server.base;
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const watched = watchPage(page);
  // Deactivating a team member asks first.
  page.on('dialog', (dialog) => dialog.accept());
  try {
    check('the server boots', await waitForHealth(BASE, 90_000), server.logs.join('').slice(-300));

    /* the front door */
    await page.goto(`${BASE}/`);
    await page.waitForURL(/\/sisene/, { timeout: 20_000 });
    check('the front door is the sign-in, even in the test environment', await page.getByTestId('sign-in-form').isVisible());
    check('and it says which environment this is', (await page.locator('main').textContent()).includes('TESTKESKKOND'));
    await page.goto(`${BASE}/tellija`);
    check('the buyer area sends a stranger to the sign-in', page.url().includes('/sisene'), page.url());

    // The one page that must be open to a stranger: a bidder needs it before
    // their first sign-in, when all they hold is a notice and a code.
    await page.goto(`${BASE}/juhend`);
    check('the guide is public — no session needed', (await page.getByTestId('juhend').count()) === 1, page.url());
    check('and it shows the pilot passages in the test environment', (await page.locator('#katsekeskkond').count()) === 1);
    await page.goto(`${BASE}/sisene`);
    check('the sign-in page links to it', (await page.getByTestId('sign-in-juhend').count()) === 1);

    /* a representative signs in and lands in their own area */
    await requestCode(page, BASE, REPRESENTATIVE.toUpperCase());
    check('the code page names the (lowercased) address', (await page.locator('main').textContent()).includes(REPRESENTATIVE));
    const code = await codeFor(server, REPRESENTATIVE);
    check('a code was mailed to the representative', /^\d{6}$/.test(code ?? ''), String(code));
    check('the code is nowhere in the notification log', !server.logs.join('').includes('notifications'), '');

    await enterCode(page, code === '000000' ? '000001' : '000000');
    check('a wrong code is refused with a reason', await errorSays(page, 'ei sobi'));
    await enterCode(page, code);
    await page.waitForURL(/\/partner\/voorud/, { timeout: 20_000 });
    const header = await headerText(page);
    check('the right code opens the partner area for the representative’s company', header.includes('Tehisaru Koolitus') && header.includes('Jaan Kask'), header.slice(0, 120));
    check('a representative gets the read-only strip', (await page.getByTestId('test-strip-readonly').count()) === 1);
    check('and no way to act as anybody else', (await page.locator('[data-testid="test-strip"] select').count()) === 0);
    check('the nav offers sign-out', await page.getByTestId('sign-out').isVisible());
    await page.screenshot({ path: join(SHOTS, 'auth-01-signed-in-partner.png'), fullPage: true });

    await page.goto(`${BASE}/`);
    check('the act-as screen is not theirs either — it sends them back to their area', page.url().includes('/partner/voorud'), page.url());
    check('a signed-in partner finds the guide in their own nav', (await page.locator('nav a[href="/juhend"]').count()) === 1);
    await page.goto(`${BASE}/tellija`);
    check('nor is the buyer area', page.url().includes('/sisene'), page.url());
    await page.goto(`${BASE}/sisene`);
    await page.locator('[data-testid="signed-in-card"] button[type="submit"]').click();
    // The sign-out redirects to /sisene, which is where we already are: waiting
    // on the URL would resolve instantly, against the page before the click.
    await page.getByTestId('sign-in-form').waitFor({ timeout: 20_000 });
    check('signing out returns to the sign-in', true);

    /* the admin lands on the act-as screen — every time */
    await signInAsAdmin(page, server, BUYER);
    check('an admin lands on the act-as screen', new URL(page.url()).pathname === '/');
    check('which names who is signed in', (await page.getByTestId('self-band').textContent()).includes('Mari Tamm'));
    check('and offers no held choice yet', (await page.getByTestId('continue-band').count()) === 0);
    await page.screenshot({ path: join(SHOTS, 'auth-04-act-as.png'), fullPage: true });

    await page.getByTestId('continue-self').click();
    await page.waitForURL(/\/tellija$/, { timeout: 20_000 });
    check('“Jätka enda nimel” goes to the töölaud as themselves', (await headerText(page)).includes('Mari Tamm (Tellija)'));
    check('the strip shows the session', (await page.getByTestId('signed-in-badge').textContent()).includes('Mari Tamm'));
    check('and does not claim they are acting as anybody', (await page.getByTestId('acting-as').count()) === 0);

    /* acting as a partner keeps the session */
    await switchTo(page, 'Tehisaru Koolitus');
    check('an admin can act as a partner', (await headerText(page)).includes('Tehisaru Koolitus'));
    check('the session survives it', (await page.getByTestId('signed-in-badge').textContent()).includes('Mari Tamm'));
    check('and the strip says whose view this is', (await page.getByTestId('acting-as').textContent()).includes('Tehisaru Koolitus'));
    await page.screenshot({ path: join(SHOTS, 'auth-05-acting-as.png'), fullPage: true });

    await page.goto(`${BASE}/`);
    check('the act-as screen offers the way back', await page.getByTestId('continue-band').isVisible());
    await page.getByTestId('continue-self').click();
    await page.waitForURL(/\/tellija$/, { timeout: 20_000 });
    check('and stopping leaves them as themselves', (await page.getByTestId('acting-as').count()) === 0);

    /* the admin allowlist: nobody had to list them first [L-08] */
    note('Lubatud aadresside loend: terve domeen');
    await page.getByTestId('sign-out').click();
    await page.waitForURL(/\/sisene/, { timeout: 20_000 });
    check('the sign-in page names the domain that may sign in', (await page.locator('[data-testid="sign-in-form"]').textContent()).includes(BUYER_DOMAIN));

    await requestCode(page, BASE, NEWCOMER);
    const newcomerCode = await codeFor(server, NEWCOMER);
    check('an unlisted address at the buyer’s domain is mailed a code', /^\d{6}$/.test(newcomerCode ?? ''), String(newcomerCode));
    await enterCode(page, newcomerCode);
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });
    check('and lands on the act-as screen as a new admin', (await page.getByTestId('self-band').textContent()).includes('Kirke Kask'));

    await page.goto(`${BASE}/tellija/meeskond`);
    await page.waitForSelector('[data-testid="add-team-member"]');
    const teamRow = page.locator('tbody tr', { hasText: NEWCOMER });
    check('the first verified code is what created them, as an admin', (await teamRow.count()) === 1 && (await teamRow.textContent()).includes('Admin'), await teamRow.textContent().catch(() => 'no row'));
    check('the Meeskond screen says what the allowlist admits', await page.getByTestId('allowlist-note').isVisible());
    await page.screenshot({ path: join(SHOTS, 'auth-03-domain-rule.png'), fullPage: true });

    // Their own row hides the toggle, and the action refuses it besides — so
    // another admin switches them off. Deactivation must stick rather than
    // being undone by the next sign-in.
    check('nobody can switch themselves off', (await teamRow.locator('button', { hasText: 'Deaktiveeri' }).count()) === 0);
    await page.getByTestId('sign-out').click();
    await page.waitForURL(/\/sisene/, { timeout: 20_000 });
    await signInAsAdmin(page, server, BUYER);
    await page.getByTestId('continue-self').click();
    await page.waitForURL(/\/tellija$/, { timeout: 20_000 });
    await page.goto(`${BASE}/tellija/meeskond`);
    await page.waitForSelector('[data-testid="add-team-member"]');
    const kirke = page.locator('tbody tr', { hasText: NEWCOMER });
    await kirke.locator('button', { hasText: 'Deaktiveeri' }).click();
    await kirke.locator('.kh-badge', { hasText: 'Deaktiveeritud' }).waitFor({ timeout: 20_000 });
    check('another admin can switch them off', (await kirke.textContent()).includes('Deaktiveeritud'));

    await page.goto(`${BASE}/sisene`);
    await page.locator('[data-testid="signed-in-card"] button[type="submit"]').click();
    await page.getByTestId('sign-in-form').waitFor({ timeout: 20_000 });
    await requestCode(page, BASE, NEWCOMER);
    await new Promise((r) => setTimeout(r, 1_500));
    check(
      'a deactivated person is not let back in by the rule',
      codesPrintedFor(server, NEWCOMER) === 1,
      `${codesPrintedFor(server, NEWCOMER)} code(s) mailed`,
    );

    /* a hankija runs the procurement and reads the rest [R-01] */
    note('Hankija teeb voore, admin haldab raamlepingut [R-01]');
    const HANKIJA = 'hankija@naidis.riigikantselei.ee';
    await signInAsAdmin(page, server, BUYER);
    await page.getByTestId('continue-self').click();
    await page.waitForURL(/\/tellija$/, { timeout: 20_000 });
    await page.goto(`${BASE}/tellija/meeskond`);
    await page.waitForSelector('[data-testid="add-team-member"]');
    await page.fill('[data-testid="add-team-member"] input[name="name"]', 'Lauri Hankija');
    await page.fill('[data-testid="add-team-member"] input[name="email"]', HANKIJA);
    await page.selectOption('[data-testid="add-team-member"] select[name="role"]', 'member');
    await page.locator('[data-testid="add-team-member"] button[type="submit"]').click();
    const hankijaRow = page.locator('tbody tr', { hasText: HANKIJA });
    await hankijaRow.waitFor({ timeout: 20_000 });
    check('a new member is added as a hankija, and the list says so', (await hankijaRow.textContent()).includes('Hankija'));
    await page.getByTestId('sign-out').click();
    await page.waitForURL(/\/sisene/, { timeout: 20_000 });

    const hankijaLanding = await signInAs(page, server, HANKIJA);
    check('a hankija lands straight in the buyer area, not on the act-as screen', hankijaLanding === '/tellija', hankijaLanding);
    check('the header names the role', (await headerText(page)).includes('hankija'));
    check('the strip offers them nobody to act as', (await page.getByTestId('test-strip-readonly').count()) === 1);
    await page.goto(`${BASE}/`);
    check('and the act-as screen is not theirs', page.url().endsWith('/tellija'), page.url());

    // Everything an admin sees, and nothing an admin writes: the framework
    // agreement's own data reads in full, with the forms replaced by a note.
    await page.goto(`${BASE}/tellija/raamhange`);
    await page.waitForSelector('h1');
    const frameworkText = (await page.locator('main').textContent()).replace(/\s+/g, ' ');
    check('a hankija reads the framework data', frameworkText.includes('10567384'), frameworkText.slice(0, 120));
    check('with the admin forms replaced by a note', (await page.getByTestId('read-only-note').count()) > 0);
    // Downloading the workbook stays theirs: it is the same data they read on
    // this page, in a file. Putting one *back* is the write, and that is closed.
    check('the workbook still downloads, since that is a read', (await page.getByTestId('download-framework').count()) === 1);
    await page.goto(`${BASE}/tellija/raamhange/import`);
    check('the framework import is closed to them', (await page.getByTestId('read-only-note').count()) > 0 && (await page.locator('input[type="file"]').count()) === 0);
    await page.goto(`${BASE}/tellija/meeskond`);
    await page.waitForSelector('h1');
    check('the team reads in full', (await page.locator('tbody tr').count()) >= 2);
    check('but nobody can be added, promoted or switched off', (await page.getByTestId('add-team-member').count()) === 0 && (await page.locator('tbody button').count()) === 0);
    await page.goto(`${BASE}/tellija/partnerid/esindajad`);
    await page.waitForSelector('[data-testid="representatives-company"]');
    check('the representatives read in full, without their forms', (await page.locator('tbody tr').count()) > 0 && (await page.getByTestId('read-only-note').count()) > 0);
    await page.screenshot({ path: join(SHOTS, 'auth-06-hankija-raamhange.png'), fullPage: true });

    // The other half of the split: the procurement itself is theirs, from a
    // draft to a confirmed allocation. Publishing notifies every partner in the
    // lot and cannot be undone, so this is the strongest write there is.
    await page.goto(`${BASE}/tellija/voorud`);
    check('the round list offers them a new round', (await page.locator('a', { hasText: 'Uus voor' }).count()) > 0);
    const draftRow = page.locator('tbody tr', { hasText: 'Mustand' }).first();
    await draftRow.waitFor({ timeout: 20_000 });
    await draftRow.locator('a').first().click();
    await page.waitForURL(/\/tellija\/voorud\/[^/]+$/, { timeout: 20_000 });
    const roundUrl = page.url();
    const deadlineMs = await publishWithShortDeadline(page);
    // Publishing revalidates the page, so the status can arrive a beat after
    // the click — wait for it rather than reading once and racing the render.
    const published = await page
      .waitForFunction(() => document.querySelector('main')?.textContent?.includes('Avatud') ?? false, null, { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    check('a hankija can publish a round', published, (await page.locator('main').textContent()).replace(/\s+/g, ' ').slice(0, 120));

    // Nobody bids, so the round ends with everything unallocated — which is a
    // real outcome to confirm, and the confirmation goes through the same seam
    // a full cascade's would.
    await waitOutDeadline(page, BASE, deadlineMs);
    await page.goto(`${roundUrl}/ulevaatus`);
    await page.waitForSelector('h1');
    // The page-wide dialog handler above accepts the confirmation prompt.
    await page.getByTestId('confirm-allocation').locator('button').click();
    const confirmed = await page
      .waitForFunction(() => document.querySelector('main')?.textContent?.includes('Kinnitatud') ?? false, null, { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    check('and confirm the allocation it ends with [T-04]', confirmed, (await page.locator('main').textContent()).replace(/\s+/g, ' ').slice(0, 120));
    check('the protocol is theirs as well [L-22]', (await page.getByTestId('protocol-link').count()) > 0);
    await page.screenshot({ path: join(SHOTS, 'auth-07-hankija-voor.png'), fullPage: true });
    await page.getByTestId('sign-out').click();
    await page.waitForURL(/\/sisene/, { timeout: 20_000 });

    /* a stranger learns nothing */
    await requestCode(page, BASE, STRANGER);
    check('an unknown address gets the same code page', page.url().includes('/sisene/kood'));
    check('but no code is mailed', (await codeFor(server, STRANGER, { expect: false })) === null);
    await enterCode(page, '123456');
    check('and any code is refused neutrally', await errorSays(page, 'kehtivat koodi'));

    /* five wrong guesses burn the code */
    await requestCode(page, BASE, DEPUTY);
    const deputyCode = await codeFor(server, DEPUTY);
    check('a code was mailed to the deputy', /^\d{6}$/.test(deputyCode ?? ''));
    const wrongCode = deputyCode === '111111' ? '222222' : '111111';
    for (let i = 0; i < 4; i++) {
      await enterCode(page, wrongCode);
      await untilRow(DB, DEPUTY, (row) => row?.attempts === i + 1);
    }
    const afterFour = codeRow(DB, DEPUTY);
    check('four wrong guesses are counted, and the code still stands', afterFour?.attempts === 4 && afterFour?.consumedAt === null, JSON.stringify(afterFour));
    await enterCode(page, wrongCode);
    const locked = await untilRow(DB, DEPUTY, (row) => row?.consumedAt !== null);
    check('the fifth wrong guess locks the code', locked?.consumedAt !== null && (await errorSays(page, 'Liiga palju')), JSON.stringify(locked));
    await enterCode(page, deputyCode);
    check('and the right code is dead afterwards', await errorSays(page, 'kehtivat koodi'));

    /* rate limit: the representative already asked once */
    await requestCode(page, BASE, REPRESENTATIVE);
    await requestCode(page, BASE, REPRESENTATIVE);
    await requestCode(page, BASE, REPRESENTATIVE);
    await new Promise((r) => setTimeout(r, 1_500));
    check('three codes per address per quarter hour, then silence — same page either way', codesPrintedFor(server, REPRESENTATIVE) === 3 && page.url().includes('/sisene/kood'), String(codesPrintedFor(server, REPRESENTATIVE)));

    check('no console errors', watched.consoleErrors.length === 0, watched.consoleErrors.slice(0, 2).join(' | '));
    check('no failed requests', watched.badResponses.length === 0, watched.badResponses.slice(0, 3).join(' | '));
  } catch (error) {
    check('test-environment walk completed', false, error instanceof Error ? error.stack ?? error.message : String(error));
    console.error('server log tail:\n' + server.logs.join('').slice(-1500));
    await page.screenshot({ path: join(SHOTS, 'auth-failure-demo.png'), fullPage: true }).catch(() => {});
  } finally {
    await page.close();
    server.stop();
    removeDatabase(DB);
  }
}

async function productionPosture(browser) {
  note('Tootmisasend: sisselogimine on välisuks, valikulehte ei ole');
  const port = await freePort();
  const DB = join(ROOT, 'data', `auth-prod-${Date.now()}.db`);
  // A **named** allowlist, which is what a real deployment carries: one address
  // that is in no list yet, so the walk below can prove both halves — that
  // address gets in, and the rest of its domain does not [L-08].
  const server = startServer({ port, databasePath: DB, demoMode: false, adminAllowlist: NEWCOMER });
  const BASE = server.base;
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const watched = watchPage(page);
  try {
    check('the production server boots', await waitForHealth(BASE, 90_000));
    await page.goto(`${BASE}/`);
    await page.waitForURL(/\/sisene/, { timeout: 20_000 });
    check('the front door is the sign-in', await page.getByTestId('sign-in-form').isVisible());
    // The deploy greps this attribute to prove the allowlist reached the
    // machine. It carries the count and not the entries: a named person's
    // address does not belong on a public page [L-08].
    check('the sign-in proves an allowlist is configured', (await page.getByTestId('sign-in-form').getAttribute('data-admin-allowlist')) === '1');
    check('without publishing whose address it is', !(await page.content()).includes(NEWCOMER));
    check('no environment badge, no act-as cards, no strip', !(await page.locator('main').textContent()).includes('TESTKESKKOND') && (await page.getByTestId('act-as-card').count()) === 0 && (await page.getByTestId('test-strip').count()) === 0);
    await page.goto(`${BASE}/tellija`);
    check('the buyer area sends a stranger to the sign-in', page.url().includes('/sisene'), page.url());

    // Public in this posture too — and here the pilot passages must be gone,
    // because outside DEMO_MODE „nothing here binds you“ would be a false
    // statement about a live procurement.
    await page.goto(`${BASE}/juhend`);
    check('the guide is public in production as well', (await page.getByTestId('juhend').count()) === 1, page.url());
    check('and drops the katsekeskkond passages there', (await page.locator('#katsekeskkond').count()) === 0);

    const landing = await signInAs(page, server, BUYER);
    check('an admin lands in the buyer area, with no act-as screen in the way', landing === '/tellija', landing);
    check('and signs in', (await headerText(page)).includes('Mari Tamm (Tellija)'));
    check('no strip in production even when signed in', (await page.getByTestId('test-strip').count()) === 0 && (await page.getByTestId('test-strip-readonly').count()) === 0);
    await page.screenshot({ path: join(SHOTS, 'auth-02-production-buyer.png'), fullPage: true });
    await page.getByTestId('sign-out').click();
    await page.waitForURL(/\/sisene/, { timeout: 20_000 });
    check('signing out returns to the sign-in', true);
    await page.goto(`${BASE}/tellija`);
    check('and the area is closed', page.url().includes('/sisene'));

    /* the allowlist is a name, not a domain [L-08] */
    const NEIGHBOUR = 'teine.kolleeg@naidis.riigikantselei.ee';
    await requestCode(page, BASE, NEIGHBOUR);
    check('a colleague at the allowlisted address’s domain is not admitted by it', (await codeFor(server, NEIGHBOUR, { expect: false })) === null);
    check('and learns nothing from the page either', page.url().includes('/sisene/kood'), page.url());

    const namedLanding = await signInAs(page, server, NEWCOMER);
    check('the named address gets in without being listed first', namedLanding === '/tellija', namedLanding);
    await page.goto(`${BASE}/tellija/meeskond`);
    await page.waitForSelector('h1');
    check('as an admin, so somebody can always administer the team', (await page.getByTestId('add-team-member').count()) === 1);
    await page.screenshot({ path: join(SHOTS, 'auth-08-named-allowlist.png'), fullPage: true });
    await page.getByTestId('sign-out').click();
    await page.waitForURL(/\/sisene/, { timeout: 20_000 });

    check('no console errors (production)', watched.consoleErrors.length === 0, watched.consoleErrors.slice(0, 2).join(' | '));
    check('no failed requests (production)', watched.badResponses.length === 0, watched.badResponses.slice(0, 3).join(' | '));
  } catch (error) {
    check('production walk completed', false, error instanceof Error ? error.stack ?? error.message : String(error));
    await page.screenshot({ path: join(SHOTS, 'auth-failure-prod.png'), fullPage: true }).catch(() => {});
  } finally {
    await page.close();
    server.stop();
    removeDatabase(DB);
  }
}

const browser = await chromium.launch({ executablePath: CHROMIUM });
mkdirSync(SHOTS, { recursive: true });
try {
  await testEnvironment(browser);
  await productionPosture(browser);
} finally {
  await browser.close();
}

console.log('\nSisselogimine [L-08]\n' + results.join('\n'));
console.log(state.failures === 0 ? '\nKõik kontrollid läbitud.' : `\n${state.failures} kontrolli ebaõnnestus.`);
process.exit(state.failures === 0 ? 0 : 1);
