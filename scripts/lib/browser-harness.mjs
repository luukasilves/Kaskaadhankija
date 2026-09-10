/**
 * Shared plumbing for the browser verification scripts.
 *
 * Every script here starts its own Next server on a throwaway database, so a
 * run never touches the developer's data and two runs never collide. The
 * pieces worth sharing are the ones that were subtly wrong when each script had
 * its own copy: the port must be one the OS says is free (a stale server from a
 * failed run would otherwise answer the health check and the script would test
 * the wrong build), the child must be killed on every exit path, and a
 * persona switch must be waited on by something that actually changes.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { rmSync } from 'node:fs';

/** A port the OS has just confirmed is free. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Start `next start` against `databasePath` and return a handle.
 *
 * `stop()` is safe to call more than once, and is also registered on process
 * exit so an aborted run cannot leave a server listening.
 */
export function startServer({
  port,
  databasePath,
  demoMode = true,
  cwd = process.cwd(),
  /** print sign-in codes to the log instead of mailing them, so a script can read one */
  devMail = true,
  /**
   * Who signs in as a buyer admin without being listed first [L-08]. A whole
   * domain here, which is what lets a suite sign in on an empty database with
   * nobody in the team yet; the real deployment carries named addresses.
   */
  adminAllowlist = BUYER_DOMAIN,
  /**
   * How short a test round's response window may be [L-23]. The product default
   * is five minutes — right for a person trying the environment, far too long
   * for a script that has to sit through two of them.
   */
  deadlineFloorSeconds = 15,
}) {
  const child = spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    cwd,
    env: {
      ...process.env,
      DATABASE_PATH: databasePath,
      PORT: String(port),
      ...(demoMode ? { DEMO_MODE: '1' } : {}),
      ...(devMail ? { EMAIL_DEV_MODE: '1' } : {}),
      ...(adminAllowlist ? { AUTO_ADMIN_ALLOWLIST: adminAllowlist } : {}),
      TEST_DEADLINE_FLOOR_SECONDS: String(deadlineFloorSeconds),
      APP_BASE_URL: `http://localhost:${port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs = [];
  child.stdout.on('data', (d) => logs.push(String(d)));
  child.stderr.on('data', (d) => logs.push(String(d)));

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    child.kill();
  };
  process.on('exit', stop);

  return { child, logs, stop, base: `http://localhost:${port}` };
}

export async function waitForHealth(base, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** Collects PASS/FAIL lines and counts failures. */
export function makeChecker() {
  const results = [];
  const state = { failures: 0 };

  const check = (label, condition, detail = '') => {
    if (condition) results.push(`  PASS  ${label}`);
    else {
      state.failures += 1;
      results.push(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
  };
  const note = (label) => results.push(`  ----  ${label}`);

  return { check, note, results, state };
}

/** Watch a page for errors the checks should fail on. */
export function watchPage(page) {
  const consoleErrors = [];
  const badResponses = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    consoleErrors.push(`${m.text()} @ ${m.location()?.url ?? '?'}`);
  });
  page.on('response', (r) => r.status() >= 400 && badResponses.push(`${r.status()} ${r.url()}`));
  page.on('requestfailed', (r) => {
    // Navigating away cancels Next's in-flight RSC prefetches; an aborted
    // request is the script's doing, not the application's.
    const why = r.failure()?.errorText ?? '';
    if (why.includes('ERR_ABORTED')) return;
    badResponses.push(`failed ${r.url()} (${why})`);
  });
  return { consoleErrors, badResponses };
}

/* ------------------------------------------------------------------ *
 * signing in [L-08]
 * ------------------------------------------------------------------ */

/** The admin the seed creates, listed and therefore not relying on the allowlist. */
export const SEED_ADMIN = { name: 'Mari Tamm', email: 'mari.tamm@naidis.riigikantselei.ee' };

/** The buyer domain the test servers treat as admins. */
export const BUYER_DOMAIN = '@naidis.riigikantselei.ee';

/**
 * The latest code the server printed for an address, waiting for it to appear.
 *
 * `EMAIL_DEV_MODE` writes the message to the log instead of sending it, and the
 * log is the only place a sign-in code ever exists — codes deliberately bypass
 * the notification log, so there is nothing to read in the database either.
 */
export async function codeFor(server, email, { expect = true, timeoutMs = 15_000 } = {}) {
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`Saaja: ${escaped}\\s*\\nTeema: Sisenemiskood (\\d{6})`, 'g');
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

/** How many codes the server has printed for an address — for the rate limits. */
export function codesPrintedFor(server, email) {
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (server.logs.join('').match(new RegExp(`Saaja: ${escaped}\\s*\\nTeema: Sisenemiskood`, 'g')) ?? []).length;
}

export async function requestCode(page, base, email) {
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
export async function enterCode(page, code) {
  const form = page.locator('[data-testid="sign-in-code-form"]');
  await form.waitFor({ timeout: 20_000 });
  await form.locator('input[name="code"]').fill(code);
  const posted = page.waitForResponse((r) => r.request().method() === 'POST', { timeout: 20_000 });
  await form.locator('button[type="submit"]').click();
  await posted;
  await page.waitForLoadState('networkidle');
}

/** Sign in with a real code and return where the sign-in landed. */
export async function signInAs(page, server, email) {
  await requestCode(page, server.base, email);
  const code = await codeFor(server, email);
  if (!/^\d{6}$/.test(code ?? '')) {
    throw new Error(`ühtki koodi ei saadetud aadressile ${email} (loend: ${code})`);
  }
  await enterCode(page, code);
  await page.waitForURL((url) => !url.pathname.startsWith('/sisene'), { timeout: 20_000 });
  return new URL(page.url()).pathname;
}

/**
 * Sign in as a buyer admin, which in the test environment lands on the act-as
 * screen. Every suite that used to enter by clicking a persona starts here.
 */
export async function signInAsAdmin(page, server, email = SEED_ADMIN.email) {
  const landing = await signInAs(page, server, email);
  if (landing !== '/') {
    throw new Error(`admin pidi maanduma valikulehel, aga maandus ${landing}`);
  }
  await page.waitForSelector('[data-testid="act-as-card"]', { timeout: 20_000 });
  return landing;
}

/** Choose a participant on the act-as screen and wait for their area. */
export async function pickActAs(page, name) {
  const card = page.locator('form:has([data-testid="act-as-card"])', { hasText: name }).first();
  const key = await card.locator('input[name="persona"]').inputValue();
  const area = key.startsWith('buyer:') ? '/tellija' : '/partner';
  await card.locator('[data-testid="act-as-card"]').click();
  await page.waitForURL((url) => url.pathname.startsWith(area), { timeout: 20_000 });
  await page.waitForSelector(`nav a[href^="${area}/"]`, { timeout: 20_000 });
}

/**
 * Switch who an admin is acting as, through the test strip.
 *
 * Waiting on the name in the document would prove nothing — the strip lists
 * every participant at all times — and partner→partner keeps the same
 * navigation, so the wait is on the application header naming the new one.
 */
export async function switchTo(page, name) {
  const select = page.locator('[data-testid="test-strip"] select');
  const value = await select
    .locator('option')
    .evaluateAll(
      (options, needle) => options.find((o) => o.textContent.includes(needle))?.value ?? null,
      name,
    );
  if (!value) throw new Error(`persoona "${name}" ei ole ribal olemas`);
  const area = value.startsWith('buyer:') ? '/tellija' : '/partner';
  await select.selectOption(value);
  await page.waitForSelector(`nav a[href^="${area}/"]`, { timeout: 20_000 });
  await page.waitForFunction(
    (needle) => {
      const header = document.querySelector('header:not([data-testid="test-strip"])');
      return !!header && header.textContent.includes(needle);
    },
    name,
    { timeout: 20_000 },
  );
}

/**
 * The application's own markup, without the test strip.
 *
 * The persona dropdown names every mock company, so a leak check over the whole
 * document would always fail; what matters is that the application never names
 * a competitor.
 */
export async function appHtml(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    const nav = document.querySelector('header:not([data-testid="test-strip"])');
    return [nav?.outerHTML ?? '', main?.outerHTML ?? ''].join('\n');
  });
}

/** Where a forbidden name occurs, so a leak is reported and not just flagged. */
export function leakDetail(html, names) {
  const found = [];
  for (const name of names) {
    const at = html.indexOf(name);
    if (at >= 0) {
      found.push(`${name} @${at}: …${html.slice(Math.max(0, at - 120), at + 80).replace(/\s+/g, ' ')}…`);
    }
  }
  return found.join('\n        ');
}

/**
 * A response deadline a minute or two out, as the publish form wants it.
 *
 * `datetime-local` has minute granularity and the server reads the value as
 * Tallinn time, so the earliest usable deadline is a minute boundary. When the
 * next one is too close to survive the round trip, take the one after it —
 * otherwise the server's floor check would reject a deadline that was fine when
 * the string was built.
 */
export function nextMinuteDeadline({ minLeadMs = 25_000 } = {}) {
  let target = Math.ceil((Date.now() + 1) / 60_000) * 60_000;
  while (target - Date.now() < minLeadMs) target += 60_000;

  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Tallinn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(target));
  // sv-SE gives 'YYYY-MM-DD HH:MM', one space away from the input's format.
  return { deadlineMs: target, localValue: parts.replace(' ', 'T') };
}

/**
 * Publish a draft with an absolute deadline a minute or two out, and return it.
 *
 * The form's working-day choices cannot express a window this short, which is
 * exactly why the absolute field exists [L-20][L-23].
 */
export async function publishWithShortDeadline(page, { minLeadMs } = {}) {
  const { deadlineMs, localValue } = nextMinuteDeadline({ minLeadMs });
  await page.getByTestId('deadline-at').fill(localValue);
  // A suite may already accept dialogs page-wide; whoever gets there second
  // finds the dialog handled, which is not a failure.
  page.once('dialog', (dialog) => dialog.accept().catch(() => {}));
  await page.getByTestId('publish-round').locator('button').click();
  await page.waitForFunction(() => document.body.textContent.includes('Avatud'), null, {
    timeout: 20_000,
  });
  return deadlineMs;
}

/** Upload a file into the one file input of an import page's form. */
export async function uploadWorkbook(page, base, path, { form, ready }) {
  await page.goto(`${base}${path.pageUrl}`);
  await page.waitForSelector(`[data-testid="${form}"]`, { timeout: 20_000 });
  await page.setInputFiles('input[type="file"]', path.file);
  await page.locator(`[data-testid="${form}"] button[type="submit"]`).click();
  await page.waitForSelector(`[data-testid="${ready}"]`, { timeout: 30_000 });
}

/**
 * Wait for a round's deadline to pass, then let a page load close it.
 *
 * There is no clock to wind any more [L-23]: a script publishes with a window
 * of a minute or two and waits it out, which is what a real deadline does. The
 * round is closed by the jobs runner — the minute timer, or the page load this
 * function ends with, whichever gets there first.
 */
export async function waitOutDeadline(page, base, deadlineMs, { graceMs = 3_000, timeoutMs = 300_000 } = {}) {
  const target = deadlineMs + graceMs;
  const wait = Math.max(0, target - Date.now());
  if (wait > timeoutMs) throw new Error(`tähtaeg on ${Math.round(wait / 1000)} s kaugusel — liiga kaugel selle skripti jaoks`);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  // A page load runs the due jobs, so the round closes in this request.
  await page.goto(`${base}/tellija`);
  await page.waitForLoadState('networkidle');
}

/** Remove a throwaway database and its WAL sidecars. */
export function removeDatabase(path) {
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
}

export const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
