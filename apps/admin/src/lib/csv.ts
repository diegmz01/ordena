function escapeCsvValue(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function rowsToCsv(
  headers: string[],
  rows: (string | number)[][],
): string {
  return [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\r\n");
}

/** BOM al inicio para que Excel detecte UTF-8 (acentos, "$") correctamente. */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
