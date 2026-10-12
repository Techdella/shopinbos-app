// Cleans hand-written email HTML before it is saved (templates and campaigns): no scripts, no embedded
// frames or forms, no on* event handlers, and no javascript:/vbscript:/data: links. Layout, inline styles,
// <style> blocks and comments (including the visual builder's blocks comment) are kept. Pure, unit-tested.

const DROP_WITH_CONTENT = ["script", "iframe", "frame", "frameset", "object", "applet", "noscript", "template", "textarea", "select"];
const DROP_TAG = ["embed", "form", "input", "button", "base", "link", "meta", "param", "option", "portal"];
const URL_ATTRS = ["href", "src", "action", "formaction", "background", "poster", "xlink:href", "srcset", "data", "lowsrc", "dynsrc"];

/** Decodes the entity tricks used to hide a scheme ("java&#115;cript:") and drops spaces/control characters. */
function normaliseUrl(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec: string) => String.fromCharCode(Number(dec)))
    .replace(/&colon;/gi, ":")
    .replace(/&tab;|&newline;/gi, "")
    .replace(/[\u0000- \u007f-\u009f]+/g, "")
    .toLowerCase();
}

/** True for a link an email may carry. data: is allowed only for small inline images. */
export function isSafeEmailUrl(value: string) {
  const url = normaliseUrl(value);
  if (/^(javascript|vbscript|livescript|mocha):/.test(url)) return false;
  if (url.startsWith("data:")) return /^data:image\/(png|gif|jpe?g|webp);/.test(url);
  return true;
}

function cleanStyle(value: string) {
  const flat = normaliseUrl(value);
  return /expression\s*\(|javascript:|vbscript:|-moz-binding|behavior\s*:|@import/.test(flat) ? "" : value;
}

const ATTR_RE = /([^\s"'<>\/=]+)(\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function cleanAttributes(attrs: string) {
  let out = "";
  for (let match = ATTR_RE.exec(attrs); match; match = ATTR_RE.exec(attrs)) {
    const name = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? match[5];
    if (name.startsWith("on") || name === "formaction" || name === "srcdoc") continue;
    if (value === undefined) {
      out += ` ${match[1]}`;
      continue;
    }
    if (URL_ATTRS.includes(name) && !isSafeEmailUrl(value)) continue;
    if (name === "style") {
      const style = cleanStyle(value);
      if (!style) continue;
      out += ` style="${style.replace(/"/g, "&quot;")}"`;
      continue;
    }
    out += ` ${match[1]}="${value.replace(/"/g, "&quot;")}"`;
  }
  return out;
}

export function sanitizeEmailHtml(html: string) {
  let out = html;
  for (const tag of DROP_WITH_CONTENT) {
    out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    // An unclosed one swallows the rest, the way a browser would read it.
    out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*$`, "gi"), "");
  }
  out = out.replace(new RegExp(`<\\/?(?:${DROP_TAG.join("|")})\\b[^>]*>`, "gi"), "");
  // <style> blocks stay (emails need them) but lose anything that runs code.
  out = out.replace(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi, (_, attrs: string, css: string) => (cleanStyle(css) ? `<style${cleanAttributes(attrs)}>${css}</style>` : ""));
  // Every remaining opening tag: rebuild its attributes from the allowed ones.
  out = out.replace(/<([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^<>]*?)?)(\/?)>/g, (whole, tag: string, attrs: string, selfClose: string) => {
    if (tag.toLowerCase() === "style") return whole.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    return `<${tag}${cleanAttributes(attrs)}${selfClose ? " /" : ""}>`;
  });
  return out;
}
