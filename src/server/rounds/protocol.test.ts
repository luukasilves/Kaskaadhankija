/**
 * The protocol against the real schema [L-22].
 *
 * These drive a whole round through the engine and then ask the protocol what
 * it says about it, because the point of the feature is that the two cannot
 * disagree: the row is written inside the same transaction as the ending.
 *
 * The renderers are smoke-tested here too — a PDF that cannot be produced is
 * indistinguishable, from the buyer's chair, from a protocol that does not
 * exist.
 */

import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents, confirmations, partners, roundProtocols, rounds } from '@/db/schema';
import { canonicalJson, fingerprint, respondingPartnerCount } from '@/domain/round-protocol';
import { buildProtocolPdf } from '../documents/protocol-pdf';
import { buildProtocolXlsx } from '../documents/protocol-xlsx';
import { parseXlsxSheets } from '../import/xlsx';
import {
  applyAdjustment,
  cancelRound,
  closeRound,
  confirmAllocation,
  confirmMarks,
  createRound,
  declineAll,
  extendDeadline,
  publishRound,
  withdrawTraining,
} from './engine';
import {
  buildRoundProtocol,
  generateProtocolForEndedRound,
  getRoundProtocol,
  protocolHash,
} from './protocol';
import { allConfirmations } from './views';
import {
  createHarness,
  partnerActor,
  seedLotWithPartners,
  type LotFixture,
  type TestHarness,
} from '../test-support';

let harness: TestHarness;
let fx: LotFixture;

/** Wednesday 30 Sep 2026, 10:00 Tallinn. */
const START = Date.UTC(2026, 8, 30, 7, 0);

beforeEach(() => {
  harness = createHarness(START);
  fx = seedLotWithPartners(harness, { partnerCount: 3, trainingCount: 6 });
});

afterEach(() => {
  harness.close();
});

/* helpers */

/** [D-09] What a partner action records as evidence; append-only, so set here. */
const EVIDENCE = { ip: '203.0.113.9', ua: 'Mozilla/5.0 (TestBrowser)' };

const openRound = () =>
  harness.write((ctx) => {
    const roundId = createRound(ctx, { lotId: fx.lotId, trainingIds: fx.trainingIds });
    publishRound(ctx, roundId);
    return roundId;
  });

const confirm = (roundId: string, partnerIndex: number, marks: string[], cap: number | null = null) =>
  harness.write(
    (ctx) => confirmMarks(ctx, roundId, fx.partnerIds[partnerIndex], { marks, cap }),
    partnerActor(`Kontakt ${partnerIndex + 1}`, fx.lotPartnerIds[partnerIndex]),
    EVIDENCE,
  );

/**
 * What a fixture partner is actually called. `seedLotWithPartners` namespaces
 * its names per fixture, so a literal 'Partner 1' only holds for the first one
 * created in a file — a trap worth not walking into twice.
 */
const partnerName = (index: number) =>
  harness.read(
    (db) =>
      db
        .select({ name: partners.name })
        .from(partners)
        .where(eq(partners.id, fx.partnerIds[index]))
        .get()!.name,
  );

const protocolRow = (roundId: string) =>
  harness.read((db) => db.select().from(roundProtocols).where(eq(roundProtocols.roundId, roundId)).get());

const stored = (roundId: string) => {
  const row = harness.read((db) => getRoundProtocol(db, roundId));
  if (!row) throw new Error('protokolli ei ole');
  return row;
};

/**
 * A round taken all the way: two partners answer, one declines, the buyer caps
 * the first and confirms.
 */
function fullRound(): string {
  const roundId = openRound();
  confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[1], fx.trainingIds[2]], 2);
  confirm(roundId, 1, [fx.trainingIds[2], fx.trainingIds[3]]);
  harness.write(
    (ctx) => declineAll(ctx, roundId, fx.partnerIds[2]),
    partnerActor('Kontakt 3', fx.lotPartnerIds[2]),
    EVIDENCE,
  );
  harness.advance(4 * 86_400_000);
  harness.write((ctx) => closeRound(ctx, roundId));
  harness.write((ctx) =>
    applyAdjustment(ctx, roundId, {
      lotPartnerId: fx.lotPartnerIds[0],
      kind: 'cap',
      cap: 1,
      justification: 'Koormus on juba suur',
    }),
  );
  harness.write((ctx) => confirmAllocation(ctx, roundId));
  return roundId;
}

/* ------------------------------------------------------------------ */

describe('[L-22] a protocol is written when a round ends', () => {
  it('writes exactly one row on confirmation, with the hash of its own text', () => {
    const roundId = fullRound();
    const row = protocolRow(roundId);
    expect(row).toBeDefined();
    expect(row?.kind).toBe('confirmed');
    expect(createHash('sha256').update(row!.contentJson, 'utf8').digest('hex')).toBe(
      row!.contentHash,
    );
    expect(stored(roundId).intact).toBe(true);
  });

  it('audits the generation with the hash, so a later edit is detectable', () => {
    const roundId = fullRound();
    const row = protocolRow(roundId)!;
    const event = harness.read((db) =>
      db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.eventType, 'protocol.generated'))
        .get(),
    );
    expect(event?.roundId).toBe(roundId);
    expect((event?.after as { contentHash: string }).contentHash).toBe(row.contentHash);
    expect(event?.summary).toContain(fingerprint(row.contentHash));
  });

  it('writes a protocol when an open round is cancelled', () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0]]);
    harness.write((ctx) => cancelRound(ctx, roundId, 'Eelarve muutus'));

    const row = protocolRow(roundId);
    expect(row?.kind).toBe('cancelled');
    const data = stored(roundId).data;
    expect(data.conditions.cancelReason).toBe('Eelarve muutus');
    expect(data.orders).toHaveLength(0);
    // The partner's answer is still part of the record: it is what the
    // cancellation has to account for.
    expect(data.bids).toHaveLength(1);
  });

  it('writes none when a draft is cancelled — nobody was ever asked', () => {
    const roundId = harness.write((ctx) =>
      createRound(ctx, { lotId: fx.lotId, trainingIds: fx.trainingIds }),
    );
    harness.write((ctx) => cancelRound(ctx, roundId, 'Vale hankeosa'));
    expect(protocolRow(roundId)).toBeUndefined();
  });

  it('has none while the round is open or merely closed', () => {
    const roundId = openRound();
    expect(protocolRow(roundId)).toBeUndefined();
    harness.advance(4 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    expect(protocolRow(roundId)).toBeUndefined();
  });
});

describe('[K-09][D-09] the bids are every confirmation, in arrival order', () => {
  it('lists all rows of the append-only table, not just the binding ones', () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0]]);
    harness.advance(60_000);
    confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[1]]);
    harness.advance(60_000);
    confirm(roundId, 1, [fx.trainingIds[2]]);
    harness.advance(4 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    harness.write((ctx) => confirmAllocation(ctx, roundId));

    const rows = harness.read((db) => allConfirmations(db, roundId));
    const data = stored(roundId).data;
    expect(data.bids).toHaveLength(rows.length);
    expect(data.bids.map((b) => b.confirmationId)).toEqual(rows.map((r) => r.id));
    expect(data.bids.map((b) => b.seq)).toEqual([1, 2, 3]);
    // Arrival order, ascending.
    expect(data.bids.map((b) => b.confirmedAt)).toEqual(
      [...data.bids].sort((a, b) => a.confirmedAt - b.confirmedAt).map((b) => b.confirmedAt),
    );
  });

  it('marks exactly one binding bid per responding partner [K-04]', () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0]]);
    harness.advance(60_000);
    confirm(roundId, 0, [fx.trainingIds[0], fx.trainingIds[1]]);
    harness.advance(60_000);
    confirm(roundId, 1, [fx.trainingIds[2]]);
    harness.advance(4 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    harness.write((ctx) => confirmAllocation(ctx, roundId));

    const data = stored(roundId).data;
    const binding = data.bids.filter((b) => b.binding);
    expect(binding).toHaveLength(2);
    expect(new Set(binding.map((b) => b.lotPartnerId)).size).toBe(2);
    // The later of the first partner's two.
    const first = data.bids.filter((b) => b.lotPartnerId === fx.lotPartnerIds[0]);
    expect(first[1].binding).toBe(true);
    expect(first[0].binding).toBe(false);
  });

  it('keeps the marks as training codes and the evidence per row', () => {
    const roundId = fullRound();
    const data = stored(roundId).data;
    const bid = data.bids[0];
    expect(bid.marks).toEqual([fx.trainingCodes[0], fx.trainingCodes[1], fx.trainingCodes[2]]);
    expect(bid.cap).toBe(2);
    expect(bid.capKind).toBe('trainings');
    expect(bid.actorLabel).toBe('Kontakt 1');
    expect(bid.partnerName).toBe(partnerName(0));
    expect(bid.rank).toBe(1);
    // A partner who declined has no marks but is still a bid.
    const declined = data.bids.find((b) => b.kind === 'decline_all');
    expect(declined?.partnerName).toBe(partnerName(2));
  });
});

describe('the protocol only copies stored facts', () => {
  it('carries both allocation snapshots exactly as the round stored them', () => {
    const roundId = fullRound();
    const round = harness.read((db) =>
      db.select().from(rounds).where(eq(rounds.id, roundId)).get(),
    )!;
    const data = stored(roundId).data;
    expect(canonicalJson(data.allocation.proposal)).toBe(canonicalJson(round.proposalSnapshot));
    expect(canonicalJson(data.allocation.final)).toBe(canonicalJson(round.finalSnapshot));
  });

  it('shows the buyer adjustment beside the proposal it changed [T-03]', () => {
    const roundId = fullRound();
    const data = stored(roundId).data;

    const effective = data.adjustments.filter((a) => a.effective);
    expect(effective).toHaveLength(1);
    expect(effective[0].kind).toBe('cap');
    expect(effective[0].capValue).toBe(1);
    expect(effective[0].justification).toBe('Koormus on juba suur');
    expect(effective[0].partnerName).toBe(partnerName(0));

    // The cap moved at least one training from the first partner to another.
    const changed = data.allocation.byTraining.filter((row) => row.changed);
    expect(changed.length).toBeGreaterThan(0);
  });

  it('reads the deadline history out of the trail, extensions included [E-06]', () => {
    const roundId = openRound();
    const extendedTo = START + 9 * 86_400_000;
    harness.write((ctx) => extendDeadline(ctx, roundId, extendedTo, 'Partneri taotlus'));
    harness.advance(10 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    harness.write((ctx) => confirmAllocation(ctx, roundId));

    const conditions = stored(roundId).data.conditions;
    expect(conditions.originalDeadlineAt).toBeTypeOf('number');
    expect(conditions.deadlineChanges).toHaveLength(1);
    expect(conditions.deadlineChanges[0].at).toBe(extendedTo);
    expect(conditions.deadlineChanges[0].from).toBe(conditions.originalDeadlineAt);
    expect(conditions.deadlineChanges[0].reason).toBe('Partneri taotlus');
    expect(conditions.deadlineAt).toBe(extendedTo);
    // [J-05] the cut comes from the snapshot, not from today's config.
    expect(conditions.cutAt).toBe(extendedTo);
  });

  it('keeps a withdrawn training in the record but out of the allocation [V-04]', () => {
    const roundId = openRound();
    harness.write((ctx) => withdrawTraining(ctx, roundId, fx.trainingIds[5], 'Tellija tühistas'));
    confirm(roundId, 0, [fx.trainingIds[0]]);
    harness.advance(4 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    harness.write((ctx) => confirmAllocation(ctx, roundId));

    const data = stored(roundId).data;
    const withdrawn = data.trainings.find((t) => t.code === fx.trainingCodes[5]);
    expect(withdrawn?.withdrawnAt).toBeTypeOf('number');
    expect(withdrawn?.withdrawnReason).toBe('Tellija tühistas');
    expect(data.allocation.byTraining.map((row) => row.trainingCode)).not.toContain(
      fx.trainingCodes[5],
    );
  });

  it('lists the orders that were created, with their frozen figures [T-05]', () => {
    const roundId = fullRound();
    const data = stored(roundId).data;
    expect(data.orders.length).toBeGreaterThan(0);
    for (const order of data.orders) {
      expect(order.number).toMatch(/^KH-2026-\d{4}$/);
      expect(order.trainingCodes.length).toBeGreaterThan(0);
      expect(order.totalEur).toBeCloseTo(order.trainingCodes.length * order.unitPriceEur, 5);
    }
    const allocated = data.orders.flatMap((o) => o.trainingCodes).sort();
    const fromAllocation = data.allocation.byTraining
      .filter((row) => row.final !== null)
      .map((row) => row.trainingCode)
      .sort();
    expect(allocated).toEqual(fromAllocation);
  });

  it('records the participants in frozen rank order with their contacts [V-07][D-09]', () => {
    const roundId = fullRound();
    const data = stored(roundId).data;
    expect(data.participants.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(data.participants.map((p) => p.partnerName)).toEqual([
      partnerName(0),
      partnerName(1),
      partnerName(2),
    ]);
    expect(data.participants[0].contactEmail).toBe('kontakt1@naidis.ee');
    expect(data.participants[0].partnerRegCode).toMatch(/^\d{8}$/);
    expect(data.participants.map((p) => p.outcomeAtClose)).toEqual([
      'confirmed',
      'confirmed',
      'declined_all',
    ]);
  });

  it('includes the notices the round sent, without delivery status [D-10]', () => {
    const roundId = fullRound();
    const data = stored(roundId).data;
    expect(data.notices.length).toBeGreaterThan(0);
    expect(data.notices.map((n) => n.type)).toContain('round_published');
    expect(data.notices.map((n) => n.type)).toContain('order_issued');
    // Deliberately no delivery field: the mail leaves after this commit.
    // (Keys come back alphabetical — the stored text is canonical JSON.)
    expect(Object.keys(data.notices[0])).toEqual([
      'createdAt',
      'recipientKind',
      'recipientName',
      'title',
      'type',
    ]);
  });

  it('includes the round’s whole audit trail', () => {
    const roundId = fullRound();
    const data = stored(roundId).data;
    const types = data.audit.map((row) => row.eventType);
    expect(types).toContain('round.published');
    expect(types).toContain('marks.confirmed');
    expect(types).toContain('adjustment.applied');
    expect(types).toContain('round.confirmed');
    expect(data.audit.map((r) => r.id)).toEqual([...data.audit.map((r) => r.id)].sort((a, b) => a - b));
  });
});

describe('determinism', () => {
  it('building the same round twice yields the same bytes', () => {
    const roundId = fullRound();
    const first = harness.read((db) =>
      buildRoundProtocol(db, roundId, { kind: 'confirmed', at: 123, by: 'Mari' }),
    );
    const second = harness.read((db) =>
      buildRoundProtocol(db, roundId, { kind: 'confirmed', at: 123, by: 'Mari' }),
    );
    expect(protocolHash(first).hash).toBe(protocolHash(second).hash);
  });

  it('a different generation instant is a different protocol', () => {
    const roundId = fullRound();
    const a = harness.read((db) =>
      buildRoundProtocol(db, roundId, { kind: 'confirmed', at: 1, by: 'Mari' }),
    );
    const b = harness.read((db) =>
      buildRoundProtocol(db, roundId, { kind: 'confirmed', at: 2, by: 'Mari' }),
    );
    expect(protocolHash(a).hash).not.toBe(protocolHash(b).hash);
  });
});

describe('integrity', () => {
  it('reports a stored text that no longer matches its hash', () => {
    const roundId = fullRound();
    harness.raw
      .prepare('UPDATE round_protocols SET content_json = ? WHERE round_id = ?')
      .run('{"schemaVersion":1}', roundId);
    expect(stored(roundId).intact).toBe(false);
  });
});

describe('a round that ended before protocols existed', () => {
  it('can be given one by hand, from the same stored facts', () => {
    const roundId = fullRound();
    // Simulate a v2.2 database: the round is confirmed, the row is absent.
    harness.raw.prepare('DELETE FROM round_protocols WHERE round_id = ?').run(roundId);
    expect(protocolRow(roundId)).toBeUndefined();

    harness.advance(86_400_000);
    const written = harness.write((ctx) => generateProtocolForEndedRound(ctx, roundId));
    const row = protocolRow(roundId)!;
    expect(row.contentHash).toBe(written.hash);
    expect(row.kind).toBe('confirmed');
    // Written later, but about the same round.
    expect(row.generatedAt).toBe(START + 5 * 86_400_000);
    const data = stored(roundId).data;
    expect(data.orders.length).toBeGreaterThan(0);
    expect(data.bids.length).toBeGreaterThan(0);
  });

  it('refuses to overwrite a protocol that already exists', () => {
    const roundId = fullRound();
    expect(() => harness.write((ctx) => generateProtocolForEndedRound(ctx, roundId))).toThrow(
      /juba olemas/,
    );
  });

  it('refuses a round that has not ended', () => {
    const roundId = openRound();
    expect(() => harness.write((ctx) => generateProtocolForEndedRound(ctx, roundId))).toThrow(
      /kinnitatud voorust/,
    );
  });

  it('refuses a draft that was cancelled without ever being published', () => {
    const roundId = harness.write((ctx) =>
      createRound(ctx, { lotId: fx.lotId, trainingIds: fx.trainingIds }),
    );
    harness.write((ctx) => cancelRound(ctx, roundId, 'Vale hankeosa'));
    expect(() => harness.write((ctx) => generateProtocolForEndedRound(ctx, roundId))).toThrow(
      /avaldatud voorust/,
    );
  });
});

/* ------------------------------------------------------------------ *
 * the two renderings
 * ------------------------------------------------------------------ */

/**
 * Every readable text run of a PDF.
 *
 * The content streams are Flate-compressed, and pdfkit writes standard-font
 * text as hex strings in **WinAnsi** — not Latin-1, which differs exactly in
 * the 0x80–0x9F range where „ “ – — · live. Decoding those bytes as Latin-1
 * silently turns the quotes and dashes into invisible control characters, so
 * the assertion has to use windows-1252 to see what a reader would see.
 */
const WINANSI = new TextDecoder('windows-1252');

function pdfText(bytes: Buffer): string {
  const raw = bytes.toString('latin1');
  const runs: Buffer[] = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const body = Buffer.from(match[1], 'latin1');
    let text: string;
    try {
      text = inflateSync(body).toString('latin1');
    } catch {
      continue;
    }
    for (const hex of text.matchAll(/<([0-9a-fA-F]+)>/g)) {
      if (hex[1].length % 2 !== 0) continue;
      runs.push(Buffer.from(hex[1], 'hex'));
    }
  }
  return WINANSI.decode(Buffer.concat(runs));
}

/**
 * The rightmost text position in a PDF, in points.
 *
 * pdfmake does not complain when a table's columns add up to more than the
 * page — it simply draws them off the paper, where nobody notices until the
 * protocol is printed. So the test measures.
 */
function pdfMaxTextX(bytes: Buffer): number {
  const raw = bytes.toString('latin1');
  let max = 0;
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let text: string;
    try {
      text = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    for (const tm of text.matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/g)) {
      max = Math.max(max, Number(tm[1]));
    }
  }
  return max;
}

describe('the PDF', () => {

  it('renders, and names the round and its fingerprint', async () => {
    const roundId = fullRound();
    const protocol = stored(roundId);
    const pdf = await buildProtocolPdf(protocol.data, protocol.contentHash);

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const text = pdfText(pdf);
    expect(text).toContain(protocol.data.round.code);
    expect(text).toContain(fingerprint(protocol.contentHash));
    // The whole hash is printed once, so it can be compared character by
    // character against the audit row.
    expect(text).toContain(protocol.contentHash.slice(0, 40));
  });

it('draws every table inside the page [A4, 36pt margins]', async () => {
    const roundId = fullRound();
    const protocol = stored(roundId);
    const pdf = await buildProtocolPdf(protocol.data, protocol.contentHash);
    // A4 is 595.28pt wide; the right margin sits at 559.28.
    expect(pdfMaxTextX(pdf)).toBeLessThanOrEqual(559.28);
  });

  it('keeps the technical evidence out of the printed document [D-09]', async () => {
    const roundId = openRound();
    harness.write(
      (ctx) => confirmMarks(ctx, roundId, fx.partnerIds[0], { marks: [fx.trainingIds[0]], cap: null }),
      partnerActor('Kontakt 1', fx.lotPartnerIds[0]),
      EVIDENCE,
    );
    harness.advance(4 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    harness.write((ctx) => confirmAllocation(ctx, roundId));

    const protocol = stored(roundId);
    // The data carries the evidence; the PDF does not print it.
    expect(protocol.data.bids[0].ip).toBe('203.0.113.9');
    const text = pdfText(await buildProtocolPdf(protocol.data, protocol.contentHash));
    expect(text).not.toContain('203.0.113.9');
    expect(text).not.toContain('TestBrowser');
  });

  it('renders a cancelled round in one sentence rather than an empty table', async () => {
    const roundId = openRound();
    confirm(roundId, 0, [fx.trainingIds[0]]);
    harness.write((ctx) => cancelRound(ctx, roundId, 'Eelarve muutus'));
    const protocol = stored(roundId);
    const text = pdfText(await buildProtocolPdf(protocol.data, protocol.contentHash));
    expect(text).toContain('Eelarve muutus');
    expect(text).toContain('jaotust ei tehtud');
  });

  it('substitutes the glyphs a standard PDF font cannot write', async () => {
    const roundId = openRound();
    // A training title with characters WinAnsi has, and one it has not.
    harness.raw
      .prepare('UPDATE trainings SET title = ? WHERE id = ?')
      .run('Õppepäev — „tehisaru“ ✓ ≥ 20', fx.trainingIds[0]);
    harness.advance(4 * 86_400_000);
    harness.write((ctx) => closeRound(ctx, roundId));
    harness.write((ctx) => confirmAllocation(ctx, roundId));

    const protocol = stored(roundId);
    const text = pdfText(await buildProtocolPdf(protocol.data, protocol.contentHash));
    // Estonian letters and typographic punctuation survive as themselves…
    expect(text).toContain('Õppepäev');
    expect(text).toContain('„tehisaru“');
    // …and the two glyphs the font lacks are folded, not mangled.
    expect(text).toContain('+ >= 20');
    expect(text).not.toContain('✓');
  });
});

describe('the .xlsx annex', () => {
  it('carries the hash and the evidence the PDF leaves out', async () => {
    const roundId = fullRound();
    const protocol = stored(roundId);
    const buffer = await buildProtocolXlsx(protocol.data, protocol.contentHash);
    const sheets = await parseXlsxSheets(buffer);

    expect([...sheets.keys()]).toEqual([
      'Tingimused',
      'Koolitused',
      'Osalejad',
      'Kinnitused',
      'Kohandused',
      'Jaotus',
      'Kaskaadi käik',
      'Jääk',
      'Tellimused',
      'Teated',
      'Auditijälg',
      'Selgitus',
    ]);

    const conditions = sheets.get('Tingimused')!;
    expect(conditions.rows[0]).toMatchObject({ väli: 'SHA-256', väärtus: protocol.contentHash });

    const bids = sheets.get('Kinnitused')!;
    expect(bids.rows.length).toBe(protocol.data.bids.length);
    expect(bids.headers).toContain('ip');
    expect(bids.headers).toContain('brauser');
    expect(bids.rows[0].ip).toBe('203.0.113.9');
    // One binding row per partner who answered — the decline counts [K-04].
    expect(bids.rows.filter((row) => row.siduv === 'jah').length).toBe(
      respondingPartnerCount(protocol.data),
    );
    expect(respondingPartnerCount(protocol.data)).toBe(3);

    const orders = sheets.get('Tellimused')!;
    expect(orders.rows.length).toBe(protocol.data.orders.length);
  });

  it('names every sheet within Excel’s 31-character limit', async () => {
    const roundId = fullRound();
    const protocol = stored(roundId);
    const sheets = await parseXlsxSheets(
      await buildProtocolXlsx(protocol.data, protocol.contentHash),
    );
    for (const name of sheets.keys()) {
      expect(name.length).toBeLessThanOrEqual(31);
      expect(name).not.toMatch(/[[\]:*?/\\]/);
    }
  });
});

describe('confirmations table untouched', () => {
  it('generating a protocol writes nothing to the append-only tables', () => {
    const roundId = fullRound();
    const before = harness.read((db) => db.select().from(confirmations).all().length);
    harness.raw.prepare('DELETE FROM round_protocols WHERE round_id = ?').run(roundId);
    harness.write((ctx) => generateProtocolForEndedRound(ctx, roundId));
    const after = harness.read((db) => db.select().from(confirmations).all().length);
    expect(after).toBe(before);
  });
});
