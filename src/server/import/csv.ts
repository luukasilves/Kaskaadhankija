/**
 * A small CSV reader for uploaded tables.
 *
 * Hand-rolled rather than a dependency, because the requirements are narrow and
 * specific to what Estonian spreadsheet users actually produce: Excel saving as
 * CSV on an Estonian locale writes semicolons, a UTF-8 BOM and CRLF line
 * endings, and quotes any field containing the delimiter.
 *
 * Returns rows keyed by their original header text; `import-rows.ts` folds the
 * headers and validates the values.
 */

export interface CsvParseResult {
  headers: string[];
  rows: Array<Record<string, string>>;
  delimiter: string;
}

const BOM = '﻿';

/**
 * Guess the delimiter from the header line: whichever candidate appears most
 * often outside quotes. Semicolon wins ties, being the Estonian Excel default.
 */
function sniffDelimiter(headerLine: string): string {
  const candidates = [';', ',', '\t'];
  let best = ';';
  let bestCount = -1;
  for (const candidate of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < headerLine.length; i++) {
      const char = headerLine[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === candidate && !inQuotes) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/** Split one physical line into fields, honouring quotes and doubled quotes. */
function splitLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Split the text into logical lines, keeping newlines that sit inside quotes
 * (a multi-line "märkused" cell is legal).
 */
function splitLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }
    if (!inQuotes && (char === '\n' || char === '\r')) {
      // Treat CRLF as one break.
      if (char === '\r' && text[i + 1] === '\n') i++;
      lines.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

export function parseCsv(input: string): CsvParseResult {
  const text = input.startsWith(BOM) ? input.slice(BOM.length) : input;
  const lines = splitLines(text).filter((line, index) => index === 0 || line.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [], delimiter: ';' };

  const delimiter = sniffDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter).map((h) => h.trim());

  const rows = lines.slice(1).map((line) => {
    const fields = splitLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (header) row[header] = (fields[index] ?? '').trim();
    });
    return row;
  });

  return { headers, rows, delimiter };
}

/** Serialise rows back to Estonian-Excel-friendly CSV (BOM, semicolons, CRLF). */
export function toCsv(headers: readonly string[], rows: ReadonlyArray<Record<string, string>>): string {
  const quote = (value: string) =>
    /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = [headers.map(quote).join(';')];
  for (const row of rows) {
    lines.push(headers.map((h) => quote(row[h] ?? '')).join(';'));
  }
  return BOM + lines.join('\r\n') + '\r\n';
}
