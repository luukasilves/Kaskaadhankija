/**
 * Drive the test harness in a real browser: opening screen, persona strip,
 * virtual clock, reset, the returning visitor, and the production posture
 * with DEMO_MODE off.
 *
 * Starts its own server on a throwaway database, so it never touches the
 * developer's data.
 *
 *   node scripts/verify-harness.mjs
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SHOTS = join(ROOT, 'scripts', 'harness-screenshots');
const DB = join(ROOT, 'data', `harness-${Date.now()}.db`);

let failures = 0;
const results = [];

function check(label, condition, detail = '') {
  if (condition) results.push(`  PASS  ${label}`);
  else {
    failures += 1;
    results.push(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function startServer({ port, demoMode }) {
  const child = spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_PATH: DB,
      PORT: String(port),
      ...(demoMode ? { DEMO_MODE: '1' } : {}),
      APP_BASE_URL: `http://localhost:${port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(String(d)));
  child.stderr.on('data', (d) => logs.push(String(d)));
  return { child, logs };
}

async function waitForHealth(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  mkdirSync(join(ROOT, 'data'), { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  });

  /* ---------------- demo mode ---------------- */

  const demo = startServer({ port: 3210, demoMode: true });
  if (!(await waitForHealth(3210))) {
    console.error('Server did not start:\n' + demo.logs.join(''));
    demo.child.kill();
    await browser.close();
    process.exit(1);
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  const badResponses = [];
  page.on('response', (r) => {
    if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
  });

  await page.goto('http://localhost:3210/');
  await page.waitForSelector('h1');

  // Opening screen: persona choice before any of the environment.
  check(
    'opening screen shows the persona picker',
    (await page.locator('main h1').first().textContent())?.includes('Kaskaadhankija'),
  );
  check('opening screen is marked as a test environment', (await page.getByText('TESTKESKKOND').count()) > 0);
  const buyerCards = await page.locator('section:has(h2:text("Tellija")) form').count();
  const partnerCards = await page.locator('section:has(h2:text("Raamlepingu partnerid")) form').count();
  check('one buyer persona offered', buyerCards === 1, `${buyerCards}`);
  check('six partner personas offered', partnerCards === 6, `${partnerCards}`);
  check(
    'no application navigation is visible before choosing',
    (await page.locator('nav a[href="/tellija/voorud"]').count()) === 0,
  );
  check('partner cards show their lot ranks', (await page.getByText(/OSA-\d · koht \d/).count()) >= 6);
  await page.screenshot({ path: join(SHOTS, '01-opening-screen.png'), fullPage: true });

  // Enter as the buyer.
  await page.locator('section:has(h2:text("Tellija")) form button').first().click();
  await page.waitForURL('**/tellija');
  check('choosing the buyer lands on the buyer area', page.url().endsWith('/tellija'));
  check('the test strip is present inside the environment', await page.getByTestId('test-strip').isVisible());
  check(
    'the strip sits above the application nav',
    await page.evaluate(() => {
      const strip = document.querySelector('[data-testid="test-strip"]');
      const nav = document.querySelector('header:not([data-testid])');
      if (!strip || !nav) return false;
      return strip.getBoundingClientRect().top < nav.getBoundingClientRect().top;
    }),
  );
  check('buyer navigation is now visible', (await page.locator('nav a[href="/tellija/voorud"]').count()) === 1);
  await page.screenshot({ path: join(SHOTS, '02-buyer-with-strip.png'), fullPage: true });

  // The clock.
  const clockBefore = await page.locator('[data-testid="test-strip"] .tabular-nums').first().textContent();
  await page.locator('[data-testid="test-strip"] button:has-text("+1 päev")').click();
  await page.waitForFunction(
    (before) => {
      const el = document.querySelector('[data-testid="test-strip"] .tabular-nums');
      return el && el.textContent !== before;
    },
    clockBefore,
    { timeout: 15_000 },
  );
  const clockAfter = await page.locator('[data-testid="test-strip"] .tabular-nums').first().textContent();
  check('advancing the clock changes the displayed instant', clockBefore !== clockAfter, `${clockBefore} → ${clockAfter}`);
  check('the clock offset is surfaced as a badge', (await page.getByText(/^\+\d+ p$/).count()) > 0);
  await page.screenshot({ path: join(SHOTS, '03-clock-advanced.png') });

  // Switch persona from the strip.
  await page.locator('[data-testid="test-strip"] select').selectOption({ index: 2 });
  await page.waitForURL('**/partner/**', { timeout: 15_000 });
  await page.waitForSelector('nav a[href="/partner/voorud"]', { timeout: 15_000 });
  check('the strip switches persona to a partner', page.url().includes('/partner'));
  check('partner navigation replaces the buyer navigation', (await page.locator('nav a[href="/partner/voorud"]').count()) === 1);
  check('buyer navigation is gone', (await page.locator('nav a[href="/tellija/voorud"]').count()) === 0);
  const stripStillThere = await page.getByTestId('test-strip').isVisible();
  check('the strip persists across personas', stripStillThere);
  await page.screenshot({ path: join(SHOTS, '04-partner-persona.png'), fullPage: true });

  // A partner may not reach the buyer area.
  await page.goto('http://localhost:3210/tellija');
  check('a partner persona is redirected away from the buyer area', !page.url().endsWith('/tellija'), page.url());

  // Reset.
  await page.goto('http://localhost:3210/partner/voorud');
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-testid="test-strip"] button:has-text("Lähtesta")').click();
  // A reset mints new ids, so it drops the persona and returns to the picker.
  await page.waitForURL('http://localhost:3210/', { timeout: 30_000 });
  await page.waitForSelector('section:has(h2:text("Tellija")) form button', { timeout: 15_000 });
  check('reset returns to the persona picker', page.url() === 'http://localhost:3210/');
  const afterReset = await page.evaluate(async () => (await fetch('/api/health')).ok);
  check('reset leaves the app healthy', afterReset);
  check(
    'reset clears the clock offset',
    (await page.locator('[data-testid="test-strip"]').getByText(/^\+\d+ p$/).count()) === 0,
  );
  check(
    'reset restores the full persona roster',
    (await page.locator('section:has(h2:text("Raamlepingu partnerid")) form').count()) === 6,
  );
  await page.screenshot({ path: join(SHOTS, '05-after-reset.png'), fullPage: true });

  /* ---------------- the returning visitor, and the fold ---------------- */

  /*
   * Every check above starts from a fresh browser profile, which is exactly how
   * a shipped bug survived: the opening screen used to redirect anyone holding
   * a persona cookie, so it was a once-per-browser event and `clearPersona`
   * had no caller at all. These checks come back with a cookie in hand.
   */
  await page.locator('section:has(h2:text("Tellija")) form button').first().click();
  await page.waitForURL('**/tellija', { timeout: 15_000 });

  await page.goto('http://localhost:3210/');
  await page.waitForSelector('h1');
  check(
    'a returning tester still gets the persona picker, not a redirect',
    page.url() === 'http://localhost:3210/' &&
      (await page.getByTestId('persona-card').count()) === 7,
    page.url(),
  );
  check('the picker offers a shortcut back to where they were', await page.getByTestId('continue-band').isVisible());
  check(
    'the persona they hold is marked on its card',
    (await page.getByText('praegu valitud').count()) === 1,
  );

  await page.getByTestId('continue-link').click();
  await page.waitForURL('**/tellija', { timeout: 15_000 });
  check('the shortcut lands back in that persona’s area', page.url().endsWith('/tellija'));

  // The strip can hand the persona back — the control that had no caller.
  await page.locator('[data-testid="test-strip"] button:has-text("Vaheta persooni")').click();
  await page.waitForURL('http://localhost:3210/', { timeout: 15_000 });
  await page.waitForSelector('[data-testid="persona-card"]', { timeout: 15_000 });
  check('“Vaheta persooni” returns to the picker', page.url() === 'http://localhost:3210/');
  check(
    'and clears the persona, so no shortcut is offered',
    (await page.getByTestId('continue-band').count()) === 0,
  );
  check(
    'the sample data is untouched by switching persona',
    (await page.getByTestId('persona-card').count()) === 7,
  );

  /*
   * The choices must be reachable without scrolling on a phone. They were not:
   * the intro prose pushed the first card to 563px on a 390px screen, under the
   * browser chrome, so the page read as having no choices on it at all.
   */
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phonePage = await phone.newPage();
  await phonePage.goto('http://localhost:3210/');
  await phonePage.waitForSelector('h1');
  const firstCard = await phonePage.getByTestId('persona-card').first().boundingBox();
  const stripHeight = (await phonePage.getByTestId('test-strip').boundingBox())?.height ?? 0;
  check(
    'on a 390px screen the first persona card starts within the first screenful',
    firstCard !== null && firstCard.y < 520,
    `esimene kaart ${Math.round(firstCard?.y ?? -1)}px, riba ${Math.round(stripHeight)}px`,
  );
  check(
    'the test strip does not take a quarter of a phone screen',
    stripHeight < 150,
    `${Math.round(stripHeight)}px`,
  );
  await phonePage.screenshot({ path: join(SHOTS, '06-phone-picker.png') });
  await phone.close();

  check(
    'no failed requests in demo mode',
    badResponses.length === 0,
    badResponses.slice(0, 4).join(' | '),
  );
  check('no console errors in demo mode', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  await page.close();
  demo.child.kill();
  await new Promise((r) => setTimeout(r, 1200));

  /* ---------------- production posture ---------------- */

  const prod = startServer({ port: 3211, demoMode: false });
  if (!(await waitForHealth(3211))) {
    console.error('Prod-mode server did not start:\n' + prod.logs.join(''));
    prod.child.kill();
    await browser.close();
    process.exit(1);
  }

  const prodPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await prodPage.goto('http://localhost:3211/');
  await prodPage.waitForSelector('h1');
  check('no test strip when DEMO_MODE is off', (await prodPage.getByTestId('test-strip').count()) === 0);
  check(
    'production shows a sign-in placeholder instead of personas',
    (await prodPage.getByText(/Sisselogimine seadistatakse/).count()) === 1,
  );
  check('no persona cards in production', (await prodPage.locator('form button').count()) === 0);
  await prodPage.goto('http://localhost:3211/tellija');
  check('the buyer area is not reachable without a persona', !prodPage.url().endsWith('/tellija'), prodPage.url());
  await prodPage.screenshot({ path: join(SHOTS, '06-production-posture.png'), fullPage: true });
  await prodPage.close();
  prod.child.kill();

  await browser.close();
  rmSync(DB, { force: true });
  for (const suffix of ['-wal', '-shm']) rmSync(`${DB}${suffix}`, { force: true });

  console.log('\nTest harness verification\n');
  console.log(results.join('\n'));
  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
  console.log(`Screenshots: ${SHOTS}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
