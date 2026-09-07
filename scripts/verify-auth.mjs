/**
 * Sign-in by e-mail code, in a real browser [L-08].
 *
 * The server runs with EMAIL_DEV_MODE, so the code is printed to its log
 * instead of sent, and the script reads it from there — the only place it ever
 * appears, since sign-in mail bypasses the notification log. Two servers: the
 * test environment (personas and sessions side by side) and the production
 * posture (no personas; `/` is the sign-in).
 *
 *   node scripts/verify-auth.mjs     (after pnpm build)
 */

import Database from 'better-sqlite3';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHROMIUM,
  freePort,
  makeChecker,
  removeDatabase,
  startServer,
  waitForHealth,
  watchPage,
} from './lib/browser-harness.mjs';

const ROOT = process.cwd();
const SHOTS = join(ROOT, 'scripts', 'e2e-screenshots');
const { check, note, results, state } = makeChecker();

const REPRESENTATIVE = 'jaan.kask@tehisaru-naidis.ee';
const DEPUTY = 'mari.mets@tehisaru-naidis.ee';
const BUYER = 'mari.tamm@naidis.riigikantselei.ee';
const STRANGER = 'keegi@mujal-naidis.ee';

// The child inherits the environment, so this reaches both servers.
process.env.EMAIL_DEV_MODE = '1';

/** The latest code the server printed for an address, waiting for it to appear. */
async function codeFor(server, email, { expect = true, timeoutMs = 15_000 } = {}) {
  const pattern = new RegExp(`Saaja: ${email.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\nTeema: Sisenemiskood (\\d{6})`, 'g');
  const deadline = Date.now() + (expect ? timeoutMs : 3_000);
  let last = null;
  while (Date.now() < deadline) {
    const text = server.logs.join('');
    let match;
    while ((match = pattern.exec(text)) !== null) last = match[1];
    if (last && expect) return last;
    await new Promise((r) => setTimeout(r, 200));
  }
  return last;
}

function codesPrintedFor(server, email) {
  return (server.logs.join('').match(new RegExp(`Saaja: ${email.replace(/\./g, '\\.')}\\s*\\nTeema: Sisenemiskood`, 'g')) ?? []).length;
}

async function requestCode(page, base, email) {
  await page.goto(`${base}/sisene`);
  await page.waitForSelector('[data-testid="sign-in-form"]');
  await page.fill('input[name="email"]', email);
  await page.locator('[data-testid="sign-in-form"] button[type="submit"]').click();
  await page.waitForURL(/\/sisene\/kood/, { timeout: 20_000 });
}

/**
 * Submit one code and wait for the server to answer. Waiting on the POST
 * itself matters: a wrong guess re-renders the same page, so neither the URL
 * nor the form changes identity, and a fill issued during the re-render would
 * be lost — the browser then blocks the empty required field, and the attempt
 * never reaches the server.
 */
async function enterCode(page, code) {
  const form = page.locator('[data-testid="sign-in-code-form"]');
  await form.waitFor({ timeout: 20_000 });
  await form.locator('input[name="code"]').fill(code);
  const posted = page.waitForResponse((r) => r.request().method() === 'POST', { timeout: 20_000 });
  await form.locator('button[type="submit"]').click();
  await posted;
  await page.waitForLoadState('networkidle');
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
  return (await page.locator('header:not([data-testid="test-strip"])').first().textContent()) ?? '';
}

async function testEnvironment(browser) {
  note('Testkeskkond: sessioon ja persoonid kõrvuti');
  const port = await freePort();
  const DB = join(ROOT, 'data', `auth-demo-${Date.now()}.db`);
  const server = startServer({ port, databasePath: DB });
  const BASE = server.base;
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const watched = watchPage(page);
  try {
    check('the server boots', await waitForHealth(BASE, 90_000), server.logs.join('').slice(-300));

    await page.goto(`${BASE}/`);
    check('the persona gate offers the real sign-in too', await page.getByTestId('sign-in-link').isVisible());

    /* a representative signs in */
    await requestCode(page, BASE, REPRESENTATIVE.toUpperCase());
    check('the code page names the (lowercased) address', (await page.locator('main').textContent()).includes(REPRESENTATIVE));
    const code = await codeFor(server, REPRESENTATIVE);
    check('a code was mailed to the representative', /^\d{6}$/.test(code ?? ''), String(code));
    check('the code is nowhere in the notification log', !server.logs.join('').includes('notifications'), '');

    await enterCode(page, code === '000000' ? '000001' : '000000');
    check('a wrong code is refused with a reason', (await page.getByTestId('sign-in-error').textContent()).includes('ei sobi'));
    await enterCode(page, code);
    await page.waitForURL(/\/partner\/voorud/, { timeout: 20_000 });
    const header = await headerText(page);
    check('the right code opens the partner area for the representative’s company', header.includes('Tehisaru Koolitus') && header.includes('Jaan Kask'), header.slice(0, 120));
    check('the strip shows the session', await page.getByTestId('signed-in-badge').isVisible());
    check('the nav offers sign-out', await page.getByTestId('sign-out').isVisible());
    await page.screenshot({ path: join(SHOTS, 'auth-01-signed-in-partner.png'), fullPage: true });

    /* the persona picker still works — and ends the session */
    const select = page.locator('[data-testid="test-strip"] select');
    const buyerValue = await select.locator('option').evaluateAll((options) => options.find((o) => o.textContent.includes('Mari Tamm'))?.value ?? null);
    await select.selectOption(buyerValue);
    await page.waitForURL(/\/tellija/, { timeout: 20_000 });
    check('choosing a persona switches identity even with a session open', (await headerText(page)).includes('Mari Tamm'));
    check('and the session is gone', (await page.getByTestId('signed-in-badge').count()) === 0);

    /* the buyer signs in for real */
    await requestCode(page, BASE, BUYER);
    const buyerCode = await codeFor(server, BUYER);
    check('a code was mailed to the buyer', /^\d{6}$/.test(buyerCode ?? ''));
    await enterCode(page, buyerCode);
    await page.waitForURL(/\/tellija$/, { timeout: 20_000 });
    check('the buyer lands on the töölaud', (await headerText(page)).includes('Mari Tamm (Tellija)'));
    await page.goto(`${BASE}/sisene`);
    check('the sign-in page recognises a signed-in person', await page.getByTestId('signed-in-card').isVisible());
    await page.locator('[data-testid="signed-in-card"] button[type="submit"]').click();
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });
    check('signing out returns to the gate in the test environment', true);
    await page.goto(`${BASE}/tellija`);
    check('the buyer area is closed again', !page.url().endsWith('/tellija'));

    /* a stranger learns nothing */
    await requestCode(page, BASE, STRANGER);
    check('an unknown address gets the same code page', page.url().includes('/sisene/kood'));
    check('but no code is mailed', (await codeFor(server, STRANGER, { expect: false })) === null);
    await enterCode(page, '123456');
    check('and any code is refused neutrally', (await page.getByTestId('sign-in-error').textContent()).includes('kehtivat koodi'));

    /* five wrong guesses burn the code */
    await requestCode(page, BASE, DEPUTY);
    const deputyCode = await codeFor(server, DEPUTY);
    check('a code was mailed to the deputy', /^\d{6}$/.test(deputyCode ?? ''));
    const wrongCode = deputyCode === '111111' ? '222222' : '111111';
    for (let i = 0; i < 4; i++) await enterCode(page, wrongCode);
    check('four wrong guesses are counted, and the code still stands', codeRow(DB, DEPUTY)?.attempts === 4 && codeRow(DB, DEPUTY)?.consumedAt === null, JSON.stringify(codeRow(DB, DEPUTY)));
    await enterCode(page, wrongCode);
    check('the fifth wrong guess locks the code', (await page.getByTestId('sign-in-error').textContent()).includes('Liiga palju') && codeRow(DB, DEPUTY)?.consumedAt !== null);
    await enterCode(page, deputyCode);
    check('and the right code is dead afterwards', (await page.getByTestId('sign-in-error').textContent()).includes('kehtivat koodi'));

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
  note('Tootmisasend: sisselogimine on välisuks');
  const port = await freePort();
  const DB = join(ROOT, 'data', `auth-prod-${Date.now()}.db`);
  const server = startServer({ port, databasePath: DB, demoMode: false });
  const BASE = server.base;
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const watched = watchPage(page);
  try {
    check('the production server boots', await waitForHealth(BASE, 90_000));
    await page.goto(`${BASE}/`);
    await page.waitForURL(/\/sisene/, { timeout: 20_000 });
    check('the front door is the sign-in', await page.getByTestId('sign-in-form').isVisible());
    check('no personas, no strip', (await page.getByTestId('persona-card').count()) === 0 && (await page.getByTestId('test-strip').count()) === 0);
    await page.goto(`${BASE}/tellija`);
    check('the buyer area sends a stranger to the sign-in', page.url().includes('/sisene'), page.url());

    await requestCode(page, BASE, BUYER);
    const code = await codeFor(server, BUYER);
    check('the buyer is mailed a code', /^\d{6}$/.test(code ?? ''));
    await enterCode(page, code);
    await page.waitForURL(/\/tellija$/, { timeout: 20_000 });
    check('and signs in', (await headerText(page)).includes('Mari Tamm (Tellija)'));
    check('no strip in production even when signed in', (await page.getByTestId('test-strip').count()) === 0);
    await page.screenshot({ path: join(SHOTS, 'auth-02-production-buyer.png'), fullPage: true });
    await page.getByTestId('sign-out').click();
    await page.waitForURL(/\/sisene/, { timeout: 20_000 });
    check('signing out returns to the sign-in', true);
    await page.goto(`${BASE}/tellija`);
    check('and the area is closed', page.url().includes('/sisene'));

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

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  try {
    await testEnvironment(browser);
    await productionPosture(browser);
  } finally {
    await browser.close();
  }
  console.log(results.join('\n'));
  console.log(`\n${state.failures === 0 ? 'All checks passed.' : `${state.failures} check(s) failed.`}`);
  process.exit(state.failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
