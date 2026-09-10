/**
 * The figures for „Juhend koolitajale“ (`/juhend`).
 *
 *   node scripts/make-juhend-shots.mjs        (after pnpm build)
 *   node scripts/make-juhend-shots.mjs --out /tmp/proov
 *
 * Three things make this different from the verification suites, even though it
 * borrows their plumbing:
 *
 *  1. **It writes into `src/`, not into `scripts/e2e-screenshots/`.** Those are
 *     throwaway evidence and `.gitignore` ignores them; these are *content*,
 *     reviewable in a diff and imported by the page — so a missing one fails
 *     `pnpm build`. (Running this while `next dev` is up will trigger a
 *     recompile loop. Harmless, but expect it.)
 *  2. **It asserts before it captures.** A figure whose locator has gone is a
 *     failure, not a blank image: that is how a renamed testid or a moved
 *     banner becomes a loud problem instead of a stale picture in a document
 *     bidders rely on.
 *  3. **It signs in as the partners themselves**, never as an admin acting as
 *     one. Acting-as puts the test strip — with a dropdown naming every partner
 *     company — above the page, and a real bidder sees the read-only strip
 *     instead. Signing in properly is the only way the figures show what a
 *     bidder actually sees.
 *
 * Element screenshots rather than full pages: legible at page width, a fraction
 * of the bytes, and they crop out the countdown that would date the picture.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHROMIUM,
  enterCode,
  freePort,
  makeChecker,
  openFinishedRound,
  openOpenRound,
  removeDatabase,
  requestCode,
  signInAs,
  startServer,
  waitForHealth,
  watchPage,
  appHtml,
} from './lib/browser-harness.mjs';

const ROOT = process.cwd();
const outFlag = process.argv.indexOf('--out');
const OUT = outFlag > -1 ? process.argv[outFlag + 1] : join(ROOT, 'src', 'app', 'juhend', 'pildid');
const DB = join(ROOT, 'data', `juhend-${Date.now()}.db`);
const { check, note, results, state } = makeChecker();

/** The seeded fictional partners. Nothing outside this list may appear. */
const NAIDISED = [
  'Tehisaru Koolitus OÜ',
  'AI Akadeemia OÜ',
  'Digioskus MTÜ',
  'Nutikoolitus OÜ',
  'E-õppe Ekspert OÜ',
  'Targa Töö Koolitus OÜ',
];

const TEHISARU = 'jaan.kask@tehisaru-naidis.ee'; // OSA-2 koht 3 — the unconfirmed draft [K-03]
const DIGIOSKUS = 'peeter.saar@digioskus-naidis.ee'; // OSA-2 koht 2 — all four states, and orders
const TARGA = 'anu.sepp@targatoo-naidis.ee'; // OSA-2 koht 4 — never opened the round

/**
 * Capture one element, having first proved it is there.
 *
 * `count() === 1` rather than `> 0`: two matches means the locator is no longer
 * naming one thing, and a screenshot of the wrong one of them is exactly the
 * silent failure this script exists to prevent.
 */
async function figure(id, locator) {
  const found = await locator.count();
  if (found !== 1) {
    check(id, false, `${found} elementi vastas lokaatorile (ootasin ühte)`);
    return;
  }
  await locator.scrollIntoViewIfNeeded();
  await locator.screenshot({ path: join(OUT, `${id}.png`) });
  check(id, true);
}

/**
 * No company but the fictional six may reach a public page.
 *
 * The script seeds its own database, so this really guards against a future
 * edit that points it at another one — the live volume now holds real bidder
 * contacts, and a competitor's name in a public document would breach [N-04].
 */
async function assertOnlyFictionalCompanies(page, where) {
  const html = await appHtml(page);
  const found = [...html.matchAll(/[A-ZÄÖÕÜŠŽ][\wäöõüšž-]+(?:\s+[\wäöõüšž-]+)*\s+(?:OÜ|AS|MTÜ|UÜ|TÜ)\b/gu)]
    .map((m) => m[0].trim())
    .filter((name) => !NAIDISED.some((known) => name.endsWith(known) || known.endsWith(name)));
  check(`${where}: ainult näidispartnerid`, found.length === 0, [...new Set(found)].join(' · '));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(join(ROOT, 'data'), { recursive: true });

  const port = await freePort();
  const server = startServer({ port, databasePath: DB });
  const base = server.base;
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  // 2× so a reader can zoom a table figure to legible text on a phone.
  //
  // No `colorScheme` here on purpose: it would have no effect. `globals.css`
  // declares a light and a dark palette, but the dark one sits in
  // `@media (prefers-color-scheme: dark) { @theme { … } }`, and Tailwind v4
  // hoists `@theme` out of the media query — so the built CSS carries no
  // colour-scheme query at all and every screen is dark for everyone. The
  // figures therefore match the application as it actually renders, which is
  // what a guide needs; if the palette is ever fixed, re-run this script.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const watched = watchPage(page);

  try {
    check('server boots and seeds', await waitForHealth(base, 90_000));

    /* --- signed out: the front door --- */
    note('Sisselogimine');
    await page.goto(`${base}/sisene`);
    await page.waitForSelector('[data-testid="sign-in-form"]');
    await figure('sisene-vorm', page.getByTestId('sign-in-form'));

    // A deliberately wrong code, so the figure shows the error a bidder meets.
    await requestCode(page, base, TEHISARU);
    await enterCode(page, '000000');
    await page.getByTestId('sign-in-error').waitFor({ timeout: 20_000 });
    await figure('sisene-viga', page.getByTestId('sign-in-code-form'));

    /* --- Tehisaru, koht 3: the unconfirmed draft --- */
    note('Tehisaru Koolitus OÜ — kinnitamata mustand');
    const landing = await signInAs(page, server, TEHISARU);
    check('a representative lands in their own area', landing === '/partner/voorud', landing);
    await figure('test-riba', page.getByTestId('test-strip-readonly'));

    check('the open OSA-2 round is theirs', await openOpenRound(page, base, 'OSA-2'));
    await assertOnlyFictionalCompanies(page, 'voor');
    // Never confirmed, so this banner names no timestamp — deterministic.
    await figure('kinnitamata', page.getByTestId('unconfirmed-banner'));
    await figure('kinnitamine', page.locator('section:has([data-testid="confirm-marks"])'));

    note('Tehisaru — teavitused ja lõppenud voor');
    await page.goto(`${base}/partner/teavitused`);
    await page.waitForSelector('h1');
    const teade = page.locator('details', { hasText: 'Uus koolitustellimuste voor' }).first();
    if ((await teade.count()) > 0) await teade.locator('summary').click();
    await figure('teavitused', teade);

    check('the finished OSA-2 round is theirs', await openFinishedRound(page, base, 'OSA-2'));
    await assertOnlyFictionalCompanies(page, 'lõppenud voor');
    await figure('maarati-teisele', page.locator('table').first());

    /* --- Digioskus, koht 2: the only column with all four states --- */
    note('Digioskus MTÜ — neli olekut ja tellimus');
    await page.getByTestId('sign-out').click();
    await page.waitForURL(/\/sisene/, { timeout: 20_000 });
    await signInAs(page, server, DIGIOSKUS);

    check('the open OSA-2 round is theirs too', await openOpenRound(page, base, 'OSA-2'));
    await assertOnlyFictionalCompanies(page, 'neli olekut');
    await figure('neli-olekut', page.locator('section:has([data-testid="state-cell"])'));

    await page.goto(`${base}/partner/tellimused`);
    await page.waitForSelector('h1');
    const order = page.locator('a[href^="/partner/tellimused/"]').first();
    check('this partner holds an order', (await order.count()) > 0);
    await order.click();
    await page.waitForSelector('article', { timeout: 20_000 });
    await assertOnlyFictionalCompanies(page, 'tellimus');
    await figure('tellimus', page.locator('article').first());

    /* --- Targa Töö, koht 4: has not answered --- */
    note('Targa Töö Koolitus OÜ — vastamata');
    await page.getByTestId('sign-out').click();
    await page.waitForURL(/\/sisene/, { timeout: 20_000 });
    await signInAs(page, server, TARGA);

    await page.goto(`${base}/partner/voorud`);
    await page.waitForSelector('h1');
    await figure('voorude-loend', page.locator('section:has(h2:text("Ootavad vastust")) li').first());

    check('the open OSA-2 round is theirs as well', await openOpenRound(page, base, 'OSA-2'));
    await figure('vastamata', page.getByTestId('no-response-banner'));

    check('no console errors', watched.consoleErrors.length === 0, watched.consoleErrors.slice(0, 2).join(' | '));
    check('no failed requests', watched.badResponses.length === 0, watched.badResponses.slice(0, 3).join(' | '));
  } catch (error) {
    check('walk completed', false, error instanceof Error ? (error.stack ?? error.message) : String(error));
    console.error('server log tail:\n' + server.logs.join('').slice(-1500));
  } finally {
    await page.close();
    await browser.close();
    server.stop();
    removeDatabase(DB);
  }
}

await main();

console.log(`\nJuhendi pildid → ${OUT}\n` + results.join('\n'));
console.log(
  state.failures === 0
    ? '\nKõik pildid tehtud.'
    : `\n${state.failures} pilti või kontrolli ebaõnnestus — juhend võib olla vananenud.`,
);
process.exit(state.failures === 0 ? 0 : 1);
