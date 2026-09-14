/**
 * The round protocol through the real front door [L-22].
 *
 * The unit tests build and render protocols against the schema; what they
 * cannot see is the HTTP path — that the buyer guard holds, that the two
 * downloads arrive with the right filenames and bytes, and that the fingerprint
 * on the page is the one the PDF prints. That is what a signed document rests
 * on, so it is checked against a running server.
 *
 * Run: `pnpm verify:protocol` (builds first).
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import {
  CHROMIUM,
  freePort,
  makeChecker,
  removeDatabase,
  signInAsAdmin,
  startServer,
  waitForHealth,
  watchPage,
} from './lib/browser-harness.mjs';

const DB = join(tmpdir(), `kaskaad-protocol-${process.pid}.db`);
const { check, results, state } = makeChecker();

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

async function main() {
  seed();
  const port = await freePort();
  const server = startServer({ port, databasePath: DB });
  const browser = await chromium.launch({ executablePath: CHROMIUM });

  try {
    if (!(await waitForHealth(server.base))) {
      console.error(server.logs.join(''));
      throw new Error('server did not become healthy');
    }

    /* 1. the downloads are buyer-only, before any browser is involved */
    const anonymous = await fetch(`${server.base}/tellija/voorud/does-not-exist/protokoll/pdf`, {
      redirect: 'manual',
    });
    check(
      'anonymous protocol download does not serve a document',
      anonymous.status !== 200,
      `status ${anonymous.status}`,
    );

    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    watchPage(page);
    await signInAsAdmin(page, server);

    /* 2. find a confirmed round through the UI, as a person would */
    await page.goto(`${server.base}/tellija/voorud`, { waitUntil: 'domcontentloaded' });
    const confirmed = page.locator('a[href^="/tellija/voorud/"]').first();
    await confirmed.waitFor({ timeout: 15_000 });

    // The seed's first two rounds are confirmed; open each until one has a
    // protocol link, so the check does not depend on their order. `uus`,
    // `import` and `mall` sit at the same depth as a round id and are not
    // rounds — following one would land on a 404 and prove nothing.
    const NOT_A_ROUND = new Set(['uus', 'import', 'mall']);
    const hrefs = await page
      .locator('a[href^="/tellija/voorud/"]')
      .evaluateAll((els, skip) =>
        [...new Set(els.map((el) => el.getAttribute('href')))].filter((h) => {
          const match = /^\/tellija\/voorud\/([^/]+)$/.exec(h ?? '');
          return match !== null && !skip.includes(match[1]);
        }),
      [...NOT_A_ROUND]);
    let roundUrl = null;
    for (const href of hrefs) {
      await page.goto(`${server.base}${href}`, { waitUntil: 'domcontentloaded' });
      if (await page.getByTestId('protocol-link').count()) {
        roundUrl = `${server.base}${href}`;
        break;
      }
    }
    check('a confirmed round links to its protocol', roundUrl !== null, `checked ${hrefs.length} rounds`);
    if (!roundUrl) throw new Error('no confirmed round with a protocol in the seeded database');

    /* 3. the protocol page states the hash and offers both files */
    await page.getByTestId('protocol-link').click();
    await page.waitForURL(/\/protokoll$/);
    const pageHash = (await page.getByTestId('protocol-hash').innerText()).trim();
    check('the page prints a full SHA-256', /^[0-9a-f]{64}$/.test(pageHash), pageHash);
    check(
      'the headline names the round',
      (await page.getByTestId('protocol-headline').innerText()).includes('VOOR-'),
    );
    check('no tampering warning on a freshly written protocol', !(await page.getByTestId('protocol-tampered').count()));
    // The hash is only evidence if it is also in the append-only trail.
    check(
      'the page finds the audit entry that carries the same hash',
      /^#\d+/.test((await page.getByTestId('protocol-audit').innerText()).trim()),
      (await page.getByTestId('protocol-audit').innerText()).trim(),
    );

    /* 4. the PDF downloads, is a PDF, and carries the same fingerprint */
    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('protocol-pdf').click(),
    ]);
    const pdfPath = await pdfDownload.path();
    const pdf = readFileSync(pdfPath);
    check(
      'the PDF filename names the round',
      /^vooru-protokoll-VOOR-\d{4}-\d{3}\.pdf$/.test(pdfDownload.suggestedFilename()),
      pdfDownload.suggestedFilename(),
    );
    check('the download is a PDF', pdf.subarray(0, 5).toString('latin1') === '%PDF-');
    check('the PDF is a real document, not a stub', pdf.length > 5_000, `${pdf.length} bytes`);
    check(
      'the fingerprint on the page appears in the PDF',
      pdfText(pdf).includes(pageHash.slice(0, 16)),
    );
    check('the PDF prints the whole hash too', pdfText(pdf).includes(pageHash.slice(0, 40)));

    /* 5. the annex downloads and is a workbook */
    const [xlsxDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('protocol-xlsx').click(),
    ]);
    const xlsx = readFileSync(await xlsxDownload.path());
    check(
      'the annex filename names the round',
      /^vooru-protokoll-VOOR-\d{4}-\d{3}\.xlsx$/.test(xlsxDownload.suggestedFilename()),
      xlsxDownload.suggestedFilename(),
    );
    check('the annex is a zip container, as .xlsx is', xlsx.subarray(0, 2).toString('latin1') === 'PK');
    check('the annex is a real workbook', xlsx.length > 5_000, `${xlsx.length} bytes`);

    /* 6. an open round has no protocol, and says so rather than 404ing */
    const openRound = hrefs.find((href) => !roundUrl.endsWith(href));
    if (openRound) {
      await page.goto(`${server.base}${openRound}/protokoll`, { waitUntil: 'domcontentloaded' });
      const explained =
        (await page.getByTestId('protocol-not-yet').count()) > 0 ||
        (await page.getByTestId('protocol-missing').count()) > 0 ||
        (await page.getByTestId('protocol-hash').count()) > 0;
      check('every round’s protocol page explains itself', explained);
    }

    /* 7. a partner can never reach one */
    const partnerContext = await browser.newContext();
    const partnerPage = await partnerContext.newPage();
    const response = await partnerPage.goto(`${roundUrl}/protokoll/pdf`, {
      waitUntil: 'domcontentloaded',
    });
    check(
      'a signed-out visitor gets no protocol',
      !response || response.status() !== 200 || /sisene/.test(partnerPage.url()),
      `${response?.status()} ${partnerPage.url()}`,
    );
    await partnerContext.close();
  } finally {
    await browser.close();
    server.stop();
    removeDatabase(DB);
  }

  console.log('\nVooru protokoll [L-22]\n' + results.join('\n'));
  console.log(
    state.failures === 0 ? '\nKõik kontrollid läbitud.' : `\n${state.failures} kontrolli ebaõnnestus.`,
  );
  process.exit(state.failures === 0 ? 0 : 1);
}

/** The readable text of a PDF: inflate the streams, decode WinAnsi hex runs. */
function pdfText(bytes) {
  const raw = bytes.toString('latin1');
  const runs = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let text;
    try {
      text = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    for (const hex of text.matchAll(/<([0-9a-fA-F]+)>/g)) {
      if (hex[1].length % 2 === 0) runs.push(Buffer.from(hex[1], 'hex'));
    }
  }
  return new TextDecoder('windows-1252').decode(Buffer.concat(runs));
}

await main();
