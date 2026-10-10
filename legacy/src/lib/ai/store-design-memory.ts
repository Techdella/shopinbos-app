import { buildRexMemoryFromSnapshot, type StoreEditorSnapshot } from "@/lib/store-templates";

export const STORE_TEMPLATE_MEMORY = `Reference storefront patterns Rex should emulate:

Primary local references:
- Velour premium store: cream, black, and gold luxury palette, announcement bar, sticky boutique nav, editorial split hero, collection tiles, product cards with wishlist, star reviews, shop filters, product detail with variations, cart drawer, checkout, blog, contact, and newsletter capture.
- Solene skincare store: blush, terracotta, moss, and cream palette, quiet editorial skincare voice, concise product education, gentle trust sections, calm product cards, contact capture, blog education, wishlist, cart, and checkout.
- Boutique editorial sample: sticky glass navigation, split hero with a dominant lifestyle image, announcement bar, trust metrics, moving ticker, new arrivals, promo banner, category grid, best sellers, lookbook, testimonials, and social proof.
- Happy Box landing page: collage photography, illustrated benefit cards, emotional storytelling, delivery explainer sections, review blocks, and bold conversion moments.

Template families to learn from:
- Fashion/editorial: Slark, AJ, Pullo
- Beauty/lifestyle: Healet, Fior, Giftos
- Food/grocery: Foodfinda, Eatveg, Sunshine, ThewayShop
- Tech/electronics: Pomato, Cla, Watcher, Timups
- Furniture/home: Freshshop, Edgecut, Digitf
- Imported complete ecommerce packs: MiniShop, Karma, Footwear, Male Fashion, Ogani, Organic, MiniStore, Furni, FoodMart, HexaShop, Eflyer, Famms, Stylish, Freshshop, Kaira, Caraft, Mellow, Booksaw, The Plaza, Bloom, Furnish, Bookly, Waggy, and Cycle.
- Imported 100-template storefront references: Foodee Restaurant, Tasty Restaurant, Metronic Shop UI, Bicycling Gear, and Hats Fashion.
- Use imported templates as visual and information-architecture references, not as static mockups. Preserve their page depth and visual character, then connect every section to Shopinbos products, categories, variants, reviews, forms, cart, wishlist, checkout, blog posts, and visitor data.
- When a selected template is a static HTML store with many pages, Rex should infer the equivalent live Shopinbos pages: home, shop, category listing, product detail, wishlist, cart drawer, checkout, blog, contact, FAQ, and form submissions.

Storefront standards:
- Never stop at a plain hero, bare product grid, and footer.
- Every generated store must include home, shop/products, product detail, categories, wishlist, cart, checkout, blog, contact form, and FAQ pages.
- Build full sections: announcement, hero, trust strip, categories, featured products, story or lookbook, testimonials or reviews, FAQ, and a closing CTA.
- Make forms real storefront capture points: newsletter and contact forms should collect name/email/phone/message in-app.
- Product pages should include editable descriptions, variations, reviews, payment trust, add to cart, and save to wishlist.
- Shop pages should include category filters and sorting affordances.
- Cart should open as a drawer or modal before checkout, and abandoned checkout should be ready for recovery emails.
- Lead with live product imagery or uploaded references whenever available. Product photos should be the strongest visual anchor.
- Use expressive typography pairings: a distinctive heading style plus a clean modern body font.
- Prefer layered layouts, image mosaics, merchandising bands, featured product callouts, and editorial rhythm over empty generic spacing.
- Add concrete retail signals: delivery promise, secure checkout, best sellers, new arrivals, limited drops, and customer love.
- Keep the design premium, mobile-friendly, and conversion-focused.
- Match the visual direction to the category: fashion can feel editorial, food can feel rich and appetizing, beauty can feel refined, tech can feel sharp and structured.
`;

export function rexMemoryForConvertedTemplate(snapshot: StoreEditorSnapshot) {
  const memory = buildRexMemoryFromSnapshot(snapshot);
  return [
    `Converted template: ${memory.templateName} (${memory.templateId})`,
    ...memory.pages.map((page) => `${page.pageType}: ${page.sections.join(", ")}; editable ${page.editableFields.join(", ")}`),
    ...memory.promptHints,
  ].join("\n");
}
