// Pure helpers for turning a campaign body into a tracked, personalised email. No server imports, so it is unit-testable.

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHref(value: string) {
  return value.replace(/&amp;/g, "&").trim();
}

const HREF_PATTERN = /href\s*=\s*(["'])(.*?)\1/gi;

/** Absolute http(s) links in the campaign body. Click tracking only redirects to these. */
export function extractCampaignLinks(html: string): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(HREF_PATTERN)) {
    const href = decodeHref(match[2]);
    if (/^https?:\/\//i.test(href)) links.add(href);
  }
  return Array.from(links);
}

export function trackingUrls(appUrl: string, token: string) {
  const base = appUrl.replace(/\/$/, "");
  return {
    open: `${base}/api/public/email/open/${token}`,
    click: (url: string) => `${base}/api/public/email/click/${token}?u=${encodeURIComponent(url)}`,
    unsubscribe: `${base}/email/unsubscribe/${token}`,
    oneClickUnsubscribe: `${base}/api/public/email/unsubscribe/${token}`,
  };
}

export interface RenderCampaignInput {
  html: string;
  recipientName: string | null;
  storeName: string;
  token: string;
  appUrl: string;
}

export function renderCampaignEmail({ html, recipientName, storeName, token, appUrl }: RenderCampaignInput) {
  const urls = trackingUrls(appUrl, token);
  const name = escapeHtml(recipientName?.trim() || "there");
  const store = escapeHtml(storeName);

  // Rewrite links before filling placeholders, so tracked targets match extractCampaignLinks(html) exactly.
  const body = html
    .replace(HREF_PATTERN, (full, quote: string, href: string) => {
      const target = decodeHref(href);
      if (!/^https?:\/\//i.test(target)) return full;
      return `href=${quote}${escapeHtml(urls.click(target))}${quote}`;
    })
    .replace(/{{\s*name\s*}}/g, name)
    .replace(/{{\s*store\s*}}/g, store)
    .replace(/{{\s*unsubscribe_url\s*}}/g, escapeHtml(urls.unsubscribe));

  // The compliance footer (business address, unsubscribe and preferences) comes from the shell in wrapEmail.
  const pixel = `<img src="${escapeHtml(urls.open)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`;

  return { html: body + pixel, unsubscribeUrl: urls.unsubscribe, oneClickUnsubscribeUrl: urls.oneClickUnsubscribe };
}
