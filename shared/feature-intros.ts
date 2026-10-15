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

  {
    key: "home",
    term: "dashboard",
    title: "Your Home dashboard",
    roles: ["seller"],
    paths: ["/home/start"],
    exactPaths: ["/home"],
    helpTopic: "start_shop",
    cta: { label: "Record a sale", href: "/home/orders/new" },
    scenes: [
      { art: "dashboard-tiles", caption: "Home is your shop at a glance.", sub: "Today’s sales, orders to pack and new messages, the moment you open Shopinbos.", durationMs: S, label: "Good morning, Ada", value: "₦86,500", chips: ["3 to pack", "5 new chats", "2 low stock"] },
      { art: "order-pipeline", caption: "Orders that need you come first.", sub: "“3 to pack” means Kemi, Tunde and Halima are waiting. Tap one to start.", durationMs: S, label: "3 to pack", chips: ["New", "Paid", "Packed", "On the way", "Delivered"] },
      { art: "chart-grow", caption: "See how this week compares.", sub: "Sales up on last week? The chart shows it, so you know what’s working.", durationMs: S, value: "+18%" },
      { art: "chat-bubbles", caption: "Peggy suggests your next step.", sub: "“Your red bag is almost sold out. Restock 10 before Friday?” One tap to act.", durationMs: S, label: "Restock the red bag?" },
      { art: "flow-nodes", caption: "Finish setting up from Start here.", sub: "Products, payments, delivery. Every step you tick brings your first sale closer.", durationMs: S, chips: ["Products", "Payments", "Delivery"] },
    ],
  },
  {
    key: "orders",
    term: "orders",
    title: "Orders and order status",
    roles: ["seller"],
    paths: ["/home/orders", "/seller/orders", "/orders", "/order"],
    helpTopic: "orders",
    cta: { label: "Record a sale", href: "/home/orders/new" },
    scenes: [
      { art: "phone-store", caption: "Every sale becomes an order.", sub: "Paid on your shop, on WhatsApp or at your stall: it lands in Orders.", durationMs: S, value: "₦24,000", chips: ["Shop", "WhatsApp", "Stall"] },
      { art: "order-pipeline", caption: "Order status shows where it is.", sub: "New, Paid, Packed, On the way, Delivered. One look tells you what to do next.", durationMs: S, label: "#1042 · Kemi", chips: ["New", "Paid", "Packed", "On the way", "Delivered"] },
      { art: "receipt", caption: "Open an order for the details.", sub: "What Kemi bought, her address in Yaba, how she paid and her phone number.", durationMs: S, label: "Order #1042", chips: ["2 × Ankara, 6 yards", "1 × Gele"], value: "₦24,000" },
      { art: "bike-route", caption: "Pack it, then send it.", sub: "Book a rider from the order. Kemi gets a tracking link on WhatsApp.", durationMs: S, label: "Yaba → Lekki" },
      { art: "chat-bubbles", caption: "Buyers get updates by themselves.", sub: "“Your order is on the way!” goes out at each step, so fewer “where’s my parcel?” calls.", durationMs: S, label: "Your order is on the way!" },
    ],
  },
  {
    key: "record-sale",
    term: "record-sale",
    title: "Record a sale",
    roles: ["seller"],
    paths: ["/home/orders/new", "/record-sale"],
    helpTopic: "record_sale",
    cta: { label: "Record a sale", href: "/home/orders/new" },
    scenes: [
      { art: "chat-bubbles", caption: "Not every sale happens on your shop.", sub: "Someone pays cash at your stall, or orders on WhatsApp and pays by transfer.", durationMs: S, label: "Sent ₦18,500 now" },
      { art: "receipt", caption: "Record it in seconds.", sub: "Pick the product, how many, and how they paid: cash, transfer or POS.", durationMs: S, label: "Sale · Mama Tobi", chips: ["1 × Red bag", "Transfer"], value: "₦18,500" },
      { art: "product-stock", caption: "Your stock updates itself.", sub: "Record one red bag sold and the count drops from 4 to 3. No selling it twice online.", durationMs: S, label: "Red bag", value: "3" },
      { art: "send-burst", caption: "Send a receipt in one tap.", sub: "A neat receipt with your logo: proof for the buyer, and they remember your name.", durationMs: S, label: "Receipt #0187" },
      { art: "chart-grow", caption: "Every naira counted in one place.", sub: "Stall, WhatsApp and online sales add up together in your reports.", durationMs: S, value: "₦412,000" },
    ],
  },
  {
    key: "inbox",
    term: "inbox",
    title: "Inbox: every chat in one place",
    roles: ["seller"],
    paths: ["/home/messages", "/home/inbox", "/home/marketing/chat", "/chats", "/inbox"],
    helpTopic: "whatsapp",
    cta: { label: "Connect WhatsApp", href: "/channels" },
    scenes: [
      { art: "inbox-list", caption: "One inbox for all your chats.", sub: "WhatsApp, Instagram, live chat on your shop and form messages, in one list.", durationMs: S, label: "Is this in size 42?", chips: ["WhatsApp", "Instagram", "Live chat", "Form"] },
      { art: "chat-bubbles", caption: "Reply from one screen.", sub: "Answer Tunde on Instagram and Bisi on WhatsApp without switching apps.", durationMs: S, label: "Yes! Size 42, ₦15,000" },
      { art: "inbox-list", caption: "Waiting chats stay on top.", sub: "A dot shows who’s still waiting, so no buyer is left on “seen”.", durationMs: S, label: "Waiting 5 min", chips: ["Bisi", "Tunde", "Halima"], value: "3" },
      { art: "flow-nodes", caption: "Peggy and auto-replies help at night.", sub: "Questions about price and delivery get an answer at once, even at 11pm.", durationMs: S, chips: ["Message", "Peggy replies", "Order"] },
      { art: "dots-sort", caption: "Suppliers and riders have their own tab.", sub: "Chats with partners stay apart from customers, so nothing gets mixed up.", durationMs: S, chips: ["Customers", "Suppliers", "Riders"] },
    ],
  },
  {
    key: "notifications",
    term: "notifications",
    title: "Notifications",
    roles: ["seller"],
    paths: ["/home/notifications", "/notifications"],
    cta: { label: "Choose your alerts", href: "/home/notifications/preferences" },
    scenes: [
      { art: "bell-alerts", caption: "Notifications tell you what needs you.", sub: "New orders, payments, messages and low stock, the moment they happen.", durationMs: S, chips: ["New order · ₦24,000", "Payment received", "Only 2 red bags left"] },
      { art: "phone-store", caption: "They reach you on your phone.", sub: "Even with Shopinbos closed, your phone buzzes when a new order comes in.", durationMs: S, value: "₦24,000" },
      { art: "dots-sort", caption: "Choose what you hear about.", sub: "Switch off what you don’t need. Keep new orders and payments on.", durationMs: S, chips: ["Orders", "Payments", "Tips"] },
      { art: "chat-bubbles", caption: "Quiet hours for your sleep.", sub: "Set quiet hours from 10pm to 7am. Anything that can wait, waits till morning.", durationMs: S, label: "Quiet 10pm – 7am" },
      { art: "chart-grow", caption: "Fast answers, more sales.", sub: "Shops that answer new orders within the hour sell more. Alerts help you do that.", durationMs: S },
    ],
  },
  {
    key: "customers",
    term: "customers",
    title: "Customers",
    roles: ["seller"],
    paths: ["/home/customers", "/seller/customers"],
    cta: { label: "Record a sale", href: "/home/orders/new" },
    scenes: [
      { art: "customer-cards", caption: "Every buyer, saved for you.", sub: "Name, phone, address and every order, saved the first time they buy.", durationMs: S, label: "Bisi Adeyemi", chips: ["Yaba", "4 orders"], value: "₦86,000" },
      { art: "customer-cards", caption: "See who your best customers are.", sub: "Bisi has spent ₦86,000 in 4 orders. She’s a VIP, so treat her like one.", durationMs: S, label: "Bisi Adeyemi", chips: ["VIP", "Lagos"], value: "₦86,000" },
      { art: "chat-bubbles", caption: "Message them in one tap.", sub: "“Bisi, your size is back in stock!” goes straight to her WhatsApp.", durationMs: S, label: "Your size is back!" },
      { art: "dots-sort", caption: "Group them into segments.", sub: "VIPs, Lagos buyers and first-timers, each ready for the right message.", durationMs: S, chips: ["VIP", "Lagos", "New"] },
      { art: "chart-grow", caption: "Repeat customers grow your shop.", sub: "Selling again to someone who knows you costs less than finding someone new.", durationMs: S, value: "38%" },
    ],
  },
  {
    key: "reviews",
    term: "reviews",
    title: "Reviews and ratings",
    roles: ["seller"],
    paths: ["/home/reviews", "/seller/reviews", "/reviews"],
    cta: { label: "Ask for reviews", href: "/home/reviews" },
    scenes: [
      { art: "star-reviews", caption: "Reviews are buyers vouching for you.", sub: "Stars and a few words from real customers help strangers trust your shop.", durationMs: S, label: "Fabric is lovely!", value: "4.8" },
      { art: "chat-bubbles", caption: "Ask at the right time.", sub: "A few days after delivery, Shopinbos asks: “How was your order, Ada?”", durationMs: S, label: "How was your order?" },
      { art: "star-reviews", caption: "Show them where buyers decide.", sub: "Your best reviews appear on product pages, right next to the Buy button.", durationMs: S, label: "Delivered same day!", value: "4.9" },
      { art: "chat-bubbles", caption: "Reply to every review, even bad ones.", sub: "“Sorry it came late, Tunde. Free delivery next time.” Other buyers see you care.", durationMs: S, label: "So sorry, Tunde!" },
      { art: "chart-grow", caption: "More reviews, more sales.", sub: "Products with reviews sell more. Start by asking your last 10 buyers.", durationMs: S, value: "32 reviews" },
    ],
  },
  {
    key: "marketplace",
    term: "marketplace",
    title: "Find products to sell",
    roles: ["seller"],
    paths: ["/marketplace", "/seller/marketplace", "/find"],
    helpTopic: "sell_without_stock",
    cta: { label: "Find products to sell", href: "/marketplace" },
    scenes: [
      { art: "store-card", caption: "The marketplace is one big warehouse.", sub: "Thousands of products from checked Nigerian suppliers, ready for your shop.", durationMs: S, label: "Shopinbos marketplace" },
      { art: "dots-sort", caption: "Search for what your buyers want.", sub: "Filter by category, price, where the supplier is and how fast they ship.", durationMs: S, chips: ["Hair", "Fashion", "Beauty"] },
      { art: "product-stock", caption: "See the supplier’s price and stock.", sub: "Shea butter from Kano: ₦2,500 from the supplier, 500 in stock, sells for about ₦4,500.", durationMs: S, label: "Shea butter", value: "500" },
      { art: "phone-store", caption: "Add it to your shop in one tap.", sub: "Photos, price and description come filled in. Change anything you like.", durationMs: S, label: "Added to your shop" },
      { art: "supplier-ship", caption: "Dropship it or buy in bulk.", sub: "Sell without stock, or ask the supplier for a wholesale price. Both start here.", durationMs: S, label: "Kano → your buyer" },
    ],
  },
  {
    key: "imports",
    term: "sourcing-imports",
    title: "Imports from China",
    roles: ["seller"],
    paths: ["/home/imports"],
    cta: { label: "Find products", href: "/marketplace" },
    scenes: [
      { art: "domain-type", caption: "Import from China the easy way.", sub: "Paste a 1688 link, or send a photo of what you want to stock.", durationMs: S, label: "detail.1688.com/…" },
      { art: "quote-tags", caption: "Our sourcing partner sends a quote.", sub: "Price per piece, shipping and duty, all in naira. No dollar card needed.", durationMs: S, chips: ["₦3,200", "₦2,950", "₦2,800"] },
      { art: "badge-verify", caption: "They buy it and check it.", sub: "Quantity and quality checked, with photos, before it leaves Guangzhou.", durationMs: S, label: "QC photos ✓", chips: ["Count", "Quality", "Packing"] },
      { art: "import-ship", caption: "By air or by sea: you choose.", sub: "Air is faster, about 10 days. Sea is cheaper for big orders, about 6 weeks.", durationMs: S, label: "Guangzhou → Lagos", chips: ["Air · 10 days", "Sea · 6 weeks"] },
      { art: "product-stock", caption: "It lands in your stock.", sub: "Follow every step. When it arrives, the 300 pieces go straight into your inventory.", durationMs: S, label: "Phone cases", value: "300" },
    ],
  },
  {
    key: "collections",
    term: "collections",
    title: "Collections and categories",
    roles: ["seller"],
    paths: ["/home/collections", "/home/categories"],
    helpTopic: "add_product",
    cta: { label: "Make a collection", href: "/home/collections" },
    scenes: [
      { art: "store-card", caption: "Collections are shelves on your shop.", sub: "Put things people buy together on one shelf, like lace, gele and bags in “Owambe Ready”.", durationMs: S, label: "Owambe Ready" },
      { art: "dots-sort", caption: "One product, many shelves.", sub: "The gold clutch can sit in “Owambe Ready” and “Under ₦20k” at the same time.", durationMs: S, chips: ["Owambe Ready", "Under ₦20k"] },
      { art: "flow-nodes", caption: "Smart collections fill themselves.", sub: "Set a rule like “tagged Sallah” and new products join on their own.", durationMs: S, chips: ["Tagged Sallah", "Joins", "On your shop"] },
      { art: "dots-sort", caption: "Categories say what a product is.", sub: "Hair › Wigs › Bone straight. Search, Google and the marketplace all use them.", durationMs: S, chips: ["Hair", "Wigs", "Bone straight"] },
      { art: "phone-store", caption: "Easy browsing, bigger carts.", sub: "Buyers find what they came for in two taps, then pick one more thing.", durationMs: S, chips: ["Owambe", "Sallah", "New in"] },
    ],
  },
  {
    key: "brand-kit",
    term: "brand-kit",
    title: "Brand kit",
    roles: ["seller"],
    paths: ["/home/brand-kit"],
    cta: { label: "Set up your brand kit", href: "/home/brand-kit" },
    scenes: [
      { art: "brand-palette", caption: "Your brand kit is your look, saved once.", sub: "Logo, colours, fonts and the way you talk, kept together in one place.", durationMs: S, label: "Glow by Amaka" },
      { art: "brand-palette", caption: "Pick colours that feel like you.", sub: "Your mint and gold, used the same way on every page, label and post.", durationMs: S, label: "Glow by Amaka", chips: ["Mint", "Gold", "Navy"] },
      { art: "theme-swap", caption: "Everything matches by itself.", sub: "Your shop, shipping labels, emails and WhatsApp catalog all use the kit.", durationMs: S, chips: ["Shop", "Labels", "Emails"] },
      { art: "chat-bubbles", caption: "Your voice, too.", sub: "Warm and chatty, or short and smart: Peggy and Rex write the way you talk.", durationMs: S, label: "Hello dear, welcome!" },
      { art: "flow-nodes", caption: "Rex uses it for every design.", sub: "Ask for a Sallah flyer and it comes out in your colours, with your logo.", durationMs: S, chips: ["Ask Rex", "Your colours", "Flyer ready"] },
    ],
  },
  {
    key: "media",
    term: "media",
    title: "Media",
    roles: ["seller"],
    paths: ["/home/media"],
    cta: { label: "Open my media", href: "/home/media" },
    scenes: [
      { art: "store-card", caption: "Every picture in your shop, in one place.", sub: "Product photos, your logo, banners and Rex's designs all land here by themselves.", durationMs: S, label: "My media" },
      { art: "video-reel", caption: "Upload once, use it anywhere.", sub: "Pick the same photo for a product, a banner or a blog post. No uploading twice.", durationMs: S },
      { art: "search-rank", caption: "Alt text helps Google find you.", sub: "Say what each picture shows, like “Red Ankara wrap dress”. Search engines read it.", durationMs: S, value: "Red Ankara wrap dress" },
      { art: "link-share", caption: "Copy a link in one tap.", sub: "Paste a picture's link into WhatsApp, an email or anywhere else you sell.", durationMs: S },
      { art: "dots-sort", caption: "Find it again fast.", sub: "Give pictures a title, then search by name or filter pictures and videos.", durationMs: S, chips: ["Pictures", "Videos"] },
    ],
  },
  {
    key: "rex-studio",
    term: "studio",
    title: "Rex Studio",
    roles: ["seller"],
    paths: ["/studio", "/home/studio"],
    cta: { label: "Open Rex Studio", href: "/studio" },
    scenes: [
      { art: "chat-bubbles", caption: "Rex is your AI designer.", sub: "Tell him what you need in plain words, like you’d tell a graphic designer.", durationMs: S, label: "Make my cake photo clean" },
      { art: "theme-swap", caption: "Clean product photos from your phone.", sub: "Rex removes the messy background and puts your cake on clean white.", durationMs: S, chips: ["Before", "After"] },
      { art: "brand-palette", caption: "A logo in minutes.", sub: "Describe your shop, pick from a few logo ideas, then change the colours and save.", durationMs: S, label: "Mama’s Kitchen" },
      { art: "store-card", caption: "Banners and posts that match.", sub: "“New this week” banners and Instagram posts in the colours of your brand kit.", durationMs: S, label: "New this week" },
      { art: "chart-grow", caption: "Better pictures sell more.", sub: "Clear photos make buyers trust you. Start with your best-selling product.", durationMs: S },
    ],
  },
  {
    key: "video-studio",
    term: "video-studio",
    title: "Video studio",
    roles: ["seller"],
    paths: ["/home/video"],
    helpTopic: "get_customers",
    cta: { label: "Make a video", href: "/home/video" },
    scenes: [
      { art: "video-reel", caption: "Short videos sell on TikTok and Reels.", sub: "People scroll fast. A 15-second video is what stops their thumb.", durationMs: S, label: "Fresh sneakers in!", value: "0:15" },
      { art: "video-reel", caption: "Rex turns photos into videos.", sub: "Pick three photos of your sneakers. Rex adds movement, music and your price.", durationMs: S, label: "₦32,000 · Order now", value: "0:15" },
      { art: "brand-palette", caption: "Your brand on every frame.", sub: "Your logo and colours from the brand kit show up by themselves.", durationMs: S, label: "Kicks by Tobi" },
      { art: "phone-store", caption: "Post it everywhere.", sub: "Download it for TikTok, Instagram Reels and WhatsApp Status.", durationMs: S, chips: ["TikTok", "Reels", "WhatsApp"] },
      { art: "chart-grow", caption: "See which video sold.", sub: "Views, taps and orders for each video, so you make more of what works.", durationMs: S, value: "12,400" },
    ],
  },
  {
    key: "discounts",
    term: "discounts",
    title: "Discounts and codes",
    roles: ["seller"],
    paths: ["/home/discounts"],
    cta: { label: "Create a discount", href: "/home/discounts" },
    scenes: [
      { art: "discount-ticket", caption: "A discount is a price cut you choose.", sub: "20% off for Sallah, ₦1,000 off a first order, or free delivery over ₦30,000.", durationMs: S, label: "SALLAH20", value: "20%" },
      { art: "chat-bubbles", caption: "A discount code is a word to type.", sub: "Share SALLAH20 on your Status. Anyone who types it at checkout gets 20% off.", durationMs: S, label: "Use code SALLAH20" },
      { art: "phone-store", caption: "Automatic offers need no code.", sub: "“Buy 2 wigs, get 10% off” applies by itself in the cart.", durationMs: S, label: "Buy 2, save 10%", value: "₦43,200" },
      { art: "flow-nodes", caption: "Set limits so you don’t lose money.", sub: "An end date, a minimum spend, and how many times it can be used.", durationMs: S, chips: ["Ends Sunday", "Min ₦10,000", "100 uses"] },
      { art: "chart-grow", caption: "See what each discount brought in.", sub: "SALLAH20 was used 46 times and brought in ₦690,000 of sales.", durationMs: S, value: "₦690,000" },
    ],
  },
  {
    key: "invoices",
    term: "invoices",
    title: "Invoices",
    roles: ["seller"],
    paths: ["/home/invoices", "/home/invoicing"],
    helpTopic: "get_paid",
    cta: { label: "Send an invoice", href: "/home/invoices" },
    scenes: [
      { art: "invoice-paper", caption: "An invoice is a bill with your name on it.", sub: "It says what the customer bought, how much they owe and by when.", durationMs: S, label: "INVOICE #014", chips: ["Due Friday"], value: "₦480,000" },
      { art: "chat-bubbles", caption: "Big and business orders need one.", sub: "A hotel in Abuja orders 20 cartons of drinks and needs a proper invoice to pay.", durationMs: S, label: "Please send an invoice" },
      { art: "send-burst", caption: "Send it by email or WhatsApp.", sub: "It comes with a pay link, so they can pay by card or transfer straight away.", durationMs: S, label: "Invoice #014" },
      { art: "invoice-paper", caption: "Paid invoices mark themselves.", sub: "When the money lands, the invoice turns Paid and your books stay tidy.", durationMs: S, label: "INVOICE #014", chips: ["Paid ✓"], value: "₦480,000" },
      { art: "receipt", caption: "Every order gets one too.", sub: "Shopinbos makes an invoice for each order, ready to print or share.", durationMs: S, label: "Order #1042", chips: ["2 × Ankara, 6 yards", "1 × Gele"], value: "₦24,000" },
    ],
  },
  {
    key: "taxes",
    term: "taxes",
    title: "Taxes and VAT",
    roles: ["seller"],
    paths: ["/home/taxes"],
    cta: { label: "Set up taxes", href: "/home/taxes" },
    scenes: [
      { art: "receipt", caption: "VAT is a tax added to what you sell.", sub: "In Nigeria it’s 7.5%. Small shops under the turnover limit may not need to charge it.", durationMs: S, label: "VAT 7.5%", chips: ["Wig  ₦40,000", "VAT  ₦3,000"], value: "₦43,000" },
      { art: "phone-store", caption: "Show it at checkout.", sub: "Switch it on and buyers see the VAT line before they pay. No surprises.", durationMs: S, value: "₦43,000" },
      { art: "money-flow", caption: "Set it aside as you sell.", sub: "VAT you collect isn’t your money. Shopinbos keeps a running total for you.", durationMs: S, label: "VAT collected", value: "₦96,000" },
      { art: "invoice-paper", caption: "Receipts business buyers can use.", sub: "Companies often need a tax invoice. Yours shows your TIN and the VAT.", durationMs: S, label: "TAX INVOICE", chips: ["TIN ✓"], value: "₦43,000" },
      { art: "chart-grow", caption: "Ready when it’s time to file.", sub: "Download a monthly summary for your accountant or the tax office. Ask them if unsure.", durationMs: S },
    ],
  },
  {
    key: "shipping-rates",
    term: "shipping-rates",
    title: "Shipping rates",
    roles: ["seller"],
    paths: ["/home/shipping"],
    helpTopic: "delivery",
    cta: { label: "Set your shipping rates", href: "/home/shipping" },
    scenes: [
      { art: "map-zones", caption: "Shipping rates are what buyers pay.", sub: "You set the delivery fee buyers see, so delivery never eats your profit.", durationMs: S, chips: ["Mainland", "Island", "Outside Lagos"], value: "₦2,000" },
      { art: "map-zones", caption: "Set a price for each zone.", sub: "₦2,000 on the Mainland, ₦3,500 to the Island, ₦5,000 outside Lagos.", durationMs: S, chips: ["Mainland", "Island", "Outside Lagos"], value: "₦3,500" },
      { art: "dots-sort", caption: "Or charge by weight.", sub: "A wig and a 25kg bag of rice shouldn’t cost the same to send.", durationMs: S, chips: ["Under 1kg", "1–5kg", "Over 5kg"] },
      { art: "discount-ticket", caption: "Free delivery as a treat.", sub: "Free delivery over ₦30,000 gets people to add one more thing to the cart.", durationMs: S, label: "OVER ₦30,000", value: "Free" },
      { art: "phone-store", caption: "Buyers see it before they pay.", sub: "Clear delivery fees at checkout mean fewer people leave without paying.", durationMs: S, value: "₦26,000" },
    ],
  },
  {
    key: "seo",
    term: "seo",
    title: "SEO and content",
    roles: ["seller", "supplier", "logistics_partner"],
    paths: ["/home/seo", "/home/cms", "/supplier/cms", "/logistics/cms"],
    scenes: [
      { art: "search-rank", caption: "SEO helps people find you on Google.", sub: "When someone searches “ankara gown Abuja”, you want to be near the top.", durationMs: S, label: "ankara gown abuja" },
      { art: "search-rank", caption: "Name things the way people search.", sub: "“Red lace gown, size 12” is found. “Item 23” never is.", durationMs: S, label: "red lace gown size 12" },
      { art: "invoice-paper", caption: "Content brings visitors for free.", sub: "A post like “Keep your wig fresh in Harmattan” can bring readers for years.", durationMs: S, label: "BLOG POST", chips: ["5 min read"] },
      { art: "chat-bubbles", caption: "Rex can write the first draft.", sub: "Give Rex a topic, then edit it in your own voice and publish.", durationMs: S, label: "Write about wig care" },
      { art: "chart-grow", caption: "Free visitors add up.", sub: "SEO is slow but steady: good titles and posts keep working while you sleep.", durationMs: S, value: "1,240" },
    ],
  },
  {
    key: "legal-pages",
    term: "legal-pages",
    title: "Legal pages",
    roles: ["seller"],
    paths: ["/home/legal"],
    cta: { label: "Write your policies", href: "/home/legal" },
    scenes: [
      { art: "invoice-paper", caption: "Legal pages are your shop’s rules.", sub: "Refunds, delivery, privacy and terms, written down where buyers can read them.", durationMs: S, label: "REFUND POLICY", chips: ["7 days"] },
      { art: "chat-bubbles", caption: "They answer questions before they’re asked.", sub: "“Can I return it?” Your refund policy says: within 7 days, if unused.", durationMs: S, label: "Can I return it?" },
      { art: "badge-verify", caption: "Clear rules build trust.", sub: "Buyers pay more easily when they know what happens if something goes wrong.", durationMs: S, label: "Policies ✓", chips: ["Refunds", "Delivery", "Privacy"] },
      { art: "flow-nodes", caption: "Rex writes the first draft.", sub: "Answer a few questions and get policies in plain English. Change anything.", durationMs: S, chips: ["5 questions", "Rex drafts", "Publish"] },
      { art: "store-card", caption: "Linked from every page.", sub: "They sit at the bottom of your shop, and payment companies often ask for them.", durationMs: S, label: "Refunds · Privacy · Terms" },
    ],
  },
  {
    key: "store-settings",
    term: "store-settings",
    title: "Settings",
    roles: ["seller"],
    paths: ["/home/settings", "/home/profile", "/home/features", "/seller/settings"],
    scenes: [
      { art: "store-card", caption: "Settings hold your shop’s details.", sub: "Name, phone, address and opening hours, used on your shop and receipts.", durationMs: S, label: "Mama’s Kitchen" },
      { art: "customer-cards", caption: "Your profile is you.", sub: "Your name, photo and login. Turn on 2-step sign-in to keep your shop safe.", durationMs: S, label: "Ada Okafor", chips: ["Owner", "2-step ✓"] },
      { art: "bell-alerts", caption: "Choose your notifications.", sub: "Decide which alerts reach your phone, WhatsApp or email.", durationMs: S, chips: ["New order", "Payout sent", "Low stock"] },
      { art: "dots-sort", caption: "Customise your menu.", sub: "Hide the tools you don’t use yet. Bring them back any time.", durationMs: S, chips: ["Shown", "Hidden"] },
      { art: "chat-bubbles", caption: "Pick your language too.", sub: "Use Shopinbos in English, Pidgin, Yorùbá, Hausa or Igbo.", durationMs: S, label: "Ẹ kú àbọ̀!" },
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

  {
    key: "supplier-home",
    term: "dashboard",
    title: "Your Today dashboard",
    roles: ["supplier"],
    paths: ["/supplier/dashboard", "/supplier/home"],
    helpTopic: "supplier_orders",
    scenes: [
      { art: "dashboard-tiles", caption: "Today shows what needs you.", sub: "Orders to pack, quote requests waiting and money on its way to you.", durationMs: S, label: "Good morning, Musa", value: "₦186,000", chips: ["4 to pack", "2 quotes", "1 low stock"] },
      { art: "order-pipeline", caption: "Pack the oldest orders first.", sub: "Every order shows a countdown. Late orders push you down the marketplace.", durationMs: S, label: "Pack by 4pm", chips: ["New", "Accepted", "Packed", "Picked up", "Delivered"] },
      { art: "quote-tags", caption: "Answer quote requests quickly.", sub: "A shop in Onitsha wants 100 cartons. The first clear price usually wins.", durationMs: S, chips: ["₦4,800", "₦4,600", "₦4,500"] },
      { art: "product-stock", caption: "Keep an eye on stock.", sub: "Low-stock warnings mean shops never sell what you can’t send.", durationMs: S, label: "Shea butter 500ml", value: "3" },
      { art: "chart-grow", caption: "Your week at a glance.", sub: "Orders, earnings and how many shops sell your products.", durationMs: S, value: "14 shops" },
    ],
  },
  {
    key: "supplier-wholesale",
    term: "wholesale",
    title: "Wholesale orders",
    roles: ["supplier"],
    paths: ["/supplier/wholesale"],
    helpTopic: "supplier_orders",
    scenes: [
      { art: "product-stock", caption: "Wholesale orders are big orders.", sub: "A shop buys 200 jars of shea butter at your bulk price, to keep as its own stock.", durationMs: S, label: "Shea butter", value: "200" },
      { art: "quote-tags", caption: "Bulk prices drop with quantity.", sub: "₦2,500 each for under 50, ₦2,200 from 50, ₦2,000 from 200.", durationMs: S, chips: ["₦2,500", "₦2,200", "₦2,000"] },
      { art: "money-flow", caption: "Paid before you pack.", sub: "The shop pays upfront through Shopinbos. It’s held in escrow until delivery.", durationMs: S, label: "Held till delivered", value: "₦400,000" },
      { art: "supplier-ship", caption: "Pack it, then book delivery.", sub: "Big orders can go by van or with a long-distance partner. You choose.", durationMs: S, label: "Kano → Onitsha" },
      { art: "chart-grow", caption: "Repeat bulk buyers are gold.", sub: "Deliver well and the same shop orders again every month.", durationMs: S, value: "3 repeat shops" },
    ],
  },
  {
    key: "supplier-buyers",
    term: "buyers",
    title: "Buyers",
    roles: ["supplier"],
    paths: ["/supplier/buyers"],
    scenes: [
      { art: "store-card", caption: "Buyers are the shops selling your products.", sub: "Every shop that added your shea butter, or bought it in bulk.", durationMs: S, label: "Glow by Amaka" },
      { art: "customer-cards", caption: "See how each shop is doing.", sub: "Glow by Amaka sold 86 jars this month. Abuja Beauty sold 12.", durationMs: S, label: "Glow by Amaka", chips: ["Dropship", "Abuja"], value: "86 sold" },
      { art: "chat-bubbles", caption: "Talk to them directly.", sub: "Tell your best shops about a new scent before anyone else.", durationMs: S, label: "New: coconut scent!" },
      { art: "dots-sort", caption: "Dropship or wholesale.", sub: "Some sell without stock, some buy in bulk. Both show here.", durationMs: S, chips: ["Dropship", "Wholesale"] },
      { art: "chart-grow", caption: "Help your best buyers grow.", sub: "Good photos and fast shipping help them sell more, and that means more for you.", durationMs: S },
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
  {
    key: "partner-home",
    term: "dashboard",
    title: "Your Today dashboard",
    roles: ["logistics_partner"],
    paths: ["/logistics/dashboard", "/logistics/home"],
    helpTopic: "partner_jobs",
    scenes: [
      { art: "dashboard-tiles", caption: "Today is your dispatch board.", sub: "New jobs, riders on the road and cash to pay in, all on one screen.", durationMs: S, label: "Good morning, Femi", value: "₦42,000", chips: ["5 new jobs", "3 riders out", "₦85k to pay in"] },
      { art: "order-pipeline", caption: "Follow every job.", sub: "Accepted, picked up, on the way, delivered. Running late? It turns amber.", durationMs: S, label: "Job #318", chips: ["Accepted", "Picked up", "On the way", "Delivered"] },
      { art: "rider-team", caption: "See who’s free.", sub: "Musa is free in Yaba. Tobi is on a drop in Ikeja. Send the next job to Musa.", durationMs: S, chips: ["Musa", "Tobi", "Femi"] },
      { art: "cash-collect", caption: "Cash to pay in sits up top.", sub: "The COD cash your riders collected today, with the deadline to pay it in.", durationMs: S, value: "₦85,000" },
      { art: "chart-grow", caption: "Your week in numbers.", sub: "Jobs done, on-time rate and earnings, next to last week’s.", durationMs: S, value: "142 jobs" },
    ],
  },
  {
    key: "partner-riders",
    term: "riders",
    title: "Riders",
    roles: ["logistics_partner"],
    paths: ["/logistics/couriers", "/logistics/riders", "/logistics/add-rider"],
    helpTopic: "rider_flow",
    cta: { label: "Add a rider", href: "/logistics/couriers" },
    scenes: [
      { art: "rider-team", caption: "Riders are your team on the road.", sub: "Add each rider with their name, phone number and bike or van.", durationMs: S, chips: ["Musa", "Tobi", "Femi"] },
      { art: "phone-store", caption: "They get a simple rider app.", sub: "A link on their phone shows pick-ups, drop-offs and who to call.", durationMs: S, label: "Pick up: Yaba" },
      { art: "bike-route", caption: "Give a job to a rider in one tap.", sub: "Pick the nearest free rider. They see the route and the addresses.", durationMs: S, label: "Musa · 12 min" },
      { art: "cash-collect", caption: "Proof at every door.", sub: "Riders take a photo or code at drop-off, and log any cash they collect.", durationMs: S, label: "Delivered ✓", value: "₦12,000" },
      { art: "star-reviews", caption: "See how each rider does.", sub: "Jobs done, on-time rate and ratings for each rider, so you can reward the best.", durationMs: S, label: "Musa is always on time", value: "4.9" },
    ],
  },
  {
    key: "partner-coverage",
    term: "coverage",
    title: "Coverage and rates",
    roles: ["logistics_partner"],
    paths: ["/logistics/coverage", "/logistics/pricing"],
    cta: { label: "Set your coverage", href: "/logistics/coverage" },
    scenes: [
      { art: "map-zones", caption: "Coverage is where you deliver.", sub: "Mark the areas you serve, so shops only send jobs you can take.", durationMs: S, chips: ["Mainland", "Lekki", "Ikeja"] },
      { art: "map-zones", caption: "Leave out what you can’t reach.", sub: "No riders in Ikorodu yet? Leave it off and you won’t get jobs there.", durationMs: S, chips: ["Mainland", "Lekki", "Ikorodu ✕"] },
      { art: "quote-tags", caption: "Rates are your prices.", sub: "Set a fee for each zone, like ₦2,000 on the Mainland and ₦3,500 to the Island.", durationMs: S, chips: ["₦3,500", "₦3,000", "₦2,000"] },
      { art: "dots-sort", caption: "Charge more for heavy or far.", sub: "Add a charge for parcels over 5kg, or trips longer than 20km.", durationMs: S, chips: ["Under 5kg", "Over 5kg"] },
      { art: "chart-grow", caption: "Fair prices win more jobs.", sub: "Shops compare delivery partners. Clear, fair rates get booked more often.", durationMs: S },
    ],
  },
  {
    key: "partner-connect",
    term: "integrations",
    title: "Connect your system",
    roles: ["logistics_partner"],
    paths: ["/logistics/connect"],
    cta: { label: "Connect your system", href: "/logistics/connect" },
    scenes: [
      { art: "flow-nodes", caption: "Link your own dispatch software.", sub: "Already use software for jobs? Connect it so you never type a job twice.", durationMs: S, chips: ["Shopinbos", "Link", "Your system"] },
      { art: "domain-type", caption: "An API key makes the link.", sub: "Copy a secret key into your system. Guard it like a password.", durationMs: S, label: "sk_live_••••7f2a" },
      { art: "flow-nodes", caption: "New jobs flow in by themselves.", sub: "A shop books you, and the job shows up in your system within seconds.", durationMs: S, chips: ["Shop books", "Job sent", "Your system"] },
      { art: "chat-bubbles", caption: "Updates flow back to the shop.", sub: "Picked up, delivered: your system tells Shopinbos and the shop sees it.", durationMs: S, label: "Status: Delivered" },
      { art: "phone-store", caption: "No system? No problem.", sub: "You can skip this. The Shopinbos app and rider links do everything.", durationMs: S },
    ],
  },

  // ─── Suppliers and delivery partners ───
  {
    key: "verification",
    term: "verification",
    title: "Verification",
    roles: ["supplier", "logistics_partner"],
    paths: ["/supplier/verification", "/logistics/verification"],
    scenes: [
      { art: "badge-verify", caption: "Verification shows you’re real.", sub: "We check your papers so shops can trust you with their orders and money.", durationMs: S, label: "Verified", chips: ["CAC", "ID", "Address"] },
      { art: "invoice-paper", caption: "Upload your CAC papers.", sub: "Your CAC certificate or business name papers, and the owner’s ID card.", durationMs: S, label: "CAC CERTIFICATE", chips: ["RC 1234567"] },
      { art: "flow-nodes", caption: "We check them quickly.", sub: "Most checks take one or two working days. We’ll message you if anything’s missing.", durationMs: S, chips: ["Upload", "Review", "Verified"] },
      { art: "badge-verify", caption: "Get the Verified badge.", sub: "It shows on your profile and listings. Verified partners get more orders.", durationMs: S, label: "Verified", chips: ["Profile", "Listings"] },
      { art: "money-flow", caption: "Payouts open up too.", sub: "Once verified, your earnings go safely to your business bank account.", durationMs: S, label: "Business account", value: "₦186,000" },
    ],
  },
  {
    key: "partner-inbox",
    term: "inbox",
    title: "Inbox",
    roles: ["supplier", "logistics_partner"],
    paths: ["/supplier/inbox", "/supplier/messages", "/supplier/chat", "/logistics/inbox", "/logistics/messages", "/logistics/chat"],
    scenes: [
      { art: "inbox-list", caption: "Every chat with shops in one place.", sub: "Questions, order notes and price talks, all in your inbox.", durationMs: S, label: "Can you pack by 3pm?", chips: ["Glow by Amaka", "Kemi’s Wigs", "Tunde Kicks"] },
      { art: "chat-bubbles", caption: "Chats stay with the order.", sub: "Open order #1042 and the chat about it is right there.", durationMs: S, label: "Yes, packed by 3pm" },
      { art: "inbox-list", caption: "Waiting chats stay on top.", sub: "A dot shows who’s waiting. Fast replies win you more work.", durationMs: S, label: "Waiting 10 min", chips: ["Glow by Amaka", "Abuja Beauty"], value: "2" },
      { art: "chat-bubbles", caption: "Agree everything here.", sub: "Settle prices and changes in the inbox, so there’s a record if anything goes wrong.", durationMs: S, label: "Agreed: ₦7,500" },
      { art: "chart-grow", caption: "Fast replies, better ratings.", sub: "Shops notice how quickly you answer. Aim for under an hour.", durationMs: S },
    ],
  },
  {
    key: "partner-performance",
    term: "on-time-rate",
    title: "Performance and reviews",
    roles: ["supplier", "logistics_partner"],
    paths: ["/supplier/analytics", "/supplier/reviews", "/logistics/analytics", "/logistics/reviews"],
    scenes: [
      { art: "chart-grow", caption: "Performance is how well you deliver.", sub: "Orders, on-time rate, ratings and earnings, week by week.", durationMs: S, value: "96%" },
      { art: "order-pipeline", caption: "On-time rate counts promises kept.", sub: "48 of 50 orders on time is a 96% on-time rate.", durationMs: S, label: "48 of 50 on time", chips: ["Accepted", "Packed", "Picked up", "Delivered"] },
      { art: "star-reviews", caption: "Shops rate every job.", sub: "Stars and a comment after each order or delivery. Reply kindly to every one.", durationMs: S, label: "Fast and careful!", value: "4.7" },
      { art: "dots-sort", caption: "Find what slows you down.", sub: "Late pick-ups on Mondays? Out of stock on Fridays? The numbers show it.", durationMs: S, chips: ["On time", "Late"] },
      { art: "chart-grow", caption: "Good numbers bring more work.", sub: "High ratings and on-time rates put you higher when shops search.", durationMs: S },
    ],
  },
  {
    key: "company-profile",
    term: "company-profile",
    title: "Company profile and settings",
    roles: ["supplier", "logistics_partner"],
    paths: ["/supplier/settings", "/supplier/profile", "/supplier/team", "/supplier/features", "/logistics/profile", "/logistics/settings", "/logistics/features"],
    scenes: [
      { art: "store-card", caption: "Your company profile is your shop window.", sub: "Shops see your name, logo, location and what you do before they pick you.", durationMs: S, label: "Kano Shea Co." },
      { art: "brand-palette", caption: "Add your logo and your story.", sub: "“Family shea butter makers in Kano since 2009” builds trust fast.", durationMs: S, label: "Kano Shea Co." },
      { art: "customer-cards", caption: "Bring your team in.", sub: "Give staff their own login. Packers see orders, not your money.", durationMs: S, label: "Musa · Packer", chips: ["Orders", "No money"] },
      { art: "dots-sort", caption: "Customise your menu.", sub: "Hide the tools you don’t use yet. Bring them back any time.", durationMs: S, chips: ["Shown", "Hidden"] },
      { art: "badge-verify", caption: "Get verified from here.", sub: "Verification sits under your company settings. Verified partners get more orders.", durationMs: S, label: "Verified", chips: ["CAC", "ID"] },
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
