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
 * **The production posture.** A deployment without `DEMO_MODE` is the real one,
 * so it is worth confirming on the same standalone build that the sign-in is
 * the only front door and the act-as screen does not exist.
 *
 * **The traced fonts.** The protocol PDF opens pdfkit's `.afm` metrics by name,
 * which Next's file tracer cannot see [L-22]. Generating a protocol for a round
 * whose row was deleted — the shape a database migrated from v2.2 has — proves
 * the metrics really made it into the standalone output, which is the one thing
 * `next start` from a full node_modules can never prove.
 *
 *   node scripts/verify-container.mjs      (after pnpm build)
 */

import Database from 'better-sqlite3';
import { chromium } from 'playwright';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUYER_DOMAIN,
  CHROMIUM,
  freePort,
  makeChecker,
  removeDatabase,
  signInAs,
  signInAsAdmin,
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
      // Codes go to the log rather than the post, so a script can read one —
      // the only place a sign-in code ever exists [L-08].
      EMAIL_DEV_MODE: '1',
      AUTO_ADMIN_ALLOWLIST: BUYER_DOMAIN,
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
      protocols: one('select count(*) n from round_protocols').n,
      seedVersion: one('select seed_version v from app_state').v,
      migrations: one("select count(*) n from __drizzle_migrations").n,
    };
  } finally {
    db.close();
  }
}

/**
 * Confirm a partner's marks through the real UI, so the write is a real one.
 *
 * The partner signs in with their own address — the contact the framework data
 * put in the tables [L-21] — because that is now the only way in [L-08].
 */
async function confirmAsPartner(browser, server) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const landing = await signInAs(page, server, 'jaan.kask@tehisaru-naidis.ee');
  if (!landing.startsWith('/partner')) {
    throw new Error(`partner pidi maanduma oma alal, aga maandus ${landing}`);
  }

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

/**
 * A confirmed round with no protocol, made by deleting the row the confirmation
 * wrote — the shape a database carried over from v2.2 has [L-22].
 */
function protocolLessRound() {
  const db = new Database(DB);
  try {
    const round = db
      .prepare("select id from rounds where status = 'confirmed' order by code limit 1")
      .get();
    if (!round) return null;
    db.prepare('delete from round_protocols where round_id = ?').run(round.id);
    return round.id;
  } finally {
    db.close();
  }
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

    const receipt = await confirmAsPartner(browser, first);
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
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(second.base);
    await page.waitForSelector('[data-testid="sign-in-form"]', { timeout: 20_000 });
    check(
      'the front door serves after the restart, badged as the test environment',
      (await page.content()).includes('TESTKESKKOND'),
    );

    /* ---------------- a protocol from the standalone build [L-22] ----------------
       The row is deleted first, which is exactly the state a database migrated
       from v2.2 is in: a confirmed round with no protocol. Generating one here
       exercises the PDF renderer inside the traced output, where a missing font
       metric would be the failure nobody caught at build time. */
    await signInAsAdmin(page, second);
    const confirmedRoundId = protocolLessRound();
    check('a confirmed round is available to protocol by hand', confirmedRoundId !== null);
    if (confirmedRoundId) {
      await page.goto(`${second.base}/tellija/voorud/${confirmedRoundId}/protokoll`);
      await page.waitForSelector('[data-testid="protocol-missing"]', { timeout: 20_000 });
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByTestId('generate-protocol').locator('button').click();
      await page.waitForSelector('[data-testid="protocol-hash"]', { timeout: 30_000 });
      const hash = (await page.getByTestId('protocol-hash').innerText()).trim();
      check('the protocol is written on the deployed build', /^[0-9a-f]{64}$/.test(hash), hash);

      const pdf = await page.request.get(
        `${second.base}/tellija/voorud/${confirmedRoundId}/protokoll/pdf`,
      );
      const bytes = await pdf.body();
      check(
        'and the PDF renders — the traced font metrics are really there',
        pdf.status() === 200 && bytes.subarray(0, 5).toString('latin1') === '%PDF-' && bytes.length > 5_000,
        `${pdf.status()} · ${bytes.length} baiti`,
      );
    }
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
      'no act-as cards in production',
      (await prodPage.getByTestId('act-as-card').count()) === 0,
    );
    check(
      'and no test-environment badge',
      !(await prodPage.content()).includes('TESTKESKKOND'),
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
