import "server-only";
import ExcelJS from "exceljs";

// Indlæsning af kunde-lister fra CSV (fra Excel, Google Sheets m.fl.) og Excel (.xlsx).

export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export type Table = { headers: string[]; rows: string[][] };

export class ImportError extends Error {}

/** Dekoder tekst som UTF-8, og falder tilbage til Windows-1252 (dansk Excel-CSV) ved ugyldige tegn. */
function decode(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Gætter separatoren ud fra første linje (semikolon er standard i dansk Excel). */
function detectDelimiter(firstLine: string) {
  const counts = [";", ",", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ";";
}

/** Simpel, robust CSV-parser med understøttelse af citationstegn og linjeskift i felter. */
export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0] ?? "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function parseXlsx(bytes: Uint8Array): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    throw new ImportError("Excel-filen kunne ikke læses. Gem den som .xlsx eller CSV, og prøv igen.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (r) => {
    const values: string[] = [];
    for (let col = 1; col <= sheet.columnCount; col++) {
      values.push(r.getCell(col).text?.trim() ?? "");
    }
    rows.push(values);
  });
  return rows;
}

/** Læser en uploadet fil til en tabel med overskrifter og rækker. */
export async function readTable(file: File): Promise<Table> {
  if (file.size === 0) throw new ImportError("Filen er tom.");
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError("Filen er for stor (højst 4 MB). Del den op i flere filer.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  let matrix: string[][];
  if (name.endsWith(".xlsx")) matrix = await parseXlsx(bytes);
  else if (name.endsWith(".csv") || name.endsWith(".txt")) matrix = parseCsv(decode(bytes));
  else if (name.endsWith(".xls")) throw new ImportError("Gamle .xls-filer understøttes ikke. Gem filen som .xlsx eller CSV.");
  else throw new ImportError("Vælg en CSV- eller Excel-fil (.csv eller .xlsx).");

  const nonEmpty = matrix.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ""));
  if (nonEmpty.length < 2) throw new ImportError("Filen skal have en overskriftsrække og mindst én kunde.");
  const [headers, ...rows] = nonEmpty;
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ImportError(`Filen har ${rows.length} rækker. Del den op i filer med højst ${MAX_IMPORT_ROWS} rækker.`);
  }
  const width = headers.length;
  return {
    headers: headers.map((h, i) => h || `Kolonne ${i + 1}`),
    rows: rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")),
  };
}
