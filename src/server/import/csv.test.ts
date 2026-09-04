import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';

describe('parseCsv', () => {
  it('reads a semicolon file with a BOM and CRLF line endings', () => {
    const text = '﻿kood;nimetus\r\nKK-2026-101;Töötuba 1\r\nKK-2026-102;Töötuba 2\r\n';
    const result = parseCsv(text);
    expect(result.delimiter).toBe(';');
    expect(result.headers).toEqual(['kood', 'nimetus']);
    expect(result.rows).toEqual([
      { kood: 'KK-2026-101', nimetus: 'Töötuba 1' },
      { kood: 'KK-2026-102', nimetus: 'Töötuba 2' },
    ]);
  });

  it('falls back to commas when the header uses them', () => {
    const result = parseCsv('kood,nimetus\nKK-2026-101,Töötuba 1\n');
    expect(result.delimiter).toBe(',');
    expect(result.rows[0]).toEqual({ kood: 'KK-2026-101', nimetus: 'Töötuba 1' });
  });

  it('handles tab-separated files', () => {
    const result = parseCsv('kood\tnimetus\nKK-2026-101\tTöötuba 1\n');
    expect(result.delimiter).toBe('\t');
    expect(result.rows[0].nimetus).toBe('Töötuba 1');
  });

  it('keeps a delimiter that appears inside a quoted field', () => {
    const result = parseCsv('kood;nimetus\nKK-2026-101;"Töötuba 1; teine osa"\n');
    expect(result.rows[0].nimetus).toBe('Töötuba 1; teine osa');
  });

  it('unescapes doubled quotes', () => {
    const result = parseCsv('kood;nimetus\nKK-2026-101;"Töötuba ""Eesti.ai"" algajatele"\n');
    expect(result.rows[0].nimetus).toBe('Töötuba "Eesti.ai" algajatele');
  });

  it('keeps a newline inside a quoted cell', () => {
    const result = parseCsv('kood;markused\nKK-2026-101;"esimene rida\nteine rida"\n');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].markused).toBe('esimene rida\nteine rida');
  });

  it('pads a short row with empty strings', () => {
    const result = parseCsv('a;b;c\n1;2\n');
    expect(result.rows[0]).toEqual({ a: '1', b: '2', c: '' });
  });

  it('ignores trailing blank lines', () => {
    const result = parseCsv('a;b\n1;2\n\n\n');
    expect(result.rows).toHaveLength(1);
  });

  it('trims surrounding whitespace from headers and cells', () => {
    const result = parseCsv(' kood ; nimetus \n  KK-2026-101  ;  Töötuba 1  \n');
    expect(result.headers).toEqual(['kood', 'nimetus']);
    expect(result.rows[0]).toEqual({ kood: 'KK-2026-101', nimetus: 'Töötuba 1' });
  });

  it('returns nothing useful for an empty file', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [], delimiter: ';' });
  });

  it('returns headers but no rows for a header-only file', () => {
    const result = parseCsv('﻿kood;nimetus\r\n');
    expect(result.headers).toEqual(['kood', 'nimetus']);
    expect(result.rows).toEqual([]);
  });
});

describe('toCsv', () => {
  it('round-trips through parseCsv', () => {
    const headers = ['kood', 'nimetus', 'markused'];
    const rows = [
      { kood: 'KK-2026-101', nimetus: 'Töötuba 1; esimene', markused: 'ütles "tere"' },
      { kood: 'KK-2026-102', nimetus: 'Töötuba 2', markused: '' },
    ];
    const parsed = parseCsv(toCsv(headers, rows));
    expect(parsed.headers).toEqual(headers);
    expect(parsed.rows).toEqual(rows);
  });

  it('writes a BOM and CRLF so Excel opens it correctly', () => {
    const text = toCsv(['a'], [{ a: '1' }]);
    expect(text.startsWith('﻿')).toBe(true);
    expect(text).toContain('\r\n');
  });
});
