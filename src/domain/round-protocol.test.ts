/**
 * The protocol's pure half [L-22].
 *
 * The one property that matters here is that the canonical text depends on the
 * *content* and nothing else — not on the order the builder happened to set
 * keys, not on a `undefined` field appearing. Everything downstream (the hash
 * in the audit trail, the fingerprint printed on paper, the integrity check on
 * download) rests on that.
 */

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  canonicalJson,
  capText,
  fingerprint,
  fingerprintLine,
  protocolHeadline,
  respondingPartnerCount,
  type RoundProtocolData,
} from './round-protocol';

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('canonicalJson', () => {
  it('is independent of key order', () => {
    const a = { b: 1, a: { d: 2, c: [1, 2] } };
    const b = { a: { c: [1, 2], d: 2 }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(sha(canonicalJson(a))).toBe(sha(canonicalJson(b)));
  });

  it('keeps array order, because array order is meaning', () => {
    // Bids are in arrival order and participants in rank order; sorting them
    // would destroy the fact the protocol asserts.
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it('drops undefined rather than letting it change the text', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });

  it('changes when any value changes', () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
    expect(canonicalJson({ a: '1' })).not.toBe(canonicalJson({ a: 1 }));
    expect(canonicalJson({ a: null })).not.toBe(canonicalJson({ a: 0 }));
  });

  it('preserves Estonian characters as themselves', () => {
    const text = canonicalJson({ nimi: 'Tehisaru Koolitus OÜ — „märge“' });
    expect(text).toContain('Tehisaru Koolitus OÜ — „märge“');
  });
});

describe('fingerprint', () => {
  it('is the first 16 hex characters of the hash', () => {
    const hash = sha('midagi');
    expect(fingerprint(hash)).toBe(hash.slice(0, 16));
    expect(fingerprint(hash)).toHaveLength(16);
    expect(fingerprintLine(hash)).toBe(`sõrmejälg ${hash.slice(0, 16)}`);
  });
});

describe('capText', () => {
  it('names the unit the cap counts [L-17]', () => {
    expect(capText(5, 'trainings')).toBe('kuni 5 koolitust');
    expect(capText(40, 'participants')).toBe('kuni 40 osalejat');
    expect(capText(null, 'trainings')).toBe('piirmäärata');
  });
});

/* A minimal but structurally real protocol, for the summary helpers. */
function fixture(over: Partial<RoundProtocolData> = {}): RoundProtocolData {
  return {
    schemaVersion: 1,
    kind: 'confirmed',
    generatedAt: 0,
    generatedBy: 'Mari Tamm',
    framework: {
      title: 'Eesti.ai koolitajate tellimine',
      procurementReference: '10567384',
      agreementReference: '',
      buyerName: 'Riigikantselei',
      validUntil: null,
    },
    lot: { code: 'OSA-2', name: 'Töötoad', description: '' },
    round: { code: 'VOOR-2026-001', status: 'Kinnitatud', originRoundCode: null, createdAt: 0, createdBy: '' },
    conditions: {
      visibilityMode: '',
      capOptions: '',
      workloadThreshold: 25,
      responseWorkingDays: 3,
      note: '',
      plannedPublishAt: null,
      plannedDeadlineAt: null,
      publishedAt: null,
      publishedBy: '',
      originalDeadlineAt: null,
      deadlineChanges: [],
      deadlineAt: null,
      expectedDecisionAt: null,
      cutAt: null,
      closedAt: null,
      confirmedAt: null,
      confirmedBy: '',
      cancelledAt: null,
      cancelReason: '',
    },
    trainings: [],
    participants: [],
    bids: [],
    adjustments: [],
    allocation: { proposal: null, final: null, byTraining: [], trace: [], leftover: [] },
    orders: [],
    notices: [],
    audit: [],
    ...over,
  };
}

describe('protocolHeadline', () => {
  it('counts orders and leftovers for a confirmed round', () => {
    const data = fixture({
      orders: [
        {
          number: 'KH-2026-0001',
          partnerName: 'A',
          partnerRegCode: '10000001',
          trainingCodes: [],
          totalEur: 0,
          unitPriceEur: 0,
          partnerConfirmedAt: null,
          buyerConfirmedAt: 0,
          buyerConfirmedBy: '',
          status: 'active',
        },
      ],
      allocation: { proposal: null, final: null, byTraining: [], trace: [], leftover: ['KK-1'] },
    });
    expect(protocolHeadline(data)).toBe('Voor VOOR-2026-001: 1 tellimust, jääk 1 koolitust.');
  });

  it('says plainly that a cancelled round allocated nothing', () => {
    expect(protocolHeadline(fixture({ kind: 'cancelled' }))).toContain('tühistati');
  });
});

describe('respondingPartnerCount', () => {
  it('counts partners, not confirmations — a partner may confirm many times', () => {
    const bid = (seq: number, lotPartnerId: string) => ({
      seq,
      confirmationId: seq,
      lotPartnerId,
      partnerName: lotPartnerId,
      rank: 1,
      kind: 'confirm' as const,
      marks: [],
      cap: null,
      capKind: 'trainings' as const,
      confirmedAt: seq,
      actorLabel: '',
      contactEmail: '',
      ip: '',
      ua: '',
      binding: seq === 2,
    });
    const data = fixture({ bids: [bid(1, 'p1'), bid(2, 'p1'), bid(3, 'p2')] });
    expect(respondingPartnerCount(data)).toBe(2);
  });
});
