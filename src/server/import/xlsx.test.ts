/** The workbook reader and builder round-trip, sheet by sheet. */

import { describe, expect, it } from 'vitest';
import { buildWorkbook, parseXlsx, parseXlsxSheets } from './xlsx';

describe('workbooks', () => {
  it('builds several sheets and reads them back by name', async () => {
    const buffer = await buildWorkbook([
      { name: 'Voor', headers: ['väli', 'väärtus'], rows: [{ väli: 'hankeosa', väärtus: 'OSA-2' }] },
      {
        name: 'Koolitused',
        headers: ['kood', 'nimetus'],
        rows: [{ kood: 'KK-2026-701', nimetus: 'Esimene' }, { kood: 'KK-2026-702', nimetus: 'Teine' }],
        validations: [{ range: 'A2:A50', values: ['KK-2026-701', 'KK-2026-702'] }],
      },
    ]);
    const sheets = await parseXlsxSheets(buffer);
    expect([...sheets.keys()]).toEqual(['Voor', 'Koolitused']);
    expect(sheets.get('Voor')?.rows).toEqual([{ väli: 'hankeosa', väärtus: 'OSA-2' }]);
    expect(sheets.get('Koolitused')?.rows.map((r) => r.kood)).toEqual(['KK-2026-701', 'KK-2026-702']);
    // The single-sheet reader still reads the first sheet.
    expect((await parseXlsx(buffer)).sheetName).toBe('Voor');
  });
});
