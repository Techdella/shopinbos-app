// Sample catalogues for theme previews on /builder/templates and in the builder's Themes view: 6 to 12 made-up
// products per industry with Nigerian names and naira prices, shown with real photos (demo-photos.ts) and, for any
// product without one, a flat illustration in the theme's palette (demo-art.ts). They only ever render inside a
// preview marked "Sample products"; nothing here is saved to a store, and there are no reviews, ratings or brands.
// Pure data, so tests can load it directly.

import type { ThemeLibraryId } from "./theme-library";
import { demoProductArt, demoSceneArt, type DemoArtKind } from "./demo-art.ts";
import { DEMO_PHOTOS, TALL_HERO_THEMES, unsplashUrl } from "./demo-photos.ts";

export interface DemoProductSeed {
  name: string;
  /** Naira. */
  price: number;
  compareAt?: number;
  category: string;
  art: DemoArtKind;
  /** The object's colour; falls back to the catalogue's palette. */
  tint?: string;
  description: string;
}

export interface DemoCatalogue {
  storeName: string;
  description: string;
  city: string;
  /** What the theme is for, in words ("hair and wigs"). */
  industry: string;
  heroArt: DemoArtKind[];
  /** Object colours to cycle through when a product has no tint. */
  mains: string[];
  products: DemoProductSeed[];
}

const p = (name: string, price: number, category: string, art: DemoArtKind, description: string, tint?: string, compareAt?: number): DemoProductSeed => ({
  name, price, category, art, description, tint, compareAt,
});

export const DEMO_CATALOGUES: Record<ThemeLibraryId, DemoCatalogue> = {
  breeze: {
    storeName: "Tolu & Co.", city: "Lagos", industry: "fashion", description: "Easy, breathable pieces made in Lagos for the heat.",
    heroArt: ["dress", "bag", "shirt"], mains: ["#C2410C", "#0F766E", "#1E3A8A"],
    products: [
      p("Ankara wrap dress", 28500, "Dresses", "dress", "A midi wrap in bold ankara print with a tie waist.", "#C2410C"),
      p("Linen two-piece set", 34000, "Sets", "shirt", "Relaxed shirt and shorts in breathable linen.", "#C9B48A"),
      p("Adire kimono", 22000, "Outerwear", "robe", "Hand-dyed indigo kimono to throw over anything.", "#1E3A8A"),
      p("Wide-leg trousers", 18500, "Trousers", "trousers", "High-waisted, fluid and office-ready.", "#0F766E"),
      p("Raffia tote bag", 15000, "Bags", "bag", "Woven raffia, roomy enough for the beach or the market.", "#C8A15A", 18000),
      p("Silk bandana top", 12500, "Tops", "shirt", "A soft satin top with a tie back.", "#DB2777"),
      p("Pleated midi dress", 19800, "Dresses", "dress", "Swishy pleats in a flattering A-line.", "#6B21A8"),
      p("Beaded mini bag", 16500, "Bags", "bag", "Hand-beaded evening bag with a chain strap.", "#111827"),
    ],
  },
  noir: {
    storeName: "Maison Ayọ̀", city: "Lagos", industry: "luxury", description: "Considered pieces for evenings that matter.",
    heroArt: ["dress", "watch", "heel"], mains: ["#7F1D1D", "#C8A96A", "#1F1F1F"],
    products: [
      p("Silk evening gown", 145000, "Gowns", "dress", "Bias-cut silk that moves with you.", "#7F1D1D"),
      p("Gold-tone wristwatch", 98000, "Watches", "watch", "Slim case, sapphire-style glass, leather strap.", "#3A2A1A"),
      p("Structured leather handbag", 120000, "Bags", "bag", "Top handle, gold hardware, suede lining.", "#1F1F1F"),
      p("Velvet agbada set", 180000, "Menswear", "robe", "Three pieces in deep plum velvet with gold embroidery.", "#3F1D38"),
      p("Pearl drop earrings", 45000, "Jewellery", "earrings", "Freshwater-style pearls on gold-tone hoops.", "#F5F0E6"),
      p("Pointed satin heels", 65000, "Shoes", "heel", "A 9cm stiletto in liquid satin.", "#C8A96A"),
    ],
  },
  plain: {
    storeName: "Kemi's Corner", city: "Ibadan", industry: "a bit of everything", description: "Good everyday things, simply sold.",
    heroArt: ["bag", "candle", "jar"], mains: ["#111111", "#6B6B6B", "#B91C1C"],
    products: [
      p("Cotton crew tee", 8500, "Clothing", "shirt", "Heavyweight cotton, boxy fit.", "#BDBDBD"),
      p("Canvas tote", 9000, "Bags", "bag", "Sturdy canvas with an inside pocket.", "#D6D3CB"),
      p("Scented soy candle", 7500, "Home", "candle", "Hand-poured, 40-hour burn.", "#F3EDE2"),
      p("Shea body butter", 6000, "Beauty", "jar", "Whipped raw shea with a little coconut oil.", "#E9DCC3"),
      p("Stoneware mug", 5500, "Home", "cup", "Speckled glaze, 350ml.", "#9CA3AF"),
      p("Leather sandals", 14000, "Shoes", "sandal", "Hand-stitched in Aba.", "#92400E"),
    ],
  },
  adire: {
    storeName: "Indigo House", city: "Abẹ́òkúta", industry: "editorial fashion", description: "Hand-dyed adire, cut into pieces you'll wear for years.",
    heroArt: ["dress", "robe", "fabric-roll"], mains: ["#1E3A8A", "#3730A3", "#B8612F"],
    products: [
      p("Adire indigo maxi dress", 32000, "Dresses", "dress", "Hand-dyed in Abẹ́òkúta, cut long and loose.", "#1E3A8A"),
      p("Adire kaftan", 27000, "Kaftans", "robe", "A relaxed kaftan with side slits.", "#1E40AF"),
      p("Tie-dye shirt", 16000, "Shirts", "shirt", "Cotton shirt with a cloud tie-dye.", "#3730A3"),
      p("Adire fabric, 4 yards", 14500, "Fabrics", "fabric-roll", "Starch-resist adire, ready to sew.", "#1E3A8A"),
      p("Batik headwrap", 6500, "Accessories", "gele", "Soft cotton batik, easy to tie.", "#B8612F"),
      p("Indigo tote", 11000, "Bags", "bag", "Adire-dyed canvas tote.", "#312E81"),
    ],
  },
  pantry: {
    storeName: "Mama Bisi's", city: "Lagos", industry: "food and drinks", description: "Home-made drinks, sauces and small chops.",
    heroArt: ["bottle", "jar", "bowl"], mains: ["#9F1239", "#E2541B", "#92400E"],
    products: [
      p("Zobo drink, 1 litre", 2500, "Drinks", "bottle", "Hibiscus with ginger and pineapple. Served chilled.", "#9F1239"),
      p("Chapman, 1 litre", 3000, "Drinks", "bottle", "The party classic, with cucumber and lemon.", "#DC2626"),
      p("Tigernut kunu", 2000, "Drinks", "bottle", "Creamy tigernut and dates, no added sugar.", "#D4A373"),
      p("Pepper sauce, 350g", 4500, "Sauces", "jar", "Scotch bonnet, onion and palm oil.", "#B91C1C"),
      p("Suya spice, 200g", 3500, "Spices", "jar", "Yaji the way the mallam makes it.", "#92400E"),
      p("Small chops pack (20)", 9500, "Small chops", "bowl", "Puff puff, samosa, spring rolls and gizdodo.", "#E2541B"),
      p("Party jollof & chicken", 4500, "Meals", "plate", "Smoky jollof, plantain and grilled chicken.", "#E2541B"),
    ],
  },
  ile: {
    storeName: "Ilé Living", city: "Abuja", industry: "home and living", description: "Calm, handmade pieces for the home.",
    heroArt: ["lamp", "vase", "cushion"], mains: ["#5E7464", "#B08D57", "#C2410C"],
    products: [
      p("Woven raffia lamp", 38000, "Lighting", "lamp", "Hand-woven shade on a turned wood base.", "#C8A15A"),
      p("Terracotta vase", 16000, "Decor", "vase", "Hand-thrown clay with a matte finish.", "#B45309"),
      p("Aṣọ-òkè throw cushion", 12500, "Cushions", "cushion", "Woven aṣọ-òkè front, linen back.", "#5E7464"),
      p("Lemongrass candle", 9000, "Decor", "candle", "Soy wax, 45-hour burn.", "#E7E5E4"),
      p("Rattan side chair", 85000, "Furniture", "chair", "Rattan and iroko, made in Ikorodu.", "#8C6A43"),
      p("Clay cooking pot", 14000, "Kitchen", "pot", "Traditional clay pot for slow soups.", "#9A3412"),
    ],
  },
  plug: {
    storeName: "Gadget Plug", city: "Lagos", industry: "gadgets", description: "Phones, audio and power, tested before they leave.",
    heroArt: ["phone", "headphones", "speaker"], mains: ["#5B8CFF", "#2A2E37", "#9AA1AC"],
    products: [
      p("Smartphone, 128GB", 285000, "Phones", "phone", "6.5\" display, dual SIM, 5000mAh battery.", "#5B8CFF"),
      p("Wireless headphones", 45000, "Audio", "headphones", "Over-ear, 30-hour battery, noise reduction.", "#2A2E37"),
      p("Bluetooth speaker", 32000, "Audio", "speaker", "Splash-proof, 12-hour play.", "#5B8CFF"),
      p("Power bank, 20,000mAh", 18500, "Power", "powerbank", "Two USB ports and fast charging.", "#E5E7EB", 22000),
      p("14\" laptop, 512GB", 520000, "Laptops", "laptop", "16GB RAM, backlit keyboard.", "#9AA1AC"),
      p("Smartwatch", 38000, "Wearables", "watch", "Heart rate, sleep and step tracking.", "#2A2E37"),
    ],
  },
  stride: {
    storeName: "Waka Kicks", city: "Lagos", industry: "shoes", description: "Sneakers and slides for every kind of waka.",
    heroArt: ["sneaker", "sandal", "sneaker"], mains: ["#FF4D1F", "#141414", "#1D4ED8"],
    products: [
      p("Runner sneakers", 42000, "Sneakers", "sneaker", "Light mesh upper, cushioned sole.", "#F97316"),
      p("Court sneakers", 38000, "Sneakers", "sneaker", "Clean white leather, goes with everything.", "#E5E7EB"),
      p("Leather slides", 15000, "Slides", "sandal", "Hand-made in Aba, cushioned footbed.", "#78350F"),
      p("Block heels", 26000, "Heels", "heel", "A steady 6cm block heel.", "#DB2777"),
      p("High-top sneakers", 48000, "Sneakers", "sneaker", "Padded collar, grippy sole.", "#1D4ED8", 55000),
      p("Sports cap", 7500, "Accessories", "cap", "Breathable, adjustable strap.", "#141414"),
    ],
  },
  ewa: {
    storeName: "Glow by Ifeoma", city: "Enugu", industry: "beauty and skincare", description: "Simple skincare with shea, black soap and botanicals.",
    heroArt: ["jar", "dropper", "soap"], mains: ["#C2566B", "#E9C9B7", "#8A5A44"],
    products: [
      p("Whipped shea body butter", 8500, "Body", "jar", "Raw shea and cocoa butter, whipped light.", "#E9C9B7"),
      p("Vitamin C serum, 30ml", 14000, "Face", "dropper", "Brightening serum for dull skin.", "#F59E0B"),
      p("African black soap", 4500, "Cleansers", "soap", "Plantain-ash black soap with shea.", "#3F2A1E"),
      p("Hydrating face cream", 11500, "Face", "jar", "Light daily moisturiser with aloe.", "#FCE7F3"),
      p("Tinted lip balm", 6500, "Lips", "lipstick", "Sheer berry tint with shea.", "#C2566B"),
      p("Sunscreen SPF 50", 12000, "Face", "tube", "No white cast on deep skin tones.", "#FDE68A"),
      p("Glow body oil", 9000, "Body", "bottle", "Jojoba and sweet almond with a soft shimmer.", "#D97706"),
    ],
  },
  suku: {
    storeName: "Crown by Zainab", city: "Abuja", industry: "hair and wigs", description: "Wigs, braids and hair care, ready to wear.",
    heroArt: ["wig", "wig", "comb"], mains: ["#1C1917", "#B45309", "#E0679E"],
    products: [
      p("Bone straight wig, 20\"", 185000, "Wigs", "wig", "13x4 lace frontal, pre-plucked.", "#1C1917"),
      p("Kinky curly wig, 16\"", 145000, "Wigs", "wig", "Full, natural-looking curls.", "#3F2A1E"),
      p("Knotless braid wig", 95000, "Braids", "wig", "Waist-length knotless braids on a lace cap.", "#111827"),
      p("Honey blonde bob", 120000, "Wigs", "wig", "Blunt bob in honey blonde.", "#B45309", 135000),
      p("Edge control", 4500, "Hair care", "jar", "Strong hold, no flakes.", "#E0679E"),
      p("Wide-tooth comb", 2500, "Tools", "comb", "Gentle on curls and wigs.", "#2A1630"),
      p("Satin bonnet", 5000, "Accessories", "cap", "Double-layer satin to protect your hair overnight.", "#E0679E"),
    ],
  },
  asoebi: {
    storeName: "Bímpé Fabrics", city: "Lagos", industry: "fabrics and lace", description: "Lace, ankara, aṣọ-òkè and george for every owambe.",
    heroArt: ["fabric-fold", "gele", "fabric-roll"], mains: ["#7C3AED", "#D4A13A", "#BE123C"],
    products: [
      p("Swiss voile lace, 5 yards", 75000, "Lace", "fabric-fold", "Soft voile lace with stone detailing.", "#7C3AED"),
      p("Cord lace, 5 yards", 95000, "Lace", "fabric-fold", "Heavy cord lace for a structured look.", "#B45309"),
      p("Ankara wax print, 6 yards", 18000, "Ankara", "fabric-roll", "Bright, colour-fast cotton print.", "#EA580C"),
      p("Aṣọ-òkè set", 65000, "Aṣọ-òkè", "fabric-roll", "Hand-woven gele, ipele and ìró.", "#6D28D9"),
      p("George wrapper", 55000, "George", "fabric-fold", "Embroidered george for the big day.", "#BE123C"),
      p("Gele headtie", 12000, "Gele", "gele", "Stiff, shiny and easy to tie.", "#D4A13A"),
    ],
  },
  agbada: {
    storeName: "Kọ́lá Tailors", city: "Ibadan", industry: "menswear", description: "Agbada, kaftans and native wear, cut to fit.",
    heroArt: ["robe", "cap", "shirt"], mains: ["#E7E5E4", "#1E3A5F", "#B08D57"],
    products: [
      p("Three-piece agbada", 95000, "Agbada", "robe", "Agbada, buba and sokoto with hand embroidery.", "#E7E5E4"),
      p("Senator kaftan", 48000, "Kaftan", "robe", "Clean senator cut in cashmere-feel fabric.", "#1E3A5F"),
      p("Embroidered buba & sokoto", 62000, "Native wear", "shirt", "Matching set with neck embroidery.", "#6B7280"),
      p("Tailored trousers", 22000, "Trousers", "trousers", "Slim cut with a clean break.", "#1A1F1C"),
      p("Fila cap", 8500, "Caps", "cap", "Aṣọ-òkè fila to finish the look.", "#B08D57"),
      p("Kaftan for boys", 18000, "Kids", "shirt", "Mini senator kaftan, ages 4 to 12.", "#7C2D12"),
    ],
  },
  ileke: {
    storeName: "Ìlẹ̀kẹ̀ Studio", city: "Lagos", industry: "jewellery and beads", description: "Beads strung by hand, one piece at a time.",
    heroArt: ["necklace", "earrings", "bracelet"], mains: ["#C8462C", "#D4A13A", "#0F766E"],
    products: [
      p("Coral bead necklace", 38000, "Necklaces", "necklace", "Three-strand coral-style beads with a brass clasp.", "#C8462C"),
      p("Waist beads set", 7500, "Waist beads", "bracelet", "Three strands, tie-on, made to your size.", "#F59E0B"),
      p("Brass hoop earrings", 12000, "Earrings", "earrings", "Hand-hammered brass hoops.", "#D4A13A"),
      p("Glass bead bracelet", 6500, "Bracelets", "bracelet", "Recycled glass beads from Bida.", "#0F766E"),
      p("Gold-plated ring", 15000, "Rings", "ring", "A slim band with a small stone.", "#C8462C"),
      p("Layered bead necklace", 24000, "Necklaces", "necklace", "Two lengths, worn together or apart.", "#7C2D12"),
    ],
  },
  ounje: {
    storeName: "Buka by Funmi", city: "Lagos", industry: "restaurant and food delivery", description: "Home-style Nigerian food, cooked fresh every day.",
    heroArt: ["plate", "bowl", "cup"], mains: ["#E2541B", "#14532D", "#B45309"],
    products: [
      p("Jollof rice & chicken", 4500, "Rice", "plate", "Smoky party jollof, fried plantain and grilled chicken.", "#E2541B"),
      p("Amala, ewédú & gbẹ̀gìrì", 3800, "Swallow", "bowl", "Soft amala with ewédú, gbẹ̀gìrì and stew.", "#3F6212"),
      p("Pounded yam & egusi", 5000, "Swallow", "bowl", "Egusi with spinach, assorted meat and stockfish.", "#CA8A04"),
      p("Fried rice & turkey", 5500, "Rice", "plate", "Vegetable fried rice with peppered turkey.", "#65A30D"),
      p("Goat meat pepper soup", 4000, "Soups", "bowl", "Spicy, light and warming.", "#B91C1C"),
      p("Ofada rice & ayamase", 4800, "Rice", "plate", "Local rice with green pepper sauce and egg.", "#4D7C0F"),
      p("Chapman, 50cl", 1500, "Drinks", "cup", "Our house Chapman, served cold.", "#DC2626"),
      p("Suya platter", 6000, "Grills", "plate", "Beef suya with onions, tomatoes and yaji.", "#92400E"),
    ],
  },
  chinchin: {
    storeName: "Sugar & Spice Bakery", city: "Port Harcourt", industry: "bakery and snacks", description: "Cakes, chin chin and pastries, baked to order.",
    heroArt: ["cake", "cupcake", "snack-jar"], mains: ["#D9467A", "#F59E0B", "#7C2D12"],
    products: [
      p("Red velvet cake, 8\"", 32000, "Cakes", "cake", "Two layers with cream cheese frosting.", "#B91C1C"),
      p("Chin chin jar, 1kg", 6500, "Snacks", "snack-jar", "Crunchy, lightly sweet, with a hint of nutmeg.", "#D97706"),
      p("Meat pie, box of 6", 7200, "Pastries", "pie", "Buttery crust with minced beef and potato.", "#CA8A04"),
      p("Cupcakes, box of 6", 9000, "Cupcakes", "cupcake", "Vanilla and chocolate with buttercream.", "#F9A8D4"),
      p("Puff puff, pack of 20", 3000, "Snacks", "bowl", "Soft and golden, dusted with sugar.", "#D97706"),
      p("Banana bread loaf", 5500, "Breads", "bread", "Moist, with walnuts.", "#92400E"),
      p("Chocolate celebration cake", 45000, "Cakes", "cake", "Three layers of chocolate for big days.", "#4A2511", 50000),
    ],
  },
  oja: {
    storeName: "Ọjà Express", city: "Lagos", industry: "groceries", description: "Your weekly shop, delivered.",
    heroArt: ["basket", "sack", "bottle"], mains: ["#0F7A3D", "#F59E0B", "#B91C1C"],
    products: [
      p("Long grain rice, 5kg", 12500, "Grains", "sack", "Stone-free parboiled rice.", "#D6C29A"),
      p("Vegetable oil, 3 litres", 9800, "Oils", "bottle", "Cholesterol-free vegetable oil.", "#FACC15"),
      p("Ijebu garri, 2kg", 3200, "Grains", "sack", "Sharp and crunchy, great for soaking.", "#E9D9A6"),
      p("Instant noodles, carton of 40", 11000, "Pantry", "sack", "Chicken flavour, 70g packs.", "#F97316"),
      p("Laundry detergent, 2kg", 5400, "Household", "soap", "Powder detergent for hand and machine wash.", "#3B82F6"),
      p("Tomato paste, pack of 10", 4000, "Pantry", "jar", "Double-concentrated, 70g sachets.", "#DC2626"),
      p("Crate of eggs (30)", 5800, "Fresh", "eggs", "Fresh large eggs.", "#D6B98C"),
      p("Bathing soap, pack of 6", 3600, "Household", "soap", "Gentle, everyday bar soap.", "#A7F3D0"),
      p("Chocolate drink tin, 900g", 4800, "Beverages", "jar", "Malted chocolate drink.", "#78350F"),
      p("Plantain, bunch", 4500, "Fresh", "basket", "Firm, ripening plantain.", "#EAB308"),
      p("Semolina, 2kg", 3900, "Grains", "sack", "Fine semolina for swallow.", "#FDE68A"),
      p("Bottled water, pack of 12", 2800, "Beverages", "bottle", "75cl table water.", "#93C5FD"),
    ],
  },
  omo: {
    storeName: "Little Ọmọ", city: "Lagos", industry: "kids and baby", description: "Soft, sturdy things for little ones.",
    heroArt: ["teddy", "blocks", "onesie"], mains: ["#3D7BF7", "#FF7A59", "#FFD54A"],
    products: [
      p("Cotton onesie set (3)", 12000, "Baby", "onesie", "Soft cotton, snap buttons, 0 to 12 months.", "#93C5FD"),
      p("Plush teddy bear", 9500, "Toys", "teddy", "Extra soft, 30cm.", "#D6A26B"),
      p("Alphabet building blocks", 8000, "Toys", "blocks", "26 wooden blocks with letters.", "#FF7A59"),
      p("Kids' sneakers", 15000, "Shoes", "sneaker", "Velcro straps for quick mornings.", "#3D7BF7"),
      p("Gentle baby lotion", 3500, "Baby care", "tube", "Fragrance-free with shea.", "#FDE68A"),
      p("Girls' ankara dress", 11500, "Clothing", "dress", "Twirly ankara dress, ages 2 to 8.", "#EA580C"),
      p("School backpack", 13500, "School", "bag", "Padded straps and a water bottle pocket.", "#1F2A44"),
    ],
  },
  iwe: {
    storeName: "Ìwé Books", city: "Yaba, Lagos", industry: "books and stationery", description: "New and loved books, notebooks and pens.",
    heroArt: ["book", "notebook", "pen"], mains: ["#B4432F", "#1E2235", "#0F766E"],
    products: [
      p("Harmattan Letters (novel)", 7500, "Fiction", "book", "A sample title: letters between two sisters, Kano to Lagos.", "#B4432F"),
      p("Lagos After Rain (novel)", 8500, "Fiction", "book", "A sample title: one wet weekend on the mainland.", "#1E2235"),
      p("Small Joys (poems)", 5500, "Poetry", "book", "A sample title: short poems about ordinary days.", "#0F766E"),
      p("Everyday Yorùbá phrasebook", 6000, "Learning", "book", "A sample title: phrases for markets, greetings and family.", "#CA8A04"),
      p("Bedtime tales for kids", 4500, "Children", "book", "A sample title: ten short stories to read aloud.", "#7C3AED"),
      p("A5 dotted notebook", 3500, "Stationery", "notebook", "160 pages, lay-flat binding.", "#1E2235"),
      p("Gel pen set (6)", 2500, "Stationery", "pen", "Smooth 0.5mm gel pens.", "#B4432F"),
      p("2027 weekly planner", 6500, "Stationery", "notebook", "Week-to-view with notes pages.", "#B4432F"),
    ],
  },
  owambe: {
    storeName: "Owambe Rentals", city: "Lagos", industry: "events and rentals", description: "Chairs, canopies and décor for your celebration.",
    heroArt: ["balloons", "canopy", "chair"], mains: ["#F2B705", "#E85D9E", "#2D0B3A"],
    products: [
      p("Chiavari chair (hire, per day)", 1500, "Chairs", "chair", "Gold chiavari chair with cushion. Minimum 50.", "#D4A017"),
      p("Canopy 20x20 (hire)", 35000, "Canopies", "canopy", "Set up and taken down by our crew.", "#F5F5F4"),
      p("Balloon arch kit", 28000, "Décor", "balloons", "120 balloons, strip and glue dots.", "#E85D9E"),
      p("Souvenir mugs (50)", 75000, "Souvenirs", "cup", "Printed with your names and date.", "#FFFFFF"),
      p("Table centrepiece vase", 6000, "Décor", "vase", "Gold-rim glass vase.", "#F2B705"),
      p("Candle light set (12)", 12000, "Décor", "candle", "Warm LED candles for tables.", "#FDE68A"),
    ],
  },
  danfo: {
    storeName: "Danfo Auto Parts", city: "Ladipo, Lagos", industry: "auto parts", description: "Genuine and quality parts, checked before dispatch.",
    heroArt: ["tyre", "battery", "oil-can"], mains: ["#FFC400", "#111111", "#6B7280"],
    products: [
      p("205/55 R16 tyre", 68000, "Tyres", "tyre", "All-season tyre. Fitting available in Lagos.", "#4B5563"),
      p("Car battery, 75Ah", 85000, "Electrical", "battery", "Maintenance-free, 12-month warranty.", "#FFC400"),
      p("Engine oil 5W-30, 4L", 32000, "Oils", "oil-can", "Fully synthetic.", "#FFC400"),
      p("Headlamp assembly (left)", 45000, "Lighting", "headlamp", "Tell us your car's make, model and year before ordering.", "#9CA3AF"),
      p("Brake pad set (front)", 18500, "Brakes", "wrench", "Low-dust ceramic pads.", "#6B7280"),
      p("Wiper blades (pair)", 6500, "Accessories", "wrench", "Frameless, quiet wipe.", "#111111"),
      p("Spark plugs (set of 4)", 12000, "Engine", "wrench", "Iridium tip.", "#9CA3AF"),
      p("Alloy rim, 16\"", 55000, "Tyres", "tyre", "Five-spoke alloy, sold singly.", "#D1D5DB"),
      p("Coolant, 4L", 9500, "Oils", "oil-can", "Ready-mixed, long life.", "#22C55E"),
      p("Tool kit (40 pieces)", 22000, "Tools", "wrench", "Sockets, spanners and screwdrivers in a case.", "#DC2626"),
      p("Jump starter", 48000, "Electrical", "battery", "Starts cars up to 3.0L.", "#111111"),
      p("Fog lamp pair", 24000, "Lighting", "headlamp", "Bright LED fog lamps.", "#FFC400"),
    ],
  },
  turare: {
    storeName: "Turare House", city: "Kano", industry: "perfume", description: "Oud, musk and perfume oils blended in Kano.",
    heroArt: ["perfume", "dropper", "perfume"], mains: ["#7C2D12", "#C9A46A", "#BE185D"],
    products: [
      p("Oud Intense, 50ml", 38000, "Oud", "perfume", "Smoky oud with saffron and rose.", "#7C2D12"),
      p("Rose Musk, 100ml", 29000, "Floral", "perfume", "Soft rose over white musk.", "#BE185D"),
      p("Amber Nights, 50ml", 34000, "Oriental", "perfume", "Warm amber, vanilla and spice.", "#92400E"),
      p("Vanilla body mist", 9500, "Body mists", "bottle", "Light vanilla for every day.", "#F5E6C8"),
      p("Sandalwood perfume oil, 12ml", 7500, "Perfume oils", "dropper", "Alcohol-free, long-lasting.", "#B45309"),
      p("Bakhoor, 40g", 6000, "Home scents", "candle", "Scented wood chips for the home.", "#4C1D95"),
    ],
  },
  oko: {
    storeName: "Oko Fresh Farms", city: "Ògùn", industry: "farm produce", description: "Eggs, tubers and greens from our farm to your door.",
    heroArt: ["basket", "eggs", "leaf"], mains: ["#2F5D2A", "#E0A526", "#8C5E30"],
    products: [
      p("Crate of eggs (30)", 5800, "Poultry", "eggs", "Collected this week from free-range layers.", "#8C5E30"),
      p("Yam tubers (5)", 12000, "Tubers", "yam", "Firm, white yam from the new harvest.", "#8C5E30"),
      p("Fresh ugu leaves, bundle", 1500, "Vegetables", "leaf", "Cut the morning of delivery.", "#2F5D2A"),
      p("Plantain, bunch", 4500, "Fruits", "basket", "Green to ripening, your choice.", "#E0A526"),
      p("Garri, 10kg", 14000, "Grains", "sack", "White garri, sieved fine.", "#D9C99A"),
      p("Fresh tomatoes, basket", 18000, "Vegetables", "basket", "Roma tomatoes, sorted.", "#DC2626", 21000),
      p("Smoked catfish, pack of 4", 8000, "Fish", "bowl", "Pond-raised and oven-smoked.", "#7C2D12"),
      p("Red palm oil, 5L", 11000, "Oils", "bottle", "Unbleached, from our own palms.", "#C2410C"),
    ],
  },
  aaro: {
    storeName: "Àárọ̀ Goods", city: "Abuja", industry: "everyday essentials", description: "Simple, well-made things for every day.",
    heroArt: ["shirt", "bag", "cup"], mains: ["#121212", "#9CA3AF", "#C2B59B"],
    products: [
      p("Heavyweight cotton tee", 9500, "Clothing", "shirt", "Boxy fit in thick, soft cotton.", "#F5F5F5"),
      p("Canvas tote bag", 7500, "Bags", "bag", "Natural canvas with a deep inside pocket.", "#C2B59B"),
      p("Stoneware mug", 6000, "Home", "cup", "Hand-glazed, holds a big cup of tea.", "#9CA3AF"),
      p("White low-top sneakers", 32000, "Shoes", "sneaker", "Clean leather sneakers that go with everything.", "#F5F5F5", 38000),
      p("Linen notebook", 4500, "Stationery", "notebook", "A5, lined pages, linen cover.", "#C2B59B"),
      p("Classic sunglasses", 14000, "Accessories", "watch", "Black frames with UV protection.", "#121212"),
    ],
  },
  highlife: {
    storeName: "Highlife Supply", city: "Lagos", industry: "lifestyle", description: "Colourful everyday pieces with a retro Lagos groove.",
    heroArt: ["shirt", "cap", "bag"], mains: ["#E4572E", "#2B2D7C", "#F2C14E"],
    products: [
      p("Groove graphic tee", 14500, "Tees", "shirt", "Soft cotton tee with a retro print.", "#E4572E"),
      p("Bucket hat", 9000, "Hats", "cap", "Reversible, one side bold print.", "#2B2D7C"),
      p("Vinyl record, highlife classics", 18000, "Music", "speaker", "A pressing of golden-era highlife hits.", "#111111"),
      p("Retro round sunglasses", 12000, "Accessories", "watch", "Tinted lenses, gold-tone frames.", "#B45309"),
      p("Colour-block tote", 11000, "Bags", "bag", "Heavy canvas in three bright panels.", "#F2C14E", 13500),
      p("Striped crew socks, 3 pairs", 6500, "Socks", "onesie", "Cushioned socks in three colourways.", "#2B2D7C"),
    ],
  },
  oba: {
    storeName: "Ọba Atelier", city: "Lagos", industry: "luxury", description: "Pieces made slowly, by hand, to be kept.",
    heroArt: ["dress", "bag", "bracelet"], mains: ["#1C1C1C", "#9C7C4F", "#E5DFD5"],
    products: [
      p("Gold-plated cuff", 85000, "Jewellery", "bracelet", "Hand-hammered brass cuff with 18k gold plating.", "#9C7C4F"),
      p("Silk twill scarf", 48000, "Accessories", "fabric-fold", "Hand-rolled edges, printed in-house.", "#7C2D12"),
      p("Leather loafers", 120000, "Shoes", "heel", "Calf leather, hand-stitched, leather sole.", "#3A2A1A"),
      p("Structured top-handle bag", 165000, "Bags", "bag", "Smooth leather with brushed gold hardware.", "#1C1C1C"),
      p("Pearl drop earrings", 62000, "Jewellery", "earrings", "Freshwater pearls on gold-filled hooks.", "#E5DFD5"),
      p("Tailored wool coat", 210000, "Clothing", "robe", "Single-breasted, fully lined.", "#6B6258"),
    ],
  },
  gbedu: {
    storeName: "Gbẹ̀du Sound", city: "Lagos", industry: "audio and streetwear", description: "Loud sound and louder fits for people who turn it up.",
    heroArt: ["headphones", "speaker", "sneaker"], mains: ["#8B5CF6", "#EC4899", "#111111"],
    products: [
      p("Wireless headphones", 145000, "Audio", "headphones", "Noise cancelling, 40 hours of play.", "#111111", 165000),
      p("Portable speaker", 68000, "Audio", "speaker", "Waterproof, deep bass, 20 hours.", "#8B5CF6"),
      p("True wireless earbuds", 52000, "Audio", "headphones", "Compact case with fast charging.", "#F5F5F7"),
      p("Heavyweight hoodie", 38000, "Apparel", "shirt", "Oversized fit, brushed fleece inside.", "#111111"),
      p("High-top sneakers", 78000, "Footwear", "sneaker", "Padded collar, grippy sole.", "#EC4899"),
      p("Game controller", 42000, "Gaming", "powerbank", "Wireless, works with phones and consoles.", "#1F2937"),
    ],
  },
  omalicha: {
    storeName: "Ọmalịcha Skin", city: "Enugu", industry: "beauty and wellness", description: "Gentle skincare and body care made for our sun.",
    heroArt: ["jar", "dropper", "tube"], mains: ["#B3477D", "#F3E3F0", "#3A2341"],
    products: [
      p("Hydrating face serum, 30ml", 12500, "Serums", "dropper", "Hyaluronic acid and aloe for thirsty skin. Morning and night.", "#F3E3F0"),
      p("Whipped shea body butter", 8500, "Body", "jar", "Raw shea and cocoa butter, whipped light. Lasts all day.", "#F5E6C8"),
      p("Gentle foaming cleanser", 7800, "Cleansers", "tube", "Low-foam, soap-free, leaves skin soft not tight.", "#FFFFFF"),
      p("Vitamin C glow cream", 14000, "Moisturisers", "jar", "Brightens dark spots with steady use.", "#F59E0B", 16500),
      p("Black soap bar", 3500, "Body", "soap", "Plantain-ash African black soap, made in small batches.", "#3A2341"),
      p("Mineral sunscreen SPF 50", 11000, "Sun care", "tube", "No white cast on deep skin tones.", "#FDE68A"),
    ],
  },
  zuma: {
    storeName: "Zuma Workshop", city: "Kano", industry: "handmade crafts", description: "Pottery, leather and woven pieces, made by hand in Kano.",
    heroArt: ["vase", "basket", "bag"], mains: ["#B8792C", "#3B2A1A", "#8C5E30"],
    products: [
      p("Hand-thrown clay vase", 18000, "Pottery", "vase", "Wheel-thrown terracotta with a matte glaze.", "#B45309"),
      p("Woven raffia basket", 12500, "Baskets", "basket", "Hand-woven raffia with leather handles.", "#C8A15A"),
      p("Kano leather tote", 32000, "Leather", "bag", "Vegetable-tanned goat leather, hand-stitched.", "#8C5E30"),
      p("Beeswax candle, set of 2", 9000, "Candles", "candle", "Pure beeswax, cotton wick, honey scent.", "#F2C14E"),
      p("Ceramic serving bowl", 15000, "Pottery", "bowl", "Speckled glaze, food safe.", "#E7DCCB"),
      p("Hand-dyed throw cushion", 14500, "Textiles", "cushion", "Indigo-dyed cotton with a hidden zip.", "#1E3A8A"),
    ],
  },
  oku: {
    storeName: "Ọkụ Athletics", city: "Lagos", industry: "sport and activewear", description: "Kit for runners, ballers and early-morning gym people.",
    heroArt: ["sneaker", "shirt", "bottle"], mains: ["#0F0F0F", "#D4FF3A", "#9CA3AF"],
    products: [
      p("Running shoes", 58000, "Footwear", "sneaker", "Light, cushioned and grippy on wet roads.", "#0F0F0F", 65000),
      p("Training tee", 12000, "Tops", "shirt", "Quick-dry fabric that doesn't cling.", "#D4FF3A"),
      p("Football jersey", 18500, "Football", "shirt", "Breathable mesh, slim fit.", "#16A34A"),
      p("Gym duffel bag", 22000, "Bags", "bag", "Shoe pocket and wet compartment.", "#111111"),
      p("Steel water bottle, 1L", 9500, "Accessories", "bottle", "Keeps water cold for 24 hours.", "#9CA3AF"),
      p("Running shorts", 11000, "Bottoms", "trousers", "Built-in liner and a zip pocket.", "#1F2937"),
    ],
  },
  ihe: {
    storeName: "Ìhè Gallery", city: "Lagos", industry: "art and prints", description: "Original works and prints by artists from across Nigeria.",
    heroArt: ["vase", "lamp", "book"], mains: ["#C2410C", "#1A1A1A", "#D6D3CE"],
    products: [
      p("Harmattan, giclée print", 45000, "Prints", "book", "Archival print on cotton rag, 50 × 70 cm.", "#D6D3CE"),
      p("Market women, oil on canvas", 380000, "Originals", "book", "Original oil painting, 90 × 120 cm.", "#C2410C"),
      p("Lagos at dusk, photograph", 65000, "Photography", "book", "Signed photographic print, 40 × 60 cm.", "#1A1A1A"),
      p("Abstract no. 7, print", 38000, "Prints", "book", "Limited edition of 50, 50 × 50 cm.", "#2563EB"),
      p("Stoneware sculpture", 120000, "Objects", "vase", "Hand-built stoneware, 35 cm tall.", "#78716C"),
      p("Portrait study, charcoal", 95000, "Originals", "book", "Charcoal on paper, framed, 40 × 50 cm.", "#44403C"),
    ],
  },
  kasuwa: {
    storeName: "Kasuwa Mega Store", city: "Kaduna", industry: "big catalogue", description: "Electronics, home, kitchen and groceries, all in one cart.",
    heroArt: ["phone", "pot", "sack"], mains: ["#0B3B8C", "#FFB800", "#111827"],
    products: [
      p("Smartphone, 128GB", 185000, "Phones", "phone", "6.6\" screen, dual SIM, 5000mAh battery.", "#111827", 199000),
      p("Bluetooth earbuds", 15500, "Electronics", "headphones", "20 hours with the case.", "#F5F5F5"),
      p("Electric kettle, 1.7L", 14000, "Kitchen", "pot", "Auto shut-off, stainless steel.", "#9CA3AF"),
      p("Non-stick pot set", 38000, "Kitchen", "pot", "Three pots with glass lids.", "#111827"),
      p("Long grain rice, 25kg", 52000, "Groceries", "sack", "Stone-free, parboiled.", "#F5F5F4"),
      p("Power bank, 20000mAh", 18000, "Electronics", "powerbank", "Charges two phones at once.", "#0B3B8C"),
      p("Standing fan, 18\"", 42000, "Home", "lamp", "Three speeds and a timer.", "#FFFFFF"),
      p("Bedsheet set, 6 by 6", 21000, "Home", "cushion", "Cotton blend, four pillowcases.", "#93C5FD"),
      p("Vegetable oil, 5L", 16500, "Groceries", "bottle", "Pure soya oil.", "#FBBF24"),
      p("Laptop backpack", 19500, "Bags", "bag", "Fits 15.6\" laptops, USB port.", "#1F2937"),
    ],
  },
  nkata: {
    storeName: "Nkata & Co.", city: "Owerri", industry: "classic fashion and home", description: "Everyday pieces made well, for the wardrobe and the home.",
    heroArt: ["shirt", "bag", "vase"], mains: ["#2F3E46", "#A3684A", "#E7DFD3"],
    products: [
      p("Oxford cotton shirt", 18500, "Shirts", "shirt", "Crisp cotton, button-down collar.", "#93C5FD"),
      p("Leather crossbody bag", 34000, "Bags", "bag", "Adjustable strap, three pockets.", "#A3684A"),
      p("Linen trousers", 21000, "Trousers", "trousers", "Relaxed fit, drawstring waist.", "#E7DFD3"),
      p("Woven straw hat", 9500, "Accessories", "cap", "Wide brim for the sun.", "#C8A15A"),
      p("Ceramic table lamp", 28000, "Home", "lamp", "Linen shade, warm light.", "#F5F5F4"),
      p("Knit cardigan", 24500, "Knitwear", "robe", "Soft cotton knit with wooden buttons.", "#2F3E46"),
    ],
  },
  uwa: {
    storeName: "Ụwa Edit", city: "Lagos", industry: "editorial lifestyle", description: "A monthly edit of fashion, objects and good reads.",
    heroArt: ["dress", "book", "vase"], mains: ["#D7263D", "#111111", "#E2DCD0"],
    products: [
      p("Pleated wrap dress", 36000, "Fashion", "dress", "The dress of the season, in rust.", "#B45309"),
      p("The Lagos cookbook", 15000, "Books", "book", "Recipes from home kitchens across the city.", "#D7263D"),
      p("Hand-painted vase", 22000, "Objects", "vase", "Each one painted by hand, no two alike.", "#1E3A8A"),
      p("Leather sandals", 26000, "Fashion", "sandal", "Flat, strappy, made in Aba.", "#8C5E30"),
      p("Linen tote", 9500, "Fashion", "bag", "Big enough for the market and a book.", "#E2DCD0"),
      p("Scented candle", 12000, "Objects", "candle", "Vetiver and lemongrass.", "#111111"),
    ],
  },
  sarauniya: {
    storeName: "Sarauniya", city: "Abuja", industry: "womenswear", description: "Occasion and everyday womenswear, designed in Abuja.",
    heroArt: ["dress", "heel", "bag"], mains: ["#1A1A1A", "#C9A27E", "#7F1D1D"],
    products: [
      p("Silk slip dress", 68000, "Dresses", "dress", "Bias-cut silk with adjustable straps.", "#C9A27E"),
      p("Tailored blazer", 75000, "Tailoring", "robe", "Single-breasted, fully lined.", "#1A1A1A"),
      p("Wide-leg trousers", 42000, "Tailoring", "trousers", "High waist, pressed crease.", "#E7E0D6"),
      p("Embellished evening gown", 165000, "Occasion", "dress", "Hand-beaded bodice, floor length.", "#7F1D1D", 190000),
      p("Strappy heeled sandals", 48000, "Shoes", "heel", "8cm block heel, padded sole.", "#1A1A1A"),
      p("Mini top-handle bag", 55000, "Bags", "bag", "Smooth leather, gold clasp.", "#C9A27E"),
    ],
  },
  zinariya: {
    storeName: "Zinariya Jewellers", city: "Kano", industry: "fine jewellery", description: "Gold and gemstone jewellery made at our bench in Kano.",
    heroArt: ["ring", "necklace", "earrings"], mains: ["#C9A24A", "#0F2E26", "#F5ECD7"],
    products: [
      p("18k gold signet ring", 285000, "Rings", "ring", "Solid 18k gold, made to your size.", "#C9A24A"),
      p("Diamond stud earrings", 420000, "Earrings", "earrings", "0.5ct total, set in white gold.", "#E5E7EB"),
      p("Gold chain necklace, 45cm", 310000, "Necklaces", "necklace", "18k gold rope chain.", "#C9A24A"),
      p("Emerald drop pendant", 365000, "Necklaces", "necklace", "Natural emerald on an 18k gold chain.", "#047857"),
      p("Gold bangle", 240000, "Bracelets", "bracelet", "Polished 18k gold, hinged clasp.", "#C9A24A"),
      p("Pearl and gold earrings", 165000, "Earrings", "earrings", "Freshwater pearls with gold hooks.", "#F5ECD7"),
    ],
  },
  irawo: {
    storeName: "Ìràwọ̀ Audio", city: "Lagos", industry: "one-product brand", description: "One pair of headphones, made properly, with everything you need to go with them.",
    heroArt: ["headphones", "speaker", "bag"], mains: ["#FF5A36", "#2B1B17", "#FFE8D6"],
    products: [
      p("Ìràwọ̀ wireless headphones", 89000, "Headphones", "headphones", "40-hour battery, noise cancelling, folds flat.", "#2B1B17", 99000),
      p("Carry case", 9500, "Accessories", "bag", "Hard shell case with a cable pocket.", "#FF5A36"),
      p("Replacement ear cushions", 7500, "Accessories", "headphones", "Memory foam, clip on in seconds.", "#2B1B17"),
      p("Braided charging cable", 4500, "Accessories", "powerbank", "USB-C, 1.5m, won't tangle.", "#FFE8D6"),
      p("Headphone stand", 12000, "Accessories", "lamp", "Weighted walnut base.", "#8C5E30"),
      p("Gift box edition", 98000, "Headphones", "headphones", "Headphones, case and cable in a gift box.", "#FF5A36"),
    ],
  },
  asa: {
    storeName: "Àṣà Kitchen", city: "Ìbàdàn", industry: "heritage food", description: "Spices, oils and pastes made the way our grandmothers made them.",
    heroArt: ["jar", "bowl", "sack"], mains: ["#9E3B22", "#2E2A1F", "#C8A15A"],
    products: [
      p("Ata gígẹ̀ pepper mix", 4500, "Spices", "jar", "Dried pepper ground with crayfish and onion.", "#9E3B22"),
      p("Iru (locust beans), 250g", 3500, "Condiments", "jar", "Fermented the traditional way.", "#4A3B2A"),
      p("Ofada stew base", 6500, "Pastes", "jar", "Green pepper and palm oil base, ready to cook.", "#3F6212"),
      p("Red palm oil, 1L", 5500, "Oils", "bottle", "Unbleached, from Ọ̀yọ́ palms.", "#C2410C"),
      p("Ẹ̀gúsí, ground, 500g", 5000, "Seeds", "sack", "Peeled and ground melon seeds.", "#E7DCC0"),
      p("Ògì (pap), 1kg", 3000, "Grains", "sack", "Fermented corn, smooth and fresh.", "#F5F5F4"),
    ],
  },
  mmiri: {
    storeName: "Mmiri Drinks", city: "Port Harcourt", industry: "drinks", description: "Cold-pressed juices and zobo, made fresh every morning.",
    heroArt: ["bottle", "cup", "bottle"], mains: ["#FFD23F", "#0B6BCB", "#DC2626"],
    products: [
      p("Zobo, 50cl", 1500, "Zobo", "bottle", "Hibiscus with ginger and pineapple.", "#7F1D1D"),
      p("Orange juice, 1L", 3500, "Juice", "bottle", "Cold-pressed, no added sugar.", "#F59E0B"),
      p("Pineapple ginger, 50cl", 1800, "Juice", "bottle", "Sweet and fiery.", "#FACC15"),
      p("Tigernut drink (kunu aya), 50cl", 2000, "Kunu", "bottle", "Creamy tigernut with dates.", "#E7DCC0"),
      p("Watermelon cooler, 1L", 3200, "Juice", "bottle", "Watermelon and mint.", "#F87171"),
      p("Party pack, 12 bottles", 16500, "Packs", "basket", "Mix any flavours for events.", "#0B6BCB", 19000),
    ],
  },
  uzo: {
    storeName: "Ụzọ Supply", city: "Abuja", industry: "travel and outdoor", description: "Bags and gear made for the road ahead.",
    heroArt: ["bag", "bottle", "cap"], mains: ["#3D5A40", "#1C1B18", "#C2B59B"],
    products: [
      p("Waxed canvas backpack", 48000, "Bags", "bag", "Water-resistant canvas, leather straps, laptop sleeve.", "#3D5A40"),
      p("Weekender duffel", 56000, "Bags", "bag", "Fits three days of clothes, with a shoe pocket.", "#8C5E30"),
      p("Insulated bottle", 11000, "Gear", "bottle", "Cold for 24 hours, hot for 12.", "#1C1B18"),
      p("Packable rain jacket", 38000, "Clothing", "robe", "Folds into its own pocket.", "#C2B59B"),
      p("Canvas cap", 8500, "Clothing", "cap", "Washed cotton, adjustable strap.", "#3D5A40"),
      p("Travel organiser pouch", 9500, "Gear", "bag", "Passport, cards, cables, all in one place.", "#1C1B18"),
    ],
  },
  rawa: {
    storeName: "Rawa Party Co.", city: "Lagos", industry: "party wear", description: "Loud outfits and accessories for every owambe, club night and birthday.",
    heroArt: ["dress", "earrings", "heel"], mains: ["#FF3D7F", "#FFE14D", "#151515"],
    products: [
      p("Sequin mini dress", 42000, "Dresses", "dress", "Silver sequins, stretch lining.", "#C0C0C0"),
      p("Hot pink co-ord set", 36000, "Sets", "shirt", "Cropped jacket and wide trousers.", "#FF3D7F"),
      p("Statement hoop earrings", 9500, "Accessories", "earrings", "Oversized gold-tone hoops.", "#FFE14D"),
      p("Platform heels", 32000, "Shoes", "heel", "Comfy platform, dance-all-night height.", "#151515"),
      p("Feather boa", 7500, "Accessories", "fabric-fold", "Soft feathers, 1.8m long.", "#FF3D7F"),
      p("Glitter clutch", 14500, "Bags", "bag", "Chain strap, fits a phone and lipstick.", "#FFE14D"),
    ],
  },
  fitila: {
    storeName: "Fitila Home", city: "Lagos", industry: "home and lighting", description: "Lamps, lights and furniture that make a room glow.",
    heroArt: ["lamp", "chair", "vase"], mains: ["#E8A33D", "#2A2420", "#F0E9DE"],
    products: [
      p("Rattan pendant light", 38000, "Lighting", "lamp", "Hand-woven rattan shade, 45cm.", "#C8A15A"),
      p("Brass table lamp", 46000, "Lighting", "lamp", "Brushed brass with a linen shade.", "#E8A33D"),
      p("Velvet accent chair", 165000, "Furniture", "chair", "Deep green velvet, solid wood legs.", "#14532D"),
      p("Ceramic floor vase", 28000, "Decor", "vase", "Matte glaze, 60cm tall.", "#F0E9DE"),
      p("Arc floor lamp", 72000, "Lighting", "lamp", "Marble base, adjustable arm.", "#2A2420"),
      p("Linen cushion set", 18000, "Textiles", "cushion", "Two cushions with feather inners.", "#C2B59B"),
    ],
  },
  oso: {
    storeName: "Ọ̀ṣọ́ Studio", city: "Lagos", industry: "fashion label", description: "Ready-to-wear with a love for details, cut in Lagos.",
    heroArt: ["dress", "bag", "earrings"], mains: ["#B23A48", "#141414", "#F2EDE6"],
    products: [
      p("Draped midi dress", 58000, "Dresses", "dress", "Fluid crepe with a draped neckline.", "#B23A48"),
      p("Oversized linen shirt", 32000, "Shirts", "shirt", "Dropped shoulders, mother-of-pearl buttons.", "#F2EDE6"),
      p("Pleated wide trousers", 38000, "Trousers", "trousers", "High waist, deep pleats.", "#141414"),
      p("Sculptural earrings", 16500, "Accessories", "earrings", "Hand-shaped brass.", "#C8A96A"),
      p("Mini bucket bag", 45000, "Bags", "bag", "Smooth leather, drawstring top.", "#7F1D1D"),
      p("Knit vest", 26000, "Knitwear", "shirt", "Fine cotton knit, V-neck.", "#C2B59B"),
    ],
  },
  shakara: {
    storeName: "Shakara Wear", city: "Lagos", industry: "streetwear", description: "Numbered drops from Lagos. No restocks, no dulling.",
    heroArt: ["shirt", "cap", "sneaker"], mains: ["#FF4F00", "#0A0A0A", "#E4E4DD"],
    products: [
      p("Drop 01 graphic tee", 18000, "Tees", "shirt", "Heavy cotton, puff print.", "#0A0A0A"),
      p("Cargo trousers", 32000, "Bottoms", "trousers", "Six pockets, adjustable hems.", "#4B5320"),
      p("Snapback cap", 12000, "Headwear", "cap", "Embroidered logo, flat brim.", "#FF4F00"),
      p("Oversized hoodie", 36000, "Tops", "shirt", "Brushed fleece, boxy fit.", "#E4E4DD"),
      p("Chunky sneakers", 68000, "Footwear", "sneaker", "Thick sole, mesh panels.", "#F5F5F4", 75000),
      p("Crossbody sling bag", 15000, "Bags", "bag", "Water-resistant, reflective strap.", "#0A0A0A"),
    ],
  },
  aga: {
    storeName: "Àga Furniture", city: "Lagos", industry: "furniture", description: "Chairs, tables and storage made in our Lagos workshop.",
    heroArt: ["chair", "lamp", "vase"], mains: ["#FBB710", "#131212", "#D6CFC4"],
    products: [
      p("White modern chair", 48000, "Chairs", "chair", "Moulded seat on solid wood legs.", "#F5F5F5"),
      p("Minimal plant pot", 9500, "Decor", "vase", "Matte ceramic, drainage hole and saucer.", "#E7E5E4"),
      p("Rocking chair", 95000, "Chairs", "chair", "Bent wood frame with a woven seat.", "#C8A15A"),
      p("Night stand", 62000, "Storage", "chair", "One drawer, solid iroko.", "#8C5E30"),
      p("Round side table", 38000, "Tables", "chair", "Powder-coated steel, 45cm.", "#131212"),
      p("Pendant lamp", 34000, "Lighting", "lamp", "Spun metal shade, warm white.", "#FBB710"),
    ],
  },
  itura: {
    storeName: "Ìtura Living", city: "Ìbàdàn", industry: "home and lifestyle", description: "Sofas, chairs and soft things for a home that feels good.",
    heroArt: ["chair", "cushion", "lamp"], mains: ["#FF3368", "#4FB3C8", "#F2B705"],
    products: [
      p("Wood and cloth sofa", 285000, "Sofas", "chair", "Three seats, solid wood frame, washable covers.", "#2563EB"),
      p("Foam lounge chair", 78000, "Chairs", "chair", "Moulded shell on hairpin legs.", "#FF7A00"),
      p("Rattan egg chair", 120000, "Chairs", "chair", "Hand-woven rattan with a deep cushion.", "#C8A15A"),
      p("Velvet pouf", 32000, "Ottomans", "cushion", "Buttoned velvet, solid base.", "#4FB3C8"),
      p("Mustard loveseat", 165000, "Sofas", "chair", "Two seats, tapered legs.", "#F2B705"),
      p("Throw blanket", 18500, "Textiles", "cushion", "Soft cotton knit, 130 × 170 cm.", "#E7E5E4", 22000),
    ],
  },
  gele: {
    storeName: "Gèlè & Co.", city: "Lagos", industry: "fashion", description: "Headties, dresses and accessories for every occasion.",
    heroArt: ["gele", "dress", "bag"], mains: ["#CA1515", "#111111", "#F4C2C2"],
    products: [
      p("Aso-oke gèlè, ready to wear", 18000, "Headties", "gele", "Pre-tied and adjustable, in rich aso-oke.", "#7C2D12"),
      p("Silk wrap dress", 42000, "Dresses", "dress", "Flowing silk-feel wrap with a tie waist.", "#CA1515", 48000),
      p("Beaded clutch", 16500, "Accessories", "bag", "Hand-beaded with a chain strap.", "#F2B705"),
      p("Coral bead necklace", 22000, "Accessories", "necklace", "Layered coral beads.", "#E86A4F"),
      p("Kids' ankara dress", 14000, "Kids", "dress", "Twirly ankara for little ones.", "#16A34A"),
      p("Lip and cheek tint", 6500, "Cosmetics", "lipstick", "Sheer colour for lips and cheeks.", "#BE185D"),
    ],
  },
  imani: {
    storeName: "Imani Store", city: "Kaduna", industry: "department store", description: "Menswear, womenswear and accessories in one store.",
    heroArt: ["shirt", "dress", "bag"], mains: ["#3B2E5A", "#4FC1E9", "#E86A9A"],
    products: [
      p("Striped round-neck tee", 9500, "Men", "shirt", "Cotton jersey, regular fit.", "#1E3A8A", 12000),
      p("Women's slim jeans", 18500, "Women", "trousers", "Stretch denim, high rise.", "#1D4ED8"),
      p("Running shoes", 32000, "Men", "sneaker", "Light mesh with a cushioned sole.", "#F97316"),
      p("Men's chinos", 16500, "Men", "trousers", "Cotton twill, slim fit.", "#2563EB"),
      p("Printed blouse", 14500, "Women", "shirt", "Floral print, relaxed fit.", "#F5F5F5"),
      p("Leather backpack", 28000, "Accessories", "bag", "Padded straps, laptop sleeve.", "#78350F"),
    ],
  },
  itanna: {
    storeName: "Ìtànná Kicks", city: "Abuja", industry: "sneakers", description: "Premium sneakers: comfort, design and performance in every pair.",
    heroArt: ["sneaker", "sneaker", "cap"], mains: ["#F59E0B", "#262626", "#F5F5F5"],
    products: [
      p("Cloud runner", 68000, "Running", "sneaker", "Breathable knit with a bouncy sole.", "#F5F5F5"),
      p("Court classic low", 54000, "Lifestyle", "sneaker", "Leather upper, clean white.", "#FFFFFF"),
      p("Trail grip mid", 82000, "Outdoor", "sneaker", "Water-resistant with a lug sole.", "#78350F"),
      p("Retro high-top", 72000, "Lifestyle", "sneaker", "Suede panels, padded collar.", "#DC2626", 79000),
      p("Everyday slip-on", 38000, "Lifestyle", "sneaker", "Canvas, no laces, all day comfort.", "#262626"),
      p("Sneaker care kit", 9500, "Care", "bottle", "Cleaner, brush and protector spray.", "#F59E0B"),
    ],
  },
  littafi: {
    storeName: "Littafi Books", city: "Kano", industry: "bookshop", description: "Novels, children's books and planners, delivered across Nigeria.",
    heroArt: ["book", "book", "notebook"], mains: ["#F86D72", "#7DD3C7", "#1F1F1F"],
    products: [
      p("The Harmattan House, paperback", 9500, "Fiction", "book", "A family saga across three generations in Kaduna.", "#F2B705"),
      p("Rain Over Ìbàdàn", 8500, "Fiction", "book", "A sharp, funny novel about four sisters.", "#F86D72", 10000),
      p("The River Remembers, anniversary edition", 7500, "Classics", "book", "A beloved classic, with a new foreword.", "#9A3412"),
      p("Bedtime stories for little ones", 6000, "Children", "book", "Twelve short stories with bright pictures.", "#7DD3C7"),
      p("2026 daily planner", 7000, "Stationery", "notebook", "A page a day, hardback, ribbon marker.", "#1F1F1F"),
      p("Poetry for quiet evenings", 5500, "Poetry", "book", "A slim collection of new Nigerian poets.", "#C4B5FD"),
    ],
  },
  itan: {
    storeName: "Ìtàn Bookhouse", city: "Lagos", industry: "literary books", description: "Literary fiction, poetry and rare finds, chosen one by one.",
    heroArt: ["book", "book", "book"], mains: ["#9C7A54", "#2F2F2F", "#E9E7DE"],
    products: [
      p("The Weaver's Daughter, hardback", 14500, "Fiction", "book", "A debut novel about marriage, loss and hope.", "#9C7A54"),
      p("A collection of Nigerian poetry", 9500, "Poetry", "book", "Fifty years of Nigerian poems in one volume.", "#2F2F2F"),
      p("An African history, illustrated", 22000, "History", "book", "A large-format history with maps and photographs.", "#78350F"),
      p("Essays on home and away", 11000, "Essays", "book", "Writers on leaving and coming back.", "#57534E", 13500),
      p("First edition, signed", 85000, "Rare books", "book", "A signed first edition from our rare shelf.", "#1C1917"),
      p("Reading journal", 6500, "Stationery", "notebook", "Log every book, with prompts and lists.", "#E9E7DE"),
    ],
  },
  awo: {
    storeName: "Àwọ̀ Fashion", city: "Lagos", industry: "fashion", description: "Everyday clothes and accessories in colours you'll wear.",
    heroArt: ["shirt", "bag", "sneaker"], mains: ["#FE4C50", "#1E1E27", "#F2B705"],
    products: [
      p("Hooded parka", 42000, "Men", "robe", "Water-resistant shell with a warm lining.", "#4C1D95", 48000),
      p("Canvas tote with leather trim", 18500, "Accessories", "bag", "Heavy canvas, leather handles.", "#3F6212"),
      p("Chunky knit jumper", 24000, "Women", "shirt", "Soft knit in mustard yellow.", "#F2B705"),
      p("Weekend duffel bag", 32000, "Accessories", "bag", "Water-resistant, shoe pocket.", "#6B7280"),
      p("Suede desert boots", 36000, "Men", "sneaker", "Classic suede, crepe sole.", "#C8A15A"),
      p("Aviator sunglasses", 14500, "Accessories", "watch", "Metal frame, UV protection.", "#1E1E27"),
    ],
  },
  kyau: {
    storeName: "Kyau Store", city: "Abuja", industry: "fashion", description: "Simple, good clothes for women and men.",
    heroArt: ["shirt", "dress", "watch"], mains: ["#717FE0", "#222222", "#F3F3F3"],
    products: [
      p("White ruffle shirt", 16500, "Women", "shirt", "Crisp cotton with a soft ruffle collar.", "#FFFFFF"),
      p("Pink tailored trousers", 21000, "Women", "trousers", "High waist, straight leg.", "#F9A8D4"),
      p("Blue check shirt", 15000, "Men", "shirt", "Cotton poplin, button-down collar.", "#93C5FD"),
      p("Classic trench coat", 58000, "Women", "robe", "Belted, water-resistant cotton.", "#78716C", 65000),
      p("Minimal black watch", 32000, "Watches", "watch", "Black dial, mesh strap.", "#111111"),
      p("Graphic print tee", 9500, "Men", "shirt", "Soft cotton with a front print.", "#F5F5F5"),
    ],
  },
  keke: {
    storeName: "Keke Cycles", city: "Abuja", industry: "bicycles", description: "Mountain, city and kids' bikes, built and serviced in our workshop.",
    heroArt: ["tyre", "wrench", "bottle"], mains: ["#2B5061", "#F7BE74", "#1B2B33"],
    products: [
      p("Trail mountain bike", 285000, "Mountain", "tyre", "Front suspension, 21 speeds, disc brakes.", "#1B2B33"),
      p("Kids' balance bike", 65000, "Kids", "tyre", "Light frame for ages 3 to 5.", "#DC2626"),
      p("City commuter bike", 195000, "City", "tyre", "Mudguards, rack and a comfy saddle.", "#2B5061", 215000),
      p("Fat-tyre e-bike", 680000, "Electric", "tyre", "Pedal assist, 60km range.", "#111827"),
      p("Cycling helmet", 28000, "Gear", "cap", "Vented shell, adjustable fit.", "#F7BE74"),
      p("Bike repair kit", 14500, "Gear", "wrench", "Multi-tool, pump and patches.", "#6B7280"),
    ],
  },
  ahia: {
    storeName: "Ahịa Online", city: "Onitsha", industry: "general store", description: "Fashion, gadgets and jewellery in one place, delivered across Nigeria.",
    heroArt: ["shirt", "phone", "necklace"], mains: ["#F9C21B", "#262626", "#E8590C"],
    products: [
      p("Men's graphic T-shirt", 9500, "Fashion", "shirt", "Soft cotton, regular fit.", "#F9C21B"),
      p("Green poplin shirt", 14000, "Fashion", "shirt", "Long sleeves, button-down collar.", "#2E8B57"),
      p("Polka dot sundress", 18500, "Fashion", "dress", "Light and flowy, with adjustable straps.", "#DC2626", 21000),
      p("14-inch laptop", 385000, "Electronics", "laptop", "8GB memory, 256GB storage.", "#374151"),
      p("Dual-SIM smartphone", 145000, "Electronics", "phone", "6.5-inch screen, 128GB.", "#111827"),
      p("Wireless headphones", 32000, "Electronics", "headphones", "30 hours of play per charge.", "#1F2937"),
      p("Gold-tone jhumka earrings", 12500, "Jewellery", "earrings", "Bell drops with a beaded fringe.", "#D4A017"),
      p("Statement necklace", 24000, "Jewellery", "necklace", "Layered gold-tone collar.", "#C9A227"),
      p("Bangle set of four", 15500, "Jewellery", "bracelet", "Gold-tone, stackable.", "#B8860B"),
    ],
  },
  ado: {
    storeName: "Àdó Menswear", city: "Lagos", industry: "menswear", description: "Sneakers, watches, bags and everyday menswear.",
    heroArt: ["shirt", "sneaker", "watch"], mains: ["#2A4F9E", "#71CD14", "#222222"],
    products: [
      p("Classic white sneakers", 38000, "Shoes", "sneaker", "Leather upper with a contrast heel.", "#F3F4F6"),
      p("Burgundy tote bag", 29500, "Bags", "bag", "Structured, with a zip pocket inside.", "#9F1239"),
      p("Black smart watch", 54000, "Watches", "watch", "Heart rate, steps and notifications.", "#111827", 62000),
      p("Running trainers", 42000, "Shoes", "sneaker", "Light mesh, cushioned sole.", "#9CA3AF"),
      p("Slim-fit denim jeans", 21000, "Clothing", "trousers", "Stretch denim, mid-blue wash.", "#2563EB"),
      p("Steel-strap watch", 47500, "Watches", "watch", "Quartz, water resistant.", "#4B5563"),
      p("Plain crew-neck tee", 8500, "Clothing", "shirt", "Heavyweight cotton.", "#374151"),
      p("Leather weekend bag", 68000, "Bags", "bag", "Fits a three-day trip.", "#92400E"),
    ],
  },
  wuta: {
    storeName: "Wuta Gadgets", city: "Kano", industry: "electronics", description: "Phones, cameras, audio and smart gear with warranty.",
    heroArt: ["phone", "headphones", "speaker"], mains: ["#F28B00", "#222222", "#F4F4F4"],
    products: [
      p("Instant camera", 78000, "Cameras", "phone", "Prints photos in seconds.", "#E5E7EB"),
      p("Over-ear headphones", 45000, "Audio", "headphones", "Noise cancelling, 40-hour battery.", "#111827", 52000),
      p("Smart fitness band", 26500, "Wearables", "watch", "Sleep, steps and heart rate.", "#F3F4F6"),
      p("Mirrorless camera kit", 520000, "Cameras", "phone", "24MP with a 15–45mm lens.", "#1F2937"),
      p("Bluetooth speaker", 34000, "Audio", "speaker", "Splash proof, 12 hours.", "#F28B00"),
      p("Fast power bank", 19500, "Accessories", "powerbank", "20,000mAh, two ports.", "#374151"),
      p("Android tablet", 165000, "Phones and tablets", "phone", "10-inch screen, 64GB.", "#6B7280"),
      p("True wireless earbuds", 22000, "Audio", "headphones", "Charging case included.", "#FFFFFF"),
    ],
  },
  ike: {
    storeName: "Ike Electronics", city: "Lagos", industry: "electronics", description: "Laptops, phones, cameras and accessories from trusted makers.",
    heroArt: ["laptop", "headphones", "phone"], mains: ["#2B2D42", "#D10024", "#E4E7ED"],
    products: [
      p("15-inch work laptop", 495000, "Laptops", "laptop", "16GB memory, 512GB SSD.", "#374151", 540000),
      p("Studio headphones", 58000, "Accessories", "headphones", "Closed back, detachable cable.", "#111827"),
      p("Compact camera", 210000, "Cameras", "phone", "20MP, 10x zoom.", "#9CA3AF"),
      p("Thin and light laptop", 640000, "Laptops", "laptop", "13-inch, all-day battery.", "#D1D5DB"),
      p("6.7-inch smartphone", 310000, "Phones", "phone", "256GB, triple camera.", "#1F2937"),
      p("Portable speaker", 39000, "Accessories", "speaker", "Deep bass, 15 hours.", "#D10024"),
      p("Action camera", 145000, "Cameras", "phone", "4K, waterproof case.", "#111827"),
      p("Budget smartphone", 98000, "Phones", "phone", "6.1-inch, 64GB.", "#4B5563"),
    ],
  },
  efo: {
    storeName: "Ẹ̀fọ́ Market", city: "Jos", industry: "vegetables", description: "Vegetables, fruit, juice and dried foods, fresh from local farms.",
    heroArt: ["basket", "leaf", "bottle"], mains: ["#82AE46", "#1E1E1E", "#F7F6F2"],
    products: [
      p("Mini sweet peppers, 500g", 2800, "Vegetables", "basket", "Red, yellow and orange.", "#F59E0B", 3200),
      p("Strawberries, 250g", 4500, "Fruits", "basket", "Sweet and juicy.", "#E11D48"),
      p("Green beans, 500g", 1800, "Vegetables", "leaf", "Snapped fresh.", "#16A34A"),
      p("Purple cabbage", 1500, "Vegetables", "leaf", "Crisp and colourful.", "#7E22CE"),
      p("Tomatoes, 1kg", 2400, "Vegetables", "basket", "Firm and ripe.", "#DC2626", 2800),
      p("Broccoli", 2200, "Vegetables", "leaf", "Fresh green heads.", "#15803D"),
      p("Carrots, 1kg", 1500, "Vegetables", "leaf", "Sweet and crunchy.", "#EA580C"),
      p("Fresh orange juice", 1500, "Juices", "cup", "Pressed this morning.", "#F59E0B"),
      p("Mixed nuts, 500g", 5500, "Dried", "jar", "Roasted, no salt added.", "#92400E"),
    ],
  },
  aluko: {
    storeName: "Àlùkò Studio", city: "Lagos", industry: "fashion", description: "Dresses, jewellery and footwear from this season's lookbook.",
    heroArt: ["dress", "necklace", "heel"], mains: ["#2E2E2E", "#EEF4F8", "#6F8BA4"],
    products: [
      p("Blue denim jacket", 26000, "Clothing", "shirt", "Cropped, washed denim.", "#3B82F6"),
      p("Embroidered kaftan dress", 24000, "Dresses", "dress", "Floaty, hand-embroidered.", "#EA9A1A"),
      p("Black open blazer", 30000, "Clothing", "shirt", "Soft shoulders.", "#111827", 36000),
      p("Pale blue mini dress", 22000, "Dresses", "dress", "Light and airy.", "#BFDBFE"),
      p("Red knit turtleneck", 17500, "Clothing", "shirt", "Chunky knit.", "#DC2626"),
      p("Gold hoop earrings", 12500, "Jewellery", "earrings", "Large, lightweight hoops.", "#D4A017"),
      p("Black strappy heels", 29000, "Footwear", "heel", "Ankle strap, 10cm.", "#111827"),
      p("Mustard wide-leg suit", 27500, "Clothing", "dress", "Relaxed two-piece.", "#D97706"),
    ],
  },
  aja: {
    storeName: "Ajá Pet Shop", city: "Abuja", industry: "pets", description: "Food, clothes, beds and toys for dogs, cats and birds.",
    heroArt: ["bowl", "cushion", "teddy"], mains: ["#F9F3EC", "#C88A3E", "#41403E"],
    products: [
      p("Grey hooded dog onesie", 8500, "Pet clothing", "shirt", "Soft fleece with ears.", "#9CA3AF"),
      p("Denim dog onesie", 9500, "Pet clothing", "shirt", "Striped collar.", "#3B82F6"),
      p("Pink knit dog sweater", 7500, "Pet clothing", "shirt", "Warm and stretchy.", "#F9A8D4", 9000),
      p("Dry dog food, 3kg", 14500, "Dog food", "sack", "Chicken and rice.", "#B45309"),
      p("Wet cat food, 12 pack", 9800, "Cat food", "jar", "Fish in gravy.", "#60A5FA"),
      p("Bone biscuits", 4500, "Dog food", "jar", "Crunchy dog biscuits.", "#92400E"),
      p("Wooden dog kennel", 38000, "Beds and houses", "chair", "Weatherproof roof.", "#B45309"),
      p("Plush elephant toy", 3500, "Toys", "teddy", "Squeaky inside.", "#9CA3AF"),
    ],
  },
  dara: {
    storeName: "Dára Fashion", city: "Lagos", industry: "fashion", description: "Everyday clothes for women and men, delivered fast.",
    heroArt: ["dress", "shirt", "bag"], mains: ["#FFFFFF", "#F96D00", "#111111"],
    products: [
      p("Light denim jacket", 26000, "Men", "shirt", "Washed blue denim.", "#93C5FD", 30000),
      p("Grey pinafore dress", 19500, "Women", "dress", "Knee length.", "#6B7280"),
      p("White off-shoulder dress", 22000, "Women", "dress", "Light cotton.", "#F9FAFB"),
      p("White top and navy trousers", 24000, "Women", "shirt", "Smart casual set.", "#1E3A8A"),
      p("Red floral ruffle dress", 26000, "Women", "dress", "Tiered mini.", "#DC2626"),
      p("Red evening gown", 48000, "Women", "dress", "Floor length.", "#B91C1C"),
      p("Black satin mini dress", 21000, "Women", "dress", "Thin straps.", "#111111"),
      p("Men's denim jacket", 28000, "Men", "shirt", "Dark wash.", "#1E3A8A"),
    ],
  },
  ife: {
    storeName: "Ìfẹ́ Boutique", city: "Lagos", industry: "boutique", description: "Dresses, swimwear, jackets and shoes, picked with love.",
    heroArt: ["dress", "bag", "heel"], mains: ["#2A2522", "#8E7363", "#F5F1EE"],
    products: [
      p("Cream crochet maxi dress", 24000, "Dresses", "dress", "Fitted, ankle length.", "#F5F5F4"),
      p("Floral bikini", 18000, "Swimwear", "dress", "Tie back.", "#F9A8D4"),
      p("Embroidered peasant blouse", 16500, "Tops", "shirt", "Floral hand-stitched detail.", "#BBF7D0", 19500),
      p("Cream macramé fringe bag", 21000, "Accessories", "bag", "Hand-knotted.", "#F5F5F4"),
      p("Brown leather ankle boots", 39000, "Shoes", "heel", "Lace-up.", "#78350F"),
      p("Woven leather belt", 9500, "Accessories", "bag", "Silver buckle.", "#78350F"),
    ],
  },
  rewa: {
    storeName: "Rẹ̀wà Fashion", city: "Lagos", industry: "fashion", description: "Dresses, everyday tops and designer-style bags.",
    heroArt: ["dress", "bag", "heel"], mains: ["#2B2B2B", "#E8074A", "#F5F5F5"],
    products: [
      p("Cream belted coat", 32000, "Women", "robe", "Relaxed fit, tie belt.", "#F5F5F4"),
      p("Graphic print tee", 9500, "Women", "shirt", "Soft cotton, boxy fit.", "#111827"),
      p("Navy slogan sweatshirt", 14500, "Women", "shirt", "Brushed fleece inside.", "#1E3A8A"),
      p("Teal satin dress", 32000, "Women", "dress", "Fluid satin, V neck.", "#0F766E", 38000),
      p("Pink leather shoulder bag", 26000, "Bags", "bag", "Gold hardware.", "#F9A8D4"),
      p("Grey tailored blazer", 34000, "Men", "shirt", "Single breasted.", "#9CA3AF"),
      p("White cotton tee", 7500, "Men", "shirt", "Everyday crew neck.", "#FFFFFF"),
    ],
  },
  igbese: {
    storeName: "Ìgbésẹ̀ Sneakers", city: "Port Harcourt", industry: "sneakers", description: "Running shoes, trainers and street sneakers.",
    heroArt: ["sneaker", "sneaker", "cap"], mains: ["#FF7A00", "#222222", "#F3F4F8"],
    products: [
      p("Grey knit runners", 42000, "Running", "sneaker", "Light knit upper.", "#9CA3AF"),
      p("Lime trail trainers", 46000, "Running", "sneaker", "Grippy outsole.", "#A3E635", 52000),
      p("Black studded slip-ons", 28000, "Casual", "sneaker", "Easy on, easy off.", "#111827"),
      p("White and tan court shoes", 39000, "Casual", "sneaker", "Orange heel tab.", "#D6B08C"),
      p("White everyday sneakers", 32000, "Casual", "sneaker", "Clean leather look.", "#F9FAFB"),
      p("White canvas high-tops", 26000, "Casual", "sneaker", "Classic lace-up high-top.", "#F9FAFB"),
      p("Sports socks, 3 pairs", 6500, "Accessories", "cap", "Cushioned soles.", "#E5E7EB"),
    ],
  },
  ola: {
    storeName: "Ọlá House", city: "Abuja", industry: "fashion house", description: "Fashion, watches, rings and leather goods for her and for him.",
    heroArt: ["dress", "watch", "ring"], mains: ["#F4F4F4", "#222222", "#C9741C"],
    products: [
      p("Silver glitter heels", 38000, "Women", "heel", "Strappy, 9cm heel.", "#D1D5DB", 45000),
      p("Blue stone ring", 24000, "Women", "ring", "Sterling silver band.", "#60A5FA"),
      p("Brown leather wallet", 18000, "Men", "bag", "Six card slots.", "#78350F", 22000),
      p("Black strap smartwatch", 52000, "Men", "watch", "Steps, sleep and alerts.", "#111827"),
      p("Black tailored suit", 120000, "Men", "robe", "Two-piece, slim cut.", "#111827"),
      p("Pink quilted mini bag", 46000, "Women", "bag", "Chain strap.", "#F472B6"),
      p("Straw boater hat", 15000, "Women", "cap", "Woven straw, ribbon band.", "#E7D8C9"),
      p("Red tie", 9500, "Men", "shirt", "Silk blend.", "#991B1B"),
    ],
  },
  okunrin: {
    storeName: "Ọkùnrin Clothing", city: "Lagos", industry: "menswear", description: "Jackets, shirts, shoes and bags for men.",
    heroArt: ["shirt", "sneaker", "bag"], mains: ["#F3F2EE", "#111111", "#E53637"],
    products: [
      p("Olive hooded windbreaker", 36000, "Clothing", "shirt", "Light shell, zip front.", "#4D5B3A"),
      p("Round sunglasses", 12500, "Accessories", "cap", "Gold frame, brown lenses.", "#B45309"),
      p("Black leather sneakers", 34000, "Shoes", "sneaker", "Clean low-top.", "#111827"),
      p("Tan cotton jacket", 29000, "Clothing", "shirt", "Four pockets.", "#B45309", 34000),
      p("Tan leather backpack", 32000, "Bags", "bag", "Buckle flap.", "#B45309"),
      p("Black slogan tee", 8500, "Clothing", "shirt", "Heavy cotton.", "#111827"),
      p("Light blue polo", 13500, "Clothing", "shirt", "Cotton piqué.", "#93C5FD"),
      p("Brown overshirt", 21000, "Clothing", "shirt", "Brushed twill.", "#78350F"),
    ],
  },
  salubata: {
    storeName: "Sálúbàtà Shoes", city: "Ibadan", industry: "shoes", description: "Boots, loafers, heels and sneakers for every day.",
    heroArt: ["sneaker", "heel", "sandal"], mains: ["#DBCC8F", "#111111", "#F8F9FA"],
    products: [
      p("Tan suede Chelsea boots", 44000, "Women", "heel", "Elastic sides.", "#B45309"),
      p("Khaki desert boots", 38000, "Men", "sneaker", "Crepe sole.", "#A16207", 46000),
      p("Blue-grey suede loafers", 35000, "Men", "sneaker", "Metal bit.", "#64748B"),
      p("Light blue canvas high-tops", 18000, "Men", "sneaker", "Lace-up canvas.", "#93C5FD"),
      p("Nude bow stilettos", 32000, "Women", "heel", "Strappy with a bow.", "#D6B08C"),
      p("Kids' pink sneakers", 16000, "Kids", "sneaker", "Light and bendy.", "#EC4899"),
      p("Handmade leather sandals", 15000, "Men", "sandal", "Hand-stitched, hard sole.", "#78350F"),
      p("Teal satin ankle-strap heels", 27000, "Women", "heel", "Ankle strap, 9cm heel.", "#0F766E"),
    ],
  },
  osan: {
    storeName: "Ọsàn Fruits", city: "Lagos", industry: "fruit", description: "Seasonal fruit, washed and delivered fresh across Lagos.",
    heroArt: ["basket", "bottle", "leaf"], mains: ["#051922", "#F28123", "#F5F5F5"],
    products: [
      p("Strawberries, 250g", 4500, "Berries", "basket", "Sweet and juicy, picked this week.", "#E11D48"),
      p("Black grapes, 500g", 4200, "Berries", "basket", "Seedless and crisp.", "#4C1D95"),
      p("Lemons, 6 pack", 2400, "Citrus", "basket", "Bright and zesty.", "#FACC15"),
      p("Sweet oranges, 2kg", 3200, "Citrus", "basket", "Great for juicing.", "#F97316", 3800),
      p("Pineapple", 2800, "Tropical", "basket", "Ripe and fragrant.", "#EAB308"),
      p("Mangoes, 4 pack", 3000, "Tropical", "basket", "Soft, sweet and in season.", "#F59E0B"),
    ],
  },
  ijokoo: {
    storeName: "Ìjókòó Furniture", city: "Lagos", industry: "furniture", description: "Chairs, sofas, tables and lights for every room.",
    heroArt: ["chair", "lamp", "cushion"], mains: ["#F6F7FB", "#E6A23C", "#2B2B2B"],
    products: [
      p("Fabric accent chair", 185000, "Chairs", "chair", "Solid wood legs, mustard weave.", "#CA8A04"),
      p("Grey lounge chair", 145000, "Chairs", "chair", "Low back, soft cushion.", "#6B7280"),
      p("Wooden rocking chair", 120000, "Chairs", "chair", "Hand-finished hardwood.", "#B45309", 135000),
      p("Brass hanging lamp", 48000, "Lighting", "lamp", "Warm light over a table.", "#B8860B"),
      p("Rust velvet sofa", 420000, "Sofas", "chair", "Three seats, deep cushions.", "#9F1239"),
      p("Wooden dining table", 360000, "Tables", "chair", "Solid wood with a natural finish.", "#78350F"),
      p("Linen armchair", 160000, "Chairs", "chair", "Cream linen, wide arms.", "#F5F5F4"),
      p("Upholstered bed frame", 380000, "Bedroom", "cushion", "Queen size, padded headboard.", "#9CA3AF"),
    ],
  },
  ite: {
    storeName: "Ìtẹ́ Interiors", city: "Abuja", industry: "interiors", description: "Furniture and styling for modern homes.",
    heroArt: ["chair", "lamp", "vase"], mains: ["#3B5D50", "#F9BF29", "#EFF2F1"],
    products: [
      p("Nordic chair", 85000, "Chairs", "chair", "Curved shell, timber legs.", "#E5E7EB"),
      p("Orange shell armchair", 120000, "Chairs", "chair", "Moulded seat, slim legs.", "#EA580C"),
      p("Lime lounge chair", 65000, "Chairs", "chair", "Upholstered seat and back.", "#65A30D"),
      p("Olive velvet sofa", 450000, "Sofas", "chair", "Three seats, deep cushions.", "#4D7C0F", 495000),
      p("Pendant lamp", 42000, "Lighting", "lamp", "Matt white shade.", "#F3F4F6"),
      p("Ceramic vase", 18000, "Decor", "vase", "Hand-glazed, 30cm.", "#D6D3D1"),
    ],
  },
  kujera: {
    storeName: "Kujera Home", city: "Kano", industry: "furniture", description: "Sofas, office chairs and lighting for home and work.",
    heroArt: ["chair", "lamp", "cushion"], mains: ["#F3F1EE", "#111111", "#B86A22"],
    products: [
      p("Green leather armchair", 220000, "Living room", "chair", "Button back, deep seat.", "#065F46", 260000),
      p("Yellow tufted sofa", 480000, "Living room", "chair", "Button-tufted, rolled arms.", "#EAB308"),
      p("Tan leather sofa", 540000, "Living room", "chair", "Soft aniline leather.", "#92400E"),
      p("Light blue armchair", 150000, "Living room", "chair", "Soft fabric, wooden legs.", "#93C5FD"),
      p("Floor lamp", 45000, "Lighting", "lamp", "Linen shade, metal stand.", "#E7E5E4"),
      p("High-back office chair", 98000, "Office", "chair", "Mesh back, adjustable height.", "#D1D5DB"),
      p("Metal wall clock", 22000, "Decor", "plate", "Matt black, silent.", "#111827"),
    ],
  },
  tufafi: {
    storeName: "Tufafi Store", city: "Kaduna", industry: "family fashion", description: "Clothes and accessories for women, men and children.",
    heroArt: ["dress", "shirt", "bag"], mains: ["#2A2A2A", "#FFFFFF", "#F7F7F7"],
    products: [
      p("Camouflage bomber jacket", 32000, "Men", "shirt", "Zip front, ribbed cuffs.", "#4D5B3A"),
      p("Light denim jacket", 24000, "Men", "shirt", "Washed blue denim.", "#93C5FD"),
      p("Black crew sweater", 18000, "Men", "shirt", "Soft knit.", "#111827"),
      p("Green utility jacket", 29000, "Women", "shirt", "Belted waist, four pockets.", "#3F6212"),
      p("Red print dress", 21000, "Women", "dress", "Knee length, flared.", "#B91C1C", 25000),
      p("Cream fluffy cardigan", 19500, "Women", "robe", "Cosy and oversized.", "#F5F5F4"),
      p("Girls' cream top", 8500, "Kids", "shirt", "Soft cotton, easy fit.", "#F5F5F4"),
      p("Boys' print shirt", 9500, "Kids", "shirt", "Cotton, short sleeves.", "#1E40AF"),
      p("Boys' orange shirt set", 12500, "Kids", "shirt", "Shirt and trousers.", "#EA580C"),
    ],
  },
  erin: {
    storeName: "Ẹ̀rín Styles", city: "Benin City", industry: "fashion", description: "Shirts, dresses and casual wear for every day.",
    heroArt: ["shirt", "dress", "bag"], mains: ["#F7444E", "#002C3E", "#E9E6E6"],
    products: [
      p("Striped cotton shirt", 15500, "Men", "shirt", "Long sleeves, slim fit.", "#9CA3AF"),
      p("Black zip jacket", 24000, "Men", "shirt", "Light shell with a stand collar.", "#111827"),
      p("Purple evening gown", 48000, "Women", "dress", "Floor length, with a fitted bodice.", "#6B21A8", 55000),
      p("Red skater dress", 19500, "Women", "dress", "Fitted waist, flared skirt.", "#DC2626"),
      p("Navy wrap dress", 21000, "Women", "dress", "Knee length, tie waist.", "#1E3A8A"),
      p("Floral tea dress", 18000, "Women", "dress", "Soft print, short sleeves.", "#F9A8D4"),
      p("Pink oversized hoodie", 17500, "Unisex", "shirt", "Brushed fleece inside.", "#F472B6"),
      p("Denim work shirt", 16500, "Men", "shirt", "Washed denim, two pockets.", "#2563EB"),
      p("Green check shirt", 14500, "Men", "shirt", "Cotton flannel.", "#059669"),
    ],
  },
  apere: {
    storeName: "Apẹ̀rẹ̀ Grocery", city: "Lagos", industry: "groceries", description: "Fresh fruit, juice, bread and pantry staples, delivered the same day.",
    heroArt: ["bottle", "basket", "bread"], mains: ["#E6F3FB", "#F2A900", "#222222"],
    products: [
      p("Bananas, one bunch", 2500, "Fruits and veg", "basket", "Ripe and sweet.", "#FACC15"),
      p("Cucumbers, pack of 3", 1800, "Fruits and veg", "basket", "Crisp, for salads.", "#16A34A"),
      p("Cherry tomatoes, 500g", 2200, "Fruits and veg", "basket", "Sweet on the vine.", "#DC2626"),
      p("Orange juice, 1 litre", 3500, "Juice", "bottle", "Not from concentrate.", "#FB923C", 4000),
      p("Mango smoothie", 2800, "Juice", "bottle", "Mango, banana and yoghurt.", "#F59E0B"),
      p("Fresh milk, 1 litre", 2600, "Dairy", "bottle", "Full cream.", "#F3F4F6"),
      p("Wholemeal bread", 1900, "Bakery", "bread", "Baked this morning.", "#B45309"),
      p("Butter croissants, 4 pack", 3200, "Bakery", "bread", "Flaky and golden.", "#D97706"),
    ],
  },
  bata: {
    storeName: "Bàtà Shoes", city: "Abuja", industry: "shoes", description: "Heels, loafers, boots and sneakers, picked for comfort and style.",
    heroArt: ["heel", "sneaker", "sandal"], mains: ["#F2F2F2", "#88C8BC", "#222222"],
    products: [
      p("Suede ankle boots", 42000, "Women", "heel", "Block heel, side zip.", "#93C5FD"),
      p("Nude court heels", 36000, "Women", "heel", "Pointed toe, 9cm heel.", "#D6B08C"),
      p("Canvas plimsolls", 15000, "Men", "sneaker", "Rubber sole, lace up.", "#9CA3AF"),
      p("Blue running shoes", 38000, "Men", "sneaker", "Cushioned, breathable mesh.", "#1D4ED8", 44000),
      p("Red patent stilettos", 39500, "Women", "heel", "High shine, 11cm heel.", "#DC2626"),
      p("Leather loafers", 41000, "Men", "sneaker", "Penny strap, soft lining.", "#92400E"),
      p("Strappy blue sandals", 27500, "Women", "sandal", "Ankle strap, 10cm heel.", "#1E3A8A"),
      p("Brown suede sneakers", 33000, "Men", "sneaker", "Low top, contrast laces.", "#92400E"),
    ],
  },
  ogba: {
    storeName: "Ọgbà Fresh", city: "Jos", industry: "fresh produce", description: "Vegetables, fruit and herbs from farms around Jos.",
    heroArt: ["basket", "leaf", "yam"], mains: ["#B0B435", "#111111", "#F5F5F5"],
    products: [
      p("Carrots, 1kg", 1500, "Vegetables", "leaf", "Sweet and crunchy.", "#EA580C"),
      p("Tomatoes, 1kg", 2400, "Vegetables", "basket", "Firm plum tomatoes.", "#DC2626"),
      p("Green grapes, 500g", 4500, "Fruit", "basket", "Seedless.", "#65A30D", 5200),
      p("Pawpaw", 1800, "Fruit", "basket", "Ripe and ready to eat.", "#F97316"),
      p("Irish potatoes, 2kg", 3000, "Vegetables", "yam", "Good for frying and boiling.", "#A16207"),
      p("Fresh lettuce", 1200, "Vegetables", "leaf", "Crisp leaves.", "#22C55E"),
      p("Garlic, 250g", 1600, "Herbs", "leaf", "Plump cloves.", "#F5F5F4"),
      p("Fresh basil", 900, "Herbs", "leaf", "Fragrant bunch.", "#15803D"),
    ],
  },
  eso: {
    storeName: "Èso Organic", city: "Ibadan", industry: "fruit and vegetables", description: "Seasonal fruit and vegetables, picked fresh and delivered fast.",
    heroArt: ["basket", "leaf", "bottle"], mains: ["#81C408", "#FFB524", "#45595B"],
    products: [
      p("Green grapes, 500g", 4200, "Fruit", "basket", "Crisp and seedless.", "#84CC16"),
      p("Raspberries, 125g", 3800, "Fruit", "basket", "Sweet and tart.", "#BE123C"),
      p("Apricots, 500g", 3500, "Fruit", "basket", "Soft and fragrant.", "#FB923C"),
      p("Bananas, one bunch", 2400, "Fruit", "basket", "Ripe and sweet.", "#FACC15"),
      p("Sweet oranges, 2kg", 3000, "Fruit", "basket", "Juicy, for juicing too.", "#F97316", 3600),
      p("Red apples, 1kg", 4000, "Fruit", "basket", "Crunchy and sweet.", "#DC2626"),
      p("Broccoli", 2200, "Vegetables", "leaf", "Fresh green heads.", "#15803D"),
      p("Strawberries, 250g", 4500, "Fruit", "basket", "Bright red and juicy.", "#E11D48"),
    ],
  },
  ewu: {
    storeName: "Ẹ̀wù Family Store", city: "Ibadan", industry: "family fashion", description: "Clothing, bags and shoes for women, men and children.",
    heroArt: ["dress", "shirt", "bag"], mains: ["#D19C97", "#EDF1FF", "#1C1C1C"],
    products: [
      p("Cream slip dress", 23000, "Dresses", "dress", "Satin feel, midi length.", "#F5F0E6"),
      p("Off-shoulder knit top", 16500, "Women", "shirt", "Soft rib knit.", "#E7D8C9"),
      p("Boys' denim jacket", 14500, "Kids", "shirt", "Washed denim, button front.", "#3B82F6"),
      p("Men's black blazer", 48000, "Men", "robe", "Single breasted, slim cut.", "#111827", 55000),
      p("Girls' denim shorts set", 11000, "Kids", "trousers", "Tee and shorts.", "#93C5FD"),
      p("Long black coat", 52000, "Women", "robe", "Wool blend, knee length.", "#1F2937"),
      p("Canvas print handbag", 19500, "Bags", "bag", "Roomy, with a zip top.", "#9CA3AF"),
      p("Brown hiking boots", 36000, "Shoes", "sneaker", "Grippy sole, padded collar.", "#78350F"),
      p("Fitted black dress", 21500, "Dresses", "dress", "Stretch jersey, knee length.", "#111111"),
      p("Men's hooded jacket", 27500, "Men", "shirt", "Water resistant shell.", "#334155"),
      p("Woven straw bag", 13500, "Bags", "basket", "Beach to brunch.", "#D6B98C"),
      p("Kids' canvas sneakers", 9500, "Shoes", "sneaker", "Easy on, easy off.", "#F9FAFB"),
    ],
  },
};

/** The fields of a storefront product the theme renderer reads (structurally a ShopperProduct). */
export interface DemoShopperProduct {
  id: string;
  name: string;
  description: string;
  images: string[];
  retailPrice: number;
  compareAtPrice: number | null;
  currency: "NGN";
  category: { id: string; name: string; slug: string };
  reviewCount: 0;
}

export interface DemoThemeColours {
  accent: string;
  ink: string;
  cardBg: string;
  paperBg: string;
}

function slug(value: string) {
  return value.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function demoCatalogueFor(themeId: string): DemoCatalogue {
  return (DEMO_CATALOGUES as Record<string, DemoCatalogue>)[themeId] ?? DEMO_CATALOGUES.plain;
}

/** The sample products for a theme, drawn in its colours. Ids are prefixed "demo-" so they can never match a real product. */
export function demoProducts(themeId: string, colours: DemoThemeColours): DemoShopperProduct[] {
  const catalogue = demoCatalogueFor(themeId);
  const photos = DEMO_PHOTOS[themeId in DEMO_CATALOGUES ? themeId : "plain"];
  return catalogue.products.map((product, index) => {
    const main = product.tint ?? catalogue.mains[index % catalogue.mains.length] ?? colours.accent;
    const photo = photos?.products[index];
    return {
      id: `demo-${themeId}-${index + 1}`,
      name: product.name,
      description: product.description,
      images: [photo ? unsplashUrl(photo, 800, 1000) : demoProductArt(product.art, { bg: colours.cardBg, main, accent: colours.accent, ink: colours.ink })],
      retailPrice: product.price,
      compareAtPrice: product.compareAt ?? null,
      currency: "NGN",
      category: { id: `demo-${slug(product.category)}`, name: product.category, slug: slug(product.category) },
      reviewCount: 0,
    };
  });
}

/** Sample banner (16:9, or 4:5 for tall hero frames) and story (4:5) pictures for a theme: photos, or drawn scenes. */
export function demoBanners(themeId: string, colours: DemoThemeColours) {
  const catalogue = demoCatalogueFor(themeId);
  const palette = { bg: colours.cardBg, field: colours.cardBg, main: colours.accent, accent: colours.accent, ink: colours.ink, mains: catalogue.mains };
  const tall = TALL_HERO_THEMES.has(themeId);
  const photos = DEMO_PHOTOS[themeId in DEMO_CATALOGUES ? themeId : "plain"];
  if (photos) return { hero: tall ? unsplashUrl(photos.hero, 1200, 1500) : unsplashUrl(photos.hero, 1920, 1080), story: unsplashUrl(photos.story, 1000, 1250) };
  return {
    hero: tall ? demoSceneArt(catalogue.heroArt.slice(0, 1), palette, 4 / 5) : demoSceneArt(catalogue.heroArt, palette, 16 / 9),
    story: demoSceneArt(catalogue.heroArt.slice(0, 2).reverse(), { ...palette, field: colours.paperBg }, 4 / 5),
  };
}

/** "Show with my products" needs at least this many products with a photo. */
export const OWN_PREVIEW_MIN_PRODUCTS = 4;

/** The seller's products that can stand in for the samples (those with a photo), or null when there are too few. */
export function ownPreviewProducts<P extends { images?: string[] | null }>(products: readonly P[] | null | undefined): P[] | null {
  const withPhoto = (products ?? []).filter((product) => Array.isArray(product.images) && product.images.some((src) => typeof src === "string" && src.trim()));
  return withPhoto.length >= OWN_PREVIEW_MIN_PRODUCTS ? withPhoto : null;
}
