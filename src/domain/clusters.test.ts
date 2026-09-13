/**
 * The cluster rules [L-28][K-10]: how a volume order is cut into groups, and
 * how a cluster is described.
 */

import { describe, expect, it } from 'vitest';
import {
  CLUSTER_CODE_RE,
  describeGroups,
  GROUP_CODE_RE,
  groupCode,
  groupIndexRange,
  parseGroupCode,
  planGroups,
  roundKindOf,
  splitEstimate,
  TRAINING_CODE_RE,
  unitCount,
} from './clusters';

describe('codes', () => {
  it('tells a training, a cluster and a group apart', () => {
    expect(TRAINING_CODE_RE.test('KK-2026-101')).toBe(true);
    expect(CLUSTER_CODE_RE.test('KL-2026-001')).toBe(true);
    expect(GROUP_CODE_RE.test('KL-2026-001-07')).toBe(true);
    expect(CLUSTER_CODE_RE.test('KK-2026-101')).toBe(false);
    expect(TRAINING_CODE_RE.test('KL-2026-001')).toBe(false);
    expect(CLUSTER_CODE_RE.test('KL-2026-001-07')).toBe(false);
  });

  it('derives a group code from the cluster and its position, and reads it back', () => {
    expect(groupCode('KL-2026-001', 7)).toBe('KL-2026-001-07');
    expect(parseGroupCode('KL-2026-001-07')).toEqual({ clusterCode: 'KL-2026-001', groupIndex: 7 });
    expect(parseGroupCode('KK-2026-101')).toBeNull();
  });

  it('a period row makes a cluster round [V-09]', () => {
    expect(roundKindOf('fixed')).toBe('fixed');
    expect(roundKindOf('period')).toBe('cluster');
    expect(unitCount('fixed', 6)).toBe('6 koolitust');
    expect(unitCount('cluster', 6)).toBe('6 rühma');
  });
});

describe('planGroups', () => {
  it('fills groups of the given size, the last carrying the remainder', () => {
    expect(planGroups(500, 50, null)).toEqual({ ok: true, value: { groupSize: 50, groups: 10, sizes: Array(10).fill(50) } });
    expect(planGroups(480, 50, null)).toEqual({
      ok: true,
      value: { groupSize: 50, groups: 10, sizes: [...Array(9).fill(50), 30] },
    });
    expect(planGroups(35, 50, null)).toEqual({ ok: true, value: { groupSize: 50, groups: 1, sizes: [35] } });
  });

  it('spreads participants evenly when only the count is given', () => {
    expect(planGroups(9, null, 4)).toEqual({ ok: true, value: { groupSize: 3, groups: 4, sizes: [3, 2, 2, 2] } });
    expect(planGroups(500, null, 10)).toEqual({ ok: true, value: { groupSize: 50, groups: 10, sizes: Array(10).fill(50) } });
  });

  it('accepts both when they agree and refuses them when they do not', () => {
    expect(planGroups(500, 50, 10).ok).toBe(true);
    const mismatch = planGroups(500, 50, 12);
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.message).toContain('ei klapi');
  });

  it('refuses a plan with neither, with too many groups, or with more groups than people', () => {
    expect(planGroups(500, null, null)).toMatchObject({ ok: false });
    const tooMany = planGroups(5000, 20, null);
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.message).toContain('kuni 99');
    expect(planGroups(3, null, 4)).toMatchObject({ ok: false });
  });
});

describe('splitEstimate', () => {
  it('splits in proportion and still adds up to the whole [L-26]', () => {
    const parts = splitEstimate(20000, [...Array(9).fill(50), 30]);
    expect(parts).toHaveLength(10);
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(20000);
    expect(parts[0]).toBe(2083);
    expect(parts[9]).toBeLessThan(parts[0]!);
  });

  it('gives every group zero when there is no estimate', () => {
    expect(splitEstimate(0, [50, 50])).toEqual([0, 0]);
  });
});

describe('describing a cluster', () => {
  const groups = Array.from({ length: 10 }, (_, i) => ({ groupIndex: i + 1, participantCount: i === 9 ? 30 : 50 }));

  it('writes a contiguous run as a range and a broken one as a list', () => {
    expect(groupIndexRange([5, 6, 7, 8, 9, 10])).toBe('05–10');
    expect(groupIndexRange([1, 3, 5])).toBe('01, 03, 05');
    expect(groupIndexRange([7])).toBe('07');
    expect(groupIndexRange([])).toBe('—');
  });

  it('describes the whole cluster and a partner’s share of it', () => {
    expect(describeGroups(groups, groups)).toBe('10 rühma × kuni 50 osalejat (480 kokku)');
    expect(describeGroups(groups.slice(4), groups)).toBe('6 rühma (05–10) × kuni 50 osalejat (280 kokku)');
  });
});
