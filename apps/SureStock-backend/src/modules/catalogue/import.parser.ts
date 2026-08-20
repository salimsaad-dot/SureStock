import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { HttpError } from '../../lib/http-error.js';

export interface ParsedSpreadsheet {
  headers: string[];
  rows: string[][];
}

function badFile(message: string): never {
  throw new HttpError(400, 'INVALID_FILE', message);
}

async function parseXlsx(buffer: Buffer): Promise<ParsedSpreadsheet> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's own .d.ts declares a bogus global `interface Buffer
  // extends ArrayBuffer {}` (index.d.ts:1) that shadows Node's real
  // Buffer type project-wide — a known bad type declaration in that
  // package, not a real mismatch: at runtime .load() just wants an
  // ordinary Node Buffer, which is exactly what this is. The cast is
  // working around exceljs's types, not around type safety.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) badFile('The spreadsheet has no sheets.');

  const rows: string[][] = [];
  sheet.eachRow((row) => {
    // .values is 1-indexed with a hole at index 0 — slice it away rather
    // than carry a phantom leading empty column into every row.
    const cells = (row.values as unknown[]).slice(1);
    rows.push(cells.map((c) => (c === null || c === undefined ? '' : String(c).trim())));
  });

  const [headers, ...dataRows] = rows;
  if (!headers) badFile('The spreadsheet is empty.');
  return { headers, rows: dataRows };
}

function parseCsvFile(buffer: Buffer): ParsedSpreadsheet {
  let records: string[][];
  try {
    records = parseCsv(buffer, { skip_empty_lines: true, trim: true, relax_column_count: true });
  } catch (err) {
    badFile(`Could not read this file as CSV: ${err instanceof Error ? err.message : String(err)}`);
  }
  const [headers, ...dataRows] = records;
  if (!headers) badFile('The file is empty.');
  return { headers, rows: dataRows };
}

/**
 * Doc 6, T-08: "CSV or XLSX upload." Both formats are normalized into
 * the same {headers, rows} shape immediately, so every step after this
 * one — mapping, validation, commit — never needs to know which format
 * the file arrived in.
 */
export async function parseSpreadsheet(buffer: Buffer, filename: string): Promise<ParsedSpreadsheet> {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'xlsx') return parseXlsx(buffer);
  if (ext === 'csv') return parseCsvFile(buffer);
  badFile(`Unsupported file type "${ext ?? 'unknown'}" — upload a .csv or .xlsx file.`);
}
