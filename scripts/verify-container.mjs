/**
 * What the container does, checked on the build the container actually runs.
 *
 * The other suites drive `next start`; the image runs `node server.js` from the
 * standalone output, against a database file on a mounted volume. Two things
 * only show up there.
 *
 * **Surviving a restart.** A Fly machine is replaced on every deploy, and the
 * database file the new one finds is what an earlier process left behind —
 * possibly mid-write, since a machine can be killed rather than asked politely
 * to stop.
 *
 * Three things could go wrong on that second boot, each of which would only be
 * discovered in production:
 *
 *   1. the seed runs again and duplicates or overwrites real data;
 *   2. the migrations run again — `0001_append_only_triggers.sql` has bare
 *      `CREATE TRIGGER` statements, so re-applying it would abort the boot;
 *   3. the WAL left by an unclean kill is not recovered and writes are lost.
 *
 * So: boot against a fresh file, write something through the application as a
 * partner would, SIGKILL the process, boot again against the same file, and
 * check that the application comes back with its data and without re-seeding.
 *
 * **The production posture.** `verify-harness.mjs` checks that `DEMO_MODE` off
 * removes the test harness, but it checks it through `next start`. A deployment
 * without the flag is the real one, so it is worth confirming on the same
 * standalone build: no strip, no personas, and the demo-only actions refused.
 *
 *   node scripts/verify-container.mjs      (after pnpm build)
 */

import Database from 'better-sqlite3';
import { chromium } from 'playwright';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHROMIUM,
  freePort,
  makeChecker,
  removeDatabase,
  waitForHealth,
} from './lib/browser-harness.mjs';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const STAGE = join(ROOT, 'data', `restart-stage-${Date.now()}`);
const VOLUME = join(ROOT, 'data', `restart-volume-${Date.now()}`);
const DB = join(VOLUME, 'kaskaadhankija.db');

const { check, results, state } = makeChecker();

/**
 * Assemble the standalone deployment exactly as the Dockerfile's runtime stage
 * does, so this exercises the same file layout the container has.
 */
function stageStandalone() {
  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(STAGE, { recursive: true });
  cpSync(join(ROOT, '.next', 'standalone'), STAGE, { recursive: true });
  cpSync(join(ROOT, '.next', 'static'), join(STAGE, '.next', 'static'), { recursive: true });
}

function startStandalone(port, { demoMode = true } = {}) {
  const child = spawn('node', ['server.js'], {
    cwd: STAGE,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '0.0.0.0',
      PORT: String(port),
      DATABASE_PATH: DB,
      ...(demoMode ? { DEMO_MODE: '1' } : {}),
      APP_BASE_URL: `http://localhost:${port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(String(d)));
  child.stderr.on('data', (d) => logs.push(String(d)));
  return { child, logs, base: `http://localhost:${port}` };
}

/** Read the database the way an operator would, without going through the app. */
function inspect() {
  const db = new Database(DB, { readonly: true });
  try {
    const one = (sql) => db.prepare(sql).get();
    return {
      rounds: one('select count(*) n from rounds').n,
      confirmations: one('select count(*) n from confirmations').n,
      trainings: one('select count(*) n from trainings').n,
      partners: one('select count(*) n from partners').n,
      auditEvents: one('select count(*) n from audit_events').n,
      seedVersion: one('select seed_version v from app_state').v,
      migrations: one("select count(*) n from __drizzle_migrations").n,
    };
  } finally {
    db.close();
  }
}

/** Confirm a partner's marks through the real UI, so the write is a real one. */
async function confirmAsPartner(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(base);
  await page.waitForSelector('section:has(h2:text("Raamlepingu partnerid")) form button');
  await page
    .locator('section:has(h2:text("Raamlepingu partnerid")) form', { hasText: 'Tehisaru' })
    .first()
    .locator('button')
    .click();
  await page.waitForURL('**/partner/voorud', { timeout: 20_000 });

  const card = page.locator('section:has(h2:text("Ootavad vastust")) li').first();
  await card.waitFor({ timeout: 20_000 });
  await card.locator('a[href^="/partner/voorud/"]').first().click();
  await page.waitForSelector('[data-testid="confirm-marks"]', { timeout: 20_000 });

  await page.getByTestId('confirm-marks').locator('button').click();
  await page.waitForFunction(() => document.body.textContent.includes('Viimane kinnitus'), null, {
    timeout: 20_000,
  });
  const receipt = await page.locator('text=Viimane kinnitus').first().textContent();
  await page.close();
  return receipt.trim();
}

async function main() {
  mkdirSync(VOLUME, { recursive: true });
  stageStandalone();

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  let first = null;
  let second = null;
  let third = null;

  try {
    /* ---------------- first boot: a fresh volume ---------------- */

    const portA = await freePort();
    first = startStandalone(portA);
    const upA = await waitForHealth(first.base, 60_000);
    check('the standalone server boots on an empty volume', upA);
    if (!upA) throw new Error('first boot failed:\n' + first.logs.join(''));

    check(
      'the first boot seeds the sample data',
      first.logs.join('').includes('näidisandmed laaditud'),
    );

    const receipt = await confirmAsPartner(browser, first.base);
    check('a partner can confirm through the deployed build', receipt.length > 0, receipt);

    const before = inspect();
    check('the confirmation reached the database', before.confirmations > 0, `${before.confirmations}`);

    /* ---------------- kill it the way a machine dies ---------------- */

    first.child.kill('SIGKILL');
    await new Promise((resolve) => first.child.once('exit', resolve));
    check('the process was killed without a graceful shutdown', first.child.killed);

    /* ---------------- second boot: the same volume ---------------- */

    const portB = await freePort();
    second = startStandalone(portB);
    const upB = await waitForHealth(second.base, 60_000);
    check('it boots again against the file the killed process left', upB);
    if (!upB) throw new Error('second boot failed:\n' + second.logs.join(''));

    const secondLog = second.logs.join('');
    check(
      'the sample data is not loaded a second time',
      !secondLog.includes('näidisandmed laaditud'),
      secondLog.slice(0, 200),
    );
    check('the deadline watcher restarts', secondLog.includes('tähtaegade jälgija töötab'));
    check(
      'the migrations do not re-apply — CREATE TRIGGER would abort the boot',
      !secondLog.toLowerCase().includes('already exists'),
    );

    const after = inspect();
    for (const [key, label] of [
      ['rounds', 'voorud'],
      ['confirmations', 'kinnitused'],
      ['trainings', 'koolitused'],
      ['partners', 'partnerid'],
      ['seedVersion', 'seemendusversioon'],
      ['migrations', 'migratsioonid'],
    ]) {
      check(`${label} survive the restart unchanged`, after[key] === before[key], `${before[key]} → ${after[key]}`);
    }
    check(
      'the audit trail only grows',
      after.auditEvents >= before.auditEvents,
      `${before.auditEvents} → ${after.auditEvents}`,
    );

    /* the application, not just the file, is intact */
    const page = await browser.newPage();
    await page.goto(second.base);
    await page.waitForSelector('h1');
    const html = await page.content();
    check('the persona screen serves after the restart', html.includes('TESTKESKKOND'));
    check(
      'the partner’s confirmation is still shown as theirs',
      html.includes('Kinnitatud') || html.includes('kinnitatud'),
    );
    await page.close();

    second.child.kill('SIGKILL');
    await new Promise((resolve) => second.child.once('exit', resolve));
    second = null;

    /* ---------------- the same build, without DEMO_MODE ---------------- */

    const portC = await freePort();
    third = startStandalone(portC, { demoMode: false });
    const upC = await waitForHealth(third.base, 60_000);
    check('the same build boots with DEMO_MODE unset', upC);
    if (!upC) throw new Error('production-posture boot failed:\n' + third.logs.join(''));

    const prodPage = await browser.newPage();
    await prodPage.goto(third.base);
    await prodPage.waitForSelector('h1');
    check('no test strip in production', (await prodPage.getByTestId('test-strip').count()) === 0);
    check(
      'no persona cards in production',
      (await prodPage.locator('section:has(h2:text("Raamlepingu partnerid")) form').count()) === 0,
    );
    check(
      'the sign-in is the front door instead',
      prodPage.url().includes('/sisene') && (await prodPage.getByTestId('sign-in-form').count()) === 1,
      prodPage.url(),
    );

    await prodPage.goto(`${third.base}/tellija`);
    await prodPage.waitForSelector('h1');
    check(
      'the buyer area sends a stranger to the sign-in',
      prodPage.url().includes('/sisene'),
      prodPage.url(),
    );
    await prodPage.close();
  } finally {
    first?.child.kill('SIGKILL');
    second?.child.kill('SIGKILL');
    third?.child.kill('SIGKILL');
    await browser.close().catch(() => {});
  }

  console.log('\nContainer behaviour: restart survival and the production posture\n');
  console.log(results.join('\n'));
  console.log(`\n${state.failures === 0 ? 'ALL PASS' : `${state.failures} FAILURE(S)`}\n`);

  removeDatabase(DB);
  rmSync(VOLUME, { recursive: true, force: true });
  rmSync(STAGE, { recursive: true, force: true });
  process.exit(state.failures === 0 ? 0 : 1);
}

main().catch((error) => {
  if (results.length > 0) console.log('\nKuni katkemiseni:\n' + results.join('\n'));
  console.error('\n' + String(error?.stack ?? error));
  rmSync(STAGE, { recursive: true, force: true });
  process.exit(1);
});
