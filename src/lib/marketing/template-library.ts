import { htmlFromBlocks, type ColumnCell, type EmailBlock, type ProductItem } from "./blocks.ts";

// The starter email templates: built from blocks (so each opens in the visual builder), written for shops in
// Nigeria, with merge tags ({{name}}, {{store}}, {{store_url}}, {{cart_url}}…) and the brand kit colour via
// {{brand_accent}}. Photos load from images.unsplash.com (ids checked by eye; the licence asks for hotlinks).
// Pure, unit-tested.

export const TEMPLATE_CATEGORIES = {
  welcome: "Welcome",
  newsletter: "Newsletter",
  promotion: "Sale or offer",
  product_launch: "New arrivals",
  abandoned_cart: "Cart reminder",
  order: "Order and thank you",
  shipping: "Shipping update",
  review: "Review request",
  win_back: "Win-back",
  birthday: "Birthday",
  festive: "Festive",
  restock: "Back in stock",
  event: "Event invite",
  announcement: "Announcement",
} as const;

export type TemplateCategory = keyof typeof TEMPLATE_CATEGORIES;

export interface LibraryTemplate {
  key: string;
  name: string;
  category: TemplateCategory;
  /** One line for the card. */
  description: string;
  subject: string;
  preheader: string;
  bodyHtml: string;
  /** Words that point Peggy's no-AI fallback at this template. */
  keywords: string[];
}

const photo = (id: string, w = 1200, h = 720) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=72`;

const PHOTOS = {
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
};

const item = (name: string, price: string, id: string): ProductItem => ({ name, price, imageUrl: photo(id, 600, 600), url: "{{store_url}}" });
const SAMPLE = {
  adireDress: item("Adire print dress", "₦28,500", "1760287364219-160c234ded00"),
  kaftan: item("Indigo kaftan", "₦34,000", "1753192108606-b4a2bc9e5661"),
  tote: item("Canvas tote bag", "₦12,000", "1683148754073-cfa906017a10"),
  sneakers: item("Everyday sneakers", "₦22,500", "1560769629-975ec94e6a86"),
  coral: item("Coral bead necklace", "₦18,000", "1562947429-2a6546643e8d"),
  beads: item("Beaded bracelet set", "₦6,500", "1641946188146-848152c45baf"),
  oud: item("Oud perfume, 50ml", "₦25,000", "1640869116016-93c00ba94b28"),
  floral: item("Floral eau de parfum", "₦21,000", "1458538977777-0549b2370168"),
};

const h = (text: string, extra: Partial<Extract<EmailBlock, { type: "heading" }>> = {}): EmailBlock => ({ type: "heading", text, ...extra });
const t = (text: string, extra: Partial<Extract<EmailBlock, { type: "text" }>> = {}): EmailBlock => ({ type: "text", text, ...extra });
const btn = (label: string, url = "{{store_url}}", extra: Partial<Extract<EmailBlock, { type: "button" }>> = {}): EmailBlock => ({ type: "button", label, url, ...extra });
const img = (id: string, alt: string): EmailBlock => ({ type: "image", url: photo(id), alt, link: "{{store_url}}" });
const coupon = (code: string, title: string, note: string): EmailBlock => ({ type: "coupon", code, title, note });
const products = (items: ProductItem[], buttonLabel = "Shop now"): EmailBlock => ({ type: "products", items, buttonLabel });
const columns = (left: ColumnCell, right: ColumnCell): EmailBlock => ({ type: "columns", cells: [left, right] });
const divider: EmailBlock = { type: "divider" };
const space = (height = 12): EmailBlock => ({ type: "spacer", height });
const social: EmailBlock = { type: "social", links: [{ network: "instagram", url: "https://instagram.com/" }, { network: "whatsapp", url: "https://wa.me/" }, { network: "website", url: "{{store_url}}" }] };
const footer = (text = "You're getting this because you shop with {{store}}. Reply to this email any time, a real person reads it."): EmailBlock => ({ type: "footer", text });

const template = (key: string, name: string, category: TemplateCategory, description: string, subject: string, preheader: string, keywords: string[], blocks: EmailBlock[]): LibraryTemplate => ({
  key,
  name,
  category,
  description,
  subject,
  preheader,
  keywords,
  bodyHtml: htmlFromBlocks(blocks),
});

export const TEMPLATE_LIBRARY: LibraryTemplate[] = [
  template("welcome", "Welcome email", "welcome", "Say hello, tell your story and give a first-order code.", "Welcome to {{store}}, {{name}}", "A small thank-you for joining us", ["welcome", "new subscriber", "joined", "hello"], [
    img(PHOTOS.printDress, "A smiling customer in a print dress"),
    h("Welcome to the family, {{name}}", { align: "center" }),
    t("Thank you for joining {{store}}. You'll be first to hear about new pieces, restocks and offers, and we promise not to fill your inbox.", { align: "center" }),
    coupon("WELCOME10", "Your first-order gift", "10% off your first order. Use it at checkout."),
    btn("Start shopping", "{{store_url}}", { align: "center" }),
    social,
    footer(),
  ]),
  template("newsletter", "Simple newsletter", "newsletter", "News from the shop, two short stories and a link back.", "News from {{store}}", "What's new this week", ["newsletter", "news", "update", "weekly", "monthly", "gist"], [
    h("The weekly gist from {{store}}"),
    t("Hi {{name}},\n\nHere's what we've been up to this week. Write a few lines about new stock, a story from the shop, or a tip your customers will like."),
    img(PHOTOS.reading, "Relaxing with a good book"),
    columns(
      { heading: "From the shop", text: "Share a behind-the-scenes moment: a new supplier, a busy market day, a customer story." },
      { heading: "Tip of the week", text: "How to care for what they bought, how to style it, or how to pick the right size." },
    ),
    btn("Visit the shop"),
    social,
    footer(),
  ]),
  template("sale", "Sale announcement", "promotion", "Big headline, a discount code and your best sellers.", "Our sale starts now at {{store}}", "For a few days only", ["sale", "discount", "promo", "offer", "flash", "black friday", "payday", "% off"], [
    h("The sale is on", { align: "center", size: "lg" }),
    t("Hi {{name}}, for the next few days selected items are reduced. Use the code below at checkout.", { align: "center" }),
    coupon("SALE20", "This weekend only", "20% off selected items while stock lasts."),
    products([SAMPLE.adireDress, SAMPLE.kaftan, SAMPLE.tote, SAMPLE.sneakers]),
    btn("Shop the sale", "{{store_url}}", { align: "center" }),
    t("The offer ends soon, so don't wait too long.", { align: "center" }),
    footer(),
  ]),
  template("new_arrival", "New arrivals", "product_launch", "A lead photo and a grid of what just landed.", "Just in at {{store}}", "Fresh stock, first look", ["new arrivals", "new collection", "launch", "just landed", "new stock", "drop"], [
    img(PHOTOS.adire, "Model in a blue adire outfit"),
    h("Just landed"),
    t("Hi {{name}}, new pieces are in and you're getting the first look. Tell your customers what makes them special."),
    products([SAMPLE.adireDress, SAMPLE.kaftan, SAMPLE.tote, SAMPLE.sneakers], "View"),
    btn("See everything new"),
    footer(),
  ]),
  template("announcement", "Shop announcement", "announcement", "Plain and clear: new hours, a holiday break or a new way to pay.", "An update from {{store}}", "Something you should know", ["announcement", "update", "notice", "closed", "holiday break", "new address", "opening hours"], [
    h("A quick update"),
    t("Hi {{name}},"),
    t("Share your news here: new opening hours, a delivery change, a holiday break, or a new way to pay.", { bg: "#F6F4FA" }),
    divider,
    t("Thank you for shopping with us.\n{{store}}"),
    footer(),
  ]),
  template("cart", "Cart reminder", "abandoned_cart", "Brings their saved bag back with one tap.", "You left something at {{store}}", "Your cart is saved", ["cart", "abandoned", "left behind", "checkout", "reminder"], [
    h("Still thinking it over?"),
    t("Hi {{name}}, your cart is saved: {{cart_items}}."),
    t("**Total: {{cart_total}}**", { bg: "#F6F4FA" }),
    btn("Finish your order", "{{cart_url}}"),
    t("Questions about sizes, delivery or payment? Just reply to this email."),
    footer(),
  ]),
  template("thank_you", "Thank you", "order", "A warm thank-you after an order, with how to reach you.", "Thank you for your order", "We're getting it ready", ["thank you", "order", "confirmation", "purchase", "receipt"], [
    h("Thank you, {{name}}"),
    t("We've received order **{{order_number}}** ({{order_total}}) and we're getting it ready."),
    t("We'll let you know as soon as it's on its way. Reply to this email if you need anything.", { bg: "#F6F4FA" }),
    btn("Keep shopping"),
    social,
    footer(),
  ]),
  template("shipping", "On its way", "shipping", "Tell buyers their order has left and what happens next.", "Your order is on its way", "Your order has left the shop", ["shipping", "shipped", "dispatch", "delivery", "on its way", "rider", "tracking"], [
    img(PHOTOS.dispatch, "Our dispatch team"),
    h("Your order is on its way"),
    t("Hi {{name}}, good news: order **{{order_number}}** has left our hands."),
    t("Our delivery partner will call you before they arrive. Please keep your phone close, and reply here if the address needs a change."),
    btn("Ask us a question", "{{store_url}}"),
    footer(),
  ]),
  template("review", "Review request", "review", "Ask happy buyers for a quick review.", "How did we do, {{name}}?", "It takes one minute", ["review", "feedback", "rating", "rate", "testimonial"], [
    img(PHOTOS.thumbsUp, "A happy customer giving a thumbs up"),
    h("How did we do?", { align: "center" }),
    t("Hi {{name}}, we hope you're enjoying your order. A quick review helps other shoppers and means a lot to a small business like ours.", { align: "center" }),
    btn("Leave a review", "{{store_url}}", { align: "center" }),
    t("Something not right? Reply to this email and we'll sort it out.", { align: "center" }),
    footer(),
  ]),
  template("win_back", "We miss you", "win_back", "A friendly nudge and a code for customers who've gone quiet.", "We miss you at {{store}}", "Here's something to welcome you back", ["win back", "miss you", "come back", "inactive", "lapsed", "quiet"], [
    img(PHOTOS.phone, "A customer smiling at her phone"),
    h("It's been a while, {{name}}"),
    t("A lot has changed since your last visit: new styles, restocks and a few customer favourites back on the shelf."),
    coupon("COMEBACK15", "Welcome back", "15% off your next order, this week only."),
    btn("See what's new"),
    footer(),
  ]),
  template("birthday", "Happy birthday", "birthday", "A birthday treat with a personal code.", "Happy birthday, {{name}}!", "A little gift from all of us", ["birthday", "bday", "celebrate", "anniversary"], [
    img(PHOTOS.cake, "A slice of red velvet birthday cake"),
    h("Happy birthday, {{name}}!", { align: "center" }),
    t("Everyone at {{store}} is wishing you a lovely day. Here's a little something from us.", { align: "center" }),
    coupon("BDAY20", "Birthday treat", "20% off one order this month."),
    btn("Treat yourself", "{{store_url}}", { align: "center" }),
    footer(),
  ]),
  template("sallah", "Sallah Mubarak", "festive", "Eid greetings with festive picks and a code.", "Sallah Mubarak from {{store}}", "Festive looks and a small gift", ["sallah", "eid", "ramadan", "mubarak", "barka da sallah"], [
    img(PHOTOS.agbada, "Man in a flowing blue agbada"),
    h("Barka da Sallah, {{name}}", { align: "center" }),
    t("Wishing you and your family peace and joy this Sallah. Look your best for the celebrations with our festive picks.", { align: "center" }),
    products([SAMPLE.kaftan, SAMPLE.coral], "Shop"),
    coupon("SALLAH15", "Sallah gift", "15% off festive pieces until the end of the holiday."),
    btn("Shop the Sallah edit", "{{store_url}}", { align: "center" }),
    footer(),
  ]),
  template("christmas", "Merry Christmas", "festive", "Season's greetings, gift ideas and an order-early nudge.", "Merry Christmas from {{store}}", "Gift ideas, and a thank-you for this year", ["christmas", "xmas", "festive", "gift", "holiday", "season"], [
    img(PHOTOS.baker, "Baking for the festive season"),
    h("Merry Christmas, {{name}}"),
    t("Thank you for shopping with {{store}} this year. If you're sorting gifts for family and friends, we've picked a few favourites."),
    products([SAMPLE.tote, SAMPLE.beads, SAMPLE.floral, SAMPLE.coral], "Gift it"),
    t("**Order early** so your gifts arrive in time, as delivery gets busy in December.", { bg: "#F6F4FA" }),
    coupon("XMAS20", "Christmas offer", "20% off gifts while it lasts."),
    btn("Shop Christmas gifts"),
    footer(),
  ]),
  template("detty_december", "Detty December", "festive", "Owambe outfits and party picks for December.", "Detty December starts here", "Outfits for every owambe this month", ["detty december", "december", "owambe", "party", "japa", "december in lagos"], [
    img(PHOTOS.owambe, "Three friends in matching ankara and gele"),
    h("Detty December starts here", { align: "center", size: "lg" }),
    t("Weddings, owambes, carols and countless hangouts: December is busy. Here's what to wear to all of them.", { align: "center" }),
    products([SAMPLE.adireDress, SAMPLE.kaftan, SAMPLE.coral, SAMPLE.sneakers]),
    btn("Shop the December edit", "{{store_url}}", { align: "center" }),
    social,
    footer(),
  ]),
  template("valentine", "Valentine's gifts", "festive", "Gift ideas for him and her before 14 February.", "Valentine's gifts they'll love", "Thoughtful picks for your person", ["valentine", "love", "14 february", "february", "gift for her", "gift for him"], [
    img(PHOTOS.perfumeHero, "Woman enjoying a fragrance"),
    h("Gifts they'll actually love"),
    t("Hi {{name}}, Valentine's Day is on its way. Make it special with something thoughtful from {{store}}."),
    products([SAMPLE.oud, SAMPLE.floral, SAMPLE.coral, SAMPLE.beads], "Gift this"),
    btn("Shop Valentine's gifts"),
    footer(),
  ]),
  template("restock", "Back in stock", "restock", "Tell waiting customers a favourite is back.", "{{product_name}} is back in stock", "Get it before it sells out again", ["restock", "back in stock", "available again", "sold out", "waitlist"], [
    img(PHOTOS.market, "A busy, well-stocked market stall"),
    h("It's back, {{name}}"),
    t("**{{product_name}}** is back in stock at {{store}}. It sold out quickly last time, so grab yours while you can."),
    btn("Get it now"),
    footer(),
  ]),
  template("event_invite", "You're invited", "event", "Invite customers to a pop-up, launch or open day.", "You're invited, {{name}}", "Join us, and bring a friend", ["event", "invite", "pop-up", "popup", "launch party", "open day", "rsvp", "fair"], [
    img(PHOTOS.asoebi, "Guest in green and white aso-ebi"),
    h("You're invited", { align: "center" }),
    t("Join {{store}} for an afternoon of shopping, small chops and good company. Bring a friend!", { align: "center" }),
    columns({ heading: "When", text: "Saturday, 2pm to 6pm\n(Write your date here)" }, { heading: "Where", text: "Our shop, Lekki Phase 1\n(Write your address here)" }),
    btn("Tell us you're coming", "{{store_url}}", { align: "center" }),
    footer(),
  ]),
  template("mothers_day", "Mother's Day", "festive", "Say thank you to mums with gift ideas.", "For the women who raised us", "Mother's Day gifts from {{store}}", ["mother", "mothers day", "mum", "mama"], [
    img(PHOTOS.motherBaby, "A mother and her baby"),
    h("For the women who raised us"),
    t("Mother's Day is coming. Spoil her with something from {{store}}, wrapped and ready."),
    products([SAMPLE.floral, SAMPLE.coral], "Gift this"),
    space(),
    btn("Shop Mother's Day gifts"),
    footer(),
  ]),
];

/** The starter whose keywords best fit a request ("write a Sallah sale email" → sallah), or null. */
export function matchStarter(request: string): LibraryTemplate | null {
  const text = ` ${request.toLowerCase()} `;
  let best: { template: LibraryTemplate; score: number } | null = null;
  for (const template of TEMPLATE_LIBRARY) {
    let score = 0;
    for (const word of template.keywords) if (text.includes(word)) score += word.length;
    if (score && (!best || score > best.score)) best = { template, score };
  }
  return best?.template ?? null;
}

/** Like matchStarter, falling back to the newsletter. */
export function nearestStarter(request: string): LibraryTemplate {
  return matchStarter(request) ?? TEMPLATE_LIBRARY.find((tpl) => tpl.key === "newsletter")!;
}

/** Library templates for filter chips: category → how many starters. */
export function categoryCounts() {
  const counts: Partial<Record<TemplateCategory, number>> = {};
  for (const tpl of TEMPLATE_LIBRARY) counts[tpl.category] = (counts[tpl.category] ?? 0) + 1;
  return counts;
}
