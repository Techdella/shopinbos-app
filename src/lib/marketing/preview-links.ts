// Email previews (template gallery, email builder, campaign and automation previews, admin product news) draw the
// real email HTML, whose links are still placeholders like {{store_url}} or {{cart_url}}. Clicking one inside the
// preview iframe loaded an error page. This turns every link into plain, non-navigable text for the preview only:
// the href and target are dropped (so nothing can be opened and no address shows on hover), buttons keep their own
// styling, and a small hint appears on hover or tap. Sent emails never pass through here.
//
// Pure string work with no imports, so tests load it without a bundler.

export const PREVIEW_LINK_ATTR = "data-preview-link";

const LINK_TAG = /<(a|area)\b([^>]*)>/gi;
const NAV_ATTRS = /\s(?:href|target|ping|download|rel)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const BARE_NAV_ATTRS = /\s(?:download)(?=[\s>/]|$)/gi;

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeCssString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ");
}

/** The style block that makes preview links inert and shows the hint. Exported for tests. */
export function previewLinkStyle(hint: string) {
  return [
    `<style data-preview-links>`,
    `a[${PREVIEW_LINK_ATTR}],area[${PREVIEW_LINK_ATTR}]{cursor:default!important;position:relative}`,
    // Plain text links keep looking like links (buttons keep their own inline styles).
    `a[${PREVIEW_LINK_ATTR}]:not([style*="color"]){color:#1a55c4}`,
    `a[${PREVIEW_LINK_ATTR}]:not([style*="text-decoration"]){text-decoration:underline}`,
    `a[${PREVIEW_LINK_ATTR}]:focus{outline:2px dashed #8a8a8a;outline-offset:2px}`,
    `a[${PREVIEW_LINK_ATTR}]:hover::after,a[${PREVIEW_LINK_ATTR}]:focus::after{content:"${escapeCssString(hint)}";position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);z-index:2147483647;`,
    `white-space:nowrap;padding:6px 9px;border-radius:7px;background:#16141f;color:#fff;font:600 12px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;letter-spacing:0;text-transform:none;text-decoration:none;box-shadow:0 6px 18px rgba(0,0,0,.18);pointer-events:none}`,
    `</style>`,
  ].join("");
}

/**
 * Preview-only copy of an email's HTML with every link made unclickable.
 * `hint` is the short line shown on hover or tap, e.g. "Links work in the email you send."
 */
export function disablePreviewLinks(html: string, hint: string): string {
  if (!html) return html;
  const safeHint = escapeAttr(hint);
  const body = html.replace(LINK_TAG, (_match, tag: string, attrs: string) => {
    const kept = attrs.replace(NAV_ATTRS, "").replace(BARE_NAV_ATTRS, "").replace(/\s*\/\s*$/, "");
    const selfClosing = /\/\s*$/.test(attrs) ? " /" : "";
    // tabindex lets a tap (or keyboard focus) show the hint; aria-disabled tells screen readers it does nothing here.
    return `<${tag}${kept} ${PREVIEW_LINK_ATTR}="" data-preview-hint="${safeHint}" tabindex="0" aria-disabled="true"${selfClosing}>`;
  });
  const style = previewLinkStyle(hint);
  if (/<\/head>/i.test(body)) return body.replace(/<\/head>/i, `${style}</head>`);
  if (/<body\b[^>]*>/i.test(body)) return body.replace(/<body\b[^>]*>/i, (open) => `${open}${style}`);
  return `${style}${body}`;
}
