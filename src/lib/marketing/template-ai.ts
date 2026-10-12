import { parseBlocks, readBlocks, type EmailBlock, type ProductItem } from "./blocks.ts";
import { TEMPLATE_LIBRARY, matchStarter, type LibraryTemplate } from "./template-library.ts";

// Pure parts of "Ask Peggy" in the email builder (and Peggy's/Rex's template tools): the block format the
// model must answer in, grounding of what comes back (products and prices only from the real catalogue, no
// made-up image links), and the no-AI fallback that fills the nearest starter with the shop's own products.

export interface ShopProduct extends ProductItem {
  id: string;
}

export const BLOCK_FORMAT = `Answer with one JSON object only: {"subject": string, "preheader": string, "note": string (one short sentence to the seller about what you did), "blocks": Block[]}.
Block is one of:
{"type":"heading","text":string,"size":"lg"|"md"|"sm","align":"left"|"center"}
{"type":"text","text":string,"align":"left"|"center"}  (blank line = new paragraph; **bold**, *italic*, [label](https://link))
{"type":"button","label":string,"url":"{{store_url}}"|"{{cart_url}}"|an https link,"align":"left"|"center"}
{"type":"image","url":string,"alt":string}  (only an image URL from the list you were given)
{"type":"products","items":[{"id": product id from the list}],"buttonLabel":string}  (2 or 4 items)
{"type":"coupon","code":string,"title":string,"note":string}  (only when the seller asked for a discount; use their code or an obvious placeholder like SALE20)
{"type":"columns","cells":[{"heading":string,"text":string},{"heading":string,"text":string}]}
{"type":"divider"} {"type":"spacer","height":16} {"type":"footer","text":string}
Merge tags you may use: {{name}} (first name), {{store}}, {{store_url}}, {{cart_url}}, {{order_number}}, {{product_name}}.`;

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
  return parseBlocks(prepared).filter((block) => {
    if (block.type === "image") return images.has(block.url);
    if (block.type === "products") return block.items.length > 0;
    if (block.type === "heading" || block.type === "text") return block.text.trim().length > 0;
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
  const starter = matchStarter(request) ?? (hasCurrent ? null : TEMPLATE_LIBRARY.find((tpl) => tpl.key === "newsletter")!);
  if (!starter) return null;
  return { subject: starter.subject, preheader: starter.preheader, blocks: starterForShop(starter, products), starter: starter.name };
}
