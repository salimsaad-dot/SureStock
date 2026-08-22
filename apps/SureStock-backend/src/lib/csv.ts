/** Renders row arrays (already `header` first) into an RFC 4180-ish CSV string — used by every "Export report" endpoint. */
export function toCsv(rows: string[][]): string {
  const escape = (cell: string) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  return rows.map((row) => row.map(escape).join(',')).join('\r\n');
}
