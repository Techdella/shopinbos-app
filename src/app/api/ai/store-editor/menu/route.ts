import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { aiConfigured } from "@/lib/ai/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { aiCost, meterAiPreview } from "@/lib/ai/usage";
import { liveItemWhere } from "@/lib/cms/fields";
import { MENU_STYLES, MOBILE_MENU_STYLES, readMenuColors } from "@/lib/storefront/menu";
import { catalogImages, cleanMenuDesign, headerMenuStyle, type MenuCatalog } from "@/lib/storefront/menu-design";
import { isBoutiqueTheme } from "@/lib/store-templates";
import { navigationDraft, navigationOf } from "@/lib/store-navigation.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/ai/store-editor/menu — Rex designs the store's menus (structure, labels, mega menu, pictures, phone
// menu). The answer is a preview: free to look at (daily cap only); applying it costs credits through
// /api/ai/store-editor/apply.
const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "rex"]), text: z.string().max(4000) })).min(1).max(20),
  /** The menus as the builder has them now (may be unsaved, or Rex's last preview). */
  current: z.object({ main: z.array(z.unknown()).max(60), footer: z.array(z.unknown()).max(60), menuStyle: z.string().max(20), mobileStyle: z.string().max(20), colors: z.record(z.string(), z.string().max(20)).optional() }).optional(),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Tell Rex what kind of menu you want" } }, { status: 400 });
  if (!aiConfigured()) return NextResponse.json({ error: { code: "AI_OFF", message: "Rex isn't switched on yet. Try again later." } }, { status: 503 });

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, brandSettings: true } });
  if (!store) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Create your store first" } }, { status: 404 });

  const limited = await meterAiPreview(user.id, "text");
  if (limited) return limited;

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
  const current = parsed.data.current ?? { main: nav.main, footer: nav.footer, menuStyle: currentStyle, mobileStyle: nav.mobileStyle, colors: readMenuColors(header?.settings) ?? {} };
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
    ...parsed.data.messages.map((message) => `${message.role === "user" ? "Seller" : "Rex"}: ${message.text}`),
  ].join("\n\n");

  const result = await aiText({ system, prompt, maxTokens: 4000 }).catch(() => null);
  if (!result) return NextResponse.json({ error: { code: "AI_FAILED", message: "Rex couldn't design that just now. Nothing was changed; try again." } }, { status: 502 });
  const json = firstJsonObject(result.text);
  const design = cleanMenuDesign(json, catalog, { menuStyle: currentStyle, mobileStyle: nav.mobileStyle });
  if (!design) return NextResponse.json({ error: { code: "AI_FORMAT", message: "Rex's menu came back unusable. Nothing was changed; try describing it another way." } }, { status: 502 });
  const reply = typeof json?.reply === "string" ? json.reply.slice(0, 600) : "Here's a menu for you. Have a look on the page.";
  return NextResponse.json({ data: { design, reply, applyCost: await aiCost("text", 1, "store_design") } });
});
