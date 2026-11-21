/**
 * CSV til dansk Excel: semikolon som separator og UTF-8 BOM, så æøå vises korrekt.
 * Celler der starter med = + - @ får et ' foran, så Excel ikke kører dem som formler.
 */
export function toCsv(header: string[], rows: (string | null | undefined)[][]): string {
  const cell = (value: string | null | undefined) => {
    let s = value ?? "";
    // Rene tal som "+45 12 34 56 78" er ufarlige og skal ikke ændres.
    if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header, ...rows].map((r) => r.map(cell).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, body: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
