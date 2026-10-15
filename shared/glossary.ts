// The words of online selling, kept as they are (Segments stays Segments) and explained in one plain sentence
// with an everyday Nigerian small-business example. Used by <Term> tooltips and the sidebar on the web, TermHint
// on mobile, and the 60-second feature intros (shared/feature-intros.ts). Pure and import-free, unit-tested in
// tests/learn.test.mjs.

export interface GlossaryEntry {
  key: string;
  /** The standard word, as the app shows it. */
  term: string;
  /** One plain sentence, at most 120 characters. */
  short: string;
  /** A concrete example from a small shop. */
  example: string;
  /** Other words that mean the same thing here (matched whole-word, case-insensitive). */
  aliases: string[];
  /** The 60-second intro that teaches this term (shared/feature-intros.ts), if there is one. */
  introKey?: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  // ── Customers and marketing ──
  { key: "segments", term: "Segments", short: "Groups of customers you pick by what they bought, where they live or what they did.", example: "Everyone in Lagos who bought shoes twice this year.", aliases: ["segment", "customer groups", "groups of customers"], introKey: "segments" },
  { key: "campaigns", term: "Campaigns", short: "One message you send to many customers at once, by email, WhatsApp or SMS.", example: "A Friday WhatsApp message to your VIPs: “New ankara just landed, 10% off till Sunday.”", aliases: ["campaign", "broadcast", "broadcasts", "messages to customers"], introKey: "campaigns" },
  { key: "automations", term: "Automations", short: "Messages and tasks that run by themselves when something happens in your shop.", example: "When someone buys, send “Thank you, Ada!” and ask for a review 5 days later.", aliases: ["automation", "automated", "flows", "workflows"], introKey: "automations" },
  { key: "subscribers", term: "Subscribers", short: "People who said yes to getting your messages, so you can market to them.", example: "The 240 people who joined your list from the pop-up on your shop.", aliases: ["subscriber", "mailing list", "contact list", "opt-in"], introKey: "subscribers" },
  { key: "audiences", term: "Audiences", short: "The people an advert or message is shown to, chosen by place, age or interest.", example: "Women 22–40 in Abuja and Port Harcourt who like fashion.", aliases: ["audience", "targeting"], introKey: "ads" },
  { key: "templates", term: "Templates", short: "Ready-made designs you fill with your own words, photos and colours.", example: "Pick the “Market Day” email template, swap in your logo and send.", aliases: ["template", "email templates", "email designs"], introKey: "templates" },
  { key: "analytics", term: "Analytics", short: "Numbers that show how your shop is doing: visits, sales and where buyers came from.", example: "120 visits from TikTok this week turned into 9 orders.", aliases: ["reports", "insights", "marketing reports", "performance", "stats"], introKey: "analytics" },
  { key: "forms", term: "Forms and pop-ups", short: "Boxes on your shop that collect a customer’s email or phone, often for a small reward.", example: "“Get ₦1,000 off your first order: drop your WhatsApp number.”", aliases: ["form", "pop-up", "pop-ups", "popup", "signup form"], introKey: "subscribers" },
  { key: "rewards", term: "Rewards", short: "Points, games and gifts that bring customers back to buy again.", example: "Spin-the-wheel on your shop gives a free delivery to every 10th visitor.", aliases: ["loyalty", "rewards and games", "points"] },
  { key: "discounts", term: "Discounts", short: "Price cuts or codes customers enter at checkout.", example: "Code SALLAH20 takes 20% off everything this weekend.", aliases: ["discount", "coupon", "coupons", "discounts and coupons"], introKey: "discounts" },
  { key: "affiliates", term: "Affiliates", short: "People who share your shop link and earn a commission on each sale it brings.", example: "A campus influencer earns 10% on every wig sold through her link.", aliases: ["affiliate", "referral", "referrals", "commission"], introKey: "affiliates" },
  { key: "ads", term: "Ads", short: "Paid posts on Facebook, Instagram or TikTok that show your products to new people.", example: "₦5,000 for 3 days shows your perfume to 8,000 people in Lagos.", aliases: ["ad", "advert", "adverts", "advertising"], introKey: "ads" },
  { key: "budget", term: "Budget", short: "The most you agree to spend on an advert, per day or in total.", example: "₦2,000 a day for 5 days, so ₦10,000 at most.", aliases: ["ad budget", "daily budget", "spend"], introKey: "ads" },
  { key: "ctr", term: "CTR", short: "Click-through rate: out of everyone who saw your ad, the share who tapped it.", example: "1,000 people saw it and 30 tapped: a 3% CTR.", aliases: ["click-through rate", "click through rate"], introKey: "ads" },
  { key: "roas", term: "ROAS", short: "Return on ad spend: how much you sold for every ₦1 the advert cost.", example: "You spent ₦10,000 and sold ₦40,000: a ROAS of 4.", aliases: ["return on ad spend"], introKey: "ads" },
  { key: "reviews", term: "Reviews", short: "Stars and comments from buyers that help new customers trust you.", example: "“Delivered in Ikeja same day. Fabric is lovely!” ★★★★★", aliases: ["review", "ratings", "testimonials", "reviews and ratings"], introKey: "reviews" },
  { key: "video-studio", term: "Video studio", short: "Rex turns your product photos into short videos for TikTok, Reels and Status.", example: "Three photos of your sneakers become a 15-second TikTok with music.", aliases: ["video", "videos"], introKey: "video-studio" },

  // ── Selling channels and inbox ──
  { key: "channels", term: "Sell everywhere", short: "Connect WhatsApp, Instagram, TikTok and Facebook so orders from all of them land in one place.", example: "A buyer on Instagram and one on WhatsApp both show up in Orders.", aliases: ["channels", "channel", "sales channels", "social selling"], introKey: "channels" },
  { key: "inbox", term: "Inbox", short: "All your customer chats from WhatsApp, Instagram, live chat and forms in one list.", example: "Reply to Tunde’s Instagram DM and Bisi’s WhatsApp from the same screen.", aliases: ["chats", "messages", "conversations", "all conversations"], introKey: "inbox" },
  { key: "live-chat", term: "Live chat", short: "A chat bubble on your shop so visitors can ask questions while they browse.", example: "“Do you have this in size 42?” answered before they leave.", aliases: ["chat widget"], introKey: "inbox" },
  { key: "auto-replies", term: "Auto-replies", short: "Answers that send themselves to common questions, even at night.", example: "Someone asks “Do you deliver to Ibadan?” at 11pm and gets your delivery fees at once.", aliases: ["auto-reply", "auto reply", "away message", "quick replies"], introKey: "automations" },
  { key: "chatbot", term: "Chatbot", short: "Peggy answers customer chats for you using your products, prices and policies.", example: "Peggy tells a buyer the red bag is ₦18,500 and sends the checkout link.", aliases: ["bot", "peggy chatbot"], introKey: "inbox" },
  { key: "whatsapp-catalog", term: "WhatsApp catalog", short: "Your products shown inside WhatsApp so buyers can browse without leaving the chat.", example: "A customer taps your catalog and picks two jars of shea butter.", aliases: ["catalog", "catalogue", "products on whatsapp"], introKey: "channels" },
  { key: "notifications", term: "Notifications", short: "Alerts about new orders, messages and things that need you.", example: "“New order: ₦24,000 from Kemi in Yaba.”", aliases: ["notification", "alerts"], introKey: "notifications" },

  // ── Orders and sales ──
  { key: "dashboard", term: "Dashboard", short: "Your first screen: today’s sales, what needs doing and tips, all in one place.", example: "“3 orders to pack, 5 new chats, ₦86,500 sold today.”", aliases: ["home dashboard", "today dashboard"], introKey: "home" },
  { key: "orders", term: "Orders", short: "Every sale, with who bought, what, how they paid and where the parcel is now.", example: "Order #1042: Kemi in Yaba, 2 ankara and a gele, ₦24,000, paid by transfer.", aliases: ["order", "all orders", "orders and order status"], introKey: "orders" },
  { key: "order-status", term: "Order status", short: "Where an order is now: New, Paid, Packed, On the way or Delivered.", example: "Kemi’s order moves from Packed to On the way when the rider picks it up.", aliases: ["status", "order statuses", "statuses"], introKey: "orders" },
  { key: "record-sale", term: "Record a sale", short: "Add a sale made at your stall, by phone or on WhatsApp, so stock and money stay right.", example: "Mama Tobi pays ₦18,500 by transfer for a red bag at your stall. Record it in seconds.", aliases: ["record sale", "new sale", "manual order", "offline sale"], introKey: "record-sale" },
  { key: "receipt", term: "Receipt", short: "Proof of payment you give the buyer after a sale.", example: "Receipt #0187 with your logo, sent to the buyer on WhatsApp.", aliases: ["receipts"], introKey: "record-sale" },
  { key: "customers", term: "Customers", short: "Everyone who has bought from you, with their contact details and order history.", example: "Bisi in Yaba: 4 orders, ₦86,000 spent, loves size 42 sandals.", aliases: ["customer", "all customers", "crm"], introKey: "customers" },
  { key: "repeat-customers", term: "Repeat customers", short: "Buyers who come back and buy again.", example: "38% of last month’s orders came from people who had bought before.", aliases: ["repeat customer", "returning customers", "repeat buyers"], introKey: "customers" },
  { key: "discount-code", term: "Discount code", short: "A word buyers type at checkout to get money off.", example: "SALLAH20 takes 20% off; FIRST1000 takes ₦1,000 off a first order.", aliases: ["discount codes", "coupon code", "coupon codes", "promo code", "promo codes"], introKey: "discounts" },
  { key: "due-date", term: "Due date", short: "The last day a customer should pay an invoice.", example: "Invoice #014 for ₦480,000, due Friday.", aliases: ["due", "payment due"], introKey: "invoices" },
  { key: "tin", term: "TIN", short: "Tax Identification Number: the number the tax office gives your business.", example: "Printed on your tax invoices so company buyers can account for the VAT.", aliases: ["tax id", "tax identification number"], introKey: "taxes" },

  // ── Products and stock ──
  { key: "inventory", term: "Inventory", short: "How many of each product you have in stock right now.", example: "12 black wigs, 3 brown. When 3 sell, brown shows “Sold out”.", aliases: ["stock", "stock level", "how many you have"], introKey: "inventory" },
  { key: "variants", term: "Variants", short: "Versions of one product, like sizes or colours, each with its own stock and price.", example: "One dress in S, M and L, in red and green: six variants.", aliases: ["variant", "options", "sizes", "colours", "colors"], introKey: "inventory" },
  { key: "sku", term: "SKU", short: "A short code you give each product or variant so you can find and count it fast.", example: "DRS-RED-M for the red dress in medium.", aliases: ["skus", "stock keeping unit", "product code"], introKey: "inventory" },
  { key: "collections", term: "Collections", short: "Groups of products shown together on your shop, like a shelf.", example: "“Owambe Ready”: lace, gele and matching bags.", aliases: ["collection", "collections and categories"], introKey: "collections" },
  { key: "categories", term: "Categories", short: "The type of each product, so buyers and search can find it.", example: "Hair › Wigs › Bone straight.", aliases: ["category"], introKey: "collections" },
  { key: "imports", term: "Bulk import", short: "Bring in many products at once from a spreadsheet or another shop.", example: "Upload your Excel list of 80 phone cases instead of typing each one.", aliases: ["import", "bulk upload", "csv", "product import"], introKey: "inventory" },
  { key: "sourcing-imports", term: "Imports", short: "Goods bought abroad, like in China, by a sourcing partner who checks and ships them to you.", example: "300 phone cases from a 1688 link, checked in Guangzhou and shipped to Lagos.", aliases: ["importing", "import from china", "1688", "imports from china"], introKey: "imports" },
  { key: "labels", term: "Labels", short: "Printable stickers with the address and order number for each package.", example: "Print 15 labels for today’s Lekki deliveries in one go.", aliases: ["shipping labels", "labels and print"] },

  // ── Sourcing ──
  { key: "marketplace", term: "Marketplace", short: "Products from checked suppliers that you can sell in your shop.", example: "Find a supplier in Aba with 500 leather sandals ready to sell.", aliases: ["find products", "suppliers", "find products to sell"], introKey: "marketplace" },
  { key: "dropship", term: "Dropship", short: "Sell a supplier’s product without buying stock first; they send it to your customer.", example: "You sell a ₦15,000 bag, the supplier in Kano ships it, you keep the difference.", aliases: ["dropshipping", "drop ship", "sell without stock"], introKey: "dropship" },
  { key: "wholesale", term: "Wholesale", short: "Buying many pieces at once from a supplier at a lower price per piece.", example: "200 phone cases at ₦900 each instead of ₦2,000 one by one.", aliases: ["bulk", "bulk orders", "wholesale orders", "bulk buying"], introKey: "wholesale" },
  { key: "quote-requests", term: "Quote requests", short: "Asking a supplier for their best price on a quantity before you buy.", example: "“What’s your price for 100 cartons of noodles, delivered to Onitsha?”", aliases: ["quote request", "quote", "quotes", "price requests", "price request", "rfq"], introKey: "wholesale" },
  { key: "white-label", term: "White label", short: "A supplier’s product sold under your own brand name and packaging.", example: "Plain body butter from a Lagos factory, sold as “Glow by Amaka”.", aliases: ["white-label", "private label", "own brand"], introKey: "supplier-products" },

  // ── Store ──
  { key: "store-settings", term: "Store settings", short: "Your shop’s name, contact details, address and opening hours, and your own login.", example: "Change your opening hours to 9am–7pm and they update on your shop and receipts.", aliases: ["shop settings"], introKey: "store-settings" },
  { key: "store-builder", term: "Store builder", short: "Where you design your shop’s pages by dragging blocks, or ask Rex to do it.", example: "Add a banner, a “Best sellers” row and your Instagram feed.", aliases: ["editor", "edit your store", "builder", "your store"], introKey: "templates" },
  { key: "themes", term: "Themes", short: "The overall look of your shop: colours, fonts and layout, changed in one click.", example: "Switch from a bright “Market” theme to a calm “Boutique” theme.", aliases: ["theme", "how your shop looks"], introKey: "templates" },
  { key: "pages", term: "Pages", short: "The separate screens of your shop, like About, Contact or Size guide.", example: "An “About us” page telling how you started in your mum’s shop.", aliases: ["page"] },
  { key: "menus", term: "Menus", short: "The links at the top and bottom of your shop that help buyers move around.", example: "Shop · Wigs · Lace · Contact.", aliases: ["menu", "navigation"] },
  { key: "content", term: "Content", short: "Blog posts and articles on your shop that bring visitors from Google.", example: "“5 ways to keep your wig fresh in Harmattan.”", aliases: ["blog", "cms", "articles"], introKey: "seo" },
  { key: "brand-kit", term: "Brand kit", short: "Your logo, colours and fonts in one place, so everything you make looks like you.", example: "Your mint green, your logo and your tagline on every flyer Rex makes.", aliases: ["brand", "branding"], introKey: "brand-kit" },
  { key: "media", term: "Media library", short: "Every picture and video in your shop, kept in one place to name, describe and use again.", example: "Pick last month’s Ankara photo for a new banner instead of uploading it again.", aliases: ["my media", "alt text", "pictures and videos"], introKey: "media" },
  { key: "studio", term: "Rex Studio", short: "Rex, the AI designer, makes product photos, logos and posts for you.", example: "Turn a phone photo of a cake into a clean white-background picture.", aliases: ["rex studio", "studio"], introKey: "rex-studio" },
  { key: "domain", term: "Domain", short: "Your shop’s own web address that people type to find you.", example: "mamaputkitchen.com instead of a long link.", aliases: ["domains", "web address", "custom domain", "url"], introKey: "domain" },
  { key: "checkout", term: "Checkout", short: "The page where a buyer enters their address and pays.", example: "Kemi adds her Yaba address, picks bank transfer and pays ₦24,000.", aliases: ["payment page", "check out"], introKey: "abandoned-carts" },
  { key: "abandoned-carts", term: "Abandoned carts", short: "Carts people filled but left before paying, so you can remind them.", example: "Bola added two wigs at 10pm and left. A reminder brings her back.", aliases: ["abandoned cart", "abandoned checkout", "cart and wishlist", "cart", "wishlist"], introKey: "abandoned-carts" },
  { key: "seo", term: "SEO", short: "Making your shop easy to find on Google for free.", example: "Showing up when someone searches “ankara gown Abuja”.", aliases: ["search engine optimisation", "search engine optimization", "show up on google", "google", "seo and content"], introKey: "seo" },
  { key: "legal-pages", term: "Legal pages", short: "Your refund, privacy and delivery rules, written down so buyers trust you.", example: "“Returns within 7 days if the item is unused.”", aliases: ["legal", "policies", "terms"], introKey: "legal-pages" },
  { key: "integrations", term: "Integrations", short: "Connections that let Shopinbos share data with other apps you use.", example: "Connect your dispatch system so new jobs appear in your rider app.", aliases: ["integration", "connect your system", "apps", "api"], introKey: "partner-connect" },
  { key: "store-health", term: "Store health", short: "A checklist that shows what to fix so your shop sells better.", example: "“3 products have no photo” and “Add a delivery fee for Abuja”.", aliases: ["health"] },
  { key: "activity", term: "Activity", short: "A log of what changed in your shop and who changed it.", example: "“Peggy lowered the price of the red bag to ₦16,000 at 2:14pm.”", aliases: ["activity log", "history"] },

  // ── Money ──
  { key: "payments", term: "Payments", short: "Money customers pay you, by card, bank transfer, USSD or cash on delivery.", example: "₦18,000 by transfer from Chidi, ₦9,500 cash on delivery from Halima.", aliases: ["payment"], introKey: "payouts" },
  { key: "payouts", term: "Payouts", short: "Money Shopinbos sends from your sales into your bank account.", example: "Monday’s ₦64,000 in sales lands in your GTBank on Tuesday.", aliases: ["payout", "money sent to your bank", "earnings", "withdrawals"], introKey: "payouts" },
  { key: "settlement", term: "Settlement", short: "The moment your money is cleared and moved to your bank.", example: "Card payments settle the next working day.", aliases: ["settlements", "settled"], introKey: "payouts" },
  { key: "escrow", term: "Escrow", short: "Money held safely in the middle until the order is delivered, then released.", example: "The buyer pays ₦30,000; it’s released to you once they get the parcel.", aliases: ["held money", "on hold"], introKey: "payouts" },
  { key: "invoices", term: "Invoices", short: "A bill with your logo that tells a customer what they owe and how to pay.", example: "Invoice #014 for 20 cartons, due Friday.", aliases: ["invoice", "invoicing"], introKey: "invoices" },
  { key: "taxes", term: "Taxes", short: "VAT and other taxes added to prices or set aside from sales.", example: "7.5% VAT shown at checkout for buyers who need a receipt.", aliases: ["tax", "vat", "taxes and vat"], introKey: "taxes" },
  { key: "cod", term: "COD", short: "Cash on delivery: the buyer pays the rider when the parcel arrives.", example: "The rider collects ₦12,000 cash at the door in Surulere.", aliases: ["cash on delivery", "pay on delivery", "cash collected", "pay on arrival"], introKey: "partner-cash" },
  { key: "pay-ins", term: "Pay-ins", short: "Cash your riders collected that your company sends back to Shopinbos for the seller.", example: "Riders collected ₦85,000 today; pay it in by tomorrow 6pm.", aliases: ["pay-in", "pay in", "remittance"], introKey: "partner-cash" },
  { key: "fees", term: "Fees", short: "What Shopinbos charges per order or job, shown before you agree.", example: "₦150 per delivery job, taken from the payout.", aliases: ["fee", "billing", "commission fee"] },

  // ── Delivery ──
  { key: "fulfilment", term: "Fulfilment", short: "Everything after an order: packing, sending and getting it to the customer.", example: "Pack the shoes, print the label, hand to the rider: order fulfilled.", aliases: ["fulfillment", "fulfil", "fulfill", "fulfilled"], introKey: "supplier-orders" },
  { key: "logistics", term: "Logistics", short: "Delivery companies and riders who move parcels from you to your customers.", example: "A Lagos bike company picks up in Ikeja and delivers in Lekki the same day.", aliases: ["delivery", "delivery partners", "delivery companies", "shipping", "dispatch"], introKey: "delivery" },
  { key: "shipping-rates", term: "Shipping rates", short: "What you charge buyers for delivery, by area or by weight.", example: "₦2,000 within Lagos Mainland, ₦3,500 to the Island, ₦5,000 outside Lagos.", aliases: ["shipping rate", "delivery fees", "delivery fee"], introKey: "shipping-rates" },
  { key: "jobs", term: "Jobs", short: "Delivery requests from shops that your company can accept and complete.", example: "Pick up 3 parcels in Yaba, drop off in Surulere, Ikeja and Ajah.", aliases: ["job", "bookings", "delivery jobs"], introKey: "partner-jobs" },
  { key: "riders", term: "Riders", short: "The people on your team who pick up and drop off parcels.", example: "Musa and Tobi on bikes, Femi in the van.", aliases: ["rider", "couriers", "courier", "fleet"], introKey: "partner-riders" },
  { key: "delivery-rates", term: "Delivery rates", short: "The prices you charge shops for each delivery, by area, weight or distance.", example: "₦2,000 on the Mainland, ₦3,500 to the Island, plus ₦500 over 5kg.", aliases: ["rates", "delivery pricing"], introKey: "partner-coverage" },
  { key: "coverage", term: "Coverage", short: "The areas you deliver to, so shops only send you jobs you can do.", example: "All of Lagos Mainland and Lekki, not Ikorodu.", aliases: ["coverage areas", "service area", "coverage and rates"], introKey: "partner-coverage" },

  // ── Partners and trust ──
  { key: "company-profile", term: "Company profile", short: "Your company’s name, logo, location and story, which shops see before they pick you.", example: "“Kano Shea Co. Family shea butter makers since 2009. Ships nationwide.”", aliases: ["company", "company profile and settings"], introKey: "company-profile" },
  { key: "on-time-rate", term: "On-time rate", short: "The share of orders or deliveries you finished by the time you promised.", example: "48 of 50 deliveries on time this week: a 96% on-time rate.", aliases: ["on time rate", "on-time", "performance and reviews"], introKey: "partner-performance" },
  { key: "api-key", term: "API key", short: "A secret code that lets another app work with your Shopinbos account.", example: "Paste it into your dispatch software, and keep it secret like a password.", aliases: ["api keys", "secret key"], introKey: "partner-connect" },
  { key: "buyers", term: "Buyers", short: "The shops that sell or buy your products.", example: "14 shops sell your sandals; 3 buy in bulk every month.", aliases: ["buyer", "shops selling your products"], introKey: "supplier-buyers" },
  { key: "verification", term: "Verification", short: "Checking your ID or company papers so shops and buyers can trust you.", example: "Upload your CAC certificate and get a “Verified” badge.", aliases: ["verify", "kyc", "kyb", "cac", "verified"], introKey: "verification" },
];

const BY_KEY = new Map(GLOSSARY.map((entry) => [entry.key, entry]));

/** The entry for a key, or null. */
export function glossaryTerm(key: string | null | undefined): GlossaryEntry | null {
  return key ? BY_KEY.get(key) ?? null : null;
}

function normalise(text: string) {
  return text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The glossary entry `text` is about. With `exact`, the whole text must be the term or an alias (page titles,
 * nav labels); otherwise the first term or alias found as a whole word wins, longest words first, so "Abandoned
 * carts" beats "cart".
 */
export function findTerm(text: string | null | undefined, { exact = false }: { exact?: boolean } = {}): GlossaryEntry | null {
  const clean = normalise(text ?? "");
  if (!clean) return null;
  const words = GLOSSARY.flatMap((entry) => [entry.term, ...entry.aliases].map((word) => ({ entry, word: normalise(word) })));
  const exactHit = words.find((item) => item.word === clean);
  if (exactHit || exact) return exactHit?.entry ?? null;
  const sorted = [...words].sort((a, b) => b.word.length - a.word.length);
  for (const item of sorted) {
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(item.word)}($|[^\\p{L}\\p{N}])`, "u").test(clean)) return item.entry;
  }
  return null;
}

// ─── Sidebar items → glossary ────────────────────────────────────────────────
// Nav item and submenu ids (src/lib/nav.ts) per role, mapped to the term they're named after. Ids in PLAIN_NAV are
// everyday words that need no explaining (Home, Orders, Settings). tests/learn.test.mjs checks every nav id is in
// one of the two.

export type GlossaryRole = "seller" | "supplier" | "logistics_partner";

const SHARED_NAV: Record<string, string> = {
  inbox: "inbox", "inbox-messages": "inbox", "inbox-partners": "inbox", "inbox-forms": "forms", "inbox-chat": "live-chat",
  "inbox-auto-replies": "auto-replies", "inbox-chatbot": "chatbot", "inbox-whatsapp-catalog": "whatsapp-catalog", "inbox-notifications": "notifications",
  reviews: "reviews", verification: "verification", cms: "content", analytics: "analytics", payouts: "payouts",
};

export const NAV_TERMS: Record<GlossaryRole, Record<string, string>> = {
  seller: {
    ...SHARED_NAV,
    products: "inventory", "products-import": "imports", inventory: "inventory", collections: "collections", categories: "categories",
    "find-products": "marketplace", "find-products-all": "marketplace", "find-suppliers": "marketplace", "find-logistics": "logistics", "find-wholesale-orders": "wholesale",
    dropship: "dropship", imports: "sourcing-imports",
    orders: "orders", "orders-all": "orders", "orders-new": "record-sale", customers: "customers", "customers-all": "customers",
    subscribers: "subscribers", segments: "segments",
    "your-store": "store-builder", editor: "store-builder", pages: "pages", navigation: "menus", blog: "content", checkout: "checkout", cart: "abandoned-carts", seo: "seo", legal: "legal-pages",
    "rex-studio": "studio", "studio-home": "studio", "studio-images": "studio", "studio-logo": "brand-kit", "brand-kit": "brand-kit", media: "media", templates: "themes", domain: "domain",
    marketing: "campaigns", "marketing-overview": "campaigns", campaigns: "campaigns", automations: "automations", "email-templates": "templates", "mkt-forms": "forms", "mkt-rewards": "rewards", "marketing-analytics": "analytics",
    ads: "ads", video: "video-studio", discounts: "discounts", affiliates: "affiliates", "sell-everywhere": "channels",
    money: "payments", payments: "payments", invoices: "invoices", taxes: "taxes",
    delivery: "logistics", "delivery-partners": "logistics", shipping: "shipping-rates", labels: "labels",
    reports: "analytics", "reports-sales": "analytics", health: "store-health", activity: "activity",
  },
  supplier: {
    ...SHARED_NAV,
    orders: "fulfilment", "dropship-orders": "dropship", "wholesale-orders": "wholesale", "quote-requests": "quote-requests",
    products: "white-label", buyers: "buyers", "buyers-all": "buyers",
  },
  logistics_partner: {
    ...SHARED_NAV,
    bookings: "jobs", "jobs-all": "jobs", quotes: "quote-requests", couriers: "riders", cash: "cod",
    coverage: "coverage", "coverage-areas": "coverage", pricing: "delivery-rates", earnings: "payouts", billing: "fees", performance: "analytics", connect: "integrations",
  },
};

/** Everyday nav words that need no tooltip. */
export const PLAIN_NAV = new Set([
  "start", "home", "dashboard", "products-all", "products-new",
  "settings", "settings-store", "settings-main", "profile", "company", "notification-prefs", "customise", "team",
]);

/** The glossary entry for a sidebar item, or null for plain words and unknown ids. */
export function navTerm(role: string | null | undefined, navId: string): GlossaryEntry | null {
  const map = NAV_TERMS[(role ?? "seller") as GlossaryRole] ?? NAV_TERMS.seller;
  return glossaryTerm(map[navId]);
}
