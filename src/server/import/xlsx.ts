/**
 * Read an uploaded .xlsx workbook into the same shape as the CSV reader.
 *
 * Only the first sheet is read, with row 1 as the header — the procurement team
 * works from the committed sample file, whose twin has exactly that layout.
 * Every cell is stringified here so `import-rows.ts` sees the same input
 * whichever format the file arrived in; in particular a date cell that Excel
 * stored as a real date is rendered back to `DD.MM.YYYY`, which the row parser
 * accepts.
 */

import ExcelJS from 'exceljs';

export interface XlsxParseResult {
  headers: string[];
  rows: Array<Record<string, string>>;
  sheetName: string;
}

function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(value.getUTCDate())}.${pad(value.getUTCMonth() + 1)}.${value.getUTCFullYear()}`;
  }
  if (typeof value === 'object') {
    // Rich text, hyperlinks, formulas and errors all carry a readable field;
    // exceljs models them as a union, so probe by key rather than by type.
    const record = value as unknown as Record<string, unknown>;
    if (Array.isArray(record.richText)) {
      return record.richText.map((part) => String((part as { text?: string }).text ?? '')).join('');
    }
    if ('text' in record) return String(record.text ?? '');
    if ('result' in record) return String(record.result ?? '');
    if ('error' in record) return '';
    return '';
  }
  return String(value).trim();
}

export async function parseXlsx(buffer: ArrayBuffer | Buffer): Promise<XlsxParseResult> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's bundled typings predate the generic Buffer<ArrayBufferLike>, and
  // it accepts an ArrayBuffer at runtime either way, so bridge the declaration.
  type LoadArg = Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(buffer as unknown as LoadArg);

  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [], sheetName: '' };

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cellToText(cell.value);
  });

  const rows: Array<Record<string, string>> = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      if (!header) return;
      const text = cellToText(row.getCell(index + 1).value);
      record[header] = text;
      if (text !== '') hasValue = true;
    });
    // Skip rows that are entirely empty — a spreadsheet often has trailing ones.
    if (hasValue) rows.push(record);
  });

  return { headers: headers.filter(Boolean), rows, sheetName: sheet.name };
}

export interface WorkbookSheet {
  name: string;
  headers: readonly string[];
  rows: ReadonlyArray<Record<string, string>>;
}

function addSheet(workbook: ExcelJS.Workbook, sheet: WorkbookSheet): void {
  const ws = workbook.addWorksheet(sheet.name);
  ws.addRow([...sheet.headers]);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of sheet.rows) {
    ws.addRow(sheet.headers.map((header) => row[header] ?? ''));
  }

  // Roughly fit each column to its content so the file is readable on opening.
  sheet.headers.forEach((header, index) => {
    const longest = sheet.rows.reduce(
      (max, row) => Math.max(max, (row[header] ?? '').length),
      header.length,
    );
    ws.getColumn(index + 1).width = Math.min(Math.max(longest + 2, 10), 60);
  });
}

/** Write one or more sheets to an .xlsx buffer — sample-file twins and templates. */
export async function buildWorkbook(sheets: readonly WorkbookSheet[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kaskaadhankija';
  for (const sheet of sheets) addSheet(workbook, sheet);
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}

/** Write rows to a single-sheet .xlsx buffer, used to derive the sample file's twin. */
export async function buildXlsx(
  sheetName: string,
  headers: readonly string[],
  rows: ReadonlyArray<Record<string, string>>,
): Promise<Buffer> {
  return buildWorkbook([{ name: sheetName, headers, rows }]);
}
