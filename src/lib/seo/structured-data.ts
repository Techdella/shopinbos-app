// schema.org JSON-LD for storefronts, following Google's structured data guidelines: the store (OnlineStore, or
// LocalBusiness with a shop address), WebSite with search, Product with offers / shipping / returns / ratings,
// BreadcrumbList, ItemList, FAQPage and page types (AboutPage, ContactPage, CollectionPage). Every builder drops
// empty values, so nothing invalid ("", [], NaN, null) is ever printed. Pure (no imports): the storefront routes
// render these through scriptSafeJson, and tests/storefront-seo.test.mjs checks the required fields.

export type JsonLd = Record<string, unknown>;

const SCHEMA = "https://schema.org";

/** Drops undefined, null, "", NaN, empty arrays and empty objects, at every depth. */
export function compact<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => compact(entry)).filter((entry) => !isEmpty(entry)) as unknown as T;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = compact(entry);
      if (!isEmpty(cleaned)) out[key] = cleaned;
    }
    return out as T;
  }
  return value;
}

function isEmpty(value: unknown) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.length === 0;
  // An object left with nothing but its @type (a Brand with no name) says nothing and is invalid.
  if (typeof value === "object" && !(value instanceof Date)) return Object.keys(value as object).filter((key) => key !== "@type").length === 0;
  return false;
}

/** Plain text for descriptions: tags stripped, whitespace squashed, cut at a word near `max`. */
export function plainDescription(value: unknown, max = 5000) {
  if (typeof value !== "string") return "";
  const text = value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

/** Only absolute http(s) URLs (images, sameAs, logos). */
export function httpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

const unique = <T,>(list: T[]) => list.filter((entry, index) => list.indexOf(entry) === index);

/** A valid GTIN-8/12/13/14 (digits only, correct check digit), else undefined: a wrong barcode is worse than none. */
export function validGtin(raw: unknown): string | undefined {
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  const code = String(raw).replace(/[\s-]/g, "");
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length) || /^0+$/.test(code)) return undefined;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check ? code : undefined;
}

/** "gtin8".."gtin14" for a valid code (Google reads the length-specific property best). */
function gtinProperty(code: string) {
  return `gtin${code.length}`;
}

const COUNTRY_CODES: Record<string, string> = {
  nigeria: "NG", ghana: "GH", kenya: "KE", "south africa": "ZA", egypt: "EG", morocco: "MA", ethiopia: "ET", tanzania: "TZ",
  uganda: "UG", rwanda: "RW", senegal: "SN", "cote d'ivoire": "CI", "côte d'ivoire": "CI", "ivory coast": "CI", cameroon: "CM",
  zambia: "ZM", zimbabwe: "ZW", botswana: "BW", namibia: "NA", malawi: "MW", mozambique: "MZ", angola: "AO", benin: "BJ",
  togo: "TG", "sierra leone": "SL", liberia: "LR", gambia: "GM", "the gambia": "GM", mali: "ML", niger: "NE", "burkina faso": "BF",
  tunisia: "TN", algeria: "DZ", "united kingdom": "GB", uk: "GB", "united states": "US", usa: "US", canada: "CA",
};

/** ISO 3166-1 alpha-2 for a stored country ("Nigeria" or "NG"), or undefined when unknown. */
export function countryCode(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (/^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  return COUNTRY_CODES[value.toLowerCase()];
}

// ─── The store ───────────────────────────────────────────────────────────────

export interface StoreAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface StoreOrgInput {
  name: string;
  /** The store's home page, absolute. */
  url: string;
  logo?: string | null;
  description?: string | null;
  /** Social profiles (Instagram, TikTok…). */
  sameAs?: ReadonlyArray<string | null | undefined>;
  email?: string | null;
  phone?: string | null;
  address?: StoreAddress | null;
  /** Opening hours in schema.org form ("Mo-Fr 09:00-18:00"); with a street address the store is a LocalBusiness. */
  openingHours?: readonly string[];
  currency?: string | null;
}

export function storeId(url: string) {
  return `${url.replace(/[#/]+$/, "")}/#store`;
}

export function websiteId(url: string) {
  return `${url.replace(/[#/]+$/, "")}/#website`;
}

function postalAddress(address: StoreAddress | null | undefined) {
  if (!address) return undefined;
  const street = [address.line1, address.line2].map((part) => (part ?? "").trim()).filter(Boolean).join(", ");
  const country = countryCode(address.country);
  if (!street && !address.city) return undefined;
  return { "@type": "PostalAddress", streetAddress: street, addressLocality: address.city, addressRegion: address.state, postalCode: address.postalCode, addressCountry: country };
}

/**
 * The store as an organisation: OnlineStore (an Organization), or LocalBusiness when it has a street address and
 * opening hours, i.e. a place customers can walk into.
 */
export function storeOrganizationLd(input: StoreOrgInput): JsonLd {
  const address = postalAddress(input.address);
  const physical = Boolean(address && (address as Record<string, unknown>).streetAddress && input.openingHours?.length);
  const logo = httpUrl(input.logo);
  const contact = input.email || input.phone
    ? { "@type": "ContactPoint", contactType: "customer service", email: input.email ?? undefined, telephone: input.phone ?? undefined, availableLanguage: "English" }
    : undefined;
  return compact({
    "@context": SCHEMA,
    "@type": physical ? "LocalBusiness" : "OnlineStore",
    "@id": storeId(input.url),
    name: input.name,
    url: input.url,
    logo: logo ? { "@type": "ImageObject", url: logo } : undefined,
    image: physical ? logo : undefined,
    description: plainDescription(input.description, 500),
    sameAs: unique((input.sameAs ?? []).map(httpUrl).filter((url): url is string => Boolean(url))),
    email: input.email ?? undefined,
    telephone: input.phone ?? undefined,
    contactPoint: contact,
    address,
    openingHours: physical ? input.openingHours : undefined,
    currenciesAccepted: input.currency ?? undefined,
  });
}

/** WebSite with a sitelinks search box: the shop page answers ?q=. */
export function websiteLd(input: { name: string; url: string; searchUrl?: string | null; description?: string | null; inLanguage?: string }): JsonLd {
  return compact({
    "@context": SCHEMA,
    "@type": "WebSite",
    "@id": websiteId(input.url),
    name: input.name,
    url: input.url,
    description: plainDescription(input.description, 300),
    inLanguage: input.inLanguage,
    publisher: { "@id": storeId(input.url) },
    potentialAction: input.searchUrl
      ? { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${input.searchUrl}${input.searchUrl.includes("?") ? "&" : "?"}q={search_term_string}` }, "query-input": "required name=search_term_string" }
      : undefined,
  });
}

// ─── Pages ───────────────────────────────────────────────────────────────────

export interface Crumb {
  name: string;
  url: string;
}

/** BreadcrumbList; null with fewer than two steps (a page that is its own root has no trail). */
export function breadcrumbLd(crumbs: ReadonlyArray<Crumb>): JsonLd | null {
  const list = crumbs.filter((crumb) => crumb.name?.trim() && httpUrl(crumb.url));
  if (list.length < 2) return null;
  return {
    "@context": SCHEMA,
    "@type": "BreadcrumbList",
    itemListElement: list.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name.trim(), item: crumb.url })),
  };
}

export type WebPageType = "WebPage" | "AboutPage" | "ContactPage" | "CollectionPage" | "FAQPage" | "SearchResultsPage";

export function webPageLd(input: { type?: WebPageType; name: string; url: string; description?: string | null; storeUrl: string; image?: string | null }): JsonLd {
  return compact({
    "@context": SCHEMA,
    "@type": input.type ?? "WebPage",
    "@id": `${input.url}#webpage`,
    name: input.name,
    url: input.url,
    description: plainDescription(input.description, 300),
    primaryImageOfPage: httpUrl(input.image),
    isPartOf: { "@id": websiteId(input.storeUrl) },
    about: input.type === "AboutPage" || input.type === "ContactPage" ? { "@id": storeId(input.storeUrl) } : undefined,
  });
}

/** ItemList of product (or post) pages, for the shop, collections and the home page. Null when empty. */
export function itemListLd(input: { name?: string; url?: string; items: ReadonlyArray<{ url: string; name?: string; image?: string | null }> }): JsonLd | null {
  const items = input.items.filter((item) => httpUrl(item.url));
  if (!items.length) return null;
  return compact({
    "@context": SCHEMA,
    "@type": "ItemList",
    name: input.name,
    url: input.url,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, url: item.url, name: item.name, image: httpUrl(item.image) })),
  });
}

/** FAQPage from the questions shown on the page; questions without an answer are left out. Null when none. */
export function faqPageLd(qas: ReadonlyArray<{ question: string; answer: string }>, url?: string): JsonLd | null {
  const seen = new Set<string>();
  const entries = qas
    .map((qa) => ({ question: plainDescription(qa.question, 300), answer: plainDescription(qa.answer, 3000) }))
    .filter((qa) => qa.question && qa.answer && !seen.has(qa.question.toLowerCase()) && seen.add(qa.question.toLowerCase()));
  if (!entries.length) return null;
  return compact({
    "@context": SCHEMA,
    "@type": "FAQPage",
    url,
    mainEntity: entries.map((qa) => ({ "@type": "Question", name: qa.question, acceptedAnswer: { "@type": "Answer", text: qa.answer } })),
  });
}

// ─── Products ────────────────────────────────────────────────────────────────

export type ProductAvailability = "InStock" | "OutOfStock" | "BackOrder" | "PreOrder" | "LimitedAvailability";

export interface ShippingInput {
  /** ISO 3166-1 alpha-2 of where the store delivers. */
  country: string;
  /** Cheapest delivery fee in the store currency (0 = free). */
  fee: number;
  currency: string;
  /** Seller's estimate, e.g. "1-2 days", "3 days". */
  estimatedDays?: string | null;
}

export interface ReturnPolicyInput {
  country: string;
  /** Days to return; 0 means returns aren't accepted. */
  days: number;
  url?: string | null;
}

export interface ProductLdInput {
  url: string;
  name: string;
  description?: string | null;
  images?: ReadonlyArray<string | null | undefined>;
  sku?: string | null;
  barcode?: string | null;
  brand?: string | null;
  category?: string | null;
  currency: string;
  /** Lowest and highest price across the versions on sale (equal when there's one price). */
  price: { min: number; max: number };
  /** How many versions are on sale (for AggregateOffer). */
  offerCount?: number;
  availability: ProductAvailability;
  condition?: "NewCondition" | "UsedCondition" | "RefurbishedCondition";
  seller: { name: string; url: string };
  /** YYYY-MM-DD; Google wants a date the price is good until. */
  priceValidUntil?: string;
  shipping?: ShippingInput | null;
  returns?: ReturnPolicyInput | null;
  /** Approved reviews only. */
  rating?: { average: number; count: number } | null;
  reviews?: ReadonlyArray<{ author: string; rating: number; date?: string | null; title?: string | null; body?: string | null }>;
}

/** "1-2 days" → {min:1,max:2}; "3 days" → {3,3}; "same day" → {0,0}; null when it can't be read. */
export function parseDayRange(raw: unknown): { min: number; max: number } | null {
  if (typeof raw !== "string") return null;
  const text = raw.toLowerCase();
  if (/same[\s-]?day|today/.test(text)) return { min: 0, max: 0 };
  const numbers = (text.match(/\d+/g) ?? []).map(Number).filter((value) => value >= 0 && value <= 90);
  if (!numbers.length) return null;
  const weeks = /week/.test(text) ? 7 : 1;
  const min = Math.min(...numbers) * weeks;
  const max = Math.max(...numbers) * weeks;
  return { min, max };
}

const price = (value: number) => (Number.isFinite(value) ? Math.round(value * 100) / 100 : undefined);

function shippingDetailsLd(input: ShippingInput | null | undefined) {
  if (!input || !/^[A-Z]{2}$/.test(input.country) || !Number.isFinite(input.fee) || input.fee < 0) return undefined;
  const days = parseDayRange(input.estimatedDays);
  return {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: price(input.fee), currency: input.currency },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: input.country },
    deliveryTime: days
      ? {
          "@type": "ShippingDeliveryTime",
          handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
          transitTime: { "@type": "QuantitativeValue", minValue: days.min, maxValue: days.max, unitCode: "DAY" },
        }
      : undefined,
  };
}

function returnPolicyLd(input: ReturnPolicyInput | null | undefined) {
  if (!input || !/^[A-Z]{2}$/.test(input.country) || !Number.isFinite(input.days) || input.days < 0) return undefined;
  if (input.days === 0) {
    return { "@type": "MerchantReturnPolicy", applicableCountry: input.country, returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted", merchantReturnLink: httpUrl(input.url) };
  }
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: input.country,
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: Math.round(input.days),
    returnMethod: "https://schema.org/ReturnByMail",
    merchantReturnLink: httpUrl(input.url),
  };
}

export function productLd(input: ProductLdInput, now = new Date()): JsonLd {
  const images = unique((input.images ?? []).map(httpUrl).filter((url): url is string => Boolean(url))).slice(0, 10);
  const gtin = validGtin(input.barcode);
  const min = price(input.price.min);
  const max = price(input.price.max);
  const validUntil = input.priceValidUntil ?? new Date(now.getTime() + 365 * 86_400_000).toISOString().slice(0, 10);
  const common = {
    priceCurrency: input.currency,
    availability: `${SCHEMA}/${input.availability}`,
    itemCondition: `${SCHEMA}/${input.condition ?? "NewCondition"}`,
    url: input.url,
    seller: { "@type": "Organization", name: input.seller.name, url: input.seller.url },
    shippingDetails: shippingDetailsLd(input.shipping),
    hasMerchantReturnPolicy: returnPolicyLd(input.returns),
  };
  const offers =
    min !== undefined && max !== undefined && max > min
      ? { "@type": "AggregateOffer", lowPrice: min, highPrice: max, offerCount: Math.max(2, input.offerCount ?? 2), ...common }
      : { "@type": "Offer", price: min, priceValidUntil: validUntil, ...common };
  const rating = input.rating && input.rating.count > 0 && input.rating.average > 0
    ? { "@type": "AggregateRating", ratingValue: Math.round(input.rating.average * 10) / 10, reviewCount: input.rating.count, bestRating: 5, worstRating: 1 }
    : undefined;
  const reviews = rating
    ? (input.reviews ?? [])
        .filter((review) => review.author?.trim() && review.rating >= 1 && review.rating <= 5)
        .slice(0, 10)
        .map((review) => ({
          "@type": "Review",
          author: { "@type": "Person", name: review.author.trim().slice(0, 80) },
          datePublished: review.date ? String(review.date).slice(0, 10) : undefined,
          name: review.title ?? undefined,
          reviewBody: plainDescription(review.body, 2000),
          reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: 5, worstRating: 1 },
        }))
    : undefined;
  return compact({
    "@context": SCHEMA,
    "@type": "Product",
    "@id": `${input.url}#product`,
    name: input.name,
    description: plainDescription(input.description) || input.name,
    url: input.url,
    image: images,
    sku: input.sku ?? undefined,
    ...(gtin ? { [gtinProperty(gtin)]: gtin } : {}),
    brand: { "@type": "Brand", name: input.brand?.trim() || input.seller.name.trim() },
    category: input.category ?? undefined,
    offers,
    aggregateRating: rating,
    review: reviews,
  });
}

/** Product condition from the product's details ("Brand new", "UK used", "Refurbished"); new when unsaid. */
export function conditionFromLabel(raw: unknown): "NewCondition" | "UsedCondition" | "RefurbishedCondition" {
  const label = typeof raw === "string" ? raw.toLowerCase() : "";
  if (/refurb/.test(label)) return "RefurbishedCondition";
  if (/used|second|pre-?owned|tokunbo/.test(label)) return "UsedCondition";
  return "NewCondition";
}
