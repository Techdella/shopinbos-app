// /llms.txt and /llms-full.txt for a store (https://llmstxt.org): a short markdown summary AI assistants and answer
// engines read to understand the store (what it sells, key pages, policies, delivery, how to reach it) with absolute
// links. Pure (no imports) so tests/storefront-seo.test.mjs checks it; src/app/s/[slug]/llms.txt gathers the data.

export interface LlmsLink {
  title: string;
  url: string;
  note?: string | null;
}

export interface LlmsProduct {
  name: string;
  url: string;
  price: string;
  available: boolean;
  category?: string | null;
  description?: string | null;
}

export interface LlmsInput {
  name: string;
  url: string;
  /** One or two sentences: what the store sells and where. */
  summary?: string | null;
  location?: string | null;
  currency?: string | null;
  pages: LlmsLink[];
  categories: LlmsLink[];
  collections: LlmsLink[];
  products: LlmsProduct[];
  /** Published products in all (the list may hold only the first ones). */
  totalProducts?: number;
  policies: LlmsLink[];
  posts?: LlmsLink[];
  /** Plain facts shoppers ask about: delivery, payment, returns. */
  facts?: string[];
  faqs?: Array<{ question: string; answer: string }>;
  contact?: { email?: string | null; phone?: string | null; whatsapp?: string | null; address?: string | null };
  rating?: { average: number; count: number } | null;
}

/** One line of markdown text: no line breaks, no stray markdown that would break the list. */
function line(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  const text = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").replace(/[[\]]/g, "").trim();
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function link(item: LlmsLink) {
  const note = line(item.note, 160);
  return `- [${line(item.title, 120) || item.url}](${item.url})${note ? `: ${note}` : ""}`;
}

function productLine(product: LlmsProduct, withDescription: boolean) {
  const bits = [product.price, product.available ? "in stock" : "sold out", line(product.category, 60)].filter(Boolean).join(", ");
  const description = withDescription ? line(product.description, 600) : "";
  return `- [${line(product.name, 120)}](${product.url}): ${bits}${description ? `. ${description}` : ""}`;
}

function section(title: string, lines: string[]) {
  return lines.length ? [`## ${title}`, "", ...lines, ""] : [];
}

function contactLines(contact: LlmsInput["contact"]) {
  if (!contact) return [];
  return [
    contact.email ? `- Email: ${line(contact.email, 120)}` : "",
    contact.phone ? `- Phone: ${line(contact.phone, 40)}` : "",
    contact.whatsapp ? `- WhatsApp: https://wa.me/${contact.whatsapp.replace(/\D/g, "")}` : "",
    contact.address ? `- Address: ${line(contact.address, 200)}` : "",
  ].filter(Boolean);
}

function header(input: LlmsInput) {
  const summary = line(input.summary, 400) || `${line(input.name)} is an online store${input.location ? ` in ${line(input.location, 80)}` : ""}.`;
  const facts = [
    input.location ? `Based in ${line(input.location, 80)}.` : "",
    input.currency ? `Prices in ${line(input.currency, 8)}.` : "",
    input.rating && input.rating.count > 0 ? `Rated ${input.rating.average.toFixed(1)} out of 5 from ${input.rating.count} customer review${input.rating.count === 1 ? "" : "s"}.` : "",
  ].filter(Boolean).join(" ");
  return [`# ${line(input.name, 120)}`, "", `> ${summary}`, "", ...(facts ? [facts, ""] : []), `Store: ${input.url}`, ""];
}

/** The short version: summary, key pages, categories, a sample of products, policies and contact. */
export function storeLlmsTxt(input: LlmsInput, maxProducts = 50) {
  const products = input.products.slice(0, maxProducts);
  const total = Math.max(input.totalProducts ?? 0, input.products.length);
  const more = total > products.length ? [`- …and ${total - products.length} more in the shop`] : [];
  return [
    ...header(input),
    ...section("Key pages", input.pages.map(link)),
    ...section("Categories", input.categories.map(link)),
    ...section("Collections", input.collections.map(link)),
    ...section("Products", [...products.map((product) => productLine(product, false)), ...more]),
    ...section("Shopping with us", (input.facts ?? []).map((fact) => `- ${line(fact, 300)}`)),
    ...section("Policies", input.policies.map(link)),
    ...section("Articles", (input.posts ?? []).slice(0, 20).map(link)),
    ...section("Contact", contactLines(input.contact)),
  ].join("\n").replace(/\n+$/, "\n");
}

/** The long version: every product with its description, every FAQ answer and post. */
export function storeLlmsFullTxt(input: LlmsInput) {
  return [
    ...header(input),
    ...section("Key pages", input.pages.map(link)),
    ...section("Categories", input.categories.map(link)),
    ...section("Collections", input.collections.map(link)),
    ...section("Products", input.products.map((product) => productLine(product, true))),
    ...section("Shopping with us", (input.facts ?? []).map((fact) => `- ${line(fact, 300)}`)),
    ...section(
      "Frequently asked questions",
      (input.faqs ?? []).filter((qa) => line(qa.question) && line(qa.answer)).flatMap((qa) => [`### ${line(qa.question, 200)}`, "", line(qa.answer, 2000), ""]),
    ),
    ...section("Policies", input.policies.map(link)),
    ...section("Articles", (input.posts ?? []).map(link)),
    ...section("Contact", contactLines(input.contact)),
  ].join("\n").replace(/\n+$/, "\n");
}
