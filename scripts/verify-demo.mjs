/**
 * Drive the built demo in a real browser and assert the cascade behaves.
 *
 * Covers the paths a stakeholder will click: decline advances to the next rank,
 * accept assigns the order, a passed deadline expires the offer without anyone
 * clicking, and exhausting the ranking fails the order. Screenshots land in
 * demo/screenshots/ for review.
 *
 *   node scripts/verify-demo.mjs
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const demoFile = join(projectRoot, 'demo', 'kaskaadhankija-demo.html');
const shotDir = join(projectRoot, 'demo', 'screenshots');

let failures = 0;
const results = [];

function check(label, condition, detail = '') {
  if (condition) {
    results.push(`  PASS  ${label}`);
  } else {
    failures += 1;
    results.push(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  await mkdir(shotDir, { recursive: true });
  // Use the Chromium already in the image rather than downloading one whose
  // build number happens to match the installed Playwright.
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));

  await page.goto(pathToFileURL(demoFile).href);
  await page.waitForSelector('.topbar', { timeout: 10_000 });

  /* ---------- dashboard ---------- */

  const heading = await page.locator('main h1').first().textContent();
  check('dashboard renders', heading?.includes('Töölaud'), `saw "${heading}"`);
  check('demo banner present', (await page.locator('.demo-badge').count()) > 0);

  const seededOrders = await page.locator('.stat-value').allTextContents();
  const totalSeeded = seededOrders.reduce((sum, v) => sum + Number(v || 0), 0);
  check('seed data present', totalSeeded >= 4, `counted ${totalSeeded} orders across statuses`);

  const pendingRows = await page.locator('.card:has-text("Ootel pakkumused") tbody tr').count();
  check('a live cascade is waiting', pendingRows >= 1, `${pendingRows} pending offers`);

  const mailCount = await page.locator('.mail').count();
  check('mailbox populated from seeded cascade', mailCount >= 4, `${mailCount} messages`);

  await page.screenshot({ path: join(shotDir, '01-dashboard.png'), fullPage: true });

  /* ---------- partner declines, cascade advances ---------- */

  await page.locator('.mail.actionable button:has-text("Ava partneri vaates")').first().click();
  await page.waitForSelector('.modal.offer-page');
  check('partner offer page opens', await page.locator('.offer-banner').isVisible());
  check(
    'offer page shows the deadline',
    (await page.locator('.modal-body').textContent())?.includes('Palume vastata hiljemalt'),
  );
  await page.screenshot({ path: join(shotDir, '02-partner-offer.png') });

  await page.locator('button:has-text("Loobun tellimusest")').click();
  await page.waitForSelector('#decline-form');
  check('decline reasons offered', (await page.locator('#decline-form .radio-row').count()) === 4);
  await page.locator('#dr-no_capacity').check();
  await page.locator('#dr-text').fill('Koolitajad on sel nädalal hõivatud.');
  await page.screenshot({ path: join(shotDir, '03-decline-reason.png') });
  await page.locator('button:has-text("Kinnita loobumine")').click();

  await page.waitForSelector('.toast');
  const declineToast = await page.locator('.toast').textContent();
  check(
    'decline advances to the next ranked partner',
    declineToast?.includes('pakkumus saadeti järgmisele'),
    `toast: "${declineToast}"`,
  );

  /* ---------- order detail + timeline ---------- */

  await page.locator('.card:has-text("Ootel pakkumused") tbody tr').first().click();
  await page.waitForSelector('.timeline');
  const timelineItems = await page.locator('.timeline-item').count();
  check('cascade timeline shows both rounds', timelineItems >= 2, `${timelineItems} rounds`);
  const timelineText = await page.locator('.card:has-text("Kaskaadi käik")').textContent();
  check('decline reason recorded in timeline', timelineText?.includes('Koolitajad on hõivatud'));
  check(
    'audit log records the decline',
    (await page.locator('.card:has-text("Sündmuste logi")').textContent())?.includes('loobus'),
  );
  await page.screenshot({ path: join(shotDir, '04-cascade-timeline.png'), fullPage: true });

  /* ---------- deadline expiry with nobody clicking ---------- */

  const beforeExpiry = await page.locator('.timeline-item').count();
  await page.locator('button:has-text("Järgmise tähtajani")').click();
  await page.waitForTimeout(300);
  const expiryToast = await page.locator('.toast').textContent();
  check(
    'passing the deadline expires the offer',
    expiryToast?.includes('aegus vastuseta'),
    `toast: "${expiryToast}"`,
  );
  const afterExpiry = await page.locator('.timeline-item').count();
  check('expiry advanced the cascade', afterExpiry > beforeExpiry, `${beforeExpiry} → ${afterExpiry}`);
  const expiredText = await page.locator('.card:has-text("Kaskaadi käik")').textContent();
  check('expired round is labelled', expiredText?.includes('Tähtaeg möödus'));
  await page.screenshot({ path: join(shotDir, '05-after-expiry.png'), fullPage: true });

  /* ---------- exhaust the ranking ---------- */

  for (let i = 0; i < 8; i++) {
    const hasPending = (await page.locator('button:has-text("Järgmise tähtajani")').count()) > 0;
    if (!hasPending) break;
    const stillCascading = (await page.locator('.badge:has-text("Kaskaad käib")').count()) > 0;
    if (!stillCascading) break;
    await page.locator('button:has-text("Järgmise tähtajani")').click();
    await page.waitForTimeout(200);
  }
  const bodyText = (await page.locator('main').textContent()) ?? '';
  check(
    'exhausted cascade fails the order',
    bodyText.includes('Kaskaad ammendunud') || bodyText.includes('Partnerit ei leitud'),
  );
  await page.screenshot({ path: join(shotDir, '06-exhausted.png'), fullPage: true });

  /* ---------- accept path on a fresh order ---------- */

  await page.locator('.sidenav a:has-text("Tellimused")').click();
  await page.waitForSelector('main h1:has-text("Tellimused")');
  // The seeded draft order is the one with no cascade yet.
  await page.locator('tbody tr:has(.badge:has-text("Ettevalmistus"))').first().click();
  await page.waitForSelector('button:has-text("Alusta kaskaadi")');
  await page.screenshot({ path: join(shotDir, '07-draft-order.png'), fullPage: true });

  await page.locator('button:has-text("Alusta kaskaadi")').click();
  await page.waitForSelector('.modal');
  check('start dialog lists the cascade order', (await page.locator('.modal tbody tr').count()) >= 2);
  await page.screenshot({ path: join(shotDir, '08-start-cascade.png') });
  await page.locator('button:has-text("Käivita kaskaad")').click();
  await page.waitForSelector('.toast');
  check(
    'cascade starts and mails rank 1',
    (await page.locator('.toast').textContent())?.includes('Kaskaad käivitatud'),
  );

  await page.locator('.timeline button:has-text("Ava partneri vaates")').first().click();
  await page.waitForSelector('.modal.offer-page');
  await page.locator('button:has-text("Võtan tellimuse vastu")').click();
  await page.waitForSelector('.toast');
  check(
    'accept assigns the order',
    (await page.locator('.toast').textContent())?.includes('võttis tellimuse vastu'),
  );
  check('order shows as assigned', (await page.locator('.badge:has-text("Määratud")').count()) > 0);
  await page.screenshot({ path: join(shotDir, '09-assigned.png'), fullPage: true });

  /* ---------- token cannot be reused ---------- */

  const reusable = await page.locator('.mail.actionable').count();
  check('answered offer is no longer actionable in the mailbox', reusable === 0, `${reusable} still actionable`);

  /* ---------- other screens ---------- */

  await page.locator('.sidenav a:has-text("Hankeosad")').click();
  await page.waitForSelector('main h1:has-text("Hankeosad")');
  check('all four lots listed', (await page.locator('tbody tr').count()) === 4);
  await page.locator('tbody tr').first().click();
  await page.waitForSelector('#lot-form');
  check('lot cascade config is editable', await page.locator('#l-days').isVisible());
  check('ranked partners listed', (await page.locator('.rank-chip').count()) >= 3);
  await page.screenshot({ path: join(shotDir, '10-lot-config.png'), fullPage: true });

  await page.locator('.sidenav a:has-text("Auditilogi")').click();
  await page.waitForSelector('main h1:has-text("Auditilogi")');
  const auditRows = await page.locator('tbody tr').count();
  check('audit log has entries', auditRows >= 15, `${auditRows} rows`);
  await page.screenshot({ path: join(shotDir, '11-audit.png'), fullPage: true });

  /* ---------- persistence ---------- */

  await page.reload();
  await page.waitForSelector('.topbar');
  await page.locator('.sidenav a:has-text("Auditilogi")').click();
  await page.waitForSelector('main h1:has-text("Auditilogi")');
  const auditAfterReload = await page.locator('tbody tr').count();
  check('state survives a reload', auditAfterReload >= auditRows, `${auditRows} → ${auditAfterReload}`);

  /* ---------- dark mode ---------- */

  const dark = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'dark',
  });
  await dark.goto(pathToFileURL(demoFile).href);
  await dark.waitForSelector('.topbar');
  const bg = await dark.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('dark mode applies its own background', bg !== 'rgb(244, 246, 249)', `body background ${bg}`);
  await dark.screenshot({ path: join(shotDir, '12-dark-mode.png'), fullPage: true });
  await dark.close();

  /* ---------- mobile ---------- */

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(pathToFileURL(demoFile).href);
  await mobile.waitForSelector('.topbar');
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check('no horizontal overflow on mobile', overflow <= 2, `overflow ${overflow}px`);
  await mobile.screenshot({ path: join(shotDir, '13-mobile.png'), fullPage: true });
  await mobile.close();

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await browser.close();

  console.log('\nDemo verification\n');
  console.log(results.join('\n'));
  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
  console.log(`Screenshots: ${shotDir}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
