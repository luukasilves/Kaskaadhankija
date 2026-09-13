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
  type RoundProtocolData, allocationByPartner } from './round-protocol';

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
  const training = (code: string) => ({
    code,
    title: `Koolitus ${code}`,
    workshopType: 'Töötuba 1',
    eventDate: '2026-10-01',
    eventEnd: null,
    county: 'Harju maakond',
    locationText: '',
    participantCount: 20,
    language: 'et',
    withdrawnAt: null,
    withdrawnReason: '',
    withdrawnBy: '',
  });
  const participant = (rank: number, name: string) => ({
    lotPartnerId: `lp${rank}`,
    rank,
    partnerName: name,
    partnerRegCode: `1000000${rank}`,
    contactName: name,
    contactEmail: `${rank}@x.ee`,
    unitPriceEur: 0,
    excludedAt: null,
    excludedReason: '',
    outcomeAtClose: 'confirmed',
  });

  it('counts allocated trainings, partners and leftovers for a confirmed round', () => {
    const data = fixture({
      trainings: [training('KK-1'), training('KK-2'), training('KK-3')],
      participants: [participant(1, 'A'), participant(2, 'B')],
      allocation: {
        proposal: null,
        final: null,
        byTraining: [
          { trainingCode: 'KK-1', proposed: 'A', final: 'A', changed: false },
          { trainingCode: 'KK-2', proposed: 'B', final: 'B', changed: false },
          { trainingCode: 'KK-3', proposed: null, final: null, changed: false },
        ],
        trace: [],
        leftover: ['KK-3'],
      },
    });
    expect(protocolHeadline(data)).toBe('Voor VOOR-2026-001: 2 koolitust 2 täitjale, jääk 1 koolitust.');
  });

  it('[L-22] groups the final allocation by partner in rank order, with the training rows', () => {
    const data = fixture({
      trainings: [training('KK-1'), training('KK-2'), training('KK-3')],
      participants: [participant(1, 'A'), participant(2, 'B'), participant(3, 'C')],
      allocation: {
        proposal: null,
        final: null,
        byTraining: [
          { trainingCode: 'KK-3', proposed: 'B', final: 'B', changed: false },
          { trainingCode: 'KK-1', proposed: 'A', final: 'A', changed: false },
          { trainingCode: 'KK-2', proposed: 'B', final: 'B', changed: false },
        ],
        trace: [],
        leftover: [],
      },
    });
    const groups = allocationByPartner(data);
    expect(groups.map((g) => g.partnerName)).toEqual(['A', 'B']);
    expect(groups[1]!.trainings.map((t) => t.code)).toEqual(['KK-2', 'KK-3']);
    // A stored schema-1 protocol has no target group; the field simply stays undefined.
    expect(groups[0]!.trainings[0]!.targetGroup).toBeUndefined();
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
