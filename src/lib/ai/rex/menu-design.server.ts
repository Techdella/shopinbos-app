import "server-only";
import { db } from "@/lib/db/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { liveItemWhere } from "@/lib/cms/fields";
import { MENU_STYLES, MOBILE_MENU_STYLES, readMenuColors } from "@/lib/storefront/menu";
import { catalogImages, cleanMenuDesign, headerMenuStyle, type MenuCatalog, type MenuDesign } from "@/lib/storefront/menu-design";
import { isBoutiqueTheme } from "@/lib/store-templates";
import { navigationDraft, navigationOf } from "@/lib/store-navigation.server";

// Rex designing the store's menus (header menu with dropdowns, footer links, menu style, phone menu, pictures,
// colours) from only what the store has. Shared by the builder's menu Rex (/api/ai/store-editor/menu, a preview)
// and Rex's edit_menu tool in the chat (written to the draft as a version with undo).

export interface MenuDesignInput {
  messages: Array<{ role: "user" | "rex"; text: string }>;
  /** The menus as the builder has them now (may be unsaved); omitted: the draft's. */
  current?: { main: unknown[]; footer: unknown[]; menuStyle: string; mobileStyle: string; colors?: Record<string, string> };
}

export type MenuDesignResult = { design: MenuDesign; reply: string } | { error: "AI_FAILED" | "AI_FORMAT" };

export async function designStoreMenu(store: { id: string; name: string; brandSettings: unknown }, input: MenuDesignInput): Promise<MenuDesignResult> {
  const draft = navigationDraft(store.brandSettings, store.name);
  const nav = navigationOf(draft);
  const [products, collections] = await Promise.all([
    db.storeProduct.findMany({ where: { storeId: store.id, status: "published" }, orderBy: { soldStock: "desc" }, take: 60, select: { id: true, name: true, images: true, category: { select: { slug: true, name: true } } } }),
    db.cmsCollection.findMany({ where: { storeId: store.id, isPublished: true }, select: { slug: true, name: true, items: { where: liveItemWhere(), orderBy: { updatedAt: "desc" }, take: 8, select: { slug: true, title: true } } } }),
  ]);
  const categories = new Map<string, { slug: string; name: string; image: string | null }>();
  for (const product of products) {
    if (product.category && !categories.has(product.category.slug)) categories.set(product.category.slug, { slug: product.category.slug, name: product.category.name, image: product.images[0] ?? null });
  }
  const catalog: MenuCatalog = {
    pages: [...new Set((draft?.pages ?? []).map((page) => String(page.pageType)).concat(["cart", "track-order"]))],
    categories: [...categories.values()],
    products: products.slice(0, 40).map((product) => ({ id: product.id, name: product.name, image: product.images[0] ?? null })),
    content: collections.flatMap((collection) => [{ ref: collection.slug, name: collection.name }, ...collection.items.map((item) => ({ ref: `${collection.slug}/${item.slug}`, name: item.title }))]),
  };
  const currentStyle = headerMenuStyle(draft, isBoutiqueTheme(draft?.templateId) ? "classic" : "caps");
  const header = (draft?.pages ?? []).flatMap((page) => page.sections ?? []).find((section) => section?.kind === "header");
  const current = input.current ?? { main: nav.main, footer: nav.footer, menuStyle: currentStyle, mobileStyle: nav.mobileStyle, colors: readMenuColors(header?.settings) ?? {} };
  const images = [...catalogImages(catalog).keys()];

  const system = `You are Rex, designing the menus for ${store.name}, an online shop on Shopinbos. You can lay out the header menu (with one level of dropdowns), the footer links, the menu style and the phone menu, and put pictures on items.
Menu styles on computers: ${MENU_STYLES.map((style) => `"${style.value}" (${style.hint})`).join(", ")}. "mega" opens dropdowns as a wide panel that shows each sub-item's picture: use it for picture menus.
Phone menus: ${MOBILE_MENU_STYLES.map((style) => `"${style.value}" (${style.hint})`).join(", ")}. "sheet" shows sub-item pictures.
Items can only point at what the store has:
- kind "page", ref one of: ${catalog.pages.join(", ")}
- kind "category", ref a category slug: ${catalog.categories.map((c) => `${c.slug} (${c.name})`).join(", ") || "none"}
- kind "product", ref a product id: ${catalog.products.map((p) => `${p.id} (${p.name})`).join(", ") || "none"}
- kind "content", ref a content path: ${catalog.content.map((c) => `${c.ref} (${c.name})`).join(", ") || "none"}
- kind "link", url an https address or a /path, with a label
Colours: the menu can have its own colours over the theme's, as #rrggbb: "text" (the menu words), "accent" (current page and hover), "bar" (a band behind the menu on computers), "panel" (dropdowns, mega menu and phone menu background), "panelText" (words in those). Set "colors" only when the seller asks about colours or a themed look; make sure words contrast with what's behind them. "colors": "theme" goes back to the theme's colours; leave "colors" out to keep the current ones.
Pictures: set "image" to one of these keys (category or product pictures): ${images.join(", ") || "none available"}.
Keep labels short (1-3 words), plain and in the shop's voice. 4-7 top-level items is usually right. Never invent pages or products.
Reply with JSON only: {"reply": "one or two friendly sentences on what you made and why", "menuStyle": "...", "mobileStyle": "...", "colors": {"text": "#...", ...} (optional), "main": [{"label": "...", "kind": "...", "ref": "...", "url": "...", "image": "...", "children": [...]}], "footer": [...] or null to leave it}`;

  const prompt = [
    `The menus now: ${JSON.stringify(current).slice(0, 6000)}`,
    ...input.messages.map((message) => `${message.role === "user" ? "Seller" : "Rex"}: ${message.text}`),
  ].join("\n\n");

  const result = await aiText({ system, prompt, maxTokens: 4000 }).catch(() => null);
  if (!result) return { error: "AI_FAILED" as const };
  const json = firstJsonObject(result.text);
  const design = cleanMenuDesign(json, catalog, { menuStyle: currentStyle, mobileStyle: nav.mobileStyle });
  if (!design) return { error: "AI_FORMAT" as const };
  const reply = typeof json?.reply === "string" ? json.reply.slice(0, 600) : "Here's a menu for you. Have a look on the page.";
  return { design, reply };
}
