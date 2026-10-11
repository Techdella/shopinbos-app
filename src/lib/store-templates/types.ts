export type TemplateSourceType = "next-template" | "html-template";

export type TemplateCategory =
  | "fashion"
  | "beauty"
  | "food"
  | "furniture"
  | "electronics"
  | "books"
  | "pets"
  | "general"
  | "minimal";

export type LayoutFamily =
  | "editorial-boutique"
  | "fashion-runway"
  | "minimal-showcase"
  | "food-market"
  | "home-living"
  | "electronics-grid"
  | "book-lifestyle"
  | "pet-lifestyle"
  | "marketplace-grid";

export type TemplatePageType =
  | "home"
  | "products"
  | "product"
  | "categories"
  | "cart"
  | "checkout"
  | "wishlist"
  | "blog"
  | "about"
  | "contact"
  | "faq";

export type DemoContentMode = "starter-demo";

export interface ThemeTokenSet {
  heroBg: string;
  heroText: string;
  accent: string;
  ctaBg: string;
  ctaText: string;
  paperBg: string;
  cardBg: string;
  ink: string;
  muted: string;
  border: string;
  headingStyle: "serif" | "grotesk";
  radius: "soft" | "rounded" | "sharp";
}

export interface BlockStyles {
  padding?: string;
  margin?: string;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  borderRadius?: string;
  textAlign?: string;
  fontSize?: string;
  fontWeight?: string;
  fontFamily?: string;
  color?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textTransform?: string;
  border?: string;
  borderColor?: string;
  borderWidth?: string;
  boxShadow?: string;
  opacity?: string;
  width?: string;
  height?: string;
  maxWidth?: string;
  minHeight?: string;
  objectFit?: string;
  gap?: string;
  display?: string;
  flexDirection?: string;
  alignItems?: string;
  justifyContent?: string;
  gridTemplateColumns?: string;
  gridGap?: string;
  position?: string;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  transform?: string;
  transition?: string;
  overflow?: string;
  zIndex?: string;
  [key: string]: string | undefined;
}

export interface ImageData {
  originalSrc: string;
  resolvedSrc: string;
  alt: string;
  editable: boolean;
  width?: number;
  height?: number;
  objectFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
}

export interface TemplateBlockNode {
  id: string;
  type: string;
  content: Record<string, unknown>;
  styles?: BlockStyles;
}

export interface TemplateSectionNode {
  id: string;
  kind: string;
  name: string;
  visible: boolean;
  blocks: TemplateBlockNode[];
  items?: Array<Record<string, unknown>>;
  settings?: Record<string, unknown>;
  styles?: BlockStyles;
  background?: {
    color?: string;
    image?: string;
    gradient?: string;
    size?: string;
    position?: string;
  };
}

export interface TemplatePageSeed {
  id: string;
  pageType: TemplatePageType;
  title: string;
  slug: string;
  sections: TemplateSectionNode[];
  seo?: {
    metaTitle: string;
    metaDescription: string;
    focusKeyword?: string; socialTitle?: string; socialDescription?: string; socialImage?: string; canonicalUrl?: string; noIndex?: boolean;
  };
}

export interface StoreTemplateManifest {
  id: string;
  name: string;
  sourcePack: string;
  sourcePath: string;
  sourceType: TemplateSourceType;
  category: TemplateCategory;
  description: string;
  licenseLabel?: string;
  previewImage?: string;
  layoutFamily: LayoutFamily;
  themeTokens: ThemeTokenSet;
  supportedPages: TemplatePageType[];
  seedPages: TemplatePageSeed[];
  demoAssets: string[];
  demoContentMode: DemoContentMode;
  tags: string[];
  aiHints: string[];
}

export interface TemplateGalleryItem {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  previewImage?: string;
  sourcePack: string;
  sourcePath: string;
  sourceType: TemplateSourceType;
  layoutFamily: LayoutFamily;
  themeTokens: ThemeTokenSet;
  supportedPages: TemplatePageType[];
  tags: string[];
  aiHints: string[];
}

export interface StoreEditorSnapshot {
  templateId: string;
  templateName: string;
  sourcePack?: string;
  sourcePath?: string;
  sourceType?: TemplateSourceType;
  layoutFamily: LayoutFamily;
  themeTokens: ThemeTokenSet;
  pages: TemplatePageSeed[];
  updatedAt: string;
}

export interface TemplateSelectionMeta {
  templateId: string;
  templateName: string;
  sourcePack: string;
  sourcePath?: string;
  sourceType: TemplateSourceType;
  category: TemplateCategory;
  previewImage?: string;
  demoContentMode: DemoContentMode;
  layoutFamily: LayoutFamily;
}

export type StoreEditorPatchOp =
  | {
      op: "update-theme";
      changes: Partial<ThemeTokenSet>;
    }
  | {
      op: "reorder-section";
      pageType: TemplatePageType;
      fromIndex: number;
      toIndex: number;
    }
  | {
      op: "update-section";
      pageType: TemplatePageType;
      sectionId: string;
      changes: Partial<TemplateSectionNode>;
    }
  | {
      op: "toggle-section";
      pageType: TemplatePageType;
      sectionId: string;
      visible: boolean;
    }
  | {
      op: "add-section";
      pageType: TemplatePageType;
      index?: number;
      section: TemplateSectionNode;
    }
  | {
      op: "remove-section";
      pageType: TemplatePageType;
      sectionId: string;
    }
  | {
      op: "update-block";
      pageType: TemplatePageType;
      sectionId: string;
      blockId: string;
      changes: Partial<TemplateBlockNode>;
    }
  | {
      op: "update-block-content";
      pageType: TemplatePageType;
      sectionId: string;
      blockId: string;
      content: Record<string, unknown>;
    }
  | {
      op: "update-block-styles";
      pageType: TemplatePageType;
      sectionId: string;
      blockId: string;
      styles: Partial<BlockStyles>;
    }
  | {
      op: "update-section-styles";
      pageType: TemplatePageType;
      sectionId: string;
      styles: Partial<BlockStyles>;
    }
  | {
      op: "update-section-background";
      pageType: TemplatePageType;
      sectionId: string;
      background: NonNullable<TemplateSectionNode["background"]>;
    }
  | {
      op: "duplicate-section";
      pageType: TemplatePageType;
      sectionId: string;
      newSectionId: string;
    };
