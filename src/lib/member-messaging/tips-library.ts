/**
 * Weekly tips library for members (sellers, suppliers, delivery partners).
 *
 * Pure content, safe to import anywhere (client or server). Consumed by the
 * weekly tip email and the weekly WhatsApp tip sender.
 *
 * Array order per role is the order members receive tips, one per week, so
 * the most useful, beginner-friendly tips come first. Tip ids are stable and
 * used in links (/tip/<id>) and send logs: never rename or reuse an id. To add
 * tips, append them after the existing ones for that role.
 */

export type TipRole = "seller" | "supplier" | "logistics_partner";

export type TipTopic =
  | "sell-more"
  | "dropshipping"
  | "what-is"
  | "rex-videos"
  | "ads"
  | "whatsapp"
  | "photos"
  | "pricing"
  | "customers"
  | "delivery"
  | "growth"
  | "money"
  | "season";

export interface Tip {
  /** Stable id, kebab-case, unique, e.g. "seller-first-10-sales". Used in links (/tip/<id>) and send logs: never rename. */
  id: string;
  role: TipRole;
  topic: TipTopic;
  /** Who it's from: Rex (store, videos, design, content) or Peggy (customers, chat, support, money, growth). */
  from: "rex" | "peggy";
  /** Email subject, <= 60 chars, specific and benefit-led, no clickbait, no ALL CAPS, at most one emoji. */
  subject: string;
  /** Email preheader, <= 90 chars. */
  preheader: string;
  /** Heading inside the email, <= 70 chars. */
  title: string;
  /** 1-2 short opening sentences. */
  intro: string;
  /** 3-5 concrete steps or ideas, each one sentence (<= 180 chars), plain text. */
  points: string[];
  /** Optional one-line Nigerian example ("Ada in Yaba sells..."), <= 200 chars. */
  example?: string;
  /** Button: label <= 25 chars, path is an in-app path (must start with "/"). */
  cta: { label: string; path: string };
  /** The WhatsApp version: ONE message <= 300 chars, plain text, no line breaks, no links, may use 1 emoji. */
  whatsapp: string;
}

/* ------------------------------------------------------------------ */
/* Sellers (16)                                                        */
/* ------------------------------------------------------------------ */

const SELLER_TIPS: Tip[] = [
  {
    id: "seller-first-10-sales",
    role: "seller",
    topic: "sell-more",
    from: "peggy",
    subject: "How to get your first 10 sales",
    preheader: "Your first buyers are usually people who already know you. Start there.",
    title: "Your first 10 sales start with people who know you",
    intro:
      "Your first customers rarely come from strangers. They come from friends, family, colleagues and past buyers who already trust you.",
    points: [
      "Write down 30 people you know who could buy from you or share your shop, then message each one personally, not as a broadcast.",
      "Share your free yourshop.mybos.store link on your WhatsApp Status every day for two weeks, with a different product each day.",
      "Offer your first 10 buyers a small thank-you, like free delivery within your area or ₦500 off, and tell them it is for early supporters.",
      "After each sale, ask the buyer for a short review and a photo of the product in use, then share it on your Status.",
      "Reply to every enquiry within minutes, because a fast reply is often what turns a question into an order.",
    ],
    example:
      "Ada in Yaba got her first 10 wig orders in three weeks by posting one wig a day on Status and messaging old classmates directly.",
    cta: { label: "Send a campaign", path: "/home/marketing/campaigns" },
    whatsapp:
      "your first 10 sales usually come from people who already know you, so message 30 friends, family and past buyers personally, post one product a day on your Status, and offer early buyers a small thank-you like free local delivery 🙌",
  },
  {
    id: "seller-phone-product-photos",
    role: "seller",
    topic: "photos",
    from: "rex",
    subject: "Better product photos with just your phone",
    preheader: "Daylight, a plain background and a clean lens. No studio needed.",
    title: "Take product photos that sell, using only your phone",
    intro:
      "Customers cannot touch your product online, so your photos do the selling. Good news: your phone is enough.",
    points: [
      "Shoot near a window in daylight, between 9am and 4pm, and switch off the flash so colours stay true.",
      "Use a plain background like a white wall, a bedsheet or a sheet of cardboard so the product stands out.",
      "Wipe your camera lens with a soft cloth before shooting, because a smudged lens makes every photo look blurry.",
      "Take at least 4 shots per product: front, back, a close-up of the detail, and one showing size or the product in use.",
      "Keep the same background for all your products so your store looks neat and consistent.",
    ],
    example:
      "Chidi in Aba shoots his leather sandals on a white cardboard by his shop window every morning and posts them by noon.",
    cta: { label: "Design a post", path: "/home/marketing/social/new" },
    whatsapp:
      "great product photos only need your phone: shoot near a window in daylight with the flash off, use a plain background like a white wall or bedsheet, wipe your lens first, and take at least 4 angles including one close-up 📸",
  },
  {
    id: "seller-what-is-dropshipping",
    role: "seller",
    topic: "what-is",
    from: "peggy",
    subject: "What is dropshipping? A simple explanation",
    preheader: "Sell products without buying stock first. Here's how it works on Shopinbos.",
    title: "What is dropshipping, and is it right for you?",
    intro:
      "Dropshipping means you sell a product in your store without buying or holding the stock. When a customer pays, the supplier packs and sends the order.",
    points: [
      "You pick products from suppliers in the Shopinbos marketplace and add them to your store with your own selling price.",
      "When a customer orders, the supplier gets the order, packs it and hands it over for delivery, so you never store goods.",
      "Your profit is the difference between your selling price and the supplier's price plus delivery.",
      "It is a low-risk way to test new products before you spend money on stock.",
      "You still own the customer experience, so choose suppliers with good reviews and fast order acceptance.",
    ],
    example:
      "Tunde in Ibadan adds skincare sets from a Lagos supplier to his store and earns his margin on each order without buying stock.",
    cta: { label: "Browse the marketplace", path: "/marketplace" },
    whatsapp:
      "dropshipping means you sell a supplier's product in your store without buying stock first, and when a customer pays, the supplier packs and sends it while you keep the difference between your price and theirs. It is a low-risk way to test new products.",
  },
  {
    id: "seller-whatsapp-with-peggy",
    role: "seller",
    topic: "whatsapp",
    from: "peggy",
    subject: "Let Peggy answer your WhatsApp customers",
    preheader: "Fast replies, even at midnight. Set up your chatbot in a few minutes.",
    title: "Sell on WhatsApp without being glued to your phone",
    intro:
      "Most Nigerian buyers want to ask a question before they pay. I can answer them on WhatsApp and live chat while you rest or work.",
    points: [
      "Connect your WhatsApp in the chatbot settings so I can reply to common questions about price, sizes and delivery.",
      "Add your delivery areas, delivery fees and return policy so my answers match how you actually work.",
      "Set up your WhatsApp store so customers can see your catalogue and order without leaving the chat.",
      "Check your inbox once or twice a day to take over any chat that needs a personal touch.",
    ],
    example:
      "Halima in Kano sells perfume oils, and I answer her late-night price questions so orders are waiting when she wakes up.",
    cta: { label: "Set up Peggy", path: "/home/inbox/chatbot" },
    whatsapp:
      "you can let me answer your customers on WhatsApp and live chat, even at midnight. Add your prices, delivery areas and return policy in the chatbot settings so my replies match how you work, then check in once or twice a day for chats that need you.",
  },
  {
    id: "seller-rex-video-hooks",
    role: "seller",
    topic: "rex-videos",
    from: "rex",
    subject: "Win the first 2 seconds of your product video",
    preheader: "People decide to keep watching almost instantly. Here's how to hook them.",
    title: "Make your first 2 seconds impossible to scroll past",
    intro:
      "On Status, Reels and TikTok, people decide in about 2 seconds whether to keep watching. Let's make those seconds count.",
    points: [
      "Open with the product in action, not your logo: the wig being flipped, the perfume being sprayed, the sneaker sole being bent.",
      "Put a short hook line on screen, like \"₦15,000 ankara set that fits every size\" or \"The gadget every Lagos driver needs\".",
      "Show the problem first, then the fix, for example a dull face, then glowing skin after your cream.",
      "Keep each video to 15 to 30 seconds and end with one clear action, like \"Tap the link to order\".",
    ],
    example:
      "Ngozi in Onitsha opened her Rex video with a close-up of shoe soles bending, and more people watched to the end.",
    cta: { label: "Make a Rex video", path: "/home/video" },
    whatsapp:
      "people decide in about 2 seconds whether to keep watching, so start your Rex video with the product in action, not your logo, add a short hook line with the price or benefit, and end with one clear action like tap to order 🎬",
  },
  {
    id: "seller-sell-more-conversion-rate",
    role: "seller",
    topic: "sell-more",
    from: "peggy",
    subject: "Turn more store visitors into paying customers",
    preheader: "What a conversion rate is, and 4 simple ways to raise yours.",
    title: "Sell more online by fixing your conversion rate",
    intro:
      "Your conversion rate is the share of visitors who buy. If 100 people visit and 2 buy, your conversion rate is 2%. Small fixes can move it.",
    points: [
      "Show the full price including delivery early, because surprise fees at checkout are a common reason people leave.",
      "Write product descriptions that answer the top questions: size, material, how long delivery takes and what happens if it does not fit.",
      "Add reviews and real customer photos to your best-selling products so new visitors can trust you.",
      "Make it easy to ask a question, because many buyers want a quick chat on WhatsApp before they pay.",
      "Add a short Rex video to your top 3 products so buyers can see them from every angle.",
    ],
    example:
      "Emeka in Abuja added delivery prices to every product page for his gadgets and stopped getting \"how much to deliver?\" drop-offs.",
    cta: { label: "Set up Peggy", path: "/home/inbox/chatbot" },
    whatsapp:
      "your conversion rate is the share of store visitors who buy, so if 100 visit and 2 buy, it is 2%. To raise it, show delivery fees early, answer size and delivery questions in your descriptions, and add reviews and a short video to your best sellers.",
  },
  {
    id: "seller-dropshipping-tips",
    role: "seller",
    topic: "dropshipping",
    from: "peggy",
    subject: "5 dropshipping habits that protect your profit",
    preheader: "Pick the right suppliers, price for delivery, and keep customers informed.",
    title: "Dropship smarter: choose well, price right, stay in touch",
    intro:
      "Dropshipping saves you from buying stock, but your name is still on every order. These habits keep customers happy and your margin safe.",
    points: [
      "Choose suppliers with good reviews and fast order acceptance, and order one sample yourself before you promote a product hard.",
      "Price for your full cost: supplier price plus delivery plus a cushion, so a ₦12,000 item might sell for ₦16,500, not ₦13,000.",
      "Tell customers the real delivery time upfront, for example 2 to 4 days within Lagos and longer for other states.",
      "Start with 5 to 10 products in one niche, like skincare or phone accessories, instead of 100 random items.",
      "Follow up after delivery to ask how it went, so you catch any problem before it becomes a bad review.",
    ],
    example:
      "Bisi in Surulere tested a supplier's sneakers with one sample order before adding the full range to her store.",
    cta: { label: "Open dropship", path: "/home/dropship" },
    whatsapp:
      "before promoting a dropship product, order one sample yourself, choose suppliers with good reviews, and price for supplier cost plus delivery plus a cushion. Starting with 5 to 10 products in one niche is usually easier to market than 100 random items.",
  },
  {
    id: "seller-what-is-payment-link",
    role: "seller",
    topic: "what-is",
    from: "peggy",
    subject: "What is a payment link? Get paid in one tap",
    preheader: "Send a link in chat, the customer pays, and you both get a record.",
    title: "What is a payment link, and when should you use one?",
    intro:
      "A payment link is a web link you send to a customer so they can pay you online in a few taps. No bank details to copy, no screenshots to confirm.",
    points: [
      "Create a link for a product or a custom amount, then paste it into WhatsApp, Instagram DMs or SMS.",
      "Use one when a customer has agreed to buy in chat, so they pay while they are still keen.",
      "Payment links give you a clear record, so you spend less time checking alerts and matching transfers.",
      "Add a clear description, like \"2 yards ankara plus Lagos delivery\", so the customer knows exactly what they are paying for.",
    ],
    example:
      "Funmi in Ikeja sends a payment link as soon as a customer picks a dress in chat, instead of typing out her account number.",
    cta: { label: "Create a payment link", path: "/home/payment-links" },
    whatsapp:
      "a payment link lets a customer pay you online in a few taps, right from WhatsApp or Instagram, with no account numbers to copy and no screenshots to check. Send one as soon as they agree to buy in chat, while they are still keen.",
  },
  {
    id: "seller-ads-budget-audience",
    role: "seller",
    topic: "ads",
    from: "peggy",
    subject: "Your first Facebook and Instagram ad, step by step",
    preheader: "Start small, target the right people, and learn before you spend more.",
    title: "Ads basics: a small budget and the right audience",
    intro:
      "You do not need a big budget to start with ads. You need a small test, a clear audience and a few days of patience.",
    points: [
      "Start with a daily budget you are comfortable losing while you learn, for example ₦2,000 to ₦5,000 a day for 5 to 7 days.",
      "Target the places you actually deliver to, like Lagos and Ogun only, instead of the whole of Nigeria.",
      "Pick an audience by age and interests that match your buyer, such as women 22 to 40 interested in skincare.",
      "Promote one proven product at a time, ideally one that has already sold well to people who know you.",
      "Leave the ad running for at least 3 days before changing it, so you are judging real results.",
    ],
    example:
      "Kemi in Lekki spent ₦3,000 a day for a week on one lip gloss bundle, targeting Lagos women 20 to 35, before trying more.",
    cta: { label: "Start an ad", path: "/home/ads" },
    whatsapp:
      "for your first ad, start small with a daily budget you are comfortable testing, target only the areas you deliver to, choose an audience that matches your real buyers, and give it at least 3 days before you change anything.",
  },
  {
    id: "seller-pricing-for-profit",
    role: "seller",
    topic: "pricing",
    from: "peggy",
    subject: "Price your products so you actually make profit",
    preheader: "Add up every cost first, then set a price you can defend.",
    title: "Price for profit, not just to be the cheapest",
    intro:
      "Many small businesses sell a lot and still feel broke because the price did not cover every cost. Let's fix that.",
    points: [
      "List every cost per item: buying price, transport to your shop, packaging, payment fees, delivery and any ad spend.",
      "Add your profit on top of the full cost, not just the buying price.",
      "Check 3 to 5 competitors, but do not copy the lowest price; compete on photos, speed and service too.",
      "Use bundles to raise the order value, like 3 perfumes for ₦25,000 instead of ₦9,500 each.",
      "Run discounts for a short, clear period with an end date, so customers do not wait for a sale before buying.",
    ],
    example:
      "Musa in Kano found packaging and transport added ₦800 to each foodstuff pack, so he raised his price and kept his margin.",
    cta: { label: "Set up a discount", path: "/home/discounts" },
    whatsapp:
      "before you set a price, add up every cost per item: buying price, transport, packaging, payment fees and delivery, then add your profit on top. Bundles, like 3 items for a set price, can raise each order without cutting your margin.",
  },
  {
    id: "seller-rex-video-status-reels-tiktok",
    role: "seller",
    topic: "rex-videos",
    from: "rex",
    subject: "One Rex video, three places: Status, Reels, TikTok",
    preheader: "Make one vertical product video and post it everywhere your buyers scroll.",
    title: "Get more from every Rex video on Status, Reels and TikTok",
    intro:
      "Each Rex video uses about 10 credits, so let's get the most out of every one by posting it in more than one place.",
    points: [
      "Make your videos vertical, because Status, Reels and TikTok all play best full screen on a phone.",
      "Post on WhatsApp Status first, since your contacts already know you and are more likely to reply.",
      "On Reels and TikTok, add 3 to 5 simple hashtags like #LagosFashion or #NaijaSkincare and a caption with the price.",
      "Post at times your buyers are on their phones, such as 7am to 9am or 7pm to 10pm.",
      "Reuse your best video again a few weeks later with a new hook line, instead of always making a new one.",
    ],
    example:
      "Zainab in Abuja posts each Rex video of her abayas on Status in the morning and on TikTok at night.",
    cta: { label: "Open Video studio", path: "/home/video" },
    whatsapp:
      "make your Rex videos vertical and post each one in three places: WhatsApp Status first for people who know you, then Reels and TikTok with the price in the caption and a few simple hashtags. Posting between 7pm and 10pm often catches buyers relaxing.",
  },
  {
    id: "seller-get-more-reviews",
    role: "seller",
    topic: "customers",
    from: "peggy",
    subject: "How to get more reviews from happy customers",
    preheader: "Ask at the right moment and make it easy. Most people just need a nudge.",
    title: "Get more reviews by asking at the right moment",
    intro:
      "Reviews help new buyers trust you. Most happy customers will leave one if you ask nicely and make it easy.",
    points: [
      "Ask 1 to 2 days after delivery, when the customer has used the product but still remembers the experience.",
      "Send a short, personal message like \"Hi Bola, how are you finding the wig? A quick review would really help us\".",
      "Ask for a photo of the product in use, because real photos build more trust than words alone.",
      "Reply to every review, including the unhappy ones, calmly and with a solution.",
    ],
    example:
      "Ifeoma in Enugu messages every buyer two days after delivery and now has photo reviews on all her top skincare products.",
    cta: { label: "See your reviews", path: "/home/reviews" },
    whatsapp:
      "the best time to ask for a review is 1 to 2 days after delivery, when the customer has used the product. Send a short personal message, ask for a photo of the product in use, and reply calmly to every review, even the unhappy ones ⭐",
  },
  {
    id: "seller-ad-creatives-that-work",
    role: "seller",
    topic: "ads",
    from: "rex",
    subject: "Ad pictures and videos that make people stop",
    preheader: "Real products, clear prices and one simple message per ad.",
    title: "Ad creatives that stop the scroll",
    intro:
      "Your ad's picture or video does most of the work. Here is what tends to perform for small shops.",
    points: [
      "Use real photos or videos of your actual product, because buyers trust real items more than stock images.",
      "Show the price or offer clearly, like \"₦18,500, free delivery in Lagos\", so the right buyers click.",
      "Keep one message per ad: one product, one benefit, one action.",
      "Try 2 or 3 different creatives for the same product and keep the one that gets the most clicks and orders.",
      "Short vertical videos of 10 to 20 seconds often work well, so try a Rex video as one of your creatives.",
    ],
    example:
      "Segun in Ibadan tested a photo and a Rex video of his power banks; the video got more clicks, so he moved his budget there.",
    cta: { label: "Create an ad", path: "/home/ads" },
    whatsapp:
      "for ads, use real photos or videos of your actual product, show the price clearly, and keep one message per ad. Try 2 or 3 different creatives for the same product, then keep the one that brings the most clicks and orders.",
  },
  {
    id: "seller-repeat-customers",
    role: "seller",
    topic: "customers",
    from: "peggy",
    subject: "Turn first-time buyers into regular customers",
    preheader: "Selling again to happy customers is easier than finding new ones.",
    title: "Keep customers coming back",
    intro:
      "Someone who has bought from you once already trusts you. A little follow-up can turn them into a regular.",
    points: [
      "Save every customer's name and what they bought, so your next message feels personal.",
      "Send a thank-you message after delivery with a small code for their next order, like ₦1,000 off.",
      "Message past buyers when something new arrives that matches what they bought before.",
      "Send campaigns no more than once or twice a week, so people look forward to them instead of muting you.",
      "Remember special customers with a small extra in the package, like a sample or a handwritten note.",
    ],
    example:
      "Amaka in Port Harcourt texts past hair buyers when new bundles arrive, and many reorder within a week.",
    cta: { label: "Send a campaign", path: "/home/marketing/campaigns" },
    whatsapp:
      "someone who has bought from you once already trusts you, so send a thank-you after delivery with a small code for next time, and message past buyers when something new arrives that matches what they bought before. Keep it to once or twice a week.",
  },
  {
    id: "seller-refer-and-earn",
    role: "seller",
    topic: "growth",
    from: "peggy",
    subject: "Invite a business friend and earn rewards",
    preheader: "Know someone who should be selling online? Refer them and earn.",
    title: "Know a business that should be online? Invite them",
    intro:
      "You probably know other business owners who still sell only in person or on WhatsApp. Inviting them can earn you rewards.",
    points: [
      "Get your personal invite link from the Refer and earn page.",
      "Share it with traders you know, like the fabric seller next to your stall or your friend who bakes cakes.",
      "Tell them what has helped you most, so they know what to try first.",
      "When they join, you can earn free months or AI credits, as shown on the Refer and earn page.",
    ],
    example:
      "Yusuf in Kaduna invited three traders from his market who sell shoes, phone cases and spices.",
    cta: { label: "Invite a business", path: "/refer" },
    whatsapp:
      "you probably know other business owners who should be selling online. Share your invite link from the Refer and earn page with them, and when they join you can earn free months or AI credits.",
  },
  {
    id: "seller-festive-season-prep",
    role: "seller",
    topic: "season",
    from: "rex",
    subject: "Get your store ready for the next big season",
    preheader: "Plan products, stock and posts 3 to 4 weeks before the rush starts.",
    title: "Prepare early for festive and seasonal rushes",
    intro:
      "Christmas, Sallah, Easter, Valentine's and back-to-school all bring buyers who shop early. Shops that prepare a few weeks ahead are ready for them.",
    points: [
      "Start planning 3 to 4 weeks before the season, and pick 5 to 10 products that fit, like gift sets, ankara outfits or foodstuff hampers.",
      "Check stock or supplier availability early, because popular items and delivery riders get scarce close to the date.",
      "Make a few Rex videos and social posts in advance and schedule them on your social calendar.",
      "Create a seasonal bundle or offer with a clear end date, like \"Christmas gift box, order before 20 December\".",
      "Tell customers your last order date for delivery before the holiday, so nobody is disappointed.",
    ],
    example:
      "Rukayat in Ilorin plans her Sallah perfume gift boxes a month ahead and schedules her posts before the rush.",
    cta: { label: "Plan a campaign", path: "/home/campaigns" },
    whatsapp:
      "busy seasons like Christmas, Sallah and Valentine's reward early planning, so start 3 to 4 weeks ahead: pick 5 to 10 seasonal products, check stock and delivery early, schedule your posts, and tell customers your last order date for delivery 🎁",
  },
];

/* ------------------------------------------------------------------ */
/* Suppliers (12)                                                      */
/* ------------------------------------------------------------------ */

const SUPPLIER_TIPS: Tip[] = [
  {
    id: "supplier-listing-photos",
    role: "supplier",
    topic: "photos",
    from: "rex",
    subject: "Listing photos that help shops choose you",
    preheader: "Sellers use your photos in their own stores. Make them clean and clear.",
    title: "Listing photos that get orders",
    intro:
      "Sellers often reuse your photos in their own stores, so clear photos make your product easier for them to sell.",
    points: [
      "Shoot on a plain white or light background in daylight, so sellers can use the photos straight away.",
      "Show every variant you stock, like each colour of ankara or each size of sneaker, in its own photo.",
      "Add one photo showing scale, such as the product held in a hand or next to a common item.",
      "Show packaging and labels clearly, because sellers want to know what their customers will receive.",
      "Avoid adding your phone number or watermarks on photos, since sellers need clean images for their stores.",
    ],
    example:
      "A cosmetics supplier in Onitsha reshot her shea butter range on a white background and got more dropship add-ons from shops.",
    cta: { label: "Update your products", path: "/supplier/products" },
    whatsapp:
      "sellers often reuse your photos in their own stores, so shoot on a plain light background in daylight, show every colour or size you stock, add one photo that shows scale, and keep photos free of phone numbers and watermarks.",
  },
  {
    id: "supplier-clear-specs-and-moq",
    role: "supplier",
    topic: "sell-more",
    from: "rex",
    subject: "Clear specs and MOQ mean fewer questions",
    preheader: "Tell shops exactly what they get and the least they can order.",
    title: "Write product details that answer questions before they're asked",
    intro:
      "Shops compare several suppliers before ordering. Clear details help them choose you without waiting for answers.",
    points: [
      "List exact specs: size, weight, material, colour options and what is in the pack.",
      "State your MOQ, which means minimum order quantity, clearly, for example \"MOQ: 12 pieces, mixed colours allowed\".",
      "Say how long you take to dispatch, such as \"ships within 24 hours of order\".",
      "Mention whether the product is suitable for dropship single orders, wholesale only, or both.",
    ],
    example:
      "A bag maker in Aba wrote \"MOQ 6, any colour mix, dispatch in 48 hours\" and spent less time answering the same questions.",
    cta: { label: "Edit your listings", path: "/supplier/products" },
    whatsapp:
      "shops compare suppliers before ordering, so list exact specs like size, material and what is in the pack, state your minimum order quantity clearly, and say how fast you dispatch. Clear details mean fewer questions and quicker decisions.",
  },
  {
    id: "supplier-accept-orders-in-2-hours",
    role: "supplier",
    topic: "customers",
    from: "peggy",
    subject: "Accept orders within 2 hours to rank higher",
    preheader: "Fast acceptance helps your ranking and keeps shops coming back.",
    title: "Accept orders within 2 hours",
    intro:
      "When a shop's customer pays, the shop is waiting on you. Accepting orders within 2 hours improves your ranking in the marketplace.",
    points: [
      "Turn on notifications on your phone so you see new orders as soon as they arrive.",
      "Check your orders page at set times, like 9am, 12pm, 3pm and 6pm, if you cannot watch it all day.",
      "Give one trusted staff member access so orders are still accepted when you are busy or travelling.",
      "If you cannot fulfil an order, decline it quickly rather than leaving it waiting, so the shop can tell their customer.",
    ],
    example:
      "A gadget supplier in Computer Village checks orders every three hours and now accepts most orders within the 2-hour window.",
    cta: { label: "View your orders", path: "/supplier/orders" },
    whatsapp:
      "accepting orders within 2 hours improves your marketplace ranking, so turn on order notifications, check orders at set times through the day, and let a trusted staff member help. If you cannot fulfil an order, decline it quickly so the shop can update their customer.",
  },
  {
    id: "supplier-what-is-dropshipping",
    role: "supplier",
    topic: "what-is",
    from: "peggy",
    subject: "What dropshipping means for you as a supplier",
    preheader: "Shops sell your products, you pack and send. Here's how to price for it.",
    title: "Dropshipping from the supplier side, explained",
    intro:
      "With dropshipping, a shop lists your product in their store without buying stock. When their customer orders, you pack and send that single order.",
    points: [
      "Many shops can sell your products at the same time, which can reach buyers you would never meet in person.",
      "Each order is usually one or two items, so your packing and dispatch need to be fast and tidy.",
      "Set your dropship price so shops can add their margin and still stay competitive, often leaving room of 20% to 40%.",
      "If your dropship price matches your retail price, shops cannot make money on it and are less likely to list it.",
      "Keep stock levels accurate, because every out-of-stock order lets down the shop and their customer.",
    ],
    example:
      "A hair supplier in Lagos sets a ₦22,000 dropship price on a bundle that retails at ₦30,000, leaving shops room to earn.",
    cta: { label: "Add a product", path: "/supplier/products/new" },
    whatsapp:
      "with dropshipping, shops list your product without buying stock, and you pack and send each order when their customer pays. Price so shops can add their margin, often 20% to 40%, and keep stock accurate so no order is let down.",
  },
  {
    id: "supplier-answer-quotes-fast",
    role: "supplier",
    topic: "customers",
    from: "peggy",
    subject: "Quick quote replies win more wholesale orders",
    preheader: "Shops often ask several suppliers. The first clear answer has an edge.",
    title: "Answer quote requests quickly and clearly",
    intro:
      "A quote request means a shop is ready to buy in bulk. They often ask more than one supplier, so a fast, clear reply matters.",
    points: [
      "Aim to reply to quote requests on the same day, and faster ranks you better.",
      "Give a full answer in one message: unit price, quantity, delivery cost, dispatch time and how long the quote is valid.",
      "Offer a better price at a higher quantity, such as ₦4,500 each for 50 or ₦4,100 each for 100.",
      "If something is out of stock, say when it will be back or suggest a close alternative.",
    ],
    example:
      "A foodstuff supplier in Kano replies to quotes within the hour with prices for 20, 50 and 100 bags.",
    cta: { label: "See quote requests", path: "/supplier/quote-requests" },
    whatsapp:
      "a quote request means a shop is ready to buy in bulk, and they often ask several suppliers. Reply the same day with unit price, quantity, delivery cost, dispatch time and how long the price holds, plus a better price for a bigger order.",
  },
  {
    id: "supplier-wholesale-price-tiers",
    role: "supplier",
    topic: "pricing",
    from: "peggy",
    subject: "Use price tiers to encourage bigger orders",
    preheader: "Clear wholesale tiers show shops why buying more is worth it.",
    title: "Set wholesale price tiers that reward bigger orders",
    intro:
      "Price tiers show shops a lower unit price when they buy more. They make bulk buying an easy decision.",
    points: [
      "Create 2 to 4 tiers, for example 1 to 11 pieces, 12 to 49 pieces and 50 pieces and above.",
      "Make each step down in price meaningful, but check that your lowest tier still covers all your costs.",
      "Keep the tiers simple and round, like ₦3,500, ₦3,200 and ₦2,900, so they are easy to compare.",
      "Review your tiers every few months when your own costs or exchange rates change.",
    ],
    example:
      "A sneaker wholesaler in Aba offers ₦14,000 each for 6 pairs and ₦12,500 each for 24 pairs.",
    cta: { label: "Set wholesale tiers", path: "/supplier/wholesale" },
    whatsapp:
      "wholesale price tiers show shops a lower unit price when they buy more. Set 2 to 4 simple tiers, like 1 to 11, 12 to 49 and 50 plus pieces, keep the prices round, and make sure your lowest tier still covers all your costs.",
  },
  {
    id: "supplier-stock-accuracy",
    role: "supplier",
    topic: "sell-more",
    from: "peggy",
    subject: "Keep your stock count accurate",
    preheader: "Every out-of-stock order hurts a shop's trust in you.",
    title: "Accurate stock keeps shops trusting you",
    intro:
      "When a shop sells your product and you are out of stock, their customer is let down. Accurate stock protects both of you.",
    points: [
      "Update stock the same day you sell offline in your shop or market, not at the end of the week.",
      "Do a quick count of your top 10 products every Monday and correct any differences.",
      "Set a product to zero stock as soon as it runs out, instead of hoping a new batch arrives in time.",
      "If a product is coming back soon, say so in the description with a realistic date.",
    ],
    example:
      "A perfume supplier in Abuja counts her 10 best sellers every Monday morning before opening the shop.",
    cta: { label: "Update stock", path: "/supplier/products" },
    whatsapp:
      "when a shop sells your product and you are out of stock, their customer is let down. Update stock the same day you sell offline, count your top 10 products every Monday, and set items to zero as soon as they run out.",
  },
  {
    id: "supplier-get-verified",
    role: "supplier",
    topic: "growth",
    from: "peggy",
    subject: "Get verified so shops can trust you faster",
    preheader: "A verified badge tells shops your business has been checked.",
    title: "Get verified and build trust with shops",
    intro:
      "Shops are trusting you with their customers. Verification shows them your business details have been checked.",
    points: [
      "Open the verification page and see which documents are needed for your business.",
      "Make sure your business name and details match your documents exactly, to avoid delays.",
      "Upload clear, readable photos or scans, with all four corners of each document showing.",
      "Complete your profile too, with your location, what you make or supply, and your dispatch times.",
    ],
    example:
      "A textile supplier in Kano completed verification and his full profile in one afternoon.",
    cta: { label: "Get verified", path: "/supplier/verification" },
    whatsapp:
      "shops are trusting you with their customers, and verification shows them your business details have been checked. Upload clear documents that match your business name exactly, and complete your profile with your location and dispatch times.",
  },
  {
    id: "supplier-dropship-packaging",
    role: "supplier",
    topic: "delivery",
    from: "rex",
    subject: "Pack dropship orders the way shops want",
    preheader: "The shop's customer opens your package. Make it neat and neutral.",
    title: "Packaging tips for dropship orders",
    intro:
      "With dropship orders, the shop's customer is the one opening your package, so it needs to look neat and arrive safe.",
    points: [
      "Use plain, clean packaging without your own prices or flyers, because the shop sets its own price.",
      "Protect fragile items like perfume bottles and gadgets with bubble wrap or paper, and seal liquids in a nylon bag.",
      "Include the order number on the outside so riders and shops can match it quickly.",
      "Take a quick photo of each packed order before handover, in case there is a question later.",
    ],
    example:
      "A skincare supplier in Ikeja seals every jar in nylon, wraps it in paper and photographs each package before pickup.",
    cta: { label: "Delivery settings", path: "/supplier/delivery" },
    whatsapp:
      "for dropship orders, the shop's customer opens your package, so use plain clean packaging with no price tags or flyers, protect fragile items, label the order number on the outside, and snap a photo of each package before handover 📦",
  },
  {
    id: "supplier-featured-weeks",
    role: "supplier",
    topic: "sell-more",
    from: "peggy",
    subject: "What featured weeks are and when to use one",
    preheader: "A featured week puts your products in front of more shops. Time it well.",
    title: "Featured weeks: what they are and when to use one",
    intro:
      "A featured week boosts your products in the marketplace so more shops see them for that week. It works best when you are ready for extra orders.",
    points: [
      "Use a featured week when you have plenty of stock and can still accept orders within 2 hours.",
      "Feature your best products, the ones with strong photos, clear details and good reviews.",
      "Time it before busy seasons, like 3 to 4 weeks before Christmas or Sallah, when shops are choosing what to stock.",
      "Check your analytics afterwards to see views, followers and orders, so you know whether to do it again.",
    ],
    example:
      "An ankara supplier in Lagos booked a featured week in early November, when shops were planning their December stock.",
    cta: { label: "View your analytics", path: "/supplier/analytics" },
    whatsapp:
      "a featured week boosts your products in the marketplace so more shops see them. Use one when you have plenty of stock and can accept orders fast, feature your best-photographed products, and time it 3 to 4 weeks before a busy season.",
  },
  {
    id: "supplier-refer-and-earn",
    role: "supplier",
    topic: "growth",
    from: "peggy",
    subject: "Invite the shops you already supply",
    preheader: "Bring your offline buyers onto Shopinbos and earn rewards.",
    title: "Invite your buyers and other businesses to Shopinbos",
    intro:
      "You already supply shops that buy from you in person or by phone. Inviting them can make reordering easier and earn you rewards.",
    points: [
      "Get your personal invite link from the Refer and earn page.",
      "Share it with retailers who already buy from you, so they can order and follow you in one place.",
      "Invite other business owners you know, like fellow traders in your market.",
      "When they join, you can earn free months or AI credits, as shown on the Refer and earn page.",
    ],
    example:
      "A shoe supplier in Aba shared his invite link with the retailers who buy from him every month.",
    cta: { label: "Invite a business", path: "/refer" },
    whatsapp:
      "you already supply shops that buy from you in person or by phone. Share your invite link from the Refer and earn page with them, and when businesses join you can earn free months or AI credits.",
  },
  {
    id: "supplier-repeat-buyers-followers",
    role: "supplier",
    topic: "customers",
    from: "peggy",
    subject: "Turn one-time shop buyers into followers",
    preheader: "Shops that follow you see your new products first.",
    title: "Build repeat shop buyers and followers",
    intro:
      "A shop that has ordered once and had a good experience is your best chance of a repeat order. Followers help you stay in front of them.",
    points: [
      "Deliver the first order perfectly, because it decides whether a shop comes back.",
      "Add new products regularly, like a few new designs each month, so followers have a reason to check your store.",
      "Ask happy shops to follow your store and leave a review after their order arrives.",
      "Reply to every review politely, and fix problems quickly when a shop is unhappy.",
    ],
    example:
      "A gadget supplier in Lagos adds new phone accessories every two weeks, and many follower shops reorder.",
    cta: { label: "See your followers", path: "/supplier/followers" },
    whatsapp:
      "a shop that had a good first order is your best chance of a repeat order. Get the first order right, add new products regularly so followers have something new to see, and ask happy shops to follow you and leave a review.",
  },
];

/* ------------------------------------------------------------------ */
/* Delivery partners (12)                                              */
/* ------------------------------------------------------------------ */

const LOGISTICS_TIPS: Tip[] = [
  {
    id: "logistics-accept-jobs-in-30-minutes",
    role: "logistics_partner",
    topic: "delivery",
    from: "peggy",
    subject: "Accept jobs within 30 minutes to rank higher",
    preheader: "Shops pick partners who respond fast. Here's how to stay quick.",
    title: "Accept jobs within 30 minutes",
    intro:
      "When a shop books you, their customer is waiting. Accepting jobs within 30 minutes improves your ranking with shops.",
    points: [
      "Turn on notifications so new bookings reach you straight away, even on the road.",
      "Have one person in charge of accepting jobs during working hours, so nothing waits.",
      "Keep your coverage and working hours up to date, so you only get jobs you can take.",
      "If you cannot take a job, decline it quickly so the shop can book someone else.",
    ],
    example:
      "A dispatch company in Yaba gave one staff member the job of accepting bookings, and most are now accepted within 15 minutes.",
    cta: { label: "View bookings", path: "/logistics/bookings" },
    whatsapp:
      "accepting jobs within 30 minutes improves your ranking with shops, so turn on booking notifications, put one person in charge of accepting jobs, keep your coverage and hours current, and decline quickly if you cannot take a job 🛵",
  },
  {
    id: "logistics-rate-cards-and-coverage",
    role: "logistics_partner",
    topic: "pricing",
    from: "peggy",
    subject: "Clear rates and coverage bring the right jobs",
    preheader: "Shops book faster when they can see where you go and what it costs.",
    title: "Set clear rate cards and coverage areas",
    intro:
      "Shops want to know two things fast: do you deliver there, and how much will it cost. Clear answers bring you better jobs.",
    points: [
      "List only the areas you can reliably reach, like Lagos Mainland, Lekki to Ajah, or Ibadan city.",
      "Set prices by zone, for example ₦2,500 within Ikeja and ₦4,000 from Ikeja to Lekki.",
      "Say what is included, like weight limits, waiting time and extra charges for bulky items.",
      "Review your rates when fuel prices change, and update them in one go instead of charging extra on the day.",
    ],
    example:
      "A rider team in Abuja split their rates into Central, Gwarinpa and Kubwa zones, so shops know the price before booking.",
    cta: { label: "Update your rates", path: "/logistics/rates" },
    whatsapp:
      "shops book faster when they can see where you deliver and what it costs, so list only areas you can reliably reach, price by zone, say what is included like weight limits and waiting time, and update rates in one go when fuel prices change.",
  },
  {
    id: "logistics-proof-of-delivery-photos",
    role: "logistics_partner",
    topic: "photos",
    from: "rex",
    subject: "Proof of delivery photos protect you",
    preheader: "One clear photo at the door can settle a dispute in seconds.",
    title: "Take a clear proof of delivery photo every time",
    intro:
      "A proof of delivery photo shows the package reached the right place. It protects you, the rider and the shop if questions come up.",
    points: [
      "Take the photo at the moment of handover, showing the package and the door, gate or customer's hand.",
      "Make sure the order label or number is visible in the photo where possible.",
      "Avoid photographing the customer's face unless they agree, and never share the photo outside the app.",
      "Upload the photo on the booking right away, before moving to the next drop.",
    ],
    example:
      "A rider in Port Harcourt snaps every package at the gate with the label showing, and late \"not delivered\" claims are easy to settle.",
    cta: { label: "Open bookings", path: "/logistics/bookings" },
    whatsapp:
      "a clear proof of delivery photo protects you and the shop, so snap the package at handover with the door or gate and the order label visible, avoid faces unless the customer agrees, and upload it on the booking before your next drop 📸",
  },
  {
    id: "logistics-on-time-delivery",
    role: "logistics_partner",
    topic: "delivery",
    from: "peggy",
    subject: "Simple habits for on-time deliveries",
    preheader: "Plan routes, call ahead and keep shops informed.",
    title: "On-time delivery habits that shops notice",
    intro:
      "On-time delivery improves your ranking and keeps shops booking you. A few daily habits make a big difference.",
    points: [
      "Plan the day's drops by area before riders leave, so they are not crossing Lagos twice.",
      "Call the customer 15 to 30 minutes before arrival to confirm they are available and get directions.",
      "Leave early for areas with heavy traffic at rush hour, like Third Mainland Bridge or Berger.",
      "If you will be late, tell the shop and the customer before the promised time, not after.",
    ],
    example:
      "A logistics team in Ibadan groups drops by area each morning and calls customers before arrival.",
    cta: { label: "View bookings", path: "/logistics/bookings" },
    whatsapp:
      "on-time delivery keeps shops booking you, so group the day's drops by area before riders leave, call customers 15 to 30 minutes before arrival, and if you will be late, tell the shop and customer before the promised time, not after.",
  },
  {
    id: "logistics-get-verified",
    role: "logistics_partner",
    topic: "growth",
    from: "peggy",
    subject: "Get verified so shops book you with confidence",
    preheader: "Shops trust you with their customers' orders. Show them you're checked.",
    title: "Get verified and win shops' trust",
    intro:
      "Shops hand you their customers' orders and sometimes their cash. Verification shows them your business has been checked.",
    points: [
      "Open the verification page and see which documents are needed for your business.",
      "Make sure your business name matches your documents exactly, to avoid delays.",
      "Upload clear, readable photos of each document with all four corners showing.",
      "Complete your profile too, with your coverage, vehicle types and working hours.",
    ],
    example:
      "A dispatch company in Kano completed verification and filled in their profile with bikes, vans and Sunday hours.",
    cta: { label: "Get verified", path: "/logistics/verification" },
    whatsapp:
      "shops trust you with their customers' orders and sometimes their cash, and verification shows your business has been checked. Upload clear documents that match your business name, and complete your profile with coverage, vehicles and hours.",
  },
  {
    id: "logistics-cash-on-delivery",
    role: "logistics_partner",
    topic: "money",
    from: "peggy",
    subject: "Handle cash on delivery the right way",
    preheader: "Clear records and fast remittance keep shops trusting you.",
    title: "Cash on delivery done right",
    intro:
      "Cash on delivery is common in Nigeria, and how you handle the money decides whether shops trust you again.",
    points: [
      "Confirm the exact amount to collect before the rider leaves, and check it matches the booking.",
      "Record every cash collection in the app on the spot, not at the end of the day.",
      "Accept transfers only after the alert has actually arrived, never just a screenshot.",
      "Remit cash to shops on the schedule you agreed, and tell them early if there is any delay.",
    ],
    example:
      "A rider team in Surulere records each cash collection right after handover and remits to shops every evening.",
    cta: { label: "Manage cash", path: "/logistics/cash" },
    whatsapp:
      "with cash on delivery, confirm the exact amount before the rider leaves, record each collection in the app on the spot, accept transfers only when the alert has actually arrived, and remit to shops on the schedule you agreed.",
  },
  {
    id: "logistics-pickup-points",
    role: "logistics_partner",
    topic: "delivery",
    from: "peggy",
    subject: "Use pickup points to save trips",
    preheader: "Let customers collect from a nearby spot when home delivery is hard.",
    title: "Pickup points: fewer failed trips, happier customers",
    intro:
      "Some customers are hard to reach at home or work. A pickup point gives them a nearby place to collect and saves your riders extra trips.",
    points: [
      "Add pickup points in busy, safe places, like a partner shop near a bus stop or market.",
      "Give clear directions and opening hours for each point, so customers can find it easily.",
      "Offer a pickup point when a delivery has failed once, instead of trying the same address again and again.",
      "Price pickup slightly lower than door delivery where it makes sense, so customers see the benefit.",
    ],
    example:
      "A delivery company in Onitsha added a pickup point near Main Market for traders who are busy all day.",
    cta: { label: "Add pickup points", path: "/logistics/pickup-points" },
    whatsapp:
      "pickup points give hard-to-reach customers a nearby place to collect and save your riders extra trips. Add them in busy, safe places with clear directions and hours, and offer one when a home delivery has already failed once.",
  },
  {
    id: "logistics-add-riders",
    role: "logistics_partner",
    topic: "growth",
    from: "peggy",
    subject: "Add your riders to take more jobs",
    preheader: "More riders in the app means you can accept more bookings at once.",
    title: "Add your riders and share the work",
    intro:
      "Adding your riders lets you assign jobs, track who is doing what and take more bookings at the same time.",
    points: [
      "Add each rider with their name, phone number and the areas they know best.",
      "Assign jobs by area, so a rider who knows Ikorodu is not sent to Lekki.",
      "Brief new riders on proof of delivery photos, cash handling and calling customers ahead.",
      "Remove riders who have left straight away, so jobs never go to the wrong person.",
    ],
    example:
      "A dispatch business in Abuja added its 6 riders and now assigns jobs by area each morning.",
    cta: { label: "Manage riders", path: "/logistics/couriers" },
    whatsapp:
      "adding your riders lets you assign jobs by area and take more bookings at once. Add each rider with the areas they know best, brief new riders on proof of delivery photos and cash handling, and remove anyone who has left straight away.",
  },
  {
    id: "logistics-five-star-reviews",
    role: "logistics_partner",
    topic: "customers",
    from: "peggy",
    subject: "How to earn more 5-star reviews from shops",
    preheader: "Polite riders, careful handling and clear updates make the difference.",
    title: "Earn 5-star reviews from shops",
    intro:
      "Shops read reviews before booking. Most 5-star reviews come from the same few habits done every time.",
    points: [
      "Train riders to greet customers politely and handle packages carefully, never thrown or squeezed.",
      "Keep packages dry with a waterproof bag, especially in rainy season.",
      "Send the shop a quick update at pickup and at delivery, so they never have to chase you.",
      "After a good job, politely ask the shop to leave a review.",
      "Reply to every review, and fix the cause when a shop is unhappy.",
    ],
    example:
      "A rider team in Lekki uses waterproof bags for every package and sends shops a message at pickup and drop-off.",
    cta: { label: "See your reviews", path: "/logistics/reviews" },
    whatsapp:
      "shops read reviews before booking, so train riders to be polite and handle packages carefully, keep parcels dry in a waterproof bag, update the shop at pickup and delivery, and politely ask for a review after a good job ⭐",
  },
  {
    id: "logistics-failed-deliveries",
    role: "logistics_partner",
    topic: "customers",
    from: "peggy",
    subject: "What to do when a delivery fails",
    preheader: "Customer not home or not answering? Here's a calm, clear routine.",
    title: "Handle failed deliveries calmly and clearly",
    intro:
      "Failed deliveries happen: wrong address, phone off, customer not home. A clear routine protects you and keeps shops happy.",
    points: [
      "Call the customer at least twice and send a text before marking a delivery as failed.",
      "Take a photo at the address as proof you were there, and note the time.",
      "Tell the shop straight away and agree the next step: a new time, a pickup point or return.",
      "Keep the package safe and dry until it is redelivered or returned, and record what happened in the app.",
    ],
    example:
      "A delivery company in Benin City calls twice, texts once and messages the shop before marking any drop as failed.",
    cta: { label: "Open bookings", path: "/logistics/bookings" },
    whatsapp:
      "when a delivery fails, call the customer at least twice and send a text, take a photo at the address as proof, tell the shop straight away to agree the next step, and keep the package safe until it is redelivered or returned.",
  },
  {
    id: "logistics-peak-days-planning",
    role: "logistics_partner",
    topic: "season",
    from: "peggy",
    subject: "Plan ahead for weekends, month-end and festive rush",
    preheader: "Bookings jump on busy days. Have riders and routes ready.",
    title: "Plan for peak days before they arrive",
    intro:
      "Bookings often rise on Fridays and Saturdays, at month-end when people get paid, and before Christmas, Sallah and Easter.",
    points: [
      "Check your analytics to see which days and areas are busiest for you.",
      "Line up extra riders for the last week of the month and the 2 to 3 weeks before big holidays.",
      "Tell your regular shops your last booking date for delivery before a holiday.",
      "Service bikes and vehicles before the rush, because a breakdown on a peak day costs the most.",
    ],
    example:
      "A rider team in Lagos adds two part-time riders every December and services all bikes in late November.",
    cta: { label: "View analytics", path: "/logistics/analytics" },
    whatsapp:
      "bookings often rise on weekends, at month-end and before big holidays, so check your busiest days in analytics, line up extra riders ahead of time, service your bikes before the rush, and tell regular shops your last booking date before a holiday.",
  },
  {
    id: "logistics-refer-shop-clients",
    role: "logistics_partner",
    topic: "growth",
    from: "peggy",
    subject: "Grow repeat shop clients and earn rewards",
    preheader: "Invite the shops you already deliver for, and keep them booking you.",
    title: "Grow repeat shop clients and invite new ones",
    intro:
      "Your best jobs come from shops that book you again and again. Inviting the businesses you already work with can also earn you rewards.",
    points: [
      "Thank shops after busy weeks and ask what would make their deliveries easier.",
      "Offer regular shops a set pickup time each day, so booking you becomes a habit.",
      "Share your invite link from the Refer and earn page with shops you deliver for outside the app.",
      "When businesses join, you can earn free months or AI credits, as shown on the Refer and earn page.",
    ],
    example:
      "A dispatch company in Ikeja invited five boutiques it already served by phone, and now they book through the app.",
    cta: { label: "Invite a business", path: "/refer" },
    whatsapp:
      "your best jobs come from shops that book you again and again, so offer regulars a set daily pickup time, and share your invite link from the Refer and earn page with shops you serve outside the app. When businesses join you can earn free months or AI credits.",
  },
];

/** All tips. Per role, array order is the weekly send order. */
export const TIPS: Tip[] = [...SELLER_TIPS, ...SUPPLIER_TIPS, ...LOGISTICS_TIPS];
