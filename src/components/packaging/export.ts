"use client";

import { buildPrintPdf } from "@shared/print-pdf";
import { BLEED_MM, packLayout, specSheet, type PackDesign } from "@shared/packaging";
import { codeSpots } from "./PackRender";

// Turns the hidden full-size render of a pack (PackRender view="flat", pixelSize, no guides) into files for the
// printer: a print-ready PDF (300 dpi artwork, trim and bleed boxes, spot-colour dieline, crop marks, vector
// barcode, spec sheet page), a 300 dpi PNG, or the SVG.

const PRINT_DPI = 300;
const CSS_DPI = 96;

export function fileBase(title: string) {
  return (title || "packaging").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "packaging";
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function imageSize(dataUrl: string) {
  return new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("Couldn't read the artwork."));
    img.src = dataUrl;
  });
}

const options = (node: HTMLElement, background: string, ratio: number) => ({
  pixelRatio: ratio,
  backgroundColor: background,
  cacheBust: true,
  width: node.offsetWidth,
  height: node.offsetHeight,
});

export async function downloadPrintPdf(node: HTMLElement, design: PackDesign, title: string) {
  const { toJpeg } = await import("html-to-image");
  await document.fonts?.ready;
  const jpeg = await toJpeg(node, { ...options(node, design.colours.ground, PRINT_DPI / CSS_DPI), quality: 0.95 });
  const size = await imageSize(jpeg);
  const layout = packLayout(design.format, design.size);
  const pdf = buildPrintPdf({
    title: title || "Packaging",
    width: layout.width,
    height: layout.height,
    bleed: BLEED_MM,
    artwork: { jpeg: dataUrlBytes(jpeg), pxWidth: size.w, pxHeight: size.h },
    dieline: layout,
    barcodes: codeSpots(design),
    spec: specSheet(design, title || "Packaging"),
  });
  save(new Blob([pdf as BlobPart], { type: "application/pdf" }), `${fileBase(title)}-print-ready.pdf`);
}

export async function downloadPng(node: HTMLElement, design: PackDesign, title: string) {
  const { toPng } = await import("html-to-image");
  await document.fonts?.ready;
  const png = await toPng(node, options(node, design.colours.ground, PRINT_DPI / CSS_DPI));
  save(new Blob([dataUrlBytes(png) as BlobPart], { type: "image/png" }), `${fileBase(title)}-300dpi.png`);
}

export function downloadSvg(node: HTMLElement, title: string) {
  const svg = node.querySelector("svg");
  if (!svg) throw new Error("Nothing to download yet.");
  const markup = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
  save(new Blob([markup], { type: "image/svg+xml" }), `${fileBase(title)}.svg`);
}

/** A small PNG of the front for the Labels and print gallery. */
export async function thumbnail(node: HTMLElement, background: string) {
  const { toBlob } = await import("html-to-image");
  await document.fonts?.ready;
  const ratio = Math.min(2, 480 / Math.max(1, node.offsetWidth));
  const blob = await toBlob(node, options(node, background, ratio));
  return blob;
}
