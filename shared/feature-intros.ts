// 60-second feature intros: five short animated scenes that teach one feature and the standard word for it
// (Segments, Campaigns, Payouts…). The web plays them in src/components/learn/FeatureIntro.tsx, the phone app in
// apps/mobile/src/components/learn/FeatureIntroSheet.tsx; both draw each scene's `art` from their own scene kit.
// Each intro opens by itself once per person, the first time they visit one of its screens, and can be replayed
// from "Learn · 60s". Pure and import-free; tests/learn.test.mjs checks timings, art ids and path matching.

/** The animated illustrations both scene kits draw. */
export const SCENE_ARTS = [
  "phone-store", // phone frame showing a little shop
  "dots-sort", // customer dots sorting into labelled groups
  "chat-bubbles", // a chat with bubbles popping in
  "send-burst", // one message bursting out as email, WhatsApp and SMS
  "chart-grow", // bars and a line growing
  "money-flow", // coins flowing from a sale into a bank
  "store-card", // a shop card with its products appearing
  "product-stock", // a product card with a stock counter and variant chips
  "bike-route", // a delivery bike riding a route between pins
  "domain-type", // a browser bar with a web address typing in
  "supplier-ship", // supplier warehouse → box → customer's door
  "flow-nodes", // automation steps lighting up one after another
  "cart-remind", // a cart left behind, a reminder, then paid
  "ad-funnel", // ad budget → people who saw it → taps → sales
  "link-share", // a shared link that pays a commission
  "quote-tags", // price tags going back and forth to a deal
  "cash-collect", // rider collects cash at the door → pay-in
  "theme-swap", // a shop changing theme
  "order-pipeline", // an order moving through its statuses: new → paid → packed → on the way → delivered
  "receipt", // a receipt printing line by line, then stamped paid
  "invoice-paper", // a paper document (invoice, policy, certificate) with a total and a stamp
  "star-reviews", // a star rating filling up and review cards sliding in
  "customer-cards", // a customer card with tags, order history and what they've spent
  "discount-ticket", // a discount ticket with its code typing in
  "brand-palette", // a logo, colour swatches and fonts, stamped onto a flyer, a label and a phone
  "import-ship", // a container ship sailing to port, a plane overhead
  "video-reel", // photos flying into a phone and playing as a short video
  "dashboard-tiles", // a home screen: greeting, a sales tile, a to-do list and little bars
  "map-zones", // a city map with delivery zones and a price tag
  "badge-verify", // papers being scanned, then a verified shield
  "rider-team", // a row of riders with who's free and who's on a job
  "inbox-list", // one inbox list with chats from many apps and an unread count
  "bell-alerts", // a ringing bell and alerts sliding in
  "search-rank", // a search typed into Google and your shop rising to the top
] as const;
export type SceneArt = (typeof SCENE_ARTS)[number];

export interface IntroScene {
  art: SceneArt;
  /** One line, the scene's point. */
  caption: string;
  /** A short spoken-style line under it. */
  sub: string;
  durationMs: number;
  /** Text the art shows (a web address, a group name, a product). */
  label?: string;
  /** Short words the art shows as chips (group names, sizes, channels). */
  chips?: string[];
  /** A number the art counts to or shows ("₦64,000", "3 left"). */
  value?: string;
}

export type IntroRole = "seller" | "supplier" | "logistics_partner";

export interface FeatureIntro {
  key: string;
  /** The standard word this intro teaches (shared/glossary.ts key). */
  term: string;
  title: string;
  roles: IntroRole[];
  /** Screens (web and mobile paths) this intro belongs to, with the pages under them. The longest matching prefix wins. */
  paths: string[];
  /** Screens that match only exactly, not the pages under them (Home is "/home", but "/home/orders" isn't Home). */
  exactPaths?: string[];
  /** The related help topic (shared/help-videos.ts), for "Watch the video" when one is published. */
  helpTopic?: string;
  /** The page's main action, offered on the last scene. */
  cta?: { label: string; href: string };
  scenes: IntroScene[];
}

const S = 12_000;

export const FEATURE_INTROS: FeatureIntro[] = [
  // ─── Sellers ───
  {
    key: "segments",
    term: "segments",
    title: "Segments",
    roles: ["seller"],
    paths: ["/home/marketing/segments"],
    helpTopic: "get_customers",
    cta: { label: "Create your first segment", href: "/home/marketing/segments" },
    scenes: [
      { art: "dots-sort", caption: "Your customers aren’t all the same.", sub: "Some buy every week, some bought once at Christmas, some live far from you.", durationMs: S, chips: ["Everyone"] },
      { art: "dots-sort", caption: "A segment is a group you choose.", sub: "Pick a rule, like “bought shoes twice” or “lives in Lagos”, and Shopinbos sorts them for you.", durationMs: S, chips: ["Lagos", "Bought twice", "New"] },
      { art: "chat-bubbles", caption: "It keeps itself up to date.", sub: "When Bisi in Yaba buys her second pair, she joins “Bought twice” on her own.", durationMs: S, label: "Bisi joined Bought twice" },
      { art: "send-burst", caption: "Send the right message to the right people.", sub: "Tell only your Abuja buyers about free delivery in Abuja. Nobody else gets spammed.", durationMs: S, label: "Abuja buyers" },
      { art: "chart-grow", caption: "Fewer messages, more sales.", sub: "Targeted messages get more replies. Start with one segment: your best customers.", durationMs: S },
    ],
  },
  {
    key: "campaigns",
    term: "campaigns",
    title: "Campaigns",
    roles: ["seller"],
    paths: ["/home/marketing/campaigns", "/home/marketing/messages", "/home/marketing/whatsapp", "/home/marketing", "/marketing"],
    helpTopic: "get_customers",
    cta: { label: "Start a campaign", href: "/home/marketing/campaigns" },
    scenes: [
      { art: "chat-bubbles", caption: "A campaign is one message to many customers.", sub: "Instead of sending 200 WhatsApps by hand, you write it once.", durationMs: S, label: "New ankara just landed!" },
      { art: "dots-sort", caption: "Choose who gets it.", sub: "Everyone, your subscribers, or a segment like “VIP buyers in Lagos”.", durationMs: S, chips: ["All", "VIP", "Lagos"] },
      { art: "send-burst", caption: "Email, WhatsApp or SMS.", sub: "Pick the channel your customers actually read. Send now or schedule for Friday 7pm.", durationMs: S, label: "Friday 7pm" },
      { art: "chart-grow", caption: "See what happened.", sub: "Who opened it, who tapped the link, and how many orders it brought.", durationMs: S, value: "9 orders" },
      { art: "store-card", caption: "Turn a quiet week into sales days.", sub: "New stock, a discount code or a festive message: one campaign does it.", durationMs: S, label: "SALLAH20" },
    ],
  },
  {
    key: "automations",
    term: "automations",
    title: "Automations",
    roles: ["seller"],
    paths: ["/home/automations", "/seller/automations", "/home/inbox/auto-replies", "/inbox/auto-replies"],
    cta: { label: "Turn on an automation", href: "/home/automations" },
    scenes: [
      { art: "flow-nodes", caption: "Automations work while you sleep.", sub: "Something happens in your shop, and a message or task follows by itself.", durationMs: S, chips: ["Order paid", "Wait 5 days", "Ask for review"] },
      { art: "chat-bubbles", caption: "Say thank you, every time.", sub: "Every buyer gets “Thank you, Ada! Your order is on its way” the moment they pay.", durationMs: S, label: "Thank you, Ada!" },
      { art: "cart-remind", caption: "Bring back carts people left.", sub: "If someone leaves at checkout, a friendly reminder goes out an hour later.", durationMs: S },
      { art: "flow-nodes", caption: "You set the steps once.", sub: "When → wait → send. Add a discount for a second order, or a birthday message.", durationMs: S, chips: ["Bought once", "Wait 30 days", "Send 10% off"] },
      { art: "chart-grow", caption: "More repeat buyers, no extra work.", sub: "Start with a ready-made automation and switch it on.", durationMs: S },
    ],
  },
  {
    key: "analytics",
    term: "analytics",
    title: "Analytics",
    roles: ["seller"],
    paths: ["/home/analytics", "/home/marketing/analytics", "/home/insights", "/home/health", "/home/activity"],
    scenes: [
      { art: "chart-grow", caption: "Analytics are your shop’s numbers.", sub: "Visits, orders and sales, by day, week or month.", durationMs: S, value: "₦412,000" },
      { art: "phone-store", caption: "See where buyers come from.", sub: "TikTok, Instagram, WhatsApp or Google: you’ll know which one sells.", durationMs: S, chips: ["TikTok", "Instagram", "WhatsApp"] },
      { art: "product-stock", caption: "Find your best sellers.", sub: "The red bag sold 40 this month. Restock it before it runs out.", durationMs: S, label: "Red leather bag", value: "40 sold" },
      { art: "dots-sort", caption: "Visits vs orders.", sub: "100 visits and 3 orders means a 3% conversion. Better photos can push it up.", durationMs: S, chips: ["Visited", "Ordered"] },
      { art: "chart-grow", caption: "Check it once a week.", sub: "Five minutes on Monday shows what to do more of.", durationMs: S },
    ],
  },
  {
    key: "subscribers",
    term: "subscribers",
    title: "Subscribers",
    roles: ["seller"],
    paths: ["/home/marketing/subscribers", "/home/marketing/forms", "/home/forms"],
    cta: { label: "Add a sign-up pop-up", href: "/home/marketing/forms" },
    scenes: [
      { art: "phone-store", caption: "Subscribers said “yes, message me”.", sub: "They gave you their email or WhatsApp number and agreed to hear from you.", durationMs: S, label: "Get ₦1,000 off" },
      { art: "dots-sort", caption: "Your list grows from your shop.", sub: "A pop-up, a form at checkout or a QR code at your stall collects them.", durationMs: S, chips: ["Pop-up", "Checkout", "QR"] },
      { art: "send-burst", caption: "Message them for free, any time.", sub: "New stock, sales and stories go straight to people who want them.", durationMs: S },
      { art: "chat-bubbles", caption: "They can leave any time.", sub: "Every message has an unsubscribe link. That keeps your list honest and legal.", durationMs: S, label: "Unsubscribe" },
      { art: "chart-grow", caption: "A list is a shop you own.", sub: "Followers can vanish with an app. Subscribers stay yours.", durationMs: S, value: "240" },
    ],
  },
  {
    key: "domain",
    term: "domain",
    title: "Domain",
    roles: ["seller"],
    paths: ["/home/domain"],
    helpTopic: "web_address",
    cta: { label: "Choose your domain", href: "/home/domain" },
    scenes: [
      { art: "domain-type", caption: "A domain is your shop’s web address.", sub: "It’s what people type, or tap, to reach your shop.", durationMs: S, label: "mamaputkitchen.com" },
      { art: "store-card", caption: "You already have a free one.", sub: "Every shop starts with a free Shopinbos address you can share today.", durationMs: S, label: "mamaput.shopinbos.com" },
      { art: "domain-type", caption: "Your own name looks more trusted.", sub: "Buy a .com or .ng and it points to the same shop, with the padlock on.", durationMs: S, label: "mamaput.ng" },
      { art: "chat-bubbles", caption: "Easy to say, easy to remember.", sub: "“Order on mamaput.ng” fits on a flyer, a bag or a radio advert.", durationMs: S, label: "Order on mamaput.ng" },
      { art: "phone-store", caption: "Set it up in a few taps.", sub: "Search a name, pay, and we connect it for you. No tech skills needed.", durationMs: S },
    ],
  },
  {
    key: "dropship",
    term: "dropship",
    title: "Dropship",
    roles: ["seller"],
    paths: ["/home/dropship", "/dropship"],
    helpTopic: "sell_without_stock",
    cta: { label: "Find products to sell", href: "/marketplace" },
    scenes: [
      { art: "store-card", caption: "Dropship means selling without stock.", sub: "Add a supplier’s product to your shop. You never buy it upfront.", durationMs: S, label: "Leather sandals" },
      { art: "phone-store", caption: "A customer buys from you.", sub: "They pay your price, say ₦15,000, on your shop.", durationMs: S, value: "₦15,000" },
      { art: "supplier-ship", caption: "The supplier sends it.", sub: "The order goes to the supplier in Aba, who packs it and ships it to your customer.", durationMs: S, label: "Aba → Lekki" },
      { art: "money-flow", caption: "You keep the difference.", sub: "Supplier price ₦9,000, your price ₦15,000: ₦6,000 is yours.", durationMs: S, value: "₦6,000" },
      { art: "chart-grow", caption: "Test products with zero risk.", sub: "Only buy stock once you know it sells.", durationMs: S },
    ],
  },
  {
    key: "wholesale",
    term: "wholesale",
    title: "Wholesale and quote requests",
    roles: ["seller"],
    paths: ["/marketplace/wholesale", "/marketplace/suppliers", "/suppliers"],
    cta: { label: "Browse suppliers", href: "/marketplace/suppliers" },
    scenes: [
      { art: "product-stock", caption: "Wholesale is buying in bulk.", sub: "200 phone cases at ₦900 each costs far less than buying them one by one.", durationMs: S, label: "Phone cases", value: "200" },
      { art: "quote-tags", caption: "A quote request asks for the best price.", sub: "Tell the supplier how many and where. They reply with a price.", durationMs: S, chips: ["₦1,100", "₦950", "₦900"] },
      { art: "chat-bubbles", caption: "Agree before you pay.", sub: "Ask about delivery to Onitsha, packaging or payment terms in the same chat.", durationMs: S, label: "Delivered to Onitsha?" },
      { art: "supplier-ship", caption: "Stock arrives at your shop.", sub: "Your inventory goes up and the products are ready to sell.", durationMs: S, label: "Warehouse → You" },
      { art: "money-flow", caption: "Bigger margins on every sale.", sub: "Lower cost per piece means more profit when you sell.", durationMs: S, value: "+₦1,100 each" },
    ],
  },
  {
    key: "payouts",
    term: "payouts",
    title: "Payouts",
    roles: ["seller"],
    paths: ["/home/payouts", "/home/payments"],
    helpTopic: "get_paid",
    cta: { label: "Add your bank account", href: "/home/payouts" },
    scenes: [
      { art: "phone-store", caption: "A customer pays you.", sub: "By card, bank transfer, USSD or cash on delivery.", durationMs: S, value: "₦24,000" },
      { art: "money-flow", caption: "Payments collect in your balance.", sub: "Every sale shows up in Money, with who paid and how.", durationMs: S, value: "₦64,000" },
      { art: "cash-collect", caption: "Escrow keeps everyone safe.", sub: "Some money waits in the middle until the parcel is delivered, then it’s released.", durationMs: S, label: "Held till delivered" },
      { art: "money-flow", caption: "A payout sends it to your bank.", sub: "Settlement is when it clears, usually the next working day.", durationMs: S, label: "GTBank •• 4821", value: "₦64,000" },
      { art: "chart-grow", caption: "Add your bank once.", sub: "Then every payout lands on its own. You’ll get a message each time.", durationMs: S },
    ],
  },
  {
    key: "inventory",
    term: "inventory",
    title: "Products, inventory and variants",
    roles: ["seller"],
    paths: ["/products", "/home/inventory", "/seller/products", "/add-products"],
    helpTopic: "add_product",
    cta: { label: "Add a product", href: "/products/new" },
    scenes: [
      { art: "product-stock", caption: "Inventory is how many you have.", sub: "Every product shows its stock, so you never sell what you don’t have.", durationMs: S, label: "Black wig", value: "12" },
      { art: "product-stock", caption: "Variants are sizes and colours.", sub: "One dress in S, M and L: each size has its own stock and price.", durationMs: S, label: "Ankara dress", chips: ["S", "M", "L"], value: "5" },
      { art: "product-stock", caption: "A SKU is a short product code.", sub: "DRS-RED-M finds the red medium dress in a second, on your phone or shelf.", durationMs: S, label: "DRS-RED-M", value: "3" },
      { art: "store-card", caption: "Collections are shelves on your shop.", sub: "Put lace, gele and bags together in “Owambe Ready”.", durationMs: S, label: "Owambe Ready" },
      { art: "chat-bubbles", caption: "Stock updates itself.", sub: "Each sale takes one off. When it’s low, Peggy tells you to restock.", durationMs: S, label: "Only 3 brown wigs left" },
    ],
  },
  {
    key: "abandoned-carts",
    term: "abandoned-carts",
    title: "Checkout and abandoned carts",
    roles: ["seller"],
    paths: ["/home/commerce/cart", "/home/checkout"],
    cta: { label: "Turn on cart reminders", href: "/home/commerce/cart" },
    scenes: [
      { art: "phone-store", caption: "Checkout is where buyers pay.", sub: "Address, delivery and payment on one simple page.", durationMs: S, value: "₦24,000" },
      { art: "cart-remind", caption: "Many people leave before paying.", sub: "Bola added two wigs at 10pm, then her data ran out. That’s an abandoned cart.", durationMs: S, label: "2 wigs · ₦48,000" },
      { art: "chat-bubbles", caption: "Send a friendly reminder.", sub: "“Hi Bola, your wigs are waiting. Tap to finish your order.”", durationMs: S, label: "Your wigs are waiting" },
      { art: "cart-remind", caption: "She comes back and pays.", sub: "Reminders bring back sales you’d otherwise never know you lost.", durationMs: S, label: "Paid ✓" },
      { art: "chart-grow", caption: "Switch it on once.", sub: "Reminders go out on their own by WhatsApp or email.", durationMs: S },
    ],
  },
  {
    key: "ads",
    term: "ads",
    title: "Ads: budget, CTR and ROAS",
    roles: ["seller"],
    paths: ["/home/ads", "/home/social"],
    helpTopic: "get_customers",
    cta: { label: "Create an ad", href: "/home/ads" },
    scenes: [
      { art: "ad-funnel", caption: "An ad shows your product to new people.", sub: "On Facebook, Instagram or TikTok, to people who don’t follow you yet.", durationMs: S, chips: ["Saw it", "Tapped", "Bought"] },
      { art: "dots-sort", caption: "Your audience is who sees it.", sub: "Women 22–40 in Abuja who like fashion, for example.", durationMs: S, chips: ["Abuja", "22–40", "Fashion"] },
      { art: "money-flow", caption: "Your budget is the most you’ll spend.", sub: "₦2,000 a day for 5 days means ₦10,000 at most. Stop any time.", durationMs: S, value: "₦10,000" },
      { art: "ad-funnel", caption: "CTR: how many tapped.", sub: "1,000 saw it and 30 tapped: a 3% click-through rate.", durationMs: S, value: "3%" },
      { art: "chart-grow", caption: "ROAS: what you got back.", sub: "Spent ₦10,000, sold ₦40,000: a ROAS of 4. Keep the ads with the best ROAS.", durationMs: S, value: "4×" },
    ],
  },
  {
    key: "affiliates",
    term: "affiliates",
    title: "Affiliates",
    roles: ["seller"],
    paths: ["/home/affiliates"],
    cta: { label: "Invite an affiliate", href: "/home/affiliates" },
    scenes: [
      { art: "link-share", caption: "Affiliates sell for you.", sub: "People who love your shop share their own special link.", durationMs: S, label: "shop.ng/?ref=ZARA" },
      { art: "chat-bubbles", caption: "Their friends buy through it.", sub: "A campus influencer posts your wigs on her Status with her link.", durationMs: S, label: "Use my link!" },
      { art: "money-flow", caption: "They earn a commission.", sub: "You choose it, like 10% of each sale. You only pay when there’s a sale.", durationMs: S, value: "10%" },
      { art: "chart-grow", caption: "See who sells the most.", sub: "Every click and sale is tracked to the right person.", durationMs: S },
      { art: "dots-sort", caption: "Start with your best customers.", sub: "Happy buyers make the best affiliates.", durationMs: S, chips: ["Fans", "Friends", "Influencers"] },
    ],
  },
  {
    key: "channels",
    term: "channels",
    title: "WhatsApp and selling everywhere",
    roles: ["seller"],
    paths: ["/channels", "/home/social/whatsapp", "/home/inbox/whatsapp-catalog"],
    helpTopic: "whatsapp",
    cta: { label: "Connect WhatsApp", href: "/channels" },
    scenes: [
      { art: "phone-store", caption: "Your buyers are on many apps.", sub: "WhatsApp, Instagram, TikTok and Facebook. Each one is a sales channel.", durationMs: S, chips: ["WhatsApp", "Instagram", "TikTok"] },
      { art: "chat-bubbles", caption: "One inbox for every chat.", sub: "Reply to Tunde on Instagram and Bisi on WhatsApp from the same screen.", durationMs: S, label: "Is this in size 42?" },
      { art: "store-card", caption: "Your WhatsApp catalog.", sub: "Your products show inside WhatsApp, so buyers pick without leaving the chat.", durationMs: S, label: "WhatsApp catalog" },
      { art: "flow-nodes", caption: "Auto-replies answer at night.", sub: "Questions about price and delivery get answered at once, even at 11pm.", durationMs: S, chips: ["Message", "Auto-reply", "Order"] },
      { art: "chart-grow", caption: "All orders in one place.", sub: "Wherever they buy, the order lands in Orders.", durationMs: S },
    ],
  },
  {
    key: "templates",
    term: "themes",
    title: "Templates and themes",
    roles: ["seller"],
    paths: ["/builder", "/seller/store", "/home/store", "/home/editor", "/home/pages", "/home/navigation", "/shop"],
    helpTopic: "start_shop",
    cta: { label: "Pick a template", href: "/builder/templates" },
    scenes: [
      { art: "theme-swap", caption: "A theme is your shop’s whole look.", sub: "Colours, fonts and layout, changed in one tap.", durationMs: S, chips: ["Market", "Boutique", "Bold"] },
      { art: "store-card", caption: "A template is a ready-made start.", sub: "Pick one made for food, fashion or beauty, then make it yours.", durationMs: S, label: "Mama’s Kitchen" },
      { art: "phone-store", caption: "Swap in your words and photos.", sub: "Your logo, your prices, your story. The design stays neat.", durationMs: S },
      { art: "theme-swap", caption: "Try another any time.", sub: "Your products and orders stay put when you change the look.", durationMs: S, chips: ["Calm", "Bright"] },
      { art: "flow-nodes", caption: "Or ask Rex to do it.", sub: "Tell Rex what you sell and he sets up the theme for you.", durationMs: S, chips: ["Describe", "Rex builds", "Publish"] },
    ],
  },
  {
    key: "delivery",
    term: "logistics",
    title: "Delivery and shipping rates",
    roles: ["seller"],
    paths: ["/home/logistics", "/marketplace/logistics", "/seller/logistics", "/partners", "/home/labels"],
    helpTopic: "delivery",
    cta: { label: "Find a delivery partner", href: "/marketplace/logistics" },
    scenes: [
      { art: "bike-route", caption: "Delivery partners move your parcels.", sub: "Checked bike and van companies in your city, ready to pick up.", durationMs: S, label: "Ikeja → Lekki" },
      { art: "quote-tags", caption: "Book with a clear price.", sub: "See the fee before you book. No haggling at the gate.", durationMs: S, chips: ["₦2,500", "₦3,000", "₦2,000"] },
      { art: "dots-sort", caption: "Shipping rates are what buyers pay.", sub: "Set prices by area: Mainland, Island, outside Lagos.", durationMs: S, chips: ["Mainland", "Island", "Outside"] },
      { art: "bike-route", caption: "Track it to the door.", sub: "You and your customer see when it’s picked up and delivered.", durationMs: S, label: "Delivered ✓" },
      { art: "cash-collect", caption: "Cash on delivery works too.", sub: "The rider collects the cash and it comes back to you as a payout.", durationMs: S, value: "₦12,000" },
    ],
  },

  // ─── Suppliers ───
  {
    key: "supplier-products",
    term: "white-label",
    title: "Your products and white label",
    roles: ["supplier"],
    paths: ["/supplier/products", "/supplier/product"],
    helpTopic: "supplier_products",
    cta: { label: "Add a product", href: "/supplier/products/new" },
    scenes: [
      { art: "product-stock", caption: "List once, sell through many shops.", sub: "Add your product with photos, price and stock.", durationMs: S, label: "Shea body butter", value: "500" },
      { art: "store-card", caption: "Shops add it to their stores.", sub: "Sellers across Nigeria put your product in front of their customers.", durationMs: S, label: "14 shops" },
      { art: "theme-swap", caption: "White label: their brand, your product.", sub: "Allow it, and a shop can sell your butter as “Glow by Amaka”.", durationMs: S, chips: ["Your label", "Their label"] },
      { art: "product-stock", caption: "Keep stock and variants right.", sub: "Sizes and scents each have stock. Shops can’t oversell.", durationMs: S, chips: ["250ml", "500ml"], value: "120" },
      { art: "chart-grow", caption: "More shops, more orders.", sub: "Good photos and honest stock win more sellers.", durationMs: S },
    ],
  },
  {
    key: "supplier-orders",
    term: "fulfilment",
    title: "Orders and fulfilment",
    roles: ["supplier"],
    paths: ["/supplier/orders", "/supplier/order"],
    helpTopic: "supplier_orders",
    scenes: [
      { art: "phone-store", caption: "A shop sold your product.", sub: "Dropship orders come in when a seller’s customer pays.", durationMs: S, value: "₦9,000" },
      { art: "supplier-ship", caption: "Fulfilment is packing and sending.", sub: "Accept, pack and hand over. The countdown shows how long you have.", durationMs: S, label: "Pack by 4pm" },
      { art: "bike-route", caption: "A rider picks it up.", sub: "We book delivery for dropship orders, so you just hand it over.", durationMs: S, label: "Aba → Lekki" },
      { art: "product-stock", caption: "Wholesale orders are bulk orders.", sub: "A shop buys 200 at once, at your bulk price.", durationMs: S, label: "Bulk order", value: "200" },
      { art: "chart-grow", caption: "Ship on time, rank higher.", sub: "Fast fulfilment brings more shops to your products.", durationMs: S },
    ],
  },
  {
    key: "supplier-quotes",
    term: "quote-requests",
    title: "Quote requests",
    roles: ["supplier"],
    paths: ["/supplier/quote-requests", "/supplier/quotes", "/supplier/quote"],
    helpTopic: "supplier_orders",
    scenes: [
      { art: "chat-bubbles", caption: "A shop asks for your price.", sub: "“100 cartons of noodles, delivered to Onitsha. What’s your best price?”", durationMs: S, label: "100 cartons?" },
      { art: "quote-tags", caption: "Reply with a quote.", sub: "Your price per piece, delivery and how long it takes.", durationMs: S, chips: ["₦4,800", "₦4,600", "₦4,500"] },
      { art: "dots-sort", caption: "Fast replies win.", sub: "Shops often ask a few suppliers. The first clear answer usually gets the order.", durationMs: S, chips: ["You", "Others"] },
      { art: "supplier-ship", caption: "Accepted quote, new order.", sub: "It becomes a wholesale order, ready to pack and ship.", durationMs: S, label: "You → Onitsha" },
      { art: "money-flow", caption: "Paid safely.", sub: "The shop pays through Shopinbos and you get your payout.", durationMs: S, value: "₦450,000" },
    ],
  },
  {
    key: "supplier-payouts",
    term: "payouts",
    title: "Earnings and payouts",
    roles: ["supplier"],
    paths: ["/supplier/payouts", "/supplier/money"],
    helpTopic: "get_paid",
    scenes: [
      { art: "phone-store", caption: "Every order earns you money.", sub: "Your price for each piece, for every shop that sells it.", durationMs: S, value: "₦9,000" },
      { art: "cash-collect", caption: "Escrow holds it until delivered.", sub: "That protects you and the buyer. Once delivered, it’s released.", durationMs: S, label: "Held till delivered" },
      { art: "money-flow", caption: "Payouts go to your bank.", sub: "Settled money is sent to the bank account you added.", durationMs: S, label: "Access •• 1093", value: "₦186,000" },
      { art: "chart-grow", caption: "See every naira.", sub: "Fees, orders and payouts, line by line.", durationMs: S },
      { art: "chat-bubbles", caption: "Get a message each time.", sub: "“₦186,000 is on its way to your bank.”", durationMs: S, label: "₦186,000 sent" },
    ],
  },

  // ─── Delivery partners ───
  {
    key: "partner-jobs",
    term: "jobs",
    title: "Delivery jobs",
    roles: ["logistics_partner"],
    paths: ["/logistics/bookings", "/logistics/quotes", "/logistics/jobs", "/logistics/job"],
    helpTopic: "partner_jobs",
    scenes: [
      { art: "chat-bubbles", caption: "Shops send you jobs.", sub: "A job is a pick-up and drop-off, with the fee shown up front.", durationMs: S, label: "Yaba → Surulere · ₦2,500" },
      { art: "flow-nodes", caption: "Accept before the timer ends.", sub: "New jobs wait a short time. Accept, and they’re yours.", durationMs: S, chips: ["New", "Accepted", "Rider"] },
      { art: "bike-route", caption: "Give it to a rider.", sub: "Pick Musa or Tobi. They see the addresses on their phone.", durationMs: S, label: "Musa · 12 min" },
      { art: "quote-tags", caption: "Price requests ask for your fee.", sub: "For long or bulky trips, shops ask first. Reply with your price.", durationMs: S, chips: ["₦8,000", "₦7,500"] },
      { art: "chart-grow", caption: "Deliver on time, get more jobs.", sub: "Good ratings bring you more shops.", durationMs: S },
    ],
  },
  {
    key: "partner-cash",
    term: "cod",
    title: "COD cash and pay-ins",
    roles: ["logistics_partner"],
    paths: ["/logistics/cash", "/logistics/payouts", "/logistics/earnings", "/logistics/billing"],
    helpTopic: "get_paid",
    scenes: [
      { art: "cash-collect", caption: "COD means cash on delivery.", sub: "The buyer pays your rider at the door.", durationMs: S, value: "₦12,000" },
      { art: "money-flow", caption: "That cash belongs to the seller.", sub: "Your company holds it for a short time, like a safe pair of hands.", durationMs: S, value: "₦85,000" },
      { art: "flow-nodes", caption: "A pay-in sends it back.", sub: "Transfer the day’s cash to Shopinbos by the deadline shown.", durationMs: S, chips: ["Collected", "Pay in", "Cleared"] },
      { art: "chart-grow", caption: "Your fees become payouts.", sub: "Your delivery earnings are paid to your bank after settlement.", durationMs: S, value: "₦42,000" },
      { art: "chat-bubbles", caption: "Pay in on time.", sub: "Late pay-ins pause new COD jobs, so we remind you before the deadline.", durationMs: S, label: "Pay in by 6pm" },
    ],
  },
];

/** "/supplier/(tabs)/orders?x=1" → "/supplier/orders" (same as shared/help-videos normaliseHelpPath). */
export function normaliseIntroPath(path: string | null | undefined) {
  const clean = (path ?? "").split(/[?#]/)[0]!.replace(/\/\([^/]+\)/g, "").replace(/\/+$/, "");
  return clean.startsWith("/") ? clean : `/${clean}`;
}

/** The intro for the screen at `path`, for this role (if given), or null. The longest matching prefix (or exact path) wins. */
export function introForPath(path: string | null | undefined, role?: string | null): FeatureIntro | null {
  const clean = normaliseIntroPath(path);
  let best: { intro: FeatureIntro; length: number } | null = null;
  for (const intro of FEATURE_INTROS) {
    if (role && !intro.roles.includes(role as IntroRole)) continue;
    for (const prefix of intro.paths) {
      const match = clean === prefix || clean.startsWith(`${prefix}/`);
      if (match && (!best || prefix.length > best.length)) best = { intro, length: prefix.length };
    }
    for (const exact of intro.exactPaths ?? []) {
      if (clean === exact && (!best || exact.length > best.length)) best = { intro, length: exact.length };
    }
  }
  return best?.intro ?? null;
}

export function introByKey(key: string | null | undefined): FeatureIntro | null {
  return FEATURE_INTROS.find((intro) => intro.key === key) ?? null;
}

export function introDurationMs(intro: FeatureIntro) {
  return intro.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
}

/** The intro keys someone has seen, with `key` added (newest last, capped like the preferences parser). */
export function withIntroSeen(seen: readonly string[] | null | undefined, key: string): string[] {
  return [...(seen ?? []).filter((item) => item !== key), key].slice(-MAX_INTROS_SEEN);
}

export const MAX_INTROS_SEEN = 60;
export const INTRO_KEY_PATTERN = /^[a-z0-9-]{1,40}$/;
