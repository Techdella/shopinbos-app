// Uploads are checked against what the bytes really are, not just the type the browser claimed: a file
// labelled image/png must start like a PNG. Stops HTML or script being stored under an image type and served
// back from our storage. SVG is text, so it is checked for anything that can run. Pure so tests can use it.

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((byte, index) => bytes[offset + index] === byte);

/** How each checked type starts. Types not listed here are not sniffed. */
const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  "image/png": (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/gif": (b) => ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a",
  "image/webp": (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
  "image/heic": (b) => ascii(b, 4, 8) === "ftyp",
  "image/heif": (b) => ascii(b, 4, 8) === "ftyp",
  "application/pdf": (b) => ascii(b, 0, 5) === "%PDF-",
  "video/mp4": (b) => ascii(b, 4, 8) === "ftyp",
  "video/quicktime": (b) => ascii(b, 4, 8) === "ftyp" || ascii(b, 4, 8) === "moov" || ascii(b, 4, 8) === "wide",
  "video/webm": (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]),
  "video/ogg": (b) => ascii(b, 0, 4) === "OggS",
  "audio/ogg": (b) => ascii(b, 0, 4) === "OggS",
};

/** Bytes needed from the start of a file for uploadContentProblem. */
export const SNIFF_BYTES = 16;

/**
 * Why this upload must be refused, or null. `head` is the first SNIFF_BYTES bytes; `text` is the whole file
 * as text, needed only for SVG.
 */
export function uploadContentProblem(declaredType: string, head: Uint8Array, text?: string): string | null {
  const type = declaredType.toLowerCase().split(";")[0]!.trim();
  if (type === "image/svg+xml") return text === undefined ? "SVG needs its text checked" : svgProblem(text);
  if (type === "text/html" || type === "application/xhtml+xml" || type.includes("javascript")) return "That kind of file can't be uploaded.";
  const matches = SIGNATURES[type];
  if (matches && !matches(head)) return "That file isn't the type it says it is. Export it again and retry.";
  return null;
}

/** SVG can carry script; only plain drawings are accepted. */
export function svgProblem(text: string): string | null {
  const svg = text.toLowerCase();
  if (!/<svg[\s>]/.test(svg)) return "That isn't an SVG file.";
  if (/<script|<foreignobject|<iframe|<embed|<object|<!entity|\bon[a-z]+\s*=|javascript:|data:text\/html|<use[^>]+href\s*=\s*(?!["']?#)/.test(svg)) {
    return "This SVG has scripts or links in it. Export it as a plain SVG or a PNG.";
  }
  return null;
}
