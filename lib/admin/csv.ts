/**
 * CSV export helpers (task 12.14). Pure.
 * CSV injection: a cell that starts with = + - @ (or a tab / carriage return) can run as a formula in Excel or LibreOffice.
 * We put a single quote in front, so the spreadsheet shows it as plain text. (OWASP "CSV Injection" advice.)
 */
export function neutralizeCell(value: string): string {
  // Look at the first character and at the first character after leading spaces (" =1+1" is also a formula in some programs).
  return /^[=+\-@\t\r]/.test(value) || /^\s+[=+\-@]/.test(value) ? `'${value}` : value;
}

/** One safe CSV cell: formula-neutral, and quoted when it holds a comma, a quote or a line break. */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  const safe = neutralizeCell(text);
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Whole file. Starts with a BOM so Excel and LibreOffice read UTF-8 names right. Lines end with CRLF (RFC 4180). */
export function toCsv(header: string[], rows: unknown[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
