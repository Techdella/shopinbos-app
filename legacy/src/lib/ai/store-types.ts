export interface StoreConfig {
  name: string;
  slug: string;
  tagline: string;
  heroHeadline: string;
  heroSubline: string;
  heroCtaText: string;
  logoUrl?: string | null;
  palette: {
    heroBg: string;
    heroText: string;
    accent: string;
    ctaBg: string;
    ctaText: string;
    paperBg: string;
  };
  fontStyle: "fraunces" | "grotesk";
  navLinks: string[];
  products: Array<{
    name: string;
    subtitle: string;
    price: string;
    color: string;
    imageUrl?: string;
  }>;
  changed: string[];
}

export const DEFAULT_STORE_CONFIG: StoreConfig = {
  name: "Your Store",
  slug: "your-store",
  tagline: "Quality products, delivered.",
  heroHeadline: "Tell Rex about your business.",
  heroSubline: "He'll build your store in real time.",
  heroCtaText: "Shop now",
  palette: {
    heroBg: "#0E2A38",
    heroText: "#FAF7F1",
    accent: "#73D8C8",
    ctaBg: "#73D8C8",
    ctaText: "#0E2A38",
    paperBg: "#FAF7F1",
  },
  fontStyle: "fraunces",
  navLinks: ["Products", "About", "Contact"],
  products: [
    { name: "Product One", subtitle: "Your first item", price: "₦0", color: "#2E7E78" },
    { name: "Product Two", subtitle: "Your second item", price: "₦0", color: "#F2A93B" },
    { name: "Product Three", subtitle: "Your third item", price: "₦0", color: "#6B4F8A" },
  ],
  changed: [],
};
