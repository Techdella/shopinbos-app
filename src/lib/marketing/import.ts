// CSV import for subscribers: a small RFC 4180 parser and header detection. Pure, unit-tested.

/** Rows of cells. Handles quoted cells with commas, quotes ("") and line breaks; also ; or tab separated files. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows.map((r) => r.map((value) => value.trim()));
}

export type ImportColumn = "email" | "name" | "first_name" | "last_name" | "phone" | "country" | "tags" | "birthday" | "ignore";

const HEADER_HINTS: Array<[ImportColumn, RegExp]> = [
  ["email", /^(e-?mail|email address|mail)$/],
  ["first_name", /^(first ?name|given ?name|firstname)$/],
  ["last_name", /^(last ?name|surname|family ?name|lastname)$/],
  ["name", /^(name|full ?name|customer|customer name|contact)$/],
  ["phone", /^(phone|phone number|mobile|whatsapp|tel|telephone|cell)$/],
  ["country", /^(country|location|city|state)$/],
  ["tags", /^(tags?|labels?|groups?)$/],
  ["birthday", /^(birthday|birth ?date|dob|date of birth)$/],
];

/** Guesses what each column holds from the header row; falls back to spotting emails in the data. */
export function detectColumns(header: string[], sample: string[][] = []): ImportColumn[] {
  const columns = header.map((cell): ImportColumn => {
    const key = cell.trim().toLowerCase().replace(/[_-]+/g, " ");
    return HEADER_HINTS.find(([, pattern]) => pattern.test(key))?.[0] ?? "ignore";
  });
  if (!columns.includes("email")) {
    const index = header.findIndex((_, i) => sample.some((row) => /@/.test(row[i] ?? "")));
    if (index >= 0) columns[index] = "email";
  }
  return columns;
}

export interface ImportRow {
  email: string;
  name: string | null;
  phone: string | null;
  country: string | null;
  tags: string[];
  birthday: string | null;
}

/** Turns CSV rows into subscriber rows. The first row is the header when it holds no email address. */
export function rowsToSubscribers(rows: string[][], columns?: ImportColumn[]): { rows: ImportRow[]; skipped: number; columns: ImportColumn[] } {
  if (!rows.length) return { rows: [], skipped: 0, columns: [] };
  const hasHeader = !rows[0].some((cell) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell));
  const body = hasHeader ? rows.slice(1) : rows;
  const cols = columns ?? (hasHeader ? detectColumns(rows[0], body.slice(0, 20)) : detectColumns(rows[0].map(() => ""), rows.slice(0, 20)));
  const out: ImportRow[] = [];
  let skipped = 0;
  for (const row of body) {
    const get = (column: ImportColumn) => {
      const index = cols.indexOf(column);
      return index >= 0 ? (row[index] ?? "").trim() : "";
    };
    const email = get("email").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      skipped++;
      continue;
    }
    const name = get("name") || [get("first_name"), get("last_name")].filter(Boolean).join(" ");
    out.push({
      email,
      name: name || null,
      phone: get("phone") || null,
      country: get("country") || null,
      tags: get("tags").split(/[,;|]/).map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      birthday: get("birthday") || null,
    });
  }
  return { rows: out, skipped, columns: cols };
}
