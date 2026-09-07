/**
 * The buyer's administration screens, in a real browser: the partners'
 * representatives (list, template, upload with a deliberately broken sheet,
 * switching one off and on) and the buyer team (add, deactivate, refuse a
 * representative's address) — and the proof that the representatives are who
 * the seeded notices were addressed to [R-02][D-10].
 *
 *   node scripts/verify-admin.mjs     (after pnpm build)
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHROMIUM,
  freePort,
  makeChecker,
  removeDatabase,
  startServer,
  switchTo,
  waitForHealth,
  watchPage,
} from './lib/browser-harness.mjs';

const ROOT = process.cwd();
const SHOTS = join(ROOT, 'scripts', 'e2e-screenshots');
const DB = join(ROOT, 'data', `admin-${Date.now()}.db`);
const FIXTURE = join(ROOT, 'scripts', 'fixtures', 'e2e-esindajad.csv');

const { check, note, results, state } = makeChecker();

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const port = await freePort();
  const server = startServer({ port, databasePath: DB });
  const BASE = server.base;
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const watched = watchPage(page);
  page.on('dialog', (dialog) => dialog.accept());

  try {
    check('the server boots', await waitForHealth(BASE, 90_000), server.logs.join('').slice(-300));

    /* ---------------- enter as the buyer ---------------- */
    await page.goto(`${BASE}/`);
    // The card is the submit button; the persona key sits in a hidden input.
    await page.locator('form:has(input[name="persona"][value^="buyer:"]) [data-testid="persona-card"]').first().click();
    await page.waitForURL(/\/tellija/, { timeout: 20_000 });
    check('the buyer area opens', page.url().endsWith('/tellija'));

    /* ---------------- representatives: the seeded list ---------------- */
    note('Esindajad');
    await page.goto(`${BASE}/tellija/partnerid/esindajad`);
    await page.waitForSelector('[data-testid="representatives-company"]');
    check('six companies are listed', (await page.getByTestId('representatives-company').count()) === 6);
    check('twelve seeded representatives', (await page.locator('tbody tr').count()) === 12);
    check('the sample deputy is there', (await page.getByText('Mari Mets').count()) === 1);
    await page.screenshot({ path: join(SHOTS, 'admin-01-esindajad.png'), fullPage: true });

    const template = await page.request.get(`${BASE}/tellija/partnerid/esindajad/mall`);
    const body = await template.body();
    check('the template downloads as a workbook', template.status() === 200 && (template.headers()['content-type'] ?? '').includes('spreadsheetml'), String(template.status()));
    check('the workbook is a real zip with content', body.length > 2000 && body[0] === 0x50 && body[1] === 0x4b, `${body.length} bytes`);

    /* ---------------- upload a sheet with two broken rows ---------------- */
    await page.goto(`${BASE}/tellija/partnerid/esindajad/import`);
    await page.setInputFiles('input[type="file"]', FIXTURE);
    await page.locator('[data-testid="representative-import-upload"] button').click();
    await page.waitForSelector('[data-testid="confirm-representative-import"]', { timeout: 20_000 });
    const preview = await page.locator('main').textContent();
    check('the preview refuses the malformed address', preview.includes('ei ole korrektne'));
    check('the preview refuses an unknown company', preview.includes('tundmatu partner'));
    check('the preview tells a new representative from an updated one', preview.includes('Uut esindajat') && preview.includes('Uuendatakse'));
    await page.screenshot({ path: join(SHOTS, 'admin-02-esindajad-eelvaade.png'), fullPage: true });
    await page.getByTestId('confirm-representative-import').locator('button').click();
    // Confirming revalidates the page, which re-renders as "already imported"
    // with a link onward in place of the form.
    await page.waitForSelector('a[href="/tellija/partnerid/esindajad"]:has-text("Ava esindajad")', { timeout: 20_000 });
    const imported = (await page.locator('main').textContent()).replace(/\s+/g, ' ');
    check(
      'two rows imported, two refused',
      imported.includes('juba imporditud') && /1\s*Uut esindajat/.test(imported) && /1\s*Uuendatakse/.test(imported) && /2\s*Veaga/.test(imported),
      imported.slice(0, 300),
    );

    await page.goto(`${BASE}/tellija/partnerid/esindajad`);
    await page.waitForSelector('[data-testid="representatives-company"]');
    const list = await page.locator('main').textContent();
    check('the new deputy is listed', list.includes('Siim Sild'));
    // One row for Jaan Kask (the company header also names him as the lot contact).
    const jaan = page.locator('tbody tr', { hasText: 'Jaan Kask' });
    check('the existing representative was updated in place, not duplicated', (await jaan.count()) === 1 && (await jaan.textContent()).includes('+372 5555 0001'));

    /* ---------------- switch one off and back on ---------------- */
    const siim = page.locator('tbody tr', { hasText: 'Siim Sild' });
    await siim.locator('button', { hasText: 'Lõpeta esindus' }).click();
    await siim.locator('.kh-badge', { hasText: 'Lõpetatud' }).waitFor({ timeout: 20_000 });
    check('a representative can be switched off', (await siim.textContent()).includes('Lõpetatud'));
    await siim.locator('button', { hasText: 'Taasta' }).click();
    await siim.locator('.kh-badge', { hasText: 'Aktiivne' }).waitFor({ timeout: 20_000 });
    check('and back on', (await siim.textContent()).includes('Aktiivne'));

    /* ---------------- the buyer team ---------------- */
    note('Meeskond');
    await page.goto(`${BASE}/tellija/meeskond`);
    await page.waitForSelector('[data-testid="add-team-member"]');
    check('the seeded admin is listed as the current user', (await page.getByText('(sina)').count()) === 1);

    await page.fill('[data-testid="add-team-member"] input[name="name"]', 'Kati Kask');
    await page.fill('[data-testid="add-team-member"] input[name="email"]', 'Kati.Kask@naidis.riigikantselei.ee');
    await page.locator('[data-testid="add-team-member"] button[type="submit"]').click();
    await page.waitForSelector('[data-testid="action-ok"]', { timeout: 20_000 });
    await page.locator('tbody tr', { hasText: 'kati.kask@naidis.riigikantselei.ee' }).waitFor({ timeout: 20_000 });
    check('a member can be added, address lowercased', (await page.locator('tbody tr', { hasText: 'kati.kask@naidis.riigikantselei.ee' }).count()) === 1);

    await page.fill('[data-testid="add-team-member"] input[name="name"]', 'Jaan Kask');
    await page.fill('[data-testid="add-team-member"] input[name="email"]', 'jaan.kask@tehisaru-naidis.ee');
    await page.locator('[data-testid="add-team-member"] button[type="submit"]').click();
    await page.waitForSelector('[data-testid="action-error"]', { timeout: 20_000 });
    check('a representative’s address is refused for the team', (await page.getByTestId('action-error').textContent()).includes('partneri esindaja'));

    const kati = page.locator('tbody tr', { hasText: 'Kati Kask' });
    await kati.locator('button', { hasText: 'Deaktiveeri' }).click();
    await kati.locator('.kh-badge', { hasText: 'Deaktiveeritud' }).waitFor({ timeout: 20_000 });
    check('a member can be deactivated', (await kati.textContent()).includes('Deaktiveeritud'));
    await page.screenshot({ path: join(SHOTS, 'admin-03-meeskond.png'), fullPage: true });

    /* ---------------- who the seeded notices went to ---------------- */
    note('Teavitused');
    await page.goto(`${BASE}/tellija/teavitused`);
    await page.waitForSelector('[data-testid="delivery-summary"]');
    check('the buyer’s log shows a delivery status per notice', (await page.getByTestId('delivery-summary').count()) > 10);
    check('without SMTP the deliveries are recorded as not sent', (await page.locator('main').textContent()).includes('e-kirja ei saadetud'));
    check('a manual re-send is offered', (await page.getByText('Saada uuesti').count()) > 0);

    await switchTo(page, 'Tehisaru');
    await page.goto(`${BASE}/partner/teavitused`);
    await page.waitForSelector('h1');
    const partnerLog = await page.locator('main').textContent();
    check('the partner’s notices were addressed to both of its representatives', partnerLog.includes('jaan.kask@tehisaru-naidis.ee') && partnerLog.includes('mari.mets@tehisaru-naidis.ee'));
    check('and to nobody else’s', !partnerLog.includes('ai-akadeemia-naidis.ee') && !partnerLog.includes('digioskus-naidis.ee'));
    await page.screenshot({ path: join(SHOTS, 'admin-04-partneri-teavitused.png'), fullPage: true });

    check('no console errors', watched.consoleErrors.length === 0, watched.consoleErrors.slice(0, 2).join(' | '));
    check('no failed requests', watched.badResponses.length === 0, watched.badResponses.slice(0, 3).join(' | '));
  } catch (error) {
    check('script completed', false, error instanceof Error ? error.stack ?? error.message : String(error));
    await page.screenshot({ path: join(SHOTS, 'admin-failure.png'), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    server.stop();
    removeDatabase(DB);
  }

  console.log(results.join('\n'));
  console.log(`\n${state.failures === 0 ? 'All checks passed.' : `${state.failures} check(s) failed.`}`);
  process.exit(state.failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
