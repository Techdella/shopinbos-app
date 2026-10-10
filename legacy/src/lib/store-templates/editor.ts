import type {
  StoreEditorPatchOp,
  StoreEditorSnapshot,
  StoreTemplateManifest,
  TemplateBlockNode,
  TemplateSelectionMeta,
  TemplatePageSeed,
  TemplatePageType,
  TemplateSectionNode,
  ThemeTokenSet,
} from "./types";

export interface StoreConfigLike {
  name: string;
  tagline: string;
  heroHeadline: string;
  heroSubline: string;
  heroCtaText: string;
  navLinks: string[];
  fontStyle: "fraunces" | "grotesk";
  palette: {
    heroBg: string;
    heroText: string;
    accent: string;
    ctaBg: string;
    ctaText: string;
    paperBg: string;
  };
  products: Array<{
    name: string;
    subtitle: string;
    price: string;
    color: string;
    imageUrl?: string;
  }>;
}

export interface StoreEditorState {
  template?: TemplateSelectionMeta;
  draft?: StoreEditorSnapshot | null;
  published?: StoreEditorSnapshot | null;
}

export interface StoreBrandSettingsLike {
  template?: TemplateSelectionMeta;
  themeTokens?: ThemeTokenSet;
  layoutVariant?: string;
  editor?: StoreEditorState;
  [key: string]: unknown;
}

function cloneSnapshot(snapshot: StoreEditorSnapshot) {
  return JSON.parse(JSON.stringify(snapshot)) as StoreEditorSnapshot;
}

const BLANK_THEME: ThemeTokenSet = {
  heroBg: "#16302B",
  heroText: "#FFFFFF",
  accent: "#0FA493",
  ctaBg: "#0FA493",
  ctaText: "#FFFFFF",
  paperBg: "#F2F5F3",
  cardBg: "#FFFFFF",
  ink: "#16302B",
  muted: "#51635D",
  border: "#E3EAE7",
  headingStyle: "serif",
  radius: "soft",
};

function block(id: string, type: string, content: Record<string, unknown>) {
  return { id, type, content };
}

function section(
  id: string,
  kind: string,
  name: string,
  blocks: TemplateSectionNode["blocks"],
  extra: Pick<TemplateSectionNode, "items" | "settings"> = {},
): TemplateSectionNode {
  return {
    id,
    kind,
    name,
    visible: true,
    blocks,
    ...extra,
  };
}

function blankHeader(storeName: string) {
  return section("blank-header", "header", "Header", [
    block("blank-header-copy", "copy", {
      logoText: storeName,
      navLinks: ["home", "products", "about", "contact"],
      utilityLinks: ["cart"],
      cartLabel: "Cart",
    }),
  ]);
}

function blankFooter(storeName: string) {
  return section("blank-footer", "footer", "Footer", [
    block("blank-footer-copy", "copy", {
      summary: `${storeName} is getting ready. Add your logo, products, contact details, and policies before publishing.`,
      columns: ["Browse", "Support", "Store"],
    }),
  ]);
}

function blankAnnouncement() {
  return section("blank-announcement", "announcement-bar", "Announcement Bar", [
    block("blank-announcement-copy", "copy", { text: "Add your shipping or payment message here." }),
  ]);
}

function blankShell(storeName: string, sections: TemplateSectionNode[]) {
  return [blankAnnouncement(), blankHeader(storeName), ...sections, blankFooter(storeName)];
}

export function createBlankEditorSnapshot(storeName = "Your Store"): StoreEditorSnapshot {
  const now = new Date().toISOString();

  return {
    templateId: "blank",
    templateName: "Blank store",
    layoutFamily: "minimal-showcase",
    themeTokens: BLANK_THEME,
    updatedAt: now,
    pages: [
      {
        id: "blank-home",
        pageType: "home",
        title: "Home",
        slug: "",
        sections: blankShell(storeName, [
          section("blank-hero", "hero-split", "Hero", [
            block("blank-hero-copy", "copy", {
              eyebrow: storeName,
              title: "Start with a blank store",
              body: "Add content here. Introduce what you sell, who it is for, and why shoppers should buy from you.",
              primaryCta: "Shop now",
              secondaryCta: "Learn more",
            }),
          ], {
            items: [
              { title: "Click to replace image", subtitle: "Hero image", color: "#16302B" },
              { title: "Add content here", subtitle: "Supporting image", color: "#0FA493" },
            ],
          }),
          section("blank-products", "featured-products", "Product Grid", [
            block("blank-products-copy", "copy", {
              title: "Connect products to display them here",
              body: "Your latest products will appear here once added. You can also map specific products from the settings panel.",
              cta: "View all products",
            }),
          ], {
            items: [
              { title: "Product placeholder", subtitle: "Connect a real product", priceLabel: "NGN 0", color: "#0FA493", mappedStoreProductId: null },
              { title: "Product placeholder", subtitle: "Connect a real product", priceLabel: "NGN 0", color: "#E08C00", mappedStoreProductId: null },
              { title: "Product placeholder", subtitle: "Connect a real product", priceLabel: "NGN 0", color: "#7C5CFF", mappedStoreProductId: null },
            ],
            settings: { productSource: "latest", allowMapping: true },
          }),
        ]),
        seo: {
          metaTitle: storeName,
          metaDescription: `Shop ${storeName} online.`,
        },
      },
      {
        id: "blank-products-page",
        pageType: "products",
        title: "Products",
        slug: "products",
        sections: blankShell(storeName, [
          section("blank-products-intro", "text-columns", "Products Intro", [
            block("blank-products-intro-copy", "copy", {
              title: "All products",
              body: "Your products will appear here once added.",
            }),
          ]),
          section("blank-products-filters", "filters-toolbar", "Filters & Sort", [
            block("blank-products-filters-copy", "copy", { title: "Browse products", body: "Category, price, and sort controls are ready for shoppers." }),
          ], {
            items: [
              { label: "Category", value: "All categories" },
              { label: "Availability", value: "In stock" },
              { label: "Sort", value: "Newest first" },
            ],
          }),
          section("blank-products-grid", "featured-products", "Product Grid", [
            block("blank-products-grid-copy", "copy", {
              title: "Products",
              body: "Connect products to display them here.",
            }),
          ], {
            items: [],
            settings: { productSource: "latest", allowMapping: true },
          }),
        ]),
        seo: { metaTitle: `${storeName} Products`, metaDescription: `Browse products from ${storeName}.` },
      },
      {
        id: "blank-product-page",
        pageType: "product",
        title: "Product Detail",
        slug: "product",
        sections: blankShell(storeName, [
          section("blank-product-detail", "product-detail", "Product Detail", [
            block("blank-product-detail-copy", "copy", {
              title: "Product detail",
              body: "When a shopper selects a product, real product information, images, price, variants, reviews, and add-to-cart actions appear here.",
            }),
          ]),
        ]),
        seo: { metaTitle: `${storeName} Product Detail`, metaDescription: `View product details from ${storeName}.` },
      },
      {
        id: "blank-cart-page",
        pageType: "cart",
        title: "Cart",
        slug: "cart",
        sections: blankShell(storeName, [
          section("blank-cart-summary", "cart-summary", "Cart Summary", [
            block("blank-cart-summary-copy", "copy", { title: "Your cart", body: "Cart items, totals, delivery estimates, and checkout actions appear here." }),
          ]),
        ]),
        seo: { metaTitle: `${storeName} Cart`, metaDescription: `Review your cart at ${storeName}.` },
      },
      {
        id: "blank-checkout-page",
        pageType: "checkout",
        title: "Checkout",
        slug: "checkout",
        sections: blankShell(storeName, [
          section("blank-checkout-form", "checkout-form", "Checkout", [
            block("blank-checkout-form-copy", "copy", { title: "Secure checkout", body: "Collect customer information, delivery details, order notes, and payment preference." }),
          ]),
        ]),
        seo: { metaTitle: `${storeName} Checkout`, metaDescription: `Checkout securely at ${storeName}.` },
      },
      {
        id: "blank-about-page",
        pageType: "about",
        title: "About",
        slug: "about",
        sections: blankShell(storeName, [
          section("blank-about-story", "story-split", "About", [
            block("blank-about-story-copy", "copy", {
              title: "Tell your story",
              body: "Add content here. Share your values, sourcing, process, or customer promise.",
            }),
          ], {
            items: [
              { title: "Add content here", body: "Use this space for a brand value." },
              { title: "Add content here", body: "Use this space for a service promise." },
              { title: "Add content here", body: "Use this space for customer support details." },
            ],
          }),
        ]),
        seo: { metaTitle: `About ${storeName}`, metaDescription: `Learn about ${storeName}.` },
      },
      {
        id: "blank-contact-page",
        pageType: "contact",
        title: "Contact",
        slug: "contact",
        sections: blankShell(storeName, [
          section("blank-contact-form", "contact-form", "Contact", [
            block("blank-contact-form-copy", "copy", {
              title: "Contact us",
              body: "Add your phone, email, address, and response details here.",
              buttonLabel: "Send message",
            }),
          ]),
        ]),
        seo: { metaTitle: `Contact ${storeName}`, metaDescription: `Contact ${storeName}.` },
      },
    ],
  };
}

function updatePage(
  pages: TemplatePageSeed[],
  pageType: TemplatePageType,
  updater: (page: TemplatePageSeed) => TemplatePageSeed,
) {
  return pages.map((page) => (page.pageType === pageType ? updater(page) : page));
}

function reorder<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return items;
  next.splice(toIndex, 0, moved);
  return next;
}

function replaceSection(
  sections: TemplateSectionNode[],
  sectionId: string,
  updater: (section: TemplateSectionNode) => TemplateSectionNode,
) {
  return sections.map((section) => (section.id === sectionId ? updater(section) : section));
}

function replaceBlock(
  blocks: TemplateBlockNode[],
  blockId: string,
  updater: (block: TemplateBlockNode) => TemplateBlockNode,
) {
  return blocks.map((block) => (block.id === blockId ? updater(block) : block));
}

export function parseEditorState(raw: unknown): StoreEditorState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const record = raw as Record<string, unknown>;
  return {
    template: record.template as TemplateSelectionMeta | undefined,
    draft: (record.draft as StoreEditorSnapshot | null | undefined) ?? null,
    published: (record.published as StoreEditorSnapshot | null | undefined) ?? null,
  };
}

export function resolveDraftSnapshot(
  brandSettings: unknown,
  fallback: StoreEditorSnapshot | null = null,
) {
  const parsed = (brandSettings && typeof brandSettings === "object" ? brandSettings : {}) as StoreBrandSettingsLike;
  const editor = parseEditorState(parsed.editor);
  return editor.draft ?? editor.published ?? fallback;
}

export function resolvePublishedSnapshot(
  brandSettings: unknown,
  fallback: StoreEditorSnapshot | null = null,
) {
  const parsed = (brandSettings && typeof brandSettings === "object" ? brandSettings : {}) as StoreBrandSettingsLike;
  const editor = parseEditorState(parsed.editor);
  return editor.published ?? fallback;
}

export function buildTemplateSelectionMeta(manifest: StoreTemplateManifest): TemplateSelectionMeta {
  const meta: TemplateSelectionMeta = {
    templateId: manifest.id,
    templateName: manifest.name,
    sourcePack: manifest.sourcePack,
    sourcePath: manifest.sourcePath,
    sourceType: manifest.sourceType,
    category: manifest.category,
    demoContentMode: manifest.demoContentMode,
    layoutFamily: manifest.layoutFamily,
  };
  if (manifest.previewImage) {
    meta.previewImage = manifest.previewImage;
  }
  return meta;
}

export function buildBrandSettingsForDraft(
  current: StoreBrandSettingsLike,
  manifest: StoreTemplateManifest,
  draft: StoreEditorSnapshot,
): StoreBrandSettingsLike {
  const editor = parseEditorState(current.editor);

  return {
    ...current,
    template: buildTemplateSelectionMeta(manifest),
    themeTokens: draft.themeTokens,
    layoutVariant: manifest.layoutFamily,
    editor: {
      ...editor,
      template: buildTemplateSelectionMeta(manifest),
      draft,
    },
  };
}

export function buildBrandSettingsForPublish(
  current: StoreBrandSettingsLike,
  manifest: StoreTemplateManifest,
  published: StoreEditorSnapshot,
): StoreBrandSettingsLike {
  const editor = parseEditorState(current.editor);

  return {
    ...current,
    template: buildTemplateSelectionMeta(manifest),
    themeTokens: published.themeTokens,
    layoutVariant: manifest.layoutFamily,
    editor: {
      ...editor,
      template: buildTemplateSelectionMeta(manifest),
      draft: published,
      published,
    },
  };
}

export function applyEditorPatchOps(snapshot: StoreEditorSnapshot, ops: StoreEditorPatchOp[]) {
  const next = cloneSnapshot(snapshot);

  for (const op of ops) {
    if (op.op === "update-theme") {
      next.themeTokens = { ...next.themeTokens, ...op.changes };
      continue;
    }

    if (op.op === "reorder-section") {
      next.pages = updatePage(next.pages, op.pageType, (page) => ({
        ...page,
        sections: reorder(page.sections, op.fromIndex, op.toIndex),
      }));
      continue;
    }

    if (op.op === "update-section") {
      next.pages = updatePage(next.pages, op.pageType, (page) => ({
        ...page,
        sections: replaceSection(page.sections, op.sectionId, (section) => ({
          ...section,
          ...op.changes,
        })),
      }));
      continue;
    }

    if (op.op === "toggle-section") {
      next.pages = updatePage(next.pages, op.pageType, (page) => ({
        ...page,
        sections: replaceSection(page.sections, op.sectionId, (section) => ({
          ...section,
          visible: op.visible,
        })),
      }));
      continue;
    }

    if (op.op === "add-section") {
      next.pages = updatePage(next.pages, op.pageType, (page) => {
        const sections = [...page.sections];
        const index = op.index ?? sections.length;
        sections.splice(index, 0, op.section);
        return { ...page, sections };
      });
      continue;
    }

    if (op.op === "remove-section") {
      next.pages = updatePage(next.pages, op.pageType, (page) => ({
        ...page,
        sections: page.sections.filter((section) => section.id !== op.sectionId),
      }));
      continue;
    }

    if (op.op === "update-block") {
      next.pages = updatePage(next.pages, op.pageType, (page) => ({
        ...page,
        sections: replaceSection(page.sections, op.sectionId, (section) => ({
          ...section,
          blocks: replaceBlock(section.blocks, op.blockId, (block) => ({
            ...block,
            ...op.changes,
          })),
        })),
      }));
      continue;
    }

    if (op.op === "update-block-content") {
      next.pages = updatePage(next.pages, op.pageType, (page) => ({
        ...page,
        sections: replaceSection(page.sections, op.sectionId, (section) => ({
          ...section,
          blocks: replaceBlock(section.blocks, op.blockId, (block) => ({
            ...block,
            content: { ...block.content, ...op.content },
          })),
        })),
      }));
      continue;
    }

    if (op.op === "update-block-styles") {
      next.pages = updatePage(next.pages, op.pageType, (page) => ({
        ...page,
        sections: replaceSection(page.sections, op.sectionId, (section) => ({
          ...section,
          blocks: replaceBlock(section.blocks, op.blockId, (block) => ({
            ...block,
            styles: { ...(block.styles ?? {}), ...op.styles },
          })),
        })),
      }));
      continue;
    }

    if (op.op === "update-section-styles") {
      next.pages = updatePage(next.pages, op.pageType, (page) => ({
        ...page,
        sections: replaceSection(page.sections, op.sectionId, (section) => ({
          ...section,
          styles: { ...(section.styles ?? {}), ...op.styles },
        })),
      }));
      continue;
    }

    if (op.op === "update-section-background") {
      next.pages = updatePage(next.pages, op.pageType, (page) => ({
        ...page,
        sections: replaceSection(page.sections, op.sectionId, (section) => ({
          ...section,
          background: { ...(section.background ?? {}), ...op.background },
        })),
      }));
      continue;
    }

    if (op.op === "duplicate-section") {
      next.pages = updatePage(next.pages, op.pageType, (page) => {
        const sections = [...page.sections];
        const sourceIndex = sections.findIndex((section) => section.id === op.sectionId);
        if (sourceIndex === -1) return page;
        const source = cloneSnapshot({ ...next, pages: [] });
        const copy = JSON.parse(JSON.stringify(sections[sourceIndex])) as TemplateSectionNode;
        copy.id = op.newSectionId;
        copy.name = `${copy.name} Copy`;
        sections.splice(sourceIndex + 1, 0, copy);
        return { ...page, sections };
      });
      continue;
    }
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

export function syncSnapshotFromStoreConfig(snapshot: StoreEditorSnapshot, store: StoreConfigLike) {
  const next = cloneSnapshot(snapshot);
  next.themeTokens = {
    ...next.themeTokens,
    heroBg: store.palette.heroBg,
    heroText: store.palette.heroText,
    accent: store.palette.accent,
    ctaBg: store.palette.ctaBg,
    ctaText: store.palette.ctaText,
    paperBg: store.palette.paperBg,
    headingStyle: store.fontStyle === "grotesk" ? "grotesk" : "serif",
  };

  next.pages = next.pages.map((page) => ({
    ...page,
    sections: page.sections.map((section) => {
      if (section.kind === "hero-split") {
        return {
          ...section,
          blocks: section.blocks.map((entry) =>
            entry.type === "copy"
              ? {
                  ...entry,
                  content: {
                    ...entry.content,
                    title: store.heroHeadline,
                    body: store.heroSubline,
                    primaryCta: store.heroCtaText,
                    eyebrow: store.name,
                  },
                }
              : entry,
          ),
        };
      }

      if (section.kind === "header") {
        return {
          ...section,
          blocks: section.blocks.map((entry) =>
            entry.type === "copy"
              ? {
                  ...entry,
                  content: {
                    ...entry.content,
                    navLinks: ["home", ...store.navLinks.map((item) => item.toLowerCase().replace(/\s+/g, "-"))]
                      .filter((item, index, array) => array.indexOf(item) === index),
                  },
                }
              : entry,
          ),
        };
      }

      if (section.kind === "featured-products") {
        return {
          ...section,
          items: store.products.slice(0, Math.max(section.items?.length ?? 0, 3)).map((product, index) => ({
            id: `${page.pageType}-product-${index + 1}`,
            title: product.name,
            subtitle: product.subtitle,
            priceLabel: product.price,
            color: product.color,
            imageUrl: product.imageUrl,
            mappedStoreProductId: null,
          })),
        };
      }

      return section;
    }),
  }));

  next.updatedAt = new Date().toISOString();
  return next;
}

export function snapshotToPublishedPages(snapshot: StoreEditorSnapshot) {
  return snapshot.pages.map((page, index) => ({
    type: page.pageType,
    title: page.title,
    slug: page.slug,
    order: index,
    isPublished: true,
    content: {
      schemaVersion: 2,
      pageType: page.pageType,
      title: page.title,
      seo: page.seo ?? null,
      sections: page.sections,
    },
  }));
}

export function snapshotToStoreConfig(
  snapshot: StoreEditorSnapshot,
  fallbackName = "Your Store",
): StoreConfigLike & { slug: string; changed: string[] } {
  const home = snapshot.pages.find((page) => page.pageType === "home");
  const hero = home?.sections.find((section) => section.kind === "hero-split");
  const header = home?.sections.find((section) => section.kind === "header");
  const featured = home?.sections.find((section) => section.kind === "featured-products");
  const heroCopy = hero?.blocks.find((entry) => entry.type === "copy")?.content ?? {};
  const headerCopy = header?.blocks.find((entry) => entry.type === "copy")?.content ?? {};

  return {
    name: String(heroCopy.eyebrow ?? fallbackName),
    slug: String(heroCopy.eyebrow ?? fallbackName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    tagline: String(heroCopy.eyebrow ?? fallbackName),
    heroHeadline: String(heroCopy.title ?? `Welcome to ${fallbackName}`),
    heroSubline: String(heroCopy.body ?? "A richer storefront seeded from a selected template."),
    heroCtaText: String(heroCopy.primaryCta ?? "Shop now"),
    palette: {
      heroBg: snapshot.themeTokens.heroBg,
      heroText: snapshot.themeTokens.heroText,
      accent: snapshot.themeTokens.accent,
      ctaBg: snapshot.themeTokens.ctaBg,
      ctaText: snapshot.themeTokens.ctaText,
      paperBg: snapshot.themeTokens.paperBg,
    },
    fontStyle: snapshot.themeTokens.headingStyle === "grotesk" ? "grotesk" : "fraunces",
    navLinks: Array.isArray(headerCopy.navLinks)
      ? (headerCopy.navLinks as string[]).map((item) => item.replace(/-/g, " "))
      : ["Products", "About", "FAQ", "Contact"],
    products: Array.isArray(featured?.items)
      ? featured.items.slice(0, 3).map((item, index) => ({
          name: String(item.title ?? `Product ${index + 1}`),
          subtitle: String(item.subtitle ?? "Template starter product"),
          price: String(item.priceLabel ?? "NGN 0"),
          color: String(item.color ?? "#2E7E78"),
          imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : undefined,
        }))
      : [],
    changed: ["template", "hero", "palette"],
  };
}
