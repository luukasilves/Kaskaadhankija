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
  /** the domain whose addresses sign in as buyer admins without being listed [L-08] */
  adminDomains = BUYER_DOMAIN,
}) {
  const child = spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    cwd,
    env: {
      ...process.env,
      DATABASE_PATH: databasePath,
      PORT: String(port),
      ...(demoMode ? { DEMO_MODE: '1' } : {}),
      ...(devMail ? { EMAIL_DEV_MODE: '1' } : {}),
      ...(adminDomains ? { AUTO_ADMIN_EMAIL_DOMAINS: adminDomains } : {}),
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

/** The admin the seed creates, listed and therefore not relying on the domain rule. */
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
