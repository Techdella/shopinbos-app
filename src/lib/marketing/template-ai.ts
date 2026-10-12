import { parseBlocks, readBlocks, type EmailBlock, type ProductItem } from "./blocks.ts";
import { TEMPLATE_FLOWS, TEMPLATE_LIBRARY, TEMPLATE_SERIES, matchStarter, type LibraryTemplate } from "./template-library.ts";

// Pure parts of "Ask Peggy" in the email builder (and Peggy's/Rex's template tools): the block format the
// model must answer in, grounding of what comes back (products and prices only from the real catalogue, no
// made-up image links), and the no-AI fallback that fills the nearest starter with the shop's own products.

export interface ShopProduct extends ProductItem {
  id: string;
}

export const BLOCK_FORMAT = `Answer with one JSON object only: {"subject": string, "preheader": string, "note": string (one short sentence to the seller about what you did), "blocks": Block[]}.
Block is one of:
{"type":"theme","theme":"classic"|"minimal"|"bold"|"editorial"|"playful"|"luxe"|"market"|"receipt"}  (optional, first; the style family: luxe = luxury dark, market = dense Temu-style deals, receipt = typewriter order details)
{"type":"hero","layout":"full"|"split"|"type","imageUrl":string,"alt":string,"eyebrow":string,"heading":string,"text":string,"buttonLabel":string,"buttonUrl":string}  (full = photo edge to edge when first; type = big words, no photo; imageUrl only from the list you were given, or "")
{"type":"heading","text":string,"size":"lg"|"md"|"sm","align":"left"|"center"}
{"type":"text","text":string,"align":"left"|"center"}  (blank line = new paragraph; **bold**, *italic*, [label](https://link))
{"type":"button","label":string,"url":"{{store_url}}"|"{{cart_url}}"|an https link,"align":"left"|"center","variant":"solid"|"outline"|"wide"}
{"type":"image","url":string,"alt":string}  (only an image URL from the list you were given)
{"type":"products","items":[{"id": product id from the list}],"buttonLabel":string,"columns":1|2|3}  (1 item with columns 1 for a feature; 2 or 4 items for 2; 3 or 6 for 3)
{"type":"coupon","code":string,"title":string,"note":string,"value":string,"variant":"dashed"|"ticket"|"bold"}  (only when the seller asked for a discount; use their code or an obvious placeholder like SALE20; value like "20% OFF")
{"type":"banner","text":string,"variant":"accent"|"dark"|"soft"}  (a slim notice strip, e.g. "Free delivery this weekend")
{"type":"countdown","variant":"boxes"|"pill"|"bar","title":string,"units":[{"value":"23","label":"hours"}],"note":string}  (static: the time left when sent; only when the seller gave an end time)
{"type":"review","quote":string,"author":string,"rating":1-5,"detail":string}  (only reviews the seller gave you)
{"type":"features","items":[{"icon":"✓","title":string,"text":string}]}  (up to 3 short highlights)
{"type":"receipt","title":string,"lines":[{"name":string,"detail":string,"amount":string}],"totals":[{"label":string,"amount":string}],"note":string}  (order/quote tables; amounts only from facts or {{order_total}}/{{cart_total}})
{"type":"steps","steps":[string],"current":number,"note":string}  (delivery progress, 2-5 steps)
{"type":"vip","tier":string,"title":string,"text":string,"perks":[string],"buttonLabel":string,"buttonUrl":string}
{"type":"meter","title":string,"current":number,"goal":number,"unit":string,"from":string,"to":string,"note":string}  (points or orders progress)
{"type":"game","game":"spin"|"scratch"|"gift"|"draw","title":string,"text":string,"prizes":[string],"value":string,"buttonLabel":string,"buttonUrl":"{{store_url}}?play=spin"}  (the game runs on the shop; be honest about prizes)
{"type":"columns","cells":[{"heading":string,"text":string},{"heading":string,"text":string}]}
{"type":"divider","variant":"line"|"dashed"|"dots"|"accent"} {"type":"spacer","height":16} {"type":"footer","text":string,"variant":"simple"|"panel"}
Merge tags you may use: {{name}} (first name), {{store}}, {{store_url}}, {{cart_url}}, {{order_number}}, {{product_name}}. In automations only: {{cart_items}}, {{cart_total}}, {{order_total}}, {{discount_code}}.`;

/** What the starter library holds, so Peggy can say "use the Welcome series" or follow a proven layout. */
export const STARTER_GUIDE = [
  `Starter templates by journey: ${Object.entries(TEMPLATE_FLOWS)
    .map(([flow, label]) => `${label}: ${TEMPLATE_LIBRARY.filter((tpl) => tpl.flow === flow).map((tpl) => tpl.name).join(", ")}`)
    .join(". ")}.`,
  `Ready-made series (the seller can create all of them at once as an automation from the Templates page): ${TEMPLATE_SERIES.map((series) => `${series.name} (${series.steps.length} emails: ${series.description})`).join("; ")}.`,
  "Good practice: cart reminders at about 1 hour (gentle, show the bag), 24 hours (reviews and reassurance) and 72 hours (a small code with a deadline); welcome series of 3 over about 5 days; one clear call to action per email; urgency only when it's true.",
].join("\n");

/** The series a request is about ("write my cart series"), if any. */
export function matchSeries(request: string) {
  const text = request.toLowerCase();
  if (!/\b(series|sequence|flow|drip)\b/.test(text)) return null;
  if (/\b(cart|basket|bag|checkout)\b/.test(text)) return TEMPLATE_SERIES.find((s) => s.key === "cart") ?? null;
  if (/\b(welcome|new subscriber|onboard)/.test(text)) return TEMPLATE_SERIES.find((s) => s.key === "welcome") ?? null;
  if (/\b(win[- ]?back|lapsed|inactive|miss you)/.test(text)) return TEMPLATE_SERIES.find((s) => s.key === "win_back") ?? null;
  return null;
}

/**
 * Keeps what the model wrote but ties it to facts: product items become the real product (name, price,
 * photo, link) or are dropped; images must be ones we offered; empty blocks go.
 */
export function groundBlocks(raw: unknown, facts: { products: ShopProduct[]; images: string[] }): EmailBlock[] {
  const byId = new Map(facts.products.map((p) => [p.id, p]));
  const byName = new Map(facts.products.map((p) => [p.name.trim().toLowerCase(), p]));
  const images = new Set(facts.images);
  const list = Array.isArray(raw) ? raw : [];
  // Product items arrive as {id}; look them up before the generic parser drops unknown keys.
  const prepared = list.map((block) => {
    if (!block || typeof block !== "object" || (block as { type?: unknown }).type !== "products") return block;
    const items = Array.isArray((block as { items?: unknown }).items) ? ((block as { items: unknown[] }).items) : [];
    const real = items
      .map((item) => {
        const it = (item && typeof item === "object" ? item : {}) as { id?: unknown; name?: unknown };
        return (typeof it.id === "string" && byId.get(it.id)) || (typeof it.name === "string" && byName.get(it.name.trim().toLowerCase())) || null;
      })
      .filter((p): p is ShopProduct => Boolean(p))
      .map(({ name, price, imageUrl, url }) => ({ name, price, imageUrl, url }));
    return { ...(block as object), items: real };
  });
  return parseBlocks(prepared)
    .map((block): EmailBlock => {
      // A hero photo we didn't offer becomes a words-only hero; column pictures likewise drop out.
      if (block.type === "hero" && block.imageUrl && !images.has(block.imageUrl)) return { ...block, imageUrl: "", alt: "", layout: "type" };
      if (block.type === "columns") return { ...block, cells: block.cells.map((cell) => (cell.imageUrl && !images.has(cell.imageUrl) ? { heading: cell.heading, text: cell.text, buttonLabel: cell.buttonLabel, buttonUrl: cell.buttonUrl } : cell)) };
      return block;
    })
    .filter((block) => {
      if (block.type === "image") return images.has(block.url);
      if (block.type === "products") return block.items.length > 0;
      if (block.type === "heading" || block.type === "text") return block.text.trim().length > 0;
      if (block.type === "hero") return block.heading.trim().length > 0;
      return true;
    });
}

/** A starter's blocks with its sample products swapped for the shop's own (or removed when it has none). */
export function starterForShop(template: LibraryTemplate, products: ShopProduct[]): EmailBlock[] {
  const blocks = readBlocks(template.bodyHtml) ?? [];
  return blocks
    .map((block) => {
      if (block.type !== "products") return block;
      const items = products.slice(0, Math.min(4, block.items.length || 4)).map(({ name, price, imageUrl, url }) => ({ name, price, imageUrl, url }));
      return items.length ? { ...block, items } : null;
    })
    .filter((block): block is EmailBlock => Boolean(block));
}

/** What the builder gets back without an AI key: the nearest starter for a "write…" request, else nothing. */
export function fallbackDraft(request: string, products: ShopProduct[], hasCurrent: boolean) {
  const series = matchSeries(request);
  const first = series ? TEMPLATE_LIBRARY.find((tpl) => tpl.key === series.steps[0].template) : null;
  const starter = first ?? matchStarter(request) ?? (hasCurrent ? null : TEMPLATE_LIBRARY.find((tpl) => tpl.key === "newsletter")!);
  if (!starter) return null;
  return { subject: starter.subject, preheader: starter.preheader, blocks: starterForShop(starter, products), starter: starter.name };
}
