// Barcodes for labels and tags (Print studio, /home/labels/studio): EAN-13 for 12/13-digit retail numbers and
// Code 128 (set B) for anything else (SKUs, order numbers). Returns the bar pattern and an SVG string. Pure and
// dependency-free, unit-tested in tests/behaviour.test.mjs.

// Code 128 patterns: each symbol is 6 alternating bar/space widths (stop is 7), values 0–106.
const CODE128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
const START_B = 104;
const STOP = 106;

/** Code 128 set B: printable ASCII (space to ~). Returns module widths, bars and spaces alternating, bar first. */
export function code128Widths(text: string): number[] {
  const value = text.trim();
  if (!value || value.length > 48) throw new Error("A barcode needs 1 to 48 characters.");
  const codes: number[] = [START_B];
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error("Use letters, numbers and simple symbols in barcodes.");
    codes.push(code - 32);
  }
  const checksum = codes.reduce((sum, code, index) => (sum + code * (index === 0 ? 1 : index)) % 103, 0);
  codes.push(checksum, STOP);
  return codes.flatMap((code) => CODE128[code].split("").map(Number));
}

const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** The EAN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(first12: string) {
  const sum = first12.split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

/** A valid 13-digit EAN from 12 digits (adds the check digit) or 13 digits (checks it); null otherwise. */
export function normaliseEan13(value: string): string | null {
  const digits = value.replace(/\s+/g, "");
  if (/^\d{12}$/.test(digits)) return digits + ean13CheckDigit(digits);
  if (/^\d{13}$/.test(digits) && ean13CheckDigit(digits.slice(0, 12)) === digits[12]) return digits;
  return null;
}

/** EAN-13 as a string of modules ("1" bar, "0" space), 95 long. */
export function ean13Modules(code: string): string {
  const ean = normaliseEan13(code);
  if (!ean) throw new Error("That isn't a valid 13-digit EAN barcode number.");
  const parity = EAN_PARITY[Number(ean[0])];
  let modules = "101";
  for (let i = 1; i <= 6; i++) modules += (parity[i - 1] === "L" ? EAN_L : EAN_G)[Number(ean[i])];
  modules += "01010";
  for (let i = 7; i <= 12; i++) modules += EAN_R[Number(ean[i])];
  return modules + "101";
}

export type BarcodeKind = "ean13" | "code128";

/** EAN-13 for valid retail numbers, Code 128 for everything else. */
export function barcodeKindFor(value: string): BarcodeKind {
  return normaliseEan13(value) ? "ean13" : "code128";
}

function escapeXml(text: string) {
  return text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/**
 * An SVG barcode (black bars on white, quiet zones included) with the human-readable value underneath.
 * `height` is the bar height in modules; the SVG scales to whatever box it is placed in.
 */
export function barcodeSvg(value: string, { height = 50, showText = true }: { height?: number; showText?: boolean } = {}): string {
  const kind = barcodeKindFor(value);
  const quiet = 10;
  const rects: string[] = [];
  let x = quiet;
  if (kind === "ean13") {
    const modules = ean13Modules(value);
    for (const bit of modules) {
      if (bit === "1") rects.push(`<rect x="${x}" y="0" width="1" height="${height}"/>`);
      x += 1;
    }
  } else {
    code128Widths(value).forEach((width, index) => {
      if (index % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${width}" height="${height}"/>`);
      x += width;
    });
  }
  const total = x + quiet;
  const label = kind === "ean13" ? normaliseEan13(value)! : value.trim();
  const textHeight = showText ? 12 : 0;
  const text = showText ? `<text x="${total / 2}" y="${height + 10}" font-family="monospace" font-size="9" text-anchor="middle">${escapeXml(label)}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height + textHeight}" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects.join("")}</g>${text}</svg>`;
}
