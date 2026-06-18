import { createSectionFromLibrary } from "./http";
import type {
  BlockStyles,
  LayoutFamily,
  StoreEditorSnapshot,
  TemplatePageSeed,
  TemplatePageType,
  TemplateSectionNode,
  ThemeTokenSet,
} from "./types";

type HtmlThemePageInput = {
  pageType: TemplatePageType;
  title?: string;
  slug?: string;
  html: string;
};

export type HtmlThemeConversionInput = {
  templateId: string;
  templateName: string;
  sourcePack?: string;
  sourcePath?: string;
  layoutFamily?: LayoutFamily;
  themeTokens: ThemeTokenSet;
  pages: HtmlThemePageInput[];
};

export type RexTemplateMemory = {
  templateId: string;
  templateName: string;
  pages: Array<{
    pageType: TemplatePageType;
    sections: string[];
    editableFields: string[];
  }>;
  promptHints: string[];
};

const PAGE_TITLES: Record<TemplatePageType, string> = {
  home: "Home",
  products: "Products",
  product: "Product Detail",
  categories: "Categories",
  cart: "Cart",
  checkout: "Checkout",
  wishlist: "Wishlist",
  blog: "Blog",
  about: "About",
  contact: "Contact",
  faq: "FAQ",
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function extractText(html: string, regex: RegExp): string {
  return stripHtml(html.match(regex)?.[1] ?? "");
}

function extractTexts(html: string, regex: RegExp, limit: number): string[] {
  return Array.from(html.matchAll(regex))
    .map((match) => stripHtml(match[1] ?? match[0] ?? ""))
    .filter(Boolean)
    .slice(0, limit);
}

function extractImages(html: string, limit: number): string[] {
  return Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi))
    .map((match) => match[1])
    .filter(Boolean)
    .slice(0, limit);
}

function extractNavLinks(html: string): string[] {
  const labels = extractTexts(html, /<a\b[^>]*>([\s\S]*?)<\/a>/gi, 12)
    .map((label) => label.toLowerCase())
    .filter((label) =>
      /^(home|shop|products|categories|blog|about|contact|faq|wishlist|cart|checkout)$/.test(label)
    );
  return Array.from(new Set(labels.map((label) => (label === "shop" ? "products" : label))));
}

function extractProductItems(html: string, images: string[]) {
  const headings = extractTexts(html, /<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/gi, 8);
  const prices = extractTexts(
    html,
    /(?:₦|N|NGN|\$|£|€)\s?[0-9][0-9,]*(?:\.\d{2})?/gi,
    8,
  );
  return headings.slice(0, 6).map((title, index) => ({
    id: `converted-product-${index + 1}`,
    title,
    subtitle: "Editable product card",
    priceLabel: prices[index] ?? "Set price",
    imageUrl: images[index],
    mappedStoreProductId: null,
  }));
}

function getPageSlug(pageType: TemplatePageType, slug?: string): string {
  if (slug !== undefined) return slug;
  return pageType === "home" ? "" : pageType;
}

function extractInlineStyles(element: string): Record<string, string> {
  const styleMatch = element.match(/style=["']([^"']*)["']/);
  if (!styleMatch) return {};
  const styles: Record<string, string> = {};
  for (const decl of styleMatch[1].split(";")) {
    const [prop, ...rest] = decl.split(":");
    if (prop && rest.length) {
      styles[prop.trim()] = rest.join(":").trim();
    }
  }
  return styles;
}

function cssPropToBlockStyles(cssProps: Record<string, string>): BlockStyles {
  const blockStyles: BlockStyles = {};
  const propMap: Record<string, keyof BlockStyles> = {
    "padding": "padding",
    "padding-top": "padding",
    "padding-bottom": "padding",
    "padding-left": "padding",
    "padding-right": "padding",
    "margin": "margin",
    "margin-top": "margin",
    "margin-bottom": "margin",
    "background-color": "backgroundColor",
    "background-image": "backgroundImage",
    "background-size": "backgroundSize",
    "border-radius": "borderRadius",
    "text-align": "textAlign",
    "font-size": "fontSize",
    "font-weight": "fontWeight",
    "font-family": "fontFamily",
    "color": "color",
    "line-height": "lineHeight",
    "letter-spacing": "letterSpacing",
    "text-transform": "textTransform",
    "box-shadow": "boxShadow",
    "max-width": "maxWidth",
    "min-height": "minHeight",
    "object-fit": "objectFit",
    "gap": "gap",
    "display": "display",
    "flex-direction": "flexDirection",
    "align-items": "alignItems",
    "justify-content": "justifyContent",
    "grid-template-columns": "gridTemplateColumns",
    "grid-gap": "gridGap",
    "position": "position",
    "overflow": "overflow",
    "z-index": "zIndex",
    "opacity": "opacity",
    "border": "border",
    "border-color": "borderColor",
    "border-width": "borderWidth",
    "width": "width",
    "height": "height",
  };
  for (const [cssProp, value] of Object.entries(cssProps)) {
    const mapped = propMap[cssProp];
    if (mapped) {
      blockStyles[mapped] = value;
    }
  }
  return blockStyles;
}

function convertPage(input: HtmlThemePageInput): TemplatePageSeed {
  const html = input.html;
  const title = input.title ?? PAGE_TITLES[input.pageType];
  const images = extractImages(html, 12);
  const headline = extractText(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || title;
  const subline = extractText(html, /<p\b[^>]*>([\s\S]*?)<\/p>/i);
  const links = extractNavLinks(html);
  const sections: TemplatePageSeed["sections"] = [];

  const header = createSectionFromLibrary("header");
  header.blocks = header.blocks.map((block) =>
    block.type === "copy"
      ? {
          ...block,
          content: {
            ...block.content,
            navLinks: links.length
              ? links.filter((link) => !["wishlist", "cart", "checkout"].includes(link))
              : ["home", "products", "about", "contact"],
            utilityLinks: links.filter((link) => ["wishlist", "cart"].includes(link)).length
              ? links.filter((link) => ["wishlist", "cart"].includes(link))
              : ["wishlist", "cart"],
          },
        }
      : block,
  );
  sections.push(header);

  if (headline || images[0]) {
    const hero = createSectionFromLibrary("hero-split");
    hero.blocks = hero.blocks.map((block) =>
      block.type === "copy"
        ? {
            ...block,
            content: {
              ...block.content,
              title: headline,
              body: subline || "Edit this theme copy to match your brand.",
              primaryCta: "Shop now",
            },
          }
        : block,
    );
    hero.items = images.slice(0, 2).map((imageUrl, index) => ({
      id: `hero-image-${index + 1}`,
      imageUrl,
      title: "Hero image",
    }));
    sections.push(hero);
  }

  if (/(product|shop|price|cart|collection)/i.test(html)) {
    const products = createSectionFromLibrary("featured-products");
    const items = extractProductItems(html, images.slice(2));
    if (items.length) products.items = items;
    sections.push(products);
  }

  if (/(category|collection|department)/i.test(html)) {
    sections.push(createSectionFromLibrary("category-list"));
  }

  if (/(review|testimonial|rating|customer)/i.test(html)) {
    sections.push(createSectionFromLibrary("testimonials"));
  }

  if (/(contact|email|phone|message|form)/i.test(html)) {
    sections.push(
      createSectionFromLibrary(
        input.pageType === "contact" ? "contact-form" : "newsletter",
      ),
    );
  }

  const storyText = extractTexts(
    html,
    /<section\b[^>]*>([\s\S]*?)<\/section>/gi,
    4,
  ).find((text) => text.length > 80);
  if (storyText && !["cart", "checkout"].includes(input.pageType)) {
    const story = createSectionFromLibrary("story-split");
    story.blocks = story.blocks.map((block) =>
      block.type === "copy"
        ? {
            ...block,
            content: {
              ...block.content,
              title: extractText(storyText, /(.{1,80})/) || "Brand story",
              body: storyText.slice(0, 260),
            },
          }
        : block,
    );
    sections.push(story);
  }

  if (input.pageType === "cart") sections.push(createSectionFromLibrary("cart-summary"));
  if (input.pageType === "checkout") sections.push(createSectionFromLibrary("checkout-form"));
  if (input.pageType === "wishlist") sections.push(createSectionFromLibrary("wishlist-grid"));
  if (input.pageType === "blog") sections.push(createSectionFromLibrary("blog-index"));
  if (input.pageType === "faq" || /(faq|frequently asked|question)/i.test(html))
    sections.push(createSectionFromLibrary("faq"));

  sections.push(createSectionFromLibrary("footer"));

  return {
    id: `converted-${input.pageType}`,
    pageType: input.pageType,
    title,
    slug: getPageSlug(input.pageType, input.slug),
    sections,
    seo: {
      metaTitle: title,
      metaDescription:
        subline.slice(0, 180) || `${title} page converted from HTML theme.`,
    },
  };
}

export function convertHtmlThemeToSnapshot(
  input: HtmlThemeConversionInput,
): StoreEditorSnapshot {
  return {
    templateId: input.templateId,
    templateName: input.templateName,
    sourcePack: input.sourcePack,
    sourcePath: input.sourcePath,
    sourceType: "next-template",
    layoutFamily: input.layoutFamily ?? "minimal-showcase",
    themeTokens: input.themeTokens,
    pages: input.pages.map(convertPage),
    updatedAt: new Date().toISOString(),
  };
}

export function buildRexMemoryFromSnapshot(
  snapshot: StoreEditorSnapshot,
): RexTemplateMemory {
  return {
    templateId: snapshot.templateId,
    templateName: snapshot.templateName,
    pages: snapshot.pages.map((page) => ({
      pageType: page.pageType,
      sections: page.sections.map((section) => section.kind),
      editableFields: Array.from(
        new Set(
          page.sections.flatMap((section) =>
            section.blocks.map((block) => block.type),
          ),
        ),
      ),
    })),
    promptHints: [
      `Recreate ${snapshot.templateName} using native editable Shopinbos sections, not iframe or static HTML output.`,
      "Preserve page order, navigation, typography tokens, product sections, forms, reviews, and footer contact details.",
      "Use mapped products, store logo, store contact details, and dynamic app data instead of hardcoded demo content.",
    ],
  };
}

export interface ParsedTemplateSection {
  type: string;
  html: string;
  styles: Record<string, string>;
  blocks: Array<{
    type: "text" | "image" | "button";
    content: Record<string, unknown>;
    styles: Record<string, string>;
  }>;
}

export function parseHtmlSection(
  sectionHtml: string,
  baseAssetPath: string,
): ParsedTemplateSection {
  const sectionStyles = extractInlineStyles(sectionHtml);
  const blocks: ParsedTemplateSection["blocks"] = [];

  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(sectionHtml)) !== null) {
    const imgTag = imgMatch[0];
    const src = imgMatch[1];
    const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
    const alt = altMatch ? altMatch[1] : "Image";
    const imgStyles = extractInlineStyles(imgTag);
    blocks.push({
      type: "image",
      content: {
        originalSrc: src,
        resolvedSrc: src.startsWith("/")
          ? src
          : `${baseAssetPath}/${src.replace(/^\.\//, "")}`,
        alt,
      },
      styles: imgStyles,
    });
  }

  const headingRegex = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/gi;
  let hMatch;
  while ((hMatch = headingRegex.exec(sectionHtml)) !== null) {
    const headingStyles = extractInlineStyles(hMatch[0]);
    blocks.push({
      type: "text",
      content: { text: stripHtml(hMatch[1]), level: hMatch[0].match(/<h([1-4])/)?.[1] ?? "2" },
      styles: headingStyles,
    });
  }

  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(sectionHtml)) !== null) {
    const pStyles = extractInlineStyles(pMatch[0]);
    blocks.push({
      type: "text",
      content: { text: stripHtml(pMatch[1]) },
      styles: pStyles,
    });
  }

  const btnRegex = /<(?:button|a)\b[^>]*>([\s\S]*?)<\/(?:button|a)>/gi;
  let btnMatch;
  while ((btnMatch = btnRegex.exec(sectionHtml)) !== null) {
    const btnTag = btnMatch[0];
    const btnStyles = extractInlineStyles(btnTag);
    const hrefMatch = btnTag.match(/href=["']([^"']*)["']/i);
    blocks.push({
      type: "button",
      content: {
        text: stripHtml(btnMatch[1]),
        link: hrefMatch ? hrefMatch[1] : "#",
      },
      styles: btnStyles,
    });
  }

  return {
    type: sectionHtml.match(/<section\b[^>]*class=["']([^"']*)["']/)?.[1] ?? "generic",
    html: sectionHtml,
    styles: sectionStyles,
    blocks,
  };
}
