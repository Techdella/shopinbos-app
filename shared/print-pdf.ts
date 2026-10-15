// A print-ready PDF for the packaging designer, written by hand (no PDF library): one page at the exact flat size
// with 3 mm bleed and a slug for crop marks, TrimBox and BleedBox set, the artwork as a 300 dpi JPEG, the dieline as
// vector lines in the "CutContour" and "Crease" spot colours (overprinting, the way print shops expect), barcodes
// redrawn as vector bars so they scan, and a second A4 page with the printer's spec sheet.
// Pure (Uint8Array in and out), unit-tested in tests/packaging.test.mjs.

import { barcodeBars } from "./barcodes.ts";

export interface PdfArtwork {
  /** JPEG bytes covering the trim plus bleed. */
  jpeg: Uint8Array;
  pxWidth: number;
  pxHeight: number;
}

export interface PdfDieline {
  cuts: Array<Array<[number, number]>>;
  circles: Array<{ cx: number; cy: number; r: number }>;
  folds: Array<[[number, number], [number, number]]>;
}

export interface PdfBarcode {
  /** Millimetres from the trim's top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
  value: string;
}

export interface PrintPdfInput {
  title: string;
  /** Trim size in millimetres. */
  width: number;
  height: number;
  bleed: number;
  artwork: PdfArtwork;
  dieline?: PdfDieline | null;
  barcodes?: PdfBarcode[];
  spec?: string[];
}

const PT = 72 / 25.4;
const SLUG = 10;

const n = (value: number) => (Math.round(value * 1000) / 1000).toString();

/** Keeps text to printable ASCII for the built-in Helvetica (WinAnsi), escaping PDF string characters. */
export function pdfText(value: string) {
  return value
    .replace(/₦/g, "NGN ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/×/g, "x")
    .replace(/[·•]/g, "-")
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/([\\()])/g, "\\$1");
}

export function buildPrintPdf(input: PrintPdfInput): Uint8Array {
  const pageW = (input.width + 2 * (input.bleed + SLUG)) * PT;
  const pageH = (input.height + 2 * (input.bleed + SLUG)) * PT;
  const ox = SLUG + input.bleed;
  // Millimetres from the trim's top-left → PDF points from the page's bottom-left.
  const X = (mm: number) => (ox + mm) * PT;
  const Y = (mm: number) => pageH - (ox + mm) * PT;

  const ops: string[] = [];
  // Artwork over the bleed box.
  const bx = SLUG * PT;
  const bw = (input.width + 2 * input.bleed) * PT;
  const bh = (input.height + 2 * input.bleed) * PT;
  ops.push(`q ${n(bw)} 0 0 ${n(bh)} ${n(bx)} ${n(SLUG * PT)} cm /Art Do Q`);

  // Vector barcodes over the artwork.
  for (const code of input.barcodes ?? []) {
    let bars: ReturnType<typeof barcodeBars>;
    try {
      bars = barcodeBars(code.value);
    } catch {
      continue;
    }
    const textH = Math.min(3, code.h * 0.22);
    const barH = code.h - textH;
    const unit = code.w / bars.total;
    ops.push(`q 1 1 1 rg ${n(X(code.x))} ${n(Y(code.y + code.h))} ${n(code.w * PT)} ${n(code.h * PT)} re f 0 0 0 rg`);
    for (const [x, w] of bars.bars) ops.push(`${n(X(code.x + x * unit))} ${n(Y(code.y + barH))} ${n(w * unit * PT)} ${n(barH * PT)} re`);
    ops.push("f");
    const size = textH * 0.85 * PT;
    const approxWidth = bars.label.length * size * 0.55;
    ops.push(`BT /F1 ${n(size)} Tf ${n(X(code.x + code.w / 2) - approxWidth / 2)} ${n(Y(code.y + code.h) + size * 0.2)} Td (${pdfText(bars.label)}) Tj ET Q`);
  }

  // Dieline in spot colours, overprinting.
  if (input.dieline) {
    ops.push("q /GSop gs /CSCut CS 1 SCN 0.5 w");
    for (const outline of input.dieline.cuts) {
      outline.forEach(([x, y], index) => ops.push(`${n(X(x))} ${n(Y(y))} ${index === 0 ? "m" : "l"}`));
      ops.push("h S");
    }
    for (const circle of input.dieline.circles) ops.push(circlePath(X(circle.cx), Y(circle.cy), circle.r * PT), "S");
    ops.push("Q");
    if (input.dieline.folds.length) {
      ops.push("q /GSop gs /CSCrease CS 1 SCN 0.5 w [3 2] 0 d");
      for (const [[x1, y1], [x2, y2]] of input.dieline.folds) ops.push(`${n(X(x1))} ${n(Y(y1))} m ${n(X(x2))} ${n(Y(y2))} l S`);
      ops.push("Q");
    }
  }

  // Crop marks at the trim corners, in registration colour, kept clear of the bleed.
  ops.push("q /CSAll CS 1 SCN 0.25 w");
  const gap = (input.bleed + 1) * PT;
  const len = (SLUG - 2) * PT;
  for (const [cx, cy, sx, sy] of [
    [X(0), Y(0), -1, 1],
    [X(input.width), Y(0), 1, 1],
    [X(0), Y(input.height), -1, -1],
    [X(input.width), Y(input.height), 1, -1],
  ] as const) {
    ops.push(`${n(cx + sx * gap)} ${n(cy)} m ${n(cx + sx * (gap + len))} ${n(cy)} l S`);
    ops.push(`${n(cx)} ${n(cy + sy * gap)} m ${n(cx)} ${n(cy + sy * (gap + len))} l S`);
  }
  ops.push("Q");
  // Slug line: what this file is.
  ops.push(`q 0 0 0 rg BT /F1 6 Tf ${n(SLUG * PT)} ${n(3 * PT)} Td (${pdfText(`${input.title}  |  trim ${input.width} x ${input.height} mm  |  bleed ${input.bleed} mm`)}) Tj ET Q`);

  const pages: Array<{ content: string; w: number; h: number; art: boolean }> = [{ content: ops.join("\n"), w: pageW, h: pageH, art: true }];
  if (input.spec?.length) {
    const a4w = 210 * PT;
    const a4h = 297 * PT;
    const lines = ["q 0 0 0 rg BT /F1 16 Tf 56 " + n(a4h - 64) + " Td (" + pdfText(input.spec[0]) + ") Tj ET"];
    let y = a4h - 96;
    for (const line of input.spec.slice(1)) {
      if (y < 56) break;
      lines.push(`BT /F1 10 Tf 56 ${n(y)} Td (${pdfText(line)}) Tj ET`);
      y -= 15;
    }
    lines.push("Q");
    pages.push({ content: lines.join("\n"), w: a4w, h: a4h, art: false });
  }

  const writer = new PdfWriter();
  const catalog = writer.reserve();
  const pagesObj = writer.reserve();
  const font = writer.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const image = writer.addStream(`<< /Type /XObject /Subtype /Image /Width ${input.artwork.pxWidth} /Height ${input.artwork.pxHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, input.artwork.jpeg);
  const tint = (c: number, m: number, y: number, k: number) => `<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [${c} ${m} ${y} ${k}] /N 1 >>`;
  const cut = writer.add(`[/Separation /CutContour /DeviceCMYK ${tint(0, 1, 0, 0)}]`);
  const crease = writer.add(`[/Separation /Crease /DeviceCMYK ${tint(1, 0, 0, 0)}]`);
  const all = writer.add(`[/Separation /All /DeviceCMYK ${tint(1, 1, 1, 1)}]`);
  const overprint = writer.add("<< /Type /ExtGState /OP true /op true /OPM 1 >>");
  const resources = `<< /Font << /F1 ${font} 0 R >> /XObject << /Art ${image} 0 R >> /ColorSpace << /CSCut ${cut} 0 R /CSCrease ${crease} 0 R /CSAll ${all} 0 R >> /ExtGState << /GSop ${overprint} 0 R >> >>`;
  const kids: number[] = [];
  for (const page of pages) {
    const content = writer.addStream("<<", new TextEncoder().encode(page.content));
    const boxes = page.art
      ? ` /BleedBox [${n(SLUG * PT)} ${n(SLUG * PT)} ${n(page.w - SLUG * PT)} ${n(page.h - SLUG * PT)}] /TrimBox [${n(X(0))} ${n(Y(input.height))} ${n(X(input.width))} ${n(Y(0))}]`
      : "";
    kids.push(writer.add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${n(page.w)} ${n(page.h)}]${boxes} /Resources ${resources} /Contents ${content} 0 R >>`));
  }
  writer.set(pagesObj, `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(" ")}] /Count ${kids.length} >>`);
  writer.set(catalog, `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);
  const info = writer.add(`<< /Title (${pdfText(input.title)}) /Producer (Shopinbos packaging designer) >>`);
  return writer.finish(catalog, info);
}

/** A circle as four Bézier curves. */
function circlePath(cx: number, cy: number, r: number) {
  const k = 0.5523 * r;
  return [
    `${n(cx + r)} ${n(cy)} m`,
    `${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c`,
    `${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c`,
    `${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c`,
    `${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c h`,
  ].join(" ");
}

class PdfWriter {
  private objects: Array<Uint8Array | null> = [];
  private encoder = new TextEncoder();

  reserve() {
    this.objects.push(null);
    return this.objects.length;
  }

  set(id: number, body: string) {
    this.objects[id - 1] = this.encoder.encode(`${id} 0 obj\n${body}\nendobj\n`);
  }

  add(body: string) {
    const id = this.reserve();
    this.set(id, body);
    return id;
  }

  /** `dict` is the dictionary's opening (without the closing >>); Length is added. */
  addStream(dict: string, data: Uint8Array) {
    const id = this.reserve();
    const head = this.encoder.encode(`${id} 0 obj\n${dict} /Length ${data.length} >>\nstream\n`);
    const tail = this.encoder.encode("\nendstream\nendobj\n");
    this.objects[id - 1] = concat([head, data, tail]);
    return id;
  }

  finish(root: number, info: number) {
    const header = new Uint8Array([...this.encoder.encode("%PDF-1.6\n%"), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);
    const parts: Uint8Array[] = [header];
    const offsets: number[] = [];
    let offset = header.length;
    for (const object of this.objects) {
      if (!object) throw new Error("PDF object never written");
      offsets.push(offset);
      parts.push(object);
      offset += object.length;
    }
    const xref = [`xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((value) => `${String(value).padStart(10, "0")} 00000 n \n`)].join("");
    parts.push(this.encoder.encode(`${xref}trailer\n<< /Size ${this.objects.length + 1} /Root ${root} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
    return concat(parts);
  }
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
