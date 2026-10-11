export interface NavStructure {
  navLinks: string[];
  logoText: string;
  utilityLinks: string[];
  ctaLabel: string;
}

export const THEME_NAV_STRUCTURES: Record<string, NavStructure> = {
  "velour-premium": {
    navLinks: ["home", "products", "about", "blog", "faq", "contact"],
    logoText: "VELOUR",
    utilityLinks: ["categories", "wishlist", "cart"],
    ctaLabel: "Explore",
  },
  "shopinbos-boutique": {
    navLinks: ["home", "products", "about", "blog", "faq", "contact"],
    logoText: "BOUTIQUE",
    utilityLinks: ["categories", "wishlist", "cart"],
    ctaLabel: "Shop now",
  },
  "noir-atelier": {
    navLinks: ["home", "products", "about", "blog", "contact"],
    logoText: "NOIR",
    utilityLinks: ["categories", "wishlist", "cart"],
    ctaLabel: "Shop edit",
  },
  "glow-ritual": {
    navLinks: ["home", "products", "about", "blog", "faq", "contact"],
    logoText: "GLOW",
    utilityLinks: ["categories", "wishlist", "cart"],
    ctaLabel: "Shop routine",
  },
  "lumi-beauty": {
    navLinks: ["home", "products", "about", "blog", "faq", "contact"],
    logoText: "LUMI",
    utilityLinks: ["wishlist", "cart"],
    ctaLabel: "Shop rituals",
  },
  "terra-home": {
    navLinks: ["home", "products", "about", "blog", "contact"],
    logoText: "TERRA",
    utilityLinks: ["categories", "wishlist", "cart"],
    ctaLabel: "Shop home",
  },
  "nova-tech": {
    navLinks: ["home", "products", "categories", "blog", "contact"],
    logoText: "NOVA",
    utilityLinks: ["wishlist", "cart"],
    ctaLabel: "Shop tech",
  },
  "fresh-basket": {
    navLinks: ["home", "products", "categories", "about", "contact"],
    logoText: "FRESH",
    utilityLinks: ["wishlist", "cart"],
    ctaLabel: "Shop groceries",
  },
  "chapter-house": {
    navLinks: ["home", "products", "about", "blog", "contact"],
    logoText: "CHAPTER",
    utilityLinks: ["categories", "wishlist", "cart"],
    ctaLabel: "Browse books",
  },
  pawhaven: {
    navLinks: ["home", "products", "about", "blog", "contact"],
    logoText: "PAWHAVEN",
    utilityLinks: ["categories", "wishlist", "cart"],
    ctaLabel: "Shop care",
  },
  "street-mode": {
    navLinks: ["home", "products", "categories", "blog", "contact"],
    logoText: "STREET",
    utilityLinks: ["wishlist", "cart"],
    ctaLabel: "Shop drop",
  },
  "aurum-jewels": {
    navLinks: ["home", "products", "about", "blog", "contact"],
    logoText: "AURUM",
    utilityLinks: ["categories", "wishlist", "cart"],
    ctaLabel: "Shop jewels",
  },
  kaira: {
    navLinks: ["home", "products", "about", "blog", "faq", "contact"],
    logoText: "KAIRA",
    utilityLinks: ["categories", "wishlist", "cart"],
    ctaLabel: "Shop now",
  },
  famms: {
    navLinks: ["home", "products", "about", "blog", "contact"],
    logoText: "Famms",
    utilityLinks: ["cart"],
    ctaLabel: "Shop Now",
  },
  malefashion: {
    navLinks: ["home", "shop", "blog", "about", "contact"],
    logoText: "MALE-FASHION",
    utilityLinks: ["cart", "wishlist"],
    ctaLabel: "Shop now",
  },
  hexashop: {
    navLinks: ["home", "men", "women", "kids", "about", "contact"],
    logoText: "HexaShop",
    utilityLinks: ["cart"],
    ctaLabel: "Purchase Now!",
  },
  furni: {
    navLinks: ["home", "shop", "about", "services", "blog", "contact"],
    logoText: "Furni.",
    utilityLinks: ["cart", "wishlist"],
    ctaLabel: "Shop Now",
  },
  "the-plaza": {
    navLinks: ["home", "shop", "categories", "contact"],
    logoText: "The Plaza",
    utilityLinks: ["cart", "wishlist"],
    ctaLabel: "Shop Now",
  },
  minishop: {
    navLinks: ["home", "shop", "about", "blog", "contact"],
    logoText: "MiniShop",
    utilityLinks: ["cart"],
    ctaLabel: "Discover Now",
  },
  freshshop: {
    navLinks: ["home", "shop", "about", "blog", "contact"],
    logoText: "FreshShop",
    utilityLinks: ["cart", "wishlist"],
    ctaLabel: "Shop now",
  },
  footwear: {
    navLinks: ["home", "men", "women", "about", "blog", "contact"],
    logoText: "Footwear",
    utilityLinks: ["cart", "wishlist"],
    ctaLabel: "Shop now",
  },
  ogani: {
    navLinks: ["home", "shop", "blog", "contact"],
    logoText: "Ogani",
    utilityLinks: ["cart"],
    ctaLabel: "Shop now",
  },
  karma: {
    navLinks: ["home", "shop", "blog", "contact"],
    logoText: "Karma",
    utilityLinks: ["cart", "wishlist"],
    ctaLabel: "Shop now",
  },
  eflyer: {
    navLinks: ["home", "electronics", "fashion", "jewellery", "contact"],
    logoText: "Eflyer",
    utilityLinks: ["cart"],
    ctaLabel: "Shop Now",
  },
  foodmart: {
    navLinks: ["home", "products", "about", "contact"],
    logoText: "FoodMart",
    utilityLinks: ["cart"],
    ctaLabel: "Shop Now",
  },
  waggy: {
    navLinks: ["home", "shop", "about", "blog", "contact"],
    logoText: "Waggy",
    utilityLinks: ["cart"],
    ctaLabel: "Shop Now",
  },
  booksaw: {
    navLinks: ["home", "shop", "about", "blog", "contact"],
    logoText: "Booksaw",
    utilityLinks: ["cart", "wishlist"],
    ctaLabel: "Browse",
  },
  bookly: {
    navLinks: ["home", "shop", "about", "contact"],
    logoText: "Bookly",
    utilityLinks: ["cart"],
    ctaLabel: "Discover",
  },
  furnish: {
    navLinks: ["home", "products", "about", "contact"],
    logoText: "Furnish",
    utilityLinks: ["cart"],
    ctaLabel: "Shop Now",
  },
  caraft: {
    navLinks: ["home", "products", "about", "contact"],
    logoText: "Caraft",
    utilityLinks: ["cart"],
    ctaLabel: "Shop Now",
  },
  electro: {
    navLinks: ["home", "products", "about", "blog", "contact"],
    logoText: "Electro",
    utilityLinks: ["cart", "wishlist"],
    ctaLabel: "Shop Now",
  },
  organic: {
    navLinks: ["home", "shop", "about", "contact"],
    logoText: "Organic",
    utilityLinks: ["cart"],
    ctaLabel: "Shop Now",
  },
  fruitables: {
    navLinks: ["home", "shop", "about", "blog", "contact"],
    logoText: "Fruitables",
    utilityLinks: ["cart"],
    ctaLabel: "Shop Now",
  },
  mellow: {
    navLinks: ["home", "shop", "about", "blog", "contact"],
    logoText: "Mellow",
    utilityLinks: ["cart", "wishlist"],
    ctaLabel: "Explore",
  },
  cycle: {
    navLinks: ["home", "shop", "about", "news", "contact"],
    logoText: "Cycle",
    utilityLinks: ["cart"],
    ctaLabel: "Shop Now",
  },
  ultras: {
    navLinks: ["home", "products", "about", "contact"],
    logoText: "Ultras",
    utilityLinks: ["cart", "wishlist"],
    ctaLabel: "Shop Now",
  },
  breeze: { navLinks: ["home", "products", "about", "contact"], logoText: "Studio", utilityLinks: ["wishlist", "cart"], ctaLabel: "Shop new arrivals" },
  noir: { navLinks: ["home", "products", "about", "contact"], logoText: "NOIR", utilityLinks: ["wishlist", "cart"], ctaLabel: "Shop the edit" },
  plain: { navLinks: ["home", "products", "about", "contact"], logoText: "Plain", utilityLinks: ["wishlist", "cart"], ctaLabel: "Shop now" },
};

export function getNavStructure(templateId: string): NavStructure {
  return (
    THEME_NAV_STRUCTURES[templateId] ?? {
      navLinks: ["home", "products", "about", "blog", "faq", "contact"],
      logoText: "Store",
      utilityLinks: ["categories", "wishlist", "cart"],
      ctaLabel: "Shop now",
    }
  );
}
