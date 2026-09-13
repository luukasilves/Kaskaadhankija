/**
 * One line per training in a notice — one per cluster in a cluster round
 * [D-01][L-28]. The dated form must not move: stored notices and the engine
 * tests read it back.
 */

import { describe, expect, it } from 'vitest';
import { trainingLines, type TrainingLineRow } from './training-lines';

const dated = (over: Partial<TrainingLineRow> = {}): TrainingLineRow => ({
  id: 't1',
  code: 'KK-2026-101',
  title: 'Töötuba 1 näidisrühmale',
  dateKind: 'fixed',
  eventDate: '2026-10-05',
  eventEnd: null,
  clusterCode: null,
  groupIndex: null,
  workshopTypeLabel: 'Töötuba 1',
  county: 'Harju maakond',
  locationText: 'Koolitaja ruumid',
  participantCount: 20,
  ...over,
});

const group = (index: number, size = 50): TrainingLineRow =>
  dated({
    id: `g${index}`,
    code: `KL-2026-001-${String(index).padStart(2, '0')}`,
    title: 'Töötuba 1 Harjumaa väikeettevõtjatele',
    dateKind: 'period',
    eventDate: '2026-10-01',
    eventEnd: '2026-12-31',
    clusterCode: 'KL-2026-001',
    groupIndex: index,
    locationText: '',
    participantCount: size,
  });

describe('trainingLines', () => {
  it('writes a dated training as before: code, title, day, format, place, size', () => {
    expect(trainingLines([dated()])).toEqual([
      'KK-2026-101 — Töötuba 1 näidisrühmale · 05.10.2026 · Töötuba 1 · Harju maakond, Koolitaja ruumid · 20 osalejat',
    ]);
  });

  it('writes a whole cluster as one line with its period and group plan', () => {
    const groups = Array.from({ length: 10 }, (_, i) => group(i + 1));
    expect(trainingLines(groups)).toEqual([
      'KL-2026-001 — Töötuba 1 Harjumaa väikeettevõtjatele · okt–dets 2026 · Töötuba 1 · Harju maakond · 10 rühma × kuni 50 osalejat (500 kokku)',
    ]);
  });

  it('measures a partner’s share against the round’s whole cluster', () => {
    const all = Array.from({ length: 10 }, (_, i) => ({ groupIndex: i + 1, participantCount: 50 }));
    const mine = [5, 6, 7, 8, 9, 10].map((i) => group(i));
    expect(trainingLines(mine, new Map([['KL-2026-001', all]]))).toEqual([
      'KL-2026-001 — Töötuba 1 Harjumaa väikeettevõtjatele · okt–dets 2026 · Töötuba 1 · Harju maakond · 6 rühma (05–10) × kuni 50 osalejat (300 kokku)',
    ]);
  });

  it('keeps dated trainings and clusters in date order, each cluster once', () => {
    const lines = trainingLines([group(2), dated({ eventDate: '2026-09-20', code: 'KK-2026-100', id: 'x' }), group(1), dated()]);
    expect(lines.map((line) => line.split(' — ')[0])).toEqual(['KK-2026-100', 'KL-2026-001', 'KK-2026-101']);
  });
});
