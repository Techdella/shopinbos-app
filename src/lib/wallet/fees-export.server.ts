import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { toCsv } from "@/lib/csv";
import { platformFeeSummary } from "./platform-fees.server";
import { PURCHASE_LABEL, purchaseSummary } from "./purchases.server";

// Admin › Wallets › Shopinbos fees as a CSV (one row per payment Shopinbos earned from) or a PDF report (totals by
// type, then the same rows), for today, the last 7 or 30 days, or all time
// (GET /api/admin/wallets/fees/export?format=csv|pdf&period=…).

export const EXPORT_PERIODS = { today: "Today", week: "Last 7 days", month: "Last 30 days", all: "All time" } as const;
export type ExportPeriod = keyof typeof EXPORT_PERIODS;

const DAY = 24 * 60 * 60 * 1000;
const CREDIT_METHOD = { card: "Card", auto: "Auto top-up", wallet: "Wallet balance" } as const;

export interface FeeLine {
  at: string;
  type: string;
  business: string;
  email: string;
  item: string;
  /** The store order's total, for store fees. */
  orderKobo: number | null;
  /** What Shopinbos earned. */
  amountKobo: number;
}

export async function feeLines(period: ExportPeriod, now = new Date()) {
  const [fees, purchases] = await Promise.all([platformFeeSummary(now, Infinity), purchaseSummary(now, Infinity)]);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const from = { today: start.getTime(), week: now.getTime() - 7 * DAY, month: now.getTime() - 30 * DAY, all: 0 }[period];
  const lines: FeeLine[] = [
    ...fees.latest.flatMap((row) => [
      ...(row.feeKobo ? [{ at: row.at, type: "Store fee", business: row.store, email: "", item: `Order ${row.orderNumber}`, orderKobo: row.totalKobo, amountKobo: row.feeKobo }] : []),
      ...(row.commissionKobo ? [{ at: row.at, type: "Supplier commission", business: row.store, email: "", item: `Order ${row.orderNumber}`, orderKobo: row.totalKobo, amountKobo: row.commissionKobo }] : []),
    ]),
    ...fees.subscriptions.latest.map((row) => ({ at: row.at, type: "Subscription", business: row.who, email: row.email ?? "", item: `${row.plan}${row.renewal ? " renewal" : ""}`, orderKobo: null, amountKobo: row.amountKobo })),
    ...fees.credits.latest.map((row) => ({ at: row.at, type: "AI credits", business: row.who, email: row.email ?? "", item: `${row.credits.toLocaleString("en-NG")} credits (${CREDIT_METHOD[row.method].toLowerCase()})`, orderKobo: null, amountKobo: row.amountKobo })),
    ...purchases.latest.map((row) => ({ at: row.at, type: PURCHASE_LABEL[row.category], business: row.who, email: row.email ?? "", item: row.item, orderKobo: null, amountKobo: row.amountKobo })),
  ]
    .filter((line) => Date.parse(line.at) >= from)
    .sort((a, b) => b.at.localeCompare(a.at));
  const totals = new Map<string, { count: number; amountKobo: number }>();
  for (const line of lines) {
    const total = totals.get(line.type) ?? { count: 0, amountKobo: 0 };
    totals.set(line.type, { count: total.count + 1, amountKobo: total.amountKobo + line.amountKobo });
  }
  return { lines, totals: [...totals].map(([type, total]) => ({ type, ...total })).sort((a, b) => b.amountKobo - a.amountKobo), totalKobo: lines.reduce((sum, line) => sum + line.amountKobo, 0) };
}

const naira = (kobo: number) => (kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const plain = (kobo: number) => (kobo / 100).toFixed(2);

/** Plain numbers, so a spreadsheet can add them up; the BOM tells Excel it's UTF-8 (names with ₦ or Yoruba marks). */
export function feesCsv(lines: FeeLine[]) {
  return "\uFEFF" + toCsv([
    ["Date", "Type", "Business", "Email", "Item", "Order total (NGN)", "Shopinbos earned (NGN)"],
    ...lines.map((line) => [line.at.slice(0, 19).replace("T", " "), line.type, line.business, line.email, line.item, line.orderKobo === null ? "" : plain(line.orderKobo), plain(line.amountKobo)]),
  ]);
}

// The standard PDF fonts only carry WinAnsi characters (no ₦ or emoji): amounts are written "NGN 1,234.00" and any
// letter with marks the font lacks is drawn without them (Ọ̀ṣun → Osun), anything else becomes "?".
const safe = (text: string) =>
  text
    .replace(/₦/g, "NGN ")
    .normalize("NFD") // Ọ̀ṣun → O + marks: keep the letter, drop the marks the font can't draw
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

function fit(text: string, font: PDFFont, size: number, width: number) {
  let out = safe(text);
  if (font.widthOfTextAtSize(out, size) <= width) return out;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > width) out = out.slice(0, -1);
  return `${out}...`;
}

export async function feesPdf(data: Awaited<ReturnType<typeof feeLines>>, period: ExportPeriod, now = new Date()) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Shopinbos fees: ${EXPORT_PERIODS[period]}`);
  pdf.setAuthor("Shopinbos");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(14 / 255, 42 / 255, 56 / 255);
  const muted = rgb(110 / 255, 110 / 255, 104 / 255);
  const line = rgb(0.88, 0.87, 0.84);
  const [W, H, M] = [842, 595, 36]; // A4 landscape
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const text = (value: string, x: number, size = 9, font = regular, color = navy) => page.drawText(safe(value), { x, y, size, font, color });
  const right = (value: string, xRight: number, size = 9, font = regular) => page.drawText(safe(value), { x: xRight - font.widthOfTextAtSize(safe(value), size), y, size, font, color: navy });
  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
  };

  text("Shopinbos fees", M, 20, bold);
  y -= 18;
  text(`${EXPORT_PERIODS[period]} · made ${now.toISOString().slice(0, 16).replace("T", " ")} UTC · amounts in NGN`, M, 10, regular, muted);
  y -= 30;

  text("Total earned", M, 11, bold);
  right(naira(data.totalKobo), M + 360, 11, bold);
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: M + 360, y }, thickness: 0.6, color: line });
  y -= 14;
  for (const total of data.totals) {
    text(`${total.type} (${total.count})`, M, 10);
    right(naira(total.amountKobo), M + 360, 10);
    y -= 15;
  }
  if (!data.totals.length) {
    text("Nothing earned in this period.", M, 10, regular, muted);
    y -= 15;
  }
  y -= 18;

  const cols = [
    { label: "Date", x: M, w: 88 },
    { label: "Type", x: M + 92, w: 100 },
    { label: "Business", x: M + 196, w: 150 },
    { label: "Item", x: M + 350, w: 250 },
    { label: "Order total", x: M + 604, w: 80, right: true },
    { label: "Earned", x: M + 688, w: W - 2 * M - 688, right: true },
  ];
  const header = () => {
    for (const col of cols) (col.right ? right(col.label, col.x + col.w, 8, bold) : text(col.label, col.x, 8, bold, muted));
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: line });
    y -= 12;
  };
  if (data.lines.length) {
    text("Payments", M, 11, bold);
    y -= 18;
    header();
  }
  for (const row of data.lines) {
    if (y < M + 10) {
      newPage();
      header();
    }
    const cells = [row.at.slice(0, 16).replace("T", " "), row.type, row.business, row.item, row.orderKobo === null ? "" : naira(row.orderKobo), naira(row.amountKobo)];
    cols.forEach((col, i) => {
      const value = fit(cells[i], regular, 8.5, col.w);
      if (col.right) right(value, col.x + col.w, 8.5);
      else text(value, col.x, 8.5);
    });
    y -= 13;
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 60, y: 18, size: 8, font: regular, color: muted }));
  return pdf.save();
}
