// The printable shipping-label page the phone app opens (GET /api/app/labels/print): one self-contained HTML page,
// the same label as the web print view (src/app/home/labels/print/page.tsx), sized for a 4×6 in label printer or
// A4 paper (4 labels a page). It opens the print dialog when it loads. Pure, unit-tested.

import type { LabelFormat } from "./labels";

export interface PrintableLabel {
  orderNumber: string;
  buyerName: string;
  buyerPhone: string | null;
  lines: string[];
  collect: number;
  count: number;
  date: string;
  /** The QR code (SVG markup from the qrcode package, which only draws paths). */
  qrSvg: string;
}

export interface PrintableLabels {
  shopName: string;
  shopPhone: string | null;
  logoUrl: string | null;
  format: LabelFormat;
  labels: PrintableLabel[];
  words: { title: string; print: string; nothing: string };
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function naira(amount: number) {
  return `₦${Math.round(amount).toLocaleString("en-NG")}`;
}

/** Only the qrcode package's own markup goes in raw; anything else is dropped. */
function safeQr(svg: string) {
  return /^<svg[\s>]/.test(svg.trim()) && !/<script|on\w+\s*=|javascript:|<foreignObject/i.test(svg) ? svg : "";
}

function labelHtml(data: PrintableLabels, label: PrintableLabel) {
  const e = escapeHtml;
  const logo = data.logoUrl && /^https:\/\//.test(data.logoUrl)
    ? `<img src="${e(data.logoUrl)}" alt="" class="logo">`
    : `<span class="logo initial">${e(data.shopName.charAt(0).toUpperCase())}</span>`;
  const address = label.lines.length ? label.lines.map((line) => `<div>${e(line)}</div>`).join("") : `<div><i>Customer pickup</i></div>`;
  const money = label.collect > 0
    ? `<div class="box"><div class="small">Pay on delivery · collect</div><div class="big">${e(naira(label.collect))}</div></div>`
    : `<div class="box paid">Paid · do not collect</div>`;
  return `<article class="ship-label">
  <header>${logo}<div class="from"><div class="shop">${e(data.shopName)}</div>${data.shopPhone ? `<div class="tiny">From · ${e(data.shopPhone)}</div>` : ""}</div></header>
  <section class="ship-to">
    <div class="small">Deliver to</div>
    <div class="buyer">${e(label.buyerName)}</div>
    ${label.buyerPhone ? `<div class="phone">${e(label.buyerPhone)}</div>` : ""}
    <div class="address">${address}</div>
  </section>
  ${money}
  <footer><div><div class="number">${e(label.orderNumber)}</div><div class="tiny">${label.count} item${label.count === 1 ? "" : "s"} · ${e(label.date)}</div></div><div class="qr">${safeQr(label.qrSvg)}</div></footer>
</article>`;
}

export function renderLabelsHtml(data: PrintableLabels) {
  const a4 = data.format === "a4";
  const body = data.labels.length
    ? `<div class="${a4 ? "sheet" : "one"}">${data.labels.map((label) => labelHtml(data, label)).join("\n")}</div>`
    : `<p class="empty">${escapeHtml(data.words.nothing)}</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(data.words.title)}</title>
<style>
  @page { size: ${a4 ? "A4" : "4in 6in"}; margin: ${a4 ? "8mm" : "0"}; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f6f5f9; color: #111; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
  .bar { position: sticky; top: 0; display: flex; justify-content: center; padding: 12px; background: #fff; border-bottom: 1px solid #e6e4ec; }
  .bar button { min-height: 48px; padding: 0 28px; border: 0; border-radius: 999px; background: #16141f; color: #fff; font-size: 17px; font-weight: 800; }
  .wrap { width: fit-content; margin: 0 auto; padding: 16px; }
  .one { display: grid; gap: 16px; }
  .ship-label { width: 4in; height: 6in; padding: 0.22in; background: #fff; display: flex; flex-direction: column; break-inside: avoid; }
  .sheet { display: grid; grid-template-columns: repeat(2, 1fr); width: 194mm; background: #fff; }
  .sheet .ship-label { width: 97mm; height: 138mm; border: 1px dashed #9a97a6; }
  .sheet .ship-label:nth-child(4n + 1):not(:first-child) { break-before: page; }
  .one .ship-label + .ship-label { break-before: page; }
  header { display: flex; align-items: center; gap: 8px; padding-bottom: 8px; border-bottom: 2px solid #000; }
  .logo { width: 36px; height: 36px; border-radius: 6px; object-fit: contain; flex-shrink: 0; }
  .initial { display: grid; place-items: center; border: 2px solid #000; font-weight: 800; font-size: 16px; }
  .from { min-width: 0; line-height: 1.2; }
  .shop { font-size: 15px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tiny { font-size: 11px; }
  .small { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; }
  .ship-to { flex: 1; padding: 12px 0; }
  .buyer { margin-top: 4px; font-size: 22px; font-weight: 800; line-height: 1.15; }
  .phone { margin-top: 2px; font-size: 16px; font-weight: 700; }
  .address { margin-top: 8px; font-size: 15px; line-height: 1.35; }
  .box { margin-bottom: 8px; padding: 8px; border: 2px solid #000; border-radius: 6px; text-align: center; }
  .box .big { font-size: 24px; font-weight: 800; }
  .paid { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.18em; padding: 6px; }
  footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding-top: 8px; border-top: 2px solid #000; }
  .number { font-family: ui-monospace, Menlo, monospace; font-size: 13px; font-weight: 700; }
  .qr { width: 0.95in; height: 0.95in; flex-shrink: 0; }
  .qr svg { width: 100%; height: 100%; }
  .empty { padding: 40px; text-align: center; color: #6b6779; }
  @media print { .bar { display: none; } body { background: #fff; } .wrap { padding: 0; } .one { gap: 0; } }
</style>
</head>
<body>
<div class="bar"><button type="button" onclick="window.print()">${escapeHtml(data.words.print)}</button></div>
<div class="wrap">${body}</div>
${data.labels.length ? `<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 400); });</script>` : ""}
</body>
</html>`;
}
