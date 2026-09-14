/** The workbook reader and builder round-trip, sheet by sheet. */

import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  buildWorkbook,
  parseXlsx,
  parseXlsxSheets,
  parseXlsxWorkbook,
  withDefaultSpreadsheetNamespace,
} from './xlsx';

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

/**
 * What another spreadsheet program's save looks like: every SpreadsheetML
 * element carries a namespace prefix. The same XML, spelled the other way —
 * which is the whole point of the reader tolerating it.
 */
async function savedWithPrefix(buffer: Buffer, prefix: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  for (const name of Object.keys(zip.files)) {
    if (!/^xl\/.*\.xml$/.test(name)) continue;
    const xml = await zip.file(name)!.async('string');
    if (!xml.includes(`xmlns="${MAIN_NS}"`)) continue;
    zip.file(
      name,
      xml
        .replace(`xmlns="${MAIN_NS}"`, `xmlns:${prefix}="${MAIN_NS}"`)
        .replace(/<(\/?)([A-Za-z][\w]*)(?=[\s>/])/g, (match, slash: string, tag: string) =>
          tag.includes(':') || tag === 'xml' ? match : `<${slash}${prefix}:${tag}`,
        ),
    );
  }
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

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

  it('carries the keywords a builder stamps through another program’s save [L-21]', async () => {
    const sheet = { name: 'Voor', headers: ['a'], rows: [{ a: '1' }] };
    const stamped = await buildWorkbook([sheet], { keywords: 'kaskaadhankija:test' });
    expect((await parseXlsxWorkbook(stamped)).keywords).toBe('kaskaadhankija:test');
    expect((await parseXlsxWorkbook(await buildWorkbook([sheet]))).keywords).toBe('');

    // Open and save with exceljs as a stand-in for Excel: core properties are
    // document metadata, and every spreadsheet program preserves them.
    const reloaded = new ExcelJS.Workbook();
    type LoadArg = Parameters<typeof reloaded.xlsx.load>[0];
    await reloaded.xlsx.load(stamped as unknown as LoadArg);
    const resaved = Buffer.from(await reloaded.xlsx.writeBuffer());
    expect((await parseXlsxWorkbook(resaved)).keywords).toBe('kaskaadhankija:test');
  });
});

describe('a workbook another program saved with a namespace prefix', () => {
  const sheets = [
    {
      name: 'Partnerid',
      headers: ['partner', 'registrikood', 'hankeosa', 'koht', 'kontaktisik', 'e_post', 'uhikuhind'],
      rows: [
        { partner: 'Tehisaru Koolitus OÜ', registrikood: '10000001', hankeosa: 'OSA-1', koht: '1', kontaktisik: 'Jaan Kask', e_post: 'jaan.kask@tehisaru-naidis.ee', uhikuhind: '58' },
        { partner: 'AI Akadeemia OÜ', registrikood: '10000002', hankeosa: 'OSA-1', koht: '2', kontaktisik: 'Liis Mägi', e_post: 'liis.magi@ai-akadeemia-naidis.ee', uhikuhind: '60,50' },
      ],
    },
    { name: 'Esindajad', headers: ['registrikood', 'esindaja', 'e_post'], rows: [{ registrikood: '10000001', esindaja: 'Mari Mets', e_post: 'mari.mets@tehisaru-naidis.ee' }] },
  ];

  it('is exactly what exceljs alone refuses', async () => {
    const prefixed = await savedWithPrefix(await buildWorkbook(sheets), 'x');
    const alone = new ExcelJS.Workbook();
    type LoadArg = Parameters<typeof alone.xlsx.load>[0];
    await expect(alone.xlsx.load(prefixed as unknown as LoadArg)).rejects.toThrow();
  });

  it('reads to the same sheets and rows as the plain file', async () => {
    const plain = await buildWorkbook(sheets);
    for (const prefix of ['x', 'ss']) {
      const parsed = await parseXlsxSheets(await savedWithPrefix(plain, prefix));
      expect([...parsed.keys()]).toEqual(['Partnerid', 'Esindajad']);
      expect(parsed.get('Partnerid')?.rows).toEqual(sheets[0]!.rows);
      expect(parsed.get('Esindajad')?.rows).toEqual(sheets[1]!.rows);
      expect(parsed.get('Partnerid')?.headers).toEqual(sheets[0]!.headers);
    }
  });

  it('leaves a plain workbook alone, and still refuses a file that is not a workbook', async () => {
    expect(await withDefaultSpreadsheetNamespace(await buildWorkbook(sheets))).toBeNull();
    await expect(parseXlsxSheets(Buffer.from('see ei ole töövihik'))).rejects.toThrow();
  });
});
