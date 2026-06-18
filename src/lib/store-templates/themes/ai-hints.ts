export interface ThemeAIHints {
  palette: string;
  vibe: string;
  layout: string;
  keySections: string[];
  dynamicBindings: string[];
  rexPrompt: string;
}

export const THEME_AI_HINTS: Record<string, ThemeAIHints> = {
  "velour-premium": {
    palette: "Dark charcoal #1E1A18, cream #F9F6F1, gold #C9973A",
    vibe: "Luxury editorial boutique — premium, refined, timeless",
    layout: "Full-screen hero split, collection grid, story split, lookbook grid, testimonial cards, FAQ accordion, newsletter capture",
    keySections: ["hero-split", "category-grid", "featured-products", "story-split", "lookbook-grid", "testimonials", "faq", "newsletter"],
    dynamicBindings: ["Logo rebuilds as VELOUR text", "Hero copy pulls from store name/tagline", "Products map to store.storeProducts", "Reviews pull from store reviews or product reviews", "Contact form submits to /api/public/store/:slug/forms", "Newsletter stores in StoreFormSubmission"],
    rexPrompt: "Create a Velour Premium store: dark editorial hero with gold accents, serif headings (Marcellus), product grid 3-col, story section with three pillars, testimonial carousel, FAQ accordion. Use #1E1A18 hero background, #C9973A gold accent, cream paper #F9F6F1. Logo: VELOUR in caps.",
  },
  kaira: {
    palette: "Black #111, white #FFF, sage #8C907E, light gray #F1F1F0",
    vibe: "Modern fashion boutique — clean, elegant, minimal-chic",
    layout: "Hero banner, trust strip, category grid, featured products, promo banner, story section, lookbook grid, testimonials, newsletter",
    keySections: ["hero-split", "trust-strip", "category-grid", "featured-products", "promo-banner", "story-split", "lookbook-grid", "testimonials", "newsletter"],
    dynamicBindings: ["Logo as KAIRA text", "Hero: product showcase with CTA", "Products: mapped from store products", "Blog posts: editable in editor"],
    rexPrompt: "Build a Kaira fashion store: hero with product imagery, sage green #8C907E accent, serif headings (Marcellus) with Jost body, clean white background #FFF, black text #111. Logo: KAIRA.",
  },
  famms: {
    palette: "Red/coral #f7444e, white #FFF, black #0c0c0c",
    vibe: "Bold fashion retail — conversion-focused, energetic, promotional",
    layout: "Hero slider, trust strip, category grid, featured products, promo banner, story section, testimonials, newsletter",
    keySections: ["hero-split", "trust-strip", "category-grid", "featured-products", "promo-banner", "testimonials", "newsletter"],
    dynamicBindings: ["Hero text: sale percentage editable", "CTAs: primary 'Shop Now'", "Product cards: store products", "Testimonials: product reviews"],
    rexPrompt: "Create a Famms fashion store: red #f7444e hero/accent, white background, Playfair Display serif headings with Montserrat body. Bold 'Sale 20% Off' hero. Red buttons. Logo: Famms.",
  },
  furni: {
    palette: "Forest green #3b5d50, gold #f9bf29, off-white #eff2f1, charcoal #2f2f2f",
    vibe: "Modern furniture showroom — warm, organic, premium",
    layout: "Hero with product image, product grid 3-col + intro column, why-choose-us feature grid, lookbook gallery, testimonials, newsletter",
    keySections: ["hero-split", "featured-products", "story-split", "lookbook-grid", "testimonials", "newsletter"],
    dynamicBindings: ["Hero title from store name", "Product items from storeProducts", "Feature columns: editable copy", "Social: configurable links"],
    rexPrompt: "Create a Furni furniture store: forest green #3b5d50 hero/nav, gold #f9bf29 accent, Inter font, off-white #eff2f1 paper. Hero with product image right, text left. Product section with intro column + 3 items. 'Why Choose Us' 4-column features. Logo: Furni.",
  },
  hexashop: {
    palette: "Charcoal #2a2a2a, white, light gray #f7f7f7, border #eee",
    vibe: "Clean fashion marketplace — structured, minimalist, category-forward",
    layout: "Hero split banner, 4-category grid (women/men/kids/accessories), featured products, testimonials, newsletter",
    keySections: ["hero-split", "category-grid", "featured-products", "testimonials", "newsletter"],
    dynamicBindings: ["Category cards: editable images/titles", "Products: store products", "Forms: app submissions"],
    rexPrompt: "Create HexaShop store: charcoal #2a2a2a text, white bg, Poppins font. Hero with left text + right category grid (2x2). 4 categories: Women, Men, Kids, Accessories. Clean, minimal borders #eee. Logo: HexaShop.",
  },
  minishop: {
    palette: "Black #000, white #FFF, gold #c49b63, light gray #f8f9fa",
    vibe: "Clean general store — functional, trustworthy, approachable",
    layout: "Hero slider, 3-column services, category grid, featured products, promo, story, testimonials, newsletter",
    keySections: ["hero-split", "trust-strip", "category-grid", "featured-products", "promo-banner", "story-split", "testimonials", "newsletter"],
    dynamicBindings: ["Hero carousel: 2 slides", "Services: Free Shipping / Support / Payments", "Products: store products"],
    rexPrompt: "Create MiniShop store: black header #000, white bg, gold accent #c49b63, Open Sans font. Hero slider with product imagery. 3-column trust strip (Free Shipping, Support, Secure Payments). Product grid. Logo: MiniShop.",
  },
  freshshop: {
    palette: "Black #000, olive #b0b435, white #FFF, dark footer #010101",
    vibe: "Fresh grocery market — vibrant, promotional, farm-fresh",
    layout: "Hero banner, trust strip, category grid (4-col), featured products, promo banner, story, testimonials, newsletter",
    keySections: ["hero-split", "trust-strip", "category-grid", "featured-products", "promo-banner", "story-split", "testimonials", "newsletter"],
    dynamicBindings: ["Hero: farm imagery", "Categories: fresh produce types", "Products: store products (food)", "Forms: app submissions"],
    rexPrompt: "Create FreshShop grocery store: black header, olive green #b0b435 accent, Dosis body font, Poppins headings. Fresh produce hero. 4-category grid. Dark footer. Logo: FreshShop.",
  },
  footwear: {
    palette: "Teal/mint #88c8bc, dark gray #616161, white, black",
    vibe: "Shoe-focused retail — clean, product-led, accessible",
    layout: "Hero banner, services strip, category grid, featured products, promo, story, testimonials, newsletter",
    keySections: ["hero-split", "trust-strip", "category-grid", "featured-products", "promo-banner", "testimonials", "newsletter"],
    dynamicBindings: ["Category: sneakers/formal/sandals", "Products: store products with size variants", "Forms: app submissions"],
    rexPrompt: "Create Footwear store: teal #88c8bc accent, Montserrat body, Rokkitt headings for nav. Clean white bg. Categories: Sneakers, Formal, Sandals. Product grid with size selector. Logo: Footwear.",
  },
  malefashion: {
    palette: "Black #111, red #e53637, white #FFF, dark footer #111",
    vibe: "Men's fashion — bold, confident, masculine",
    layout: "Hero banner, category grid, featured products, promo, testimonials, newsletter",
    keySections: ["hero-split", "category-grid", "featured-products", "promo-banner", "testimonials", "newsletter"],
    dynamicBindings: ["Hero: men's fashion imagery", "Categories: tops/bottoms/accessories", "Products: store products", "Newsletter: app submission"],
    rexPrompt: "Create MaleFashion store: black #111 bg, red #e53637 accent, white text on dark, Nunito Sans font. Men's fashion focus. Bold hero. Categories: Tops, Bottoms, Accessories, Footwear. Logo: MALE-FASHION.",
  },
  ogani: {
    palette: "Green #7fad39, white #FFF, dark text #111, light gray #f5f5f5",
    vibe: "Organic grocery — fresh, natural, wholesome",
    layout: "Hero with category sidebar, category grid, featured products, promo, testimonials, newsletter",
    keySections: ["hero-split", "category-grid", "featured-products", "promo-banner", "testimonials", "newsletter"],
    dynamicBindings: ["Categories: fruits/vegetables/pantry", "Products: store products (organic)", "Forms: app submissions"],
    rexPrompt: "Create Ogani grocery store: green #7fad39 accent, Cairo font, white bg, light #f5f5f5 top bar. Categories: Fruits, Vegetables, Pantry, Beverages. Logo: Ogani.",
  },
  karma: {
    palette: "Amber gradient #ffba00→#ff6c00, dark #222, white #FFF, light lavender #f9f9ff",
    vibe: "General retail — energetic, versatile, modern",
    layout: "Hero banner, category grid, featured products, promo, testimonials, newsletter",
    keySections: ["hero-split", "category-grid", "featured-products", "promo-banner", "testimonials", "newsletter"],
    dynamicBindings: ["Hero: gradient accent", "Categories: general retail", "Products: store products", "Forms: app submissions"],
    rexPrompt: "Create Karma shop: amber gradient #ffba00→#ff6c00 accent, dark #222 text, Poppins headings with Roboto body. Clean white bg with #f9f9ff section bg. Logo: Karma.",
  },
  eflyer: {
    palette: "Orange-red #f26522, dark gray #2b2a29, white, black footer #252525",
    vibe: "Electronics marketplace — high-energy, discount-driven, commercial",
    layout: "Hero banner, category grid, featured products, promo banner, newsletter, dark footer",
    keySections: ["hero-split", "category-grid", "featured-products", "promo-banner", "newsletter"],
    dynamicBindings: ["Categories: electronics/fashion/jewellery", "Products: store products", "Deals: promo banners"],
    rexPrompt: "Create Eflyer store: orange-red #f26522 accent, dark header #2b2a29, Poppins font. Multi-category store: Electronics, Fashion, Jewellery. Promotional, discount-led feel. Logo: Eflyer.",
  },
  "the-plaza": {
    palette: "Dark gray #414141, tan #b09d81, white, black footer #111",
    vibe: "Home & lifestyle — structured, elegant, tasteful",
    layout: "Hero banner, category grid, featured products, testimonials, newsletter, footer",
    keySections: ["hero-split", "category-grid", "featured-products", "testimonials", "newsletter"],
    dynamicBindings: ["Products: home/furniture store products", "Categories: room-based", "Forms: app submissions"],
    rexPrompt: "Create The Plaza store: dark gray #414141 text, tan #b09d81 accent, Raleway font. Clean structured layout. Home/living products. Logo: The Plaza.",
  },
};

export function getThemeAIHints(templateId: string): ThemeAIHints {
  return (
    THEME_AI_HINTS[templateId] ?? {
      palette: "Balanced, clean color scheme matching the template's original design",
      vibe: "Professional ecommerce storefront",
      layout: "Standard ecommerce layout with hero, products, and essential pages",
      keySections: ["hero-split", "featured-products", "testimonials", "newsletter"],
      dynamicBindings: ["All text and images are editable in the visual editor", "Products map to store inventory", "Forms connect to Shopinbos backend"],
      rexPrompt: "Create a professional ecommerce store with the template's original design language. Use the theme's color palette and font choices. Populate all pages: home, products, product detail, cart, checkout, wishlist, about, contact, blog, FAQ.",
    }
  );
}
