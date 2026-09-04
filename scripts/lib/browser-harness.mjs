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
export function startServer({ port, databasePath, demoMode = true, cwd = process.cwd() }) {
  const child = spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    cwd,
    env: {
      ...process.env,
      DATABASE_PATH: databasePath,
      PORT: String(port),
      ...(demoMode ? { DEMO_MODE: '1' } : {}),
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

/**
 * Switch persona through the test strip.
 *
 * Waiting on the persona's name in the document would prove nothing — the
 * strip lists every persona at all times — and partner→partner keeps the same
 * navigation, so the wait is on the application header naming the new persona.
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

/** Move the virtual clock to the next deadline and wait for the strip to update. */
export async function advanceToNextDeadline(page) {
  const button = page.locator('[data-testid="test-strip"] button:has-text("Järgmise tähtajani")');
  if (await button.isDisabled()) return false;
  const before = await page
    .locator('[data-testid="test-strip"] .tabular-nums')
    .first()
    .textContent();
  await button.click();
  await page.waitForFunction(
    (previous) => {
      const el = document.querySelector('[data-testid="test-strip"] .tabular-nums');
      return el && el.textContent !== previous;
    },
    before,
    { timeout: 20_000 },
  );
  return true;
}

/** Remove a throwaway database and its WAL sidecars. */
export function removeDatabase(path) {
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
}

export const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
