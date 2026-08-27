import { describe, expect, it } from 'vitest';
import { type CandidatePartner, cascadeOrder, selectNextPartner } from './select-next';

const partner = (
  id: string,
  rank: number,
  extra: Partial<CandidatePartner> = {},
): CandidatePartner => ({
  lotPartnerId: id,
  rank,
  isActive: true,
  assignedCount: 0,
  ...extra,
});

const THREE = [partner('a', 1), partner('b', 2), partner('c', 3)];

describe('selectNextPartner — strict', () => {
  it('starts at rank 1', () => {
    expect(selectNextPartner(THREE, new Set(), 'strict')).toBe('a');
  });

  it('advances to the next rank once one has been offered', () => {
    expect(selectNextPartner(THREE, new Set(['a']), 'strict')).toBe('b');
    expect(selectNextPartner(THREE, new Set(['a', 'b']), 'strict')).toBe('c');
  });

  it('returns null when every partner has been offered', () => {
    expect(selectNextPartner(THREE, new Set(['a', 'b', 'c']), 'strict')).toBeNull();
  });

  it('returns null for an empty lot', () => {
    expect(selectNextPartner([], new Set(), 'strict')).toBeNull();
  });

  it('skips deactivated partners', () => {
    const partners = [partner('a', 1, { isActive: false }), partner('b', 2), partner('c', 3)];
    expect(selectNextPartner(partners, new Set(), 'strict')).toBe('b');
  });

  it('ignores rank gaps left by deactivation', () => {
    const partners = [partner('b', 2), partner('d', 7)];
    expect(selectNextPartner(partners, new Set(['b']), 'strict')).toBe('d');
  });

  it('ignores assigned volume', () => {
    const partners = [partner('a', 1, { assignedCount: 99 }), partner('b', 2)];
    expect(selectNextPartner(partners, new Set(), 'strict')).toBe('a');
  });

  it('is not confused by an unordered input array', () => {
    const partners = [partner('c', 3), partner('a', 1), partner('b', 2)];
    expect(selectNextPartner(partners, new Set(), 'strict')).toBe('a');
  });
});

describe('selectNextPartner — rotation', () => {
  it('prefers the partner holding the fewest orders', () => {
    const partners = [
      partner('a', 1, { assignedCount: 4 }),
      partner('b', 2, { assignedCount: 1 }),
      partner('c', 3, { assignedCount: 2 }),
    ];
    expect(selectNextPartner(partners, new Set(), 'rotation')).toBe('b');
  });

  it('breaks ties on rank', () => {
    const partners = [
      partner('a', 3, { assignedCount: 2 }),
      partner('b', 1, { assignedCount: 2 }),
      partner('c', 2, { assignedCount: 2 }),
    ];
    expect(selectNextPartner(partners, new Set(), 'rotation')).toBe('b');
  });

  it('still excludes partners already offered this run', () => {
    const partners = [
      partner('a', 1, { assignedCount: 0 }),
      partner('b', 2, { assignedCount: 5 }),
    ];
    expect(selectNextPartner(partners, new Set(['a']), 'rotation')).toBe('b');
  });

  it('behaves like strict when volumes are equal', () => {
    expect(selectNextPartner(THREE, new Set(), 'rotation')).toBe('a');
  });
});

describe('cascadeOrder', () => {
  it('lists active partners in cascade order', () => {
    const partners = [partner('c', 3), partner('a', 1), partner('b', 2)];
    expect(cascadeOrder(partners, 'strict').map((p) => p.lotPartnerId)).toEqual(['a', 'b', 'c']);
  });

  it('omits deactivated partners', () => {
    const partners = [partner('a', 1, { isActive: false }), partner('b', 2)];
    expect(cascadeOrder(partners, 'strict').map((p) => p.lotPartnerId)).toEqual(['b']);
  });

  it('reorders by volume in rotation mode', () => {
    const partners = [
      partner('a', 1, { assignedCount: 3 }),
      partner('b', 2, { assignedCount: 0 }),
    ];
    expect(cascadeOrder(partners, 'rotation').map((p) => p.lotPartnerId)).toEqual(['b', 'a']);
  });
});
