import type { StoreEditorSnapshot, TemplatePageSeed } from "./types";

// Themes ship pages without a search description, so a seller who picks a theme and presses Publish
// would be blocked until they wrote one for every page. Fill only what's blank, from the store's own name.

const DESCRIPTIONS: Partial<Record<TemplatePageSeed["pageType"], (store: string) => string>> = {
  home: (store) => `Shop ${store} online. Secure checkout and delivery across Nigeria.`,
  products: (store) => `Browse products from ${store}.`,
  categories: (store) => `Shop ${store} by category.`,
  product: (store) => `Product details, prices and delivery from ${store}.`,
  cart: (store) => `Review your bag at ${store}.`,
  checkout: (store) => `Check out securely at ${store}.`,
  about: (store) => `Learn about ${store}.`,
  contact: (store) => `Get in touch with ${store}.`,
  wishlist: (store) => `Your saved products at ${store}.`,
  blog: (store) => `Stories and updates from ${store}.`,
  faq: (store) => `Answers about ordering, delivery and returns at ${store}.`,
};

function clip(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

export function fillMissingPageSeo<T extends Pick<StoreEditorSnapshot, "pages">>(snapshot: T, storeName: string): T {
  const store = storeName.trim() || "our store";
  return {
    ...snapshot,
    pages: snapshot.pages.map((page) => {
      // What the seller wrote is kept as is (too long still blocks publish, so they can fix it).
      const metaTitle = page.seo?.metaTitle?.trim() ? page.seo.metaTitle : clip(page.pageType === "home" ? store : `${page.title} | ${store}`, 70);
      const metaDescription = page.seo?.metaDescription?.trim()
        ? page.seo.metaDescription
        : clip((DESCRIPTIONS[page.pageType] ?? ((name: string) => `${page.title} at ${name}.`))(store), 180);
      return { ...page, seo: { ...page.seo, metaTitle, metaDescription } };
    }),
  };
}
