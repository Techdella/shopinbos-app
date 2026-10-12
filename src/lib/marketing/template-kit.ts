import { htmlFromBlocks, type ColumnCell, type CountdownUnit, type EmailBlock, type EmailThemeName, type FeatureItem, type ProductItem, type ReceiptLine, type ReceiptTotal } from "./blocks.ts";

// Building blocks for the starter email library: categories, flows (the gallery's tabs), sample photos and
// products, and short constructors for each block type. Photos load from images.unsplash.com (every id was
// checked by eye; the licence asks for hotlinks). Pure.

export const TEMPLATE_CATEGORIES = {
  welcome: "Welcome",
  newsletter: "Newsletter",
  promotion: "Sale or offer",
  product_launch: "New arrivals",
  abandoned_cart: "Cart reminder",
  browse: "Browse reminder",
  price_drop: "Price drop",
  order: "Order and thank you",
  shipping: "Shipping update",
  post_purchase: "After purchase",
  review: "Review request",
  referral: "Referral",
  loyalty: "Rewards and loyalty",
  game: "Games and surprises",
  win_back: "Win-back",
  survey: "Feedback",
  birthday: "Birthday",
  festive: "Festive",
  restock: "Back in stock",
  event: "Event invite",
  announcement: "Announcement",
  wholesale: "Wholesale",
} as const;

export type TemplateCategory = keyof typeof TEMPLATE_CATEGORIES;

/** The gallery's tabs: where in a customer's journey an email belongs. */
export const TEMPLATE_FLOWS = {
  welcome: "Welcome & first order",
  recovery: "Cart & browse",
  post_purchase: "Orders & after",
  promotions: "Sales & offers",
  seasonal: "Seasons & holidays",
  games: "Games & loyalty",
  retention: "Win-back & feedback",
  news: "News & events",
  b2b: "Wholesale",
} as const;

export type TemplateFlow = keyof typeof TEMPLATE_FLOWS;

export interface LibraryTemplate {
  key: string;
  name: string;
  category: TemplateCategory;
  flow: TemplateFlow;
  /** The style family it's drawn in. */
  style: EmailThemeName;
  /** Part of a ready-made series ("cart", step 2). */
  series?: { key: string; step: number };
  /** One line for the card. */
  description: string;
  subject: string;
  preheader: string;
  bodyHtml: string;
  /** Words that point Peggy's no-AI fallback at this template. */
  keywords: string[];
}

export const photo = (id: string, w = 1200, h = 720) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=72`;

export const PHOTOS = {
  printDress: "1523825036634-aab3cce05919",
  reading: "1525715843408-5c6ec44503b1",
  adire: "1787779350563-29cf5a87c6c7",
  agbada: "1767929820469-9aca9080cc99",
  asoebi: "1726276262267-ebb01cfa0982",
  owambe: "1681545303529-b6beb2e19f02",
  baker: "1709837167686-a2e33aad1bf0",
  dispatch: "1737649316494-6a32b7fda654",
  market: "1773858441067-de99ed159a95",
  thumbsUp: "1690054273244-e491abdb4ce4",
  phone: "1662858557337-48c9ecf07ee0",
  perfumeHero: "1591479763204-a293f0ba9cc7",
  motherBaby: "1591451855781-9eb0f9726a33",
  cake: "1714949134591-d6f2c581b20d",
  chinchin: "1665554837563-3782d21a676b",
  // Added for the second library (each viewed before use).
  laughing: "1508002366005-75a695ee2d17",
  tailorBw: "1744808336885-c6b2425c3f1e",
  tailor: "1687422808289-e721259c9eb4",
  adirePainting: "1775669954911-fc68d9deae84",
  skincare: "1646457417455-77a66a9fcf34",
  tomatoSeller: "1575303093127-18b3c4ef8c41",
  shoeSeller: "1591964447401-b6a88f3dafb7",
  darkPortrait: "1614709444380-a624c3385da9",
  weddingCouple: "1661332306744-70f9ed1a7f40",
  schoolGirl: "1697906098003-495f078d58ae",
  hijabPerfume: "1774870814205-f8ffee37616c",
  heritage: "1756842583762-09ac2ef7387f",
  coralWoman: "1766107349536-c6de9ab38dcd",
  watermelonStall: "1773858437375-e49a91b73ff1",
  shopFriends: "1790943780822-9918073fe9f1",
  kitchenSmile: "1733491762566-701553a88e7d",
  weddingCake: "1562967061-7dab59e87d17",
  beadMaker: "1789028152733-54a551be2e8b",
  outdoorCook: "1698827623494-c4e1196ba0ca",
};

export const item = (name: string, price: string, id: string, extra: Partial<ProductItem> = {}): ProductItem => ({ name, price, imageUrl: photo(id, 600, 600), url: "{{store_url}}", ...extra });

export const SAMPLE = {
  adireDress: item("Adire print dress", "₦28,500", "1760287364219-160c234ded00"),
  kaftan: item("Indigo kaftan", "₦34,000", "1753192108606-b4a2bc9e5661"),
  tote: item("Canvas tote bag", "₦12,000", "1683148754073-cfa906017a10"),
  sneakers: item("Everyday sneakers", "₦22,500", "1560769629-975ec94e6a86"),
  coral: item("Coral bead necklace", "₦18,000", "1562947429-2a6546643e8d"),
  beads: item("Beaded bracelet set", "₦6,500", "1641946188146-848152c45baf"),
  oud: item("Oud perfume, 50ml", "₦25,000", "1640869116016-93c00ba94b28"),
  floral: item("Floral eau de parfum", "₦21,000", "1458538977777-0549b2370168"),
  // Second library.
  wrapDress: item("Ankara wrap dress", "₦28,500", "1760907949889-eb62b7fd9f75"),
  linenSet: item("Linen two-piece set", "₦34,000", "1783113298894-eeb3b71315d9"),
  kimono: item("Adire kimono", "₦22,000", "1663044023021-89c818cf9f2d"),
  raffiaTote: item("Raffia tote bag", "₦15,000", "1763056531605-4e75d78e5016"),
  miniBag: item("Beaded mini bag", "₦16,500", "1759064716592-3963a0881ff8"),
  gown: item("Silk evening gown", "₦145,000", "1790563379722-4c6af233f20c"),
  watch: item("Gold-tone wristwatch", "₦98,000", "1541778480-fc1752bbc2a9"),
  handbag: item("Structured leather handbag", "₦120,000", "1691480150204-66dd1eb77391"),
  pearls: item("Pearl drop earrings", "₦45,000", "1682822749969-61a63203c501"),
  heels: item("Pointed satin heels", "₦65,000", "1459712105412-be146fae746d"),
  sheaButter: item("Whipped shea body butter", "₦8,500", "1638131163449-70059e10de6a"),
  serum: item("Vitamin C serum, 30ml", "₦14,000", "1713768704571-6aeb0d0e5105"),
  blackSoap: item("African black soap", "₦4,500", "1638131164559-5efa77e52527"),
  sunscreen: item("Sunscreen SPF 50", "₦12,000", "1689163642429-279f59082ab5"),
  bodyOil: item("Glow body oil", "₦9,000", "1556760544-74068565f05c"),
  headphones: item("Wireless headphones", "₦45,000", "1607445996476-0480fc8744ea"),
  speaker: item("Bluetooth speaker", "₦32,000", "1582978571763-2d039e56f0c3"),
  powerBank: item("Power bank, 20,000mAh", "₦18,500", "1706275399494-fb26bbc5da63"),
  smartwatch: item("Smartwatch", "₦38,000", "1546868871-7041f2a55e12"),
  courtSneakers: item("Court sneakers", "₦38,000", "1780824947013-dc7e01284025"),
  slides: item("Leather slides", "₦15,000", "1613662632164-7f2b081a5b46"),
  rice: item("Long grain rice, 5kg", "₦12,500", "1645331465778-eb409d112198"),
  oil: item("Vegetable oil, 3 litres", "₦9,800", "1720468750623-39e9a09f5067"),
  noodles: item("Instant noodles, carton of 40", "₦11,000", "1591874879354-bf0a6e982c60"),
  detergent: item("Laundry detergent, 2kg", "₦5,400", "1593095948071-474c5cc2989d"),
  eggs: item("Crate of eggs (30)", "₦5,800", "1561621798-2a92b970226b"),
  water: item("Bottled water, pack of 12", "₦2,800", "1639390167093-9c62311fe84d"),
  cupcakes: item("Cupcakes, box of 6", "₦9,000", "1618652970214-19b55729f0e6"),
  meatPie: item("Meat pie, box of 6", "₦7,200", "1545668855-b923f0176935"),
  puffPuff: item("Puff puff, pack of 20", "₦3,000", "1665833613236-7c1d087463b1"),
  chinChin: item("Chin chin jar, 1kg", "₦6,500", "1665554837563-3782d21a676b"),
  backpack: item("School backpack", "₦13,500", "1765516833058-c322c800fee1"),
  notebook: item("A5 dotted notebook", "₦3,500", "1591195852468-03a01d1375d6"),
  pens: item("Gel pen set (6)", "₦2,500", "1521669145854-0bd392445939"),
  kidsSneakers: item("Kids' sneakers", "₦15,000", "1678192568478-9488ee55def6"),
  girlsDress: item("Girls' ankara dress", "₦11,500", "1740741703267-4d183c18f4a1"),
  agbadaSet: item("Three-piece agbada", "₦95,000", "1788035963223-06abb95a1289"),
  senator: item("Senator kaftan", "₦48,000", "1648329008114-bce0ec0b5950"),
  filaCap: item("Fila cap", "₦8,500", "1782237319321-bac65528d4a5"),
  gele: item("Gele headtie", "₦12,000", "1788035962644-6a783701ac92"),
  laceFabric: item("Swiss voile lace, 5 yards", "₦75,000", "1769420290265-6359445daaa4"),
  ankaraFabric: item("Ankara wax print, 6 yards", "₦18,000", "1552710307-537199cd41c0"),
  roseMusk: item("Rose Musk, 100ml", "₦29,000", "1458538977777-0549b2370168"),
  amber: item("Amber Nights, 50ml", "₦34,000", "1733660227163-01bc46e0d7d7"),
  bakhoor: item("Bakhoor, 40g", "₦6,000", "1777361988778-6e918aaa2e26"),
  hoops: item("Brass hoop earrings", "₦12,000", "1630383078851-30b015f390a2"),
  layered: item("Layered bead necklace", "₦24,000", "1779950656551-4873213f195e"),
  candle: item("Lemongrass candle", "₦9,000", "1714228499605-367154d9bdb2"),
  vase: item("Terracotta vase", "₦16,000", "1674390521253-79caf82d0ceb"),
};

/** A sample product with an old price and a tag. */
export const deal = (product: ProductItem, was: string, badge?: string): ProductItem => ({ ...product, was, ...(badge ? { badge } : {}) });

type Of<T extends EmailBlock["type"]> = Extract<EmailBlock, { type: T }>;

export const h = (text: string, extra: Partial<Of<"heading">> = {}): EmailBlock => ({ type: "heading", text, ...extra });
export const t = (text: string, extra: Partial<Of<"text">> = {}): EmailBlock => ({ type: "text", text, ...extra });
export const btn = (label: string, url = "{{store_url}}", extra: Partial<Of<"button">> = {}): EmailBlock => ({ type: "button", label, url, ...extra });
export const img = (id: string, alt: string): EmailBlock => ({ type: "image", url: photo(id), alt, link: "{{store_url}}" });
export const coupon = (code: string, title: string, note: string, extra: Partial<Of<"coupon">> = {}): EmailBlock => ({ type: "coupon", code, title, note, ...extra });
export const products = (items: ProductItem[], buttonLabel = "Shop now", extra: Partial<Of<"products">> = {}): EmailBlock => ({ type: "products", items, buttonLabel, ...extra });
export const columns = (left: ColumnCell, right: ColumnCell): EmailBlock => ({ type: "columns", cells: [left, right] });
export const divider: EmailBlock = { type: "divider" };
export const rule = (variant: Of<"divider">["variant"], extra: Partial<Of<"divider">> = {}): EmailBlock => ({ type: "divider", variant, ...extra });
export const space = (height = 12): EmailBlock => ({ type: "spacer", height });
export const social: EmailBlock = { type: "social", links: [{ network: "instagram", url: "https://instagram.com/" }, { network: "whatsapp", url: "https://wa.me/" }, { network: "website", url: "{{store_url}}" }] };
/**
 * The template's own sign-off. Compliance lines (why they're getting it, Unsubscribe, the address) are not written
 * here: the shell adds them in the footer of every email (src/lib/email/shell.ts).
 */
export const footer = (text = "Reply to this email any time, a real person reads it.", extra: Partial<Of<"footer">> = {}): EmailBlock => ({ type: "footer", text, ...extra });

interface HeroInput {
  image?: string;
  alt?: string;
  eyebrow?: string;
  heading: string;
  text?: string;
  button?: string;
  url?: string;
}
const hero = (layout: Of<"hero">["layout"], input: HeroInput, extra: Partial<Of<"hero">> = {}): EmailBlock => ({
  type: "hero",
  layout,
  imageUrl: input.image ? photo(input.image, 1200, layout === "split" ? 1200 : 760) : "",
  alt: input.alt ?? "",
  eyebrow: input.eyebrow ?? "",
  heading: input.heading,
  text: input.text ?? "",
  buttonLabel: input.button ?? "",
  buttonUrl: input.url ?? "{{store_url}}",
  ...extra,
});
/** Photo edge to edge across the top (when it's the first block), words underneath. */
export const heroFull = (input: HeroInput, extra: Partial<Of<"hero">> = {}) => hero("full", input, extra);
/** Photo beside the words; stacks on a phone. */
export const heroSplit = (input: HeroInput, extra: Partial<Of<"hero">> = {}) => hero("split", input, extra);
/** No photo: big type on a colour panel. */
export const heroType = (input: Omit<HeroInput, "image" | "alt">, extra: Partial<Of<"hero">> = {}) => hero("type", input, extra);

export const banner = (text: string, variant: Of<"banner">["variant"] = "accent", extra: Partial<Of<"banner">> = {}): EmailBlock => ({ type: "banner", text, variant, ...extra });
export const countdown = (variant: Of<"countdown">["variant"], title: string, units: CountdownUnit[], note = "", extra: Partial<Of<"countdown">> = {}): EmailBlock => ({ type: "countdown", variant, title, units, note, ...extra });
export const hours = (h: string, m = "00"): CountdownUnit[] => [{ value: h, label: "hours" }, { value: m, label: "mins" }];
export const days = (d: string, h: string, m = "00"): CountdownUnit[] => [{ value: d, label: "days" }, { value: h, label: "hours" }, { value: m, label: "mins" }];
export const receipt = (title: string, lines: ReceiptLine[], totals: ReceiptTotal[], note = "", extra: Partial<Of<"receipt">> = {}): EmailBlock => ({ type: "receipt", title, lines, totals, note, ...extra });
export const steps = (list: string[], current: number, note = ""): EmailBlock => ({ type: "steps", steps: list, current, note });
export const review = (quote: string, author: string, detail = "Verified buyer", rating = 5, extra: Partial<Of<"review">> = {}): EmailBlock => ({ type: "review", quote, author, rating, detail, ...extra });
export const features = (items: FeatureItem[], extra: Partial<Of<"features">> = {}): EmailBlock => ({ type: "features", items, ...extra });
export const vip = (tier: string, title: string, text: string, perks: string[], button = "", url = "{{store_url}}"): EmailBlock => ({ type: "vip", tier, title, text, perks, buttonLabel: button, buttonUrl: url });
export const meter = (input: { title: string; current: number; goal: number; unit: string; from?: string; to?: string; note?: string }): EmailBlock => ({ type: "meter", from: "", to: "", note: "", ...input });
export const game = (kind: Of<"game">["game"], input: { title: string; text?: string; prizes?: string[]; value?: string; button: string; url?: string }, extra: Partial<Of<"game">> = {}): EmailBlock => ({
  type: "game",
  game: kind,
  title: input.title,
  text: input.text ?? "",
  prizes: input.prizes ?? [],
  value: input.value ?? "",
  buttonLabel: input.button,
  buttonUrl: input.url ?? "{{store_url}}",
  ...extra,
});

/** Things almost every Nigerian shopper asks before paying. */
export const TRUST: FeatureItem[] = [
  { icon: "₦", title: "Pay your way", text: "Card, transfer or pay on delivery where available." },
  { icon: "✓", title: "Easy returns", text: "Wrong size? Tell us within 7 days." },
  { icon: "→", title: "Fast delivery", text: "Lagos in 1 to 2 days, other states in 3 to 5." },
];

export interface TemplateOptions {
  flow: TemplateFlow;
  style?: EmailThemeName;
  series?: { key: string; step: number };
}

/** A library entry; a non-classic style adds the "theme" block that sets the card and fonts. */
export const template = (
  key: string,
  name: string,
  category: TemplateCategory,
  description: string,
  subject: string,
  preheader: string,
  keywords: string[],
  blocks: EmailBlock[],
  options: TemplateOptions,
): LibraryTemplate => {
  const style = options.style ?? "classic";
  return {
    key,
    name,
    category,
    flow: options.flow,
    style,
    ...(options.series ? { series: options.series } : {}),
    description,
    subject,
    preheader,
    keywords,
    bodyHtml: htmlFromBlocks(style === "classic" ? blocks : [{ type: "theme", theme: style }, ...blocks]),
  };
};
