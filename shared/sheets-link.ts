// Google Sheets as a product upload (supplier bulk upload, src/app/actions/supplier.ts): a sheet shared as "Anyone
// with the link" is read through its CSV export. Pure, unit-tested in tests/supplier-sheets-import.test.mjs.

/** The CSV export address of a Google Sheets link (keeps the tab when the link names one), or null. */
export function sheetsCsvUrl(link: string): string | null {
  const text = link.trim();
  const match = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(text);
  if (!match) return null;
  const gid = /[#&?]gid=(\d+)/.exec(text)?.[1];
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}
