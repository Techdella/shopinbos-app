// SEO for anything a seller edits (CMS items, store pages, products, collections): one shape, the length
// rules behind the meters, the Yoast-style checklist and the Next.js metadata it turns into. Pure (no server
// or React imports) so it is unit-tested in tests/behaviour.test.mjs and shared by the SeoTab component.

export interface SeoFields {
  metaTitle: string;
  metaDescription: string;
  focusKeyword: string;
  socialTitle: string;
  socialDescription: string;
  socialImage: string;
  canonicalUrl: string;
  noIndex: boolean;
}

export const EMPTY_SEO: SeoFields = {
  metaTitle: "",
  metaDescription: "",
  focusKeyword: "",
  socialTitle: "",
  socialDescription: "",
  socialImage: "",
  canonicalUrl: "",
  noIndex: false,
};

export const SEO_LIMITS = {
  title: { min: 30, max: 60, hard: 70 },
  description: { min: 70, max: 160, hard: 320 },
} as const;

const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

/**
 * Reads stored SEO (any of the older key spellings) into the full shape. Lenient on purpose (no trimming,
 * no URL checks) so it can sit between an input and its state; use cleanSeo before saving or rendering.
 */
export function normalizeSeo(raw: unknown): SeoFields {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    metaTitle: str(r.metaTitle ?? r.title ?? r.seoTitle, SEO_LIMITS.title.hard),
    metaDescription: str(r.metaDescription ?? r.description ?? r.seoDescription, SEO_LIMITS.description.hard),
    focusKeyword: str(r.focusKeyword, 80),
    socialTitle: str(r.socialTitle ?? r.ogTitle, 120),
    socialDescription: str(r.socialDescription ?? r.ogDescription, 300),
    socialImage: str(r.socialImage ?? r.ogImage, 2000),
    canonicalUrl: str(r.canonicalUrl ?? r.canonical, 2000),
    noIndex: r.noIndex === true || r.noindex === true,
  };
}

/** SEO ready to store or render: trimmed text, and only absolute http(s) links for the image and canonical. */
export function cleanSeo(raw: unknown): SeoFields {
  const seo = normalizeSeo(raw);
  return {
    metaTitle: seo.metaTitle.trim(),
    metaDescription: seo.metaDescription.trim(),
    focusKeyword: seo.focusKeyword.trim(),
    socialTitle: seo.socialTitle.trim(),
    socialDescription: seo.socialDescription.trim(),
    socialImage: safeHttpUrl(seo.socialImage.trim()),
    canonicalUrl: safeHttpUrl(seo.canonicalUrl.trim()),
    noIndex: seo.noIndex,
  };
}

/** Only absolute http(s) links are allowed for canonical and share images. */
export function safeHttpUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export type MeterState = "empty" | "short" | "good" | "long";

/** Length meter for the search title or description: empty, short, good or long, and a 0-100 fill. */
export function lengthMeter(length: number, kind: "title" | "description"): { state: MeterState; pct: number } {
  const limit = SEO_LIMITS[kind];
  const pct = Math.min(100, Math.round((length / limit.max) * 100));
  if (length === 0) return { state: "empty", pct: 0 };
  if (length < limit.min) return { state: "short", pct };
  if (length > limit.max) return { state: "long", pct: 100 };
  return { state: "good", pct };
}

export interface SeoCheckInput {
  seo: SeoFields;
  /** The title on the page (post title, product name). */
  title: string;
  slug: string;
  /** Plain text of the first paragraph of the content, if there is content. */
  firstParagraph?: string;
  /** Plain text of the whole content, for the length check. */
  bodyText?: string;
  images?: { total: number; missingAlt: number };
}

export interface SeoCheck {
  id: string;
  ok: boolean;
  label: string;
}

function includesPhrase(haystack: string, phrase: string) {
  const p = phrase.trim().toLowerCase();
  return Boolean(p) && haystack.toLowerCase().includes(p);
}

/** The checklist under the SEO tab. Every item is something the seller can fix on that same tab or page. */
export function seoChecks(input: SeoCheckInput): SeoCheck[] {
  const title = input.seo.metaTitle || input.title;
  const description = input.seo.metaDescription;
  const keyword = input.seo.focusKeyword.trim();
  const titleMeter = lengthMeter(title.length, "title");
  const descMeter = lengthMeter(description.length, "description");
  const checks: SeoCheck[] = [
    {
      id: "title-length",
      ok: titleMeter.state === "good",
      label: titleMeter.state === "long" ? "Search title is too long; Google cuts it off after about 60 characters" : titleMeter.state === "good" ? "Search title is a good length" : "Search title is short; aim for 30 to 60 characters",
    },
    {
      id: "description-length",
      ok: descMeter.state === "good",
      label: descMeter.state === "empty" ? "Add a search description" : descMeter.state === "short" ? "Search description is short; aim for 70 to 160 characters" : descMeter.state === "long" ? "Search description is too long; keep it under 160 characters" : "Search description is a good length",
    },
    {
      id: "slug",
      ok: Boolean(input.slug) && input.slug.length <= 75,
      label: input.slug ? (input.slug.length <= 75 ? "Web address is short and readable" : "Shorten the web address") : "Add a web address",
    },
  ];
  if (keyword) {
    checks.push(
      { id: "keyword-title", ok: includesPhrase(title, keyword), label: `"${keyword}" ${includesPhrase(title, keyword) ? "is" : "is not"} in the search title` },
      { id: "keyword-description", ok: includesPhrase(description, keyword), label: `"${keyword}" ${includesPhrase(description, keyword) ? "is" : "is not"} in the search description` },
      { id: "keyword-slug", ok: includesPhrase(input.slug.replace(/-/g, " "), keyword.replace(/-/g, " ")), label: `"${keyword}" ${includesPhrase(input.slug.replace(/-/g, " "), keyword) ? "is" : "is not"} in the web address` },
    );
    if (input.firstParagraph !== undefined) {
      const inFirst = includesPhrase(input.firstParagraph, keyword);
      checks.push({ id: "keyword-intro", ok: inFirst, label: `"${keyword}" ${inFirst ? "is" : "is not"} in the first paragraph` });
    }
  } else {
    checks.push({ id: "keyword", ok: false, label: "Add a main search phrase to get tips for it" });
  }
  if (input.bodyText !== undefined) {
    const words = input.bodyText.split(/\s+/).filter(Boolean).length;
    checks.push({ id: "length", ok: words >= 300, label: words >= 300 ? `${words} words of content` : `Only ${words} words; pages with 300+ words tend to rank better` });
  }
  if (input.images && input.images.total > 0) {
    checks.push({
      id: "alt",
      ok: input.images.missingAlt === 0,
      label: input.images.missingAlt === 0 ? "Every image has a description (alt text)" : `${input.images.missingAlt} image${input.images.missingAlt === 1 ? "" : "s"} without a description (alt text)`,
    });
  }
  checks.push({ id: "social", ok: Boolean(input.seo.socialImage), label: input.seo.socialImage ? "Has a share image for WhatsApp, Facebook and X" : "Add a share image so links look good on WhatsApp and Facebook" });
  if (input.seo.noIndex) checks.push({ id: "noindex", ok: false, label: "Hidden from search engines (turn off to let Google list it)" });
  return checks;
}

/** 0-100 from the checklist, for the small score next to the tab. */
export function seoScore(checks: SeoCheck[]) {
  if (!checks.length) return 0;
  return Math.round((checks.filter((check) => check.ok).length / checks.length) * 100);
}

export interface SeoMetadataFallbacks {
  title: string;
  description: string;
  image?: string | null;
  canonical: string;
  siteName: string;
  type?: "website" | "article";
  /** Title template, e.g. "%s | Store"; applied only when the seller didn't write their own search title. */
  titleSuffix?: string;
}

/**
 * Next.js metadata from the seller's SEO with sensible fallbacks. Returns a plain object (shaped like
 * Next's Metadata) so this stays dependency-free.
 */
export function seoMetadata(raw: SeoFields, fallback: SeoMetadataFallbacks) {
  const seo = cleanSeo(raw);
  const title = seo.metaTitle || (fallback.titleSuffix ? `${fallback.title} | ${fallback.titleSuffix}` : fallback.title);
  const description = (seo.metaDescription || fallback.description || "").slice(0, 300);
  const socialTitle = seo.socialTitle || title;
  const socialDescription = seo.socialDescription || description;
  const image = seo.socialImage || fallback.image || null;
  const canonical = seo.canonicalUrl || fallback.canonical;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots: seo.noIndex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: socialTitle,
      description: socialDescription,
      url: canonical,
      siteName: fallback.siteName,
      type: fallback.type ?? "website",
      images: image ? [{ url: image, alt: socialTitle }] : [],
    },
    twitter: { card: image ? ("summary_large_image" as const) : ("summary" as const), title: socialTitle, description: socialDescription, images: image ? [image] : [] },
  };
}
