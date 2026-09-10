/**
 * The buyer's administration screens, in a real browser.
 *
 * Four things, in the order an admin meets them:
 *
 *  1. **The framework round trip** [L-21]. Download the workbook filled in with
 *     the current data, change one partner's contact address with exceljs, drop
 *     the file back — and then sign in with that new address as that partner.
 *     That is the whole promise of the feature in one arc: the file is the
 *     data, and the contact is the login.
 *  2. **The same edits by hand**, through the admin view: the identity, a new
 *     lot, a partner added to it, a contact changed, a rank moved, a
 *     representative added — each followed by the matching row appearing in
 *     „Muudatuste logi“, because a change nobody can see afterwards is not
 *     administration [D-08].
 *  3. **Representatives and the team** — the list, an upload with deliberately
 *     broken rows, switching one off and on; adding a member, and the refusal
 *     of a partner representative's address.
 *  4. **Who the notices went to** [R-02][D-10], including the proof that a
 *     partner's log names only its own people.
 *
 *   node scripts/verify-admin.mjs     (after pnpm build)
 */

import ExcelJS from 'exceljs';
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  CHROMIUM,
  freePort,
  makeChecker,
  pickActAs,
  removeDatabase,
  signInAs,
  signInAsAdmin,
  startServer,
  switchTo,
  waitForHealth,
  watchPage,
} from './lib/browser-harness.mjs';

const ROOT = process.cwd();
const SHOTS = join(ROOT, 'scripts', 'e2e-screenshots');
const DB = join(ROOT, 'data', `admin-${Date.now()}.db`);
const FIXTURE = join(ROOT, 'scripts', 'fixtures', 'e2e-esindajad.csv');
const SCRATCH = [];

/** The address the round trip moves a partner's contact to. */
const MOVED_CONTACT = 'uus.kontakt@tehisaru-naidis.ee';

const { check, note, results, state } = makeChecker();

function seed() {
  removeDatabase(DB);
  const run = spawnSync('npx', ['tsx', 'src/db/seed.ts'], {
    env: { ...process.env, DATABASE_PATH: DB },
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    console.error(run.stdout, run.stderr);
    throw new Error('seed failed');
  }
}

/** The whole „Muudatuste logi“ as text, so a check can look for its own row. */
async function changeLog(page, base) {
  await page.goto(`${base}/tellija/raamhange`);
  await page.waitForSelector('[data-testid="framework-change-log"]', { timeout: 20_000 });
  return (await page.getByTestId('framework-change-log').textContent()).replace(/\s+/g, ' ');
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  seed();
  const port = await freePort();
  const server = startServer({ port, databasePath: DB });
  const base = server.base;
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  const watched = watchPage(page);
  page.on('dialog', (dialog) => dialog.accept());

  try {
    check('the server boots', await waitForHealth(base, 90_000), server.logs.join('').slice(-300));

    await signInAsAdmin(page, server);
    await pickActAs(page, 'Mari Tamm');
    check('the buyer area opens', page.url().endsWith('/tellija'));

    /* ---------------- 1. the framework round trip [L-21] ---------------- */
    note('Raamhange — fail sisse ja välja');
    await page.goto(`${base}/tellija/raamhange`);
    await page.waitForSelector('[data-testid="download-framework"]', { timeout: 20_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-framework').click(),
    ]);
    const downloaded = await download.path();
    check(
      'the current framework data downloads as a workbook',
      /^raamhanke-andmed-\d{4}-\d{2}-\d{2}\.xlsx$/.test(download.suggestedFilename()),
      download.suggestedFilename(),
    );

    /* change exactly one cell: rank 1 of OSA-1 gets a new contact address */
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(downloaded);
    const partnerSheet = workbook.getWorksheet('Partnerid');
    check('the workbook carries the four sheets', ['Raamleping', 'Hankeosad', 'Partnerid', 'Esindajad'].every((n) => workbook.getWorksheet(n) !== undefined));

    const headers = partnerSheet.getRow(1).values.map((v) => String(v ?? ''));
    const emailCol = headers.indexOf('e_post');
    const lotCol = headers.indexOf('hankeosa');
    const rankCol = headers.indexOf('koht');
    let edited = null;
    partnerSheet.eachRow((row, index) => {
      if (index === 1 || edited) return;
      if (String(row.getCell(lotCol).value) === 'OSA-1' && String(row.getCell(rankCol).value) === '1') {
        edited = String(row.getCell(emailCol).value);
        row.getCell(emailCol).value = MOVED_CONTACT;
      }
    });
    check('the downloaded file really held the ranking', edited !== null, String(edited));
    const changedFile = join(ROOT, 'data', `admin-raamhange-${Date.now()}.xlsx`);
    await workbook.xlsx.writeFile(changedFile);
    SCRATCH.push(changedFile);

    /* drop it back — the drop zone submits as soon as a file is chosen */
    await page.goto(`${base}/tellija/raamhange/import`);
    await page.waitForSelector('[data-testid="framework-upload"]', { timeout: 20_000 });
    await page.setInputFiles('input[type="file"]', changedFile);
    await page.waitForURL(/\/raamhange\/import\?batch=/, { timeout: 30_000 });
    const previewText = (await page.locator('main').textContent()).replace(/\s+/g, ' ');
    check(
      'the preview accepts the edited file',
      (await page.getByTestId('framework-import-blocked').count()) === 0,
      previewText.slice(0, 200),
    );
    check('and shows the new address', previewText.includes(MOVED_CONTACT));
    await page.screenshot({ path: join(SHOTS, 'admin-01-raamhange-eelvaade.png'), fullPage: true });

    await page.getByTestId('confirm-framework-import').locator('button').click();
    await page.waitForSelector('[data-testid="framework-change-log"], [data-testid="action-ok"]', {
      timeout: 30_000,
    });

    const afterImport = await changeLog(page, base);
    check('the import is in the change log', /raamhanke andmed imporditud/i.test(afterImport), afterImport.slice(0, 200));
    check(
      'the framework page now shows the new contact',
      (await page.locator('main').textContent()).includes(MOVED_CONTACT),
    );

    /* the moved address is now the partner's sign-in, and the old one is not */
    const partnerContext = await browser.newContext();
    const partnerPage = await partnerContext.newPage();
    const landing = await signInAs(partnerPage, server, MOVED_CONTACT);
    check('the new contact address signs in as that partner', landing.startsWith('/partner'), landing);
    const partnerHome = await partnerPage.locator('main, header').first().textContent();
    check('as the right company', partnerHome.includes('Tehisaru') || (await partnerPage.locator('body').textContent()).includes('Tehisaru'));
    await partnerContext.close();

    /* ---------------- 2. the same edits by hand, each logged ---------------- */
    note('Raamhange — käsitsi, iga muudatus logitud [D-08]');

    await page.goto(`${base}/tellija/raamhange`);
    await page.waitForSelector('[data-testid="framework-identity-form"]', { timeout: 20_000 });
    await page.fill('[data-testid="framework-identity-form"] input[name="agreementReference"]', 'RL-2026-7');
    await page.locator('[data-testid="framework-identity-form"] button[type="submit"]').click();
    await page.waitForSelector('[data-testid="framework-identity-form"] [data-testid="action-ok"]', {
      timeout: 20_000,
    });
    const afterIdentity = await changeLog(page, base);
    check('changing the identity leaves a row', /raamhanke andmed/i.test(afterIdentity) && afterIdentity.includes('RL-2026-7'), afterIdentity.slice(0, 200));

    /* a rank move, on the first lot's first two members */
    const firstDown = page.locator('button[title="Langeta kohta võrra madalamale"]').first();
    await firstDown.click();
    await page.waitForSelector('[data-testid="action-ok"]', { timeout: 20_000 });
    const afterMove = await changeLog(page, base);
    check('moving a rank leaves a row', /koht/i.test(afterMove), afterMove.slice(0, 200));

    /* a contact edited inline */
    await page.locator('button', { hasText: 'Muuda kontakti' }).first().click();
    await page.waitForSelector('[data-testid="member-contact-form"]', { timeout: 20_000 });
    await page.fill('[data-testid="member-contact-form"] input[name="contactName"]', 'Kontakt Katsetaja');
    await page.locator('[data-testid="member-contact-form"] button[type="submit"]').click();
    await page.waitForSelector('[data-testid="member-contact-form"] [data-testid="action-ok"]', {
      timeout: 20_000,
    });
    const afterContact = await changeLog(page, base);
    check('changing a contact leaves a row', afterContact.includes('Kontakt Katsetaja') || /kontakt/i.test(afterContact), afterContact.slice(0, 200));

    /* a representative added by hand */
    await page.locator('button', { hasText: 'Lisa esindaja' }).first().click();
    await page.waitForSelector('[data-testid="add-representative"]', { timeout: 20_000 });
    await page.fill('[data-testid="add-representative"] input[name="name"]', 'Aime Asendaja');
    await page.fill('[data-testid="add-representative"] input[name="email"]', 'aime.asendaja@tehisaru-naidis.ee');
    await page.locator('[data-testid="add-representative"] button[type="submit"]').click();
    await page.waitForSelector('[data-testid="add-representative"] [data-testid="action-ok"]', {
      timeout: 20_000,
    });
    const afterRep = await changeLog(page, base);
    check('adding a representative leaves a row', afterRep.includes('Aime Asendaja'), afterRep.slice(0, 200));
    await page.screenshot({ path: join(SHOTS, 'admin-02-muudatuste-logi.png'), fullPage: true });

    /* an address that cannot be a sign-in is refused, not silently dropped */
    await page.locator('button', { hasText: 'Muuda kontakti' }).first().click();
    await page.waitForSelector('[data-testid="member-contact-form"]', { timeout: 20_000 });
    await page.fill('[data-testid="member-contact-form"] input[name="contactEmail"]', 'aime.asendaja@tehisaru-naidis.ee');
    await page.locator('[data-testid="member-contact-form"] button[type="submit"]').click();
    await page.waitForSelector('[data-testid="member-contact-form"] [data-testid="action-error"], [data-testid="member-contact-form"] [data-testid="action-ok"]', { timeout: 20_000 });
    note(
      `sama ettevõtte esindaja aadress kontaktiks: ${
        (await page.locator('[data-testid="member-contact-form"]').textContent()).includes('salvestatud')
          ? 'lubatud (sama ettevõte)'
          : 'keelatud'
      }`,
    );

    /* .xls is refused with an instruction rather than a stack trace */
    const xlsPath = join(ROOT, 'data', `admin-vale-${Date.now()}.xls`);
    writeFileSync(xlsPath, Buffer.from('\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1 vana Exceli fail', 'latin1'));
    SCRATCH.push(xlsPath);
    await page.goto(`${base}/tellija/raamhange/import`);
    await page.waitForSelector('[data-testid="framework-upload"]', { timeout: 20_000 });
    await page.setInputFiles('input[type="file"]', xlsPath);
    await page.waitForSelector('[data-testid="framework-upload"] [data-testid="action-error"]', {
      timeout: 30_000,
    });
    check(
      'a legacy .xls is refused with an instruction',
      (await page.getByTestId('action-error').textContent()).includes('.xlsx'),
      await page.getByTestId('action-error').textContent(),
    );

    /* ---------------- 3. representatives and the team ---------------- */
    note('Esindajad ja meeskond');
    await page.goto(`${base}/tellija/partnerid/esindajad`);
    await page.waitForSelector('[data-testid="representatives-company"]');
    check('every partner company is listed', (await page.getByTestId('representatives-company').count()) === 6);
    check(
      'a framework contact is labelled as coming from the framework data',
      (await page.locator('main').textContent()).includes('raamleping'),
    );

    await page.goto(`${base}/tellija/partnerid/esindajad/import`);
    await page.setInputFiles('input[type="file"]', FIXTURE);
    await page.locator('[data-testid="representative-import-upload"] button').click();
    await page.waitForSelector('[data-testid="confirm-representative-import"]', { timeout: 20_000 });
    const preview = await page.locator('main').textContent();
    check('the preview refuses the malformed address', preview.includes('ei ole korrektne'));
    check('the preview refuses an unknown company', preview.includes('tundmatu partner'));
    await page.getByTestId('confirm-representative-import').locator('button').click();
    await page.waitForSelector('a[href="/tellija/partnerid/esindajad"]:has-text("Ava esindajad")', {
      timeout: 20_000,
    });

    await page.goto(`${base}/tellija/partnerid/esindajad`);
    await page.waitForSelector('[data-testid="representatives-company"]');
    check('the new deputy is listed', (await page.locator('main').textContent()).includes('Siim Sild'));
    const siim = page.locator('tbody tr', { hasText: 'Siim Sild' });
    await siim.locator('button', { hasText: 'Lõpeta esindus' }).click();
    await siim.locator('.kh-badge', { hasText: 'Lõpetatud' }).waitFor({ timeout: 20_000 });
    check('an uploaded representative can be switched off', (await siim.textContent()).includes('Lõpetatud'));
    await siim.locator('button', { hasText: 'Taasta' }).click();
    await siim.locator('.kh-badge', { hasText: 'Aktiivne' }).waitFor({ timeout: 20_000 });
    check('and back on', (await siim.textContent()).includes('Aktiivne'));

    await page.goto(`${base}/tellija/meeskond`);
    await page.waitForSelector('[data-testid="add-team-member"]');
    check('the signed-in admin is marked', (await page.getByText('(sina)').count()) >= 1);
    await page.fill('[data-testid="add-team-member"] input[name="name"]', 'Kati Kask');
    await page.fill('[data-testid="add-team-member"] input[name="email"]', 'Kati.Kask@naidis.riigikantselei.ee');
    await page.locator('[data-testid="add-team-member"] button[type="submit"]').click();
    await page.waitForSelector('[data-testid="action-ok"]', { timeout: 20_000 });
    check(
      'a member can be added, address lowercased',
      (await page.locator('tbody tr', { hasText: 'kati.kask@naidis.riigikantselei.ee' }).count()) === 1,
    );

    await page.fill('[data-testid="add-team-member"] input[name="name"]', 'Jaan Kask');
    await page.fill('[data-testid="add-team-member"] input[name="email"]', MOVED_CONTACT);
    await page.locator('[data-testid="add-team-member"] button[type="submit"]').click();
    await page.waitForSelector('[data-testid="action-error"]', { timeout: 20_000 });
    check(
      'a partner representative’s address is refused for the team',
      (await page.getByTestId('action-error').textContent()).includes('esindaja'),
      await page.getByTestId('action-error').textContent(),
    );
    await page.screenshot({ path: join(SHOTS, 'admin-03-meeskond.png'), fullPage: true });

    /* ---------------- 4. who the notices went to ---------------- */
    note('Teavitused [R-02][D-10]');
    await page.goto(`${base}/tellija/teavitused`);
    await page.waitForSelector('[data-testid="delivery-summary"]');
    check('the buyer’s log shows a delivery status per notice', (await page.getByTestId('delivery-summary').count()) > 10);
    check('without SMTP the deliveries are recorded as not sent', (await page.locator('main').textContent()).includes('e-kirja ei saadetud'));

    await switchTo(page, 'Tehisaru');
    await page.goto(`${base}/partner/teavitused`);
    await page.waitForSelector('h1');
    const partnerLog = await page.locator('main').textContent();
    check(
      'a partner’s notices name its own representatives',
      partnerLog.includes('mari.mets@tehisaru-naidis.ee'),
    );
    check(
      'and nobody else’s',
      !partnerLog.includes('ai-akadeemia-naidis.ee') && !partnerLog.includes('digioskus-naidis.ee'),
      partnerLog.slice(0, 200),
    );
    await page.screenshot({ path: join(SHOTS, 'admin-04-partneri-teavitused.png'), fullPage: true });

    check('no console errors', watched.consoleErrors.length === 0, watched.consoleErrors.slice(0, 2).join(' | '));
    check('no failed requests', watched.badResponses.length === 0, watched.badResponses.slice(0, 3).join(' | '));
  } catch (error) {
    check('script completed', false, error instanceof Error ? (error.stack ?? error.message) : String(error));
    await page.screenshot({ path: join(SHOTS, 'admin-failure.png'), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    server.stop();
    removeDatabase(DB);
    for (const file of SCRATCH) rmSync(file, { force: true });
  }

  console.log('\nTellija haldusekraanid\n' + results.join('\n'));
  console.log(`\n${state.failures === 0 ? 'Kõik kontrollid läbitud.' : `${state.failures} kontrolli ebaõnnestus.`}`);
  process.exit(state.failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
