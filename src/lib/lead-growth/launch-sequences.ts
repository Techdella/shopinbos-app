// The launch email sequences (sellers, suppliers, delivery partners) and the seller campaigns (wins and the season),
// as content. Loaded into Admin › Lead campaigns with "Add launch sequences" (src/app/actions/admin-lead-growth.ts),
// which creates whatever isn't there yet, switched off, so an admin reads them before turning them on.
//
// Who's who: Rex builds the seller's store with them (design, pages, product descriptions) and Peggy answers their
// customers on WhatsApp and live chat. Every seller gets a free web address, yourshop.mybos.store.
//
// Timeline (Lagos time): launch Sunday 1 November 09:00. Suppliers and delivery partners can register from
// Thursday 22 October (10 days before), so their sequences send the app's sign-up link from then, with a setup call
// with the team for anyone who'd like a hand. Sellers sign up on launch day, so their pre-launch emails point at
// shopinbos.com, not the app.
//
// Every step either waits after the previous one or goes out on a date. Dated updates are skipped once stale (36 h
// after their date), so someone who joins on the 30th gets the welcome and what's still ahead, not old news. The
// "registration is open" and "we're live" emails catch late joiners up (skipAfter far ahead) and read fine as a
// first email. Each sequence ends for a lead the moment they create an account or opt out.
//
// The seller sequence is live: people are part-way through it and their place is a step number, so keep its seven
// steps in this order (change the words freely).
//
// Banners are the designed images in public/brand/launch/ (1200×628), also used as the WhatsApp template headers.

import type { LeadAudienceType, LeadStepType } from "./pure.ts";
import { whatsappChatUrl } from "../support-contact.ts";

export const LAUNCH_AT = "2026-11-01T09:00:00+01:00";
export const PARTNER_REGISTRATION_AT = "2026-10-22T09:00:00+01:00";
const CATCH_UP_UNTIL = "2026-12-31T23:00:00+01:00";

const APP = "https://app.shopinbos.com";
const SITE = "https://shopinbos.com";

/** The designed banners in public/brand/launch/ (1200×628), offered in the message editors' image picker. */
export const LAUNCH_BANNERS = [
  "wa-01-welcome-seller", "wa-02-welcome-supplier", "wa-03-welcome-delivery", "wa-04-launch-live", "wa-05-claim-domain", "wa-06-rex-build",
  "wa-07-add-products", "wa-08-feature-drop", "wa-09-seller-school", "wa-10-black-friday", "wa-11-cyber-monday", "wa-12-christmas",
  "wa-13-detty-december", "wa-14-new-year", "wa-15-supplier-call", "wa-16-delivery-call",
] as const;

/** A launch banner by file name (public/brand/launch/<name>.jpg), as a full URL for emails and Meta. */
export const banner = (name: string) => `${APP}/brand/launch/${name}.jpg`;

type Step = LeadStepType;

function email(input: { subject: string; body: string; cta: string; url: string; image: string; at?: string; delayHours?: number; skipAfter?: string }): Step {
  return {
    channel: "email",
    subject: input.subject,
    body: input.body.trim(),
    ctaLabel: input.cta,
    ctaUrl: input.url,
    waTemplate: null,
    waLanguage: null,
    imageUrl: banner(input.image),
    delayHours: input.delayHours ?? 0,
    at: input.at ?? null,
    skipAfter: input.skipAfter ?? null,
  };
}

const audience = (role: "seller" | "supplier" | "delivery"): LeadAudienceType => ({ roles: [role], kinds: [], statuses: ["new", "contacted"], consentOnly: true, sinceDays: 0, source: "" });

// ─── Sellers ────────────────────────────────────────────────────────────────────────────────────────────────────

const SELLER_STEPS: Step[] = [
  email({
    skipAfter: LAUNCH_AT,
    image: "wa-01-welcome-seller",
    subject: "You're in, {{first_name}}. Shopinbos opens on 1 November",
    cta: "See what's coming",
    url: SITE,
    body: `
Hi {{first_name}},

Thank you for joining the Shopinbos waitlist. You're on the list, and your free web address, yourshop.mybos.store, is coming on Sunday 1 November.

Here's who you'll be working with:

• Rex builds your online store with you. Tell Rex what you sell and he sets up your pages, your look and your product descriptions in about five minutes.
• Peggy answers your customers. She replies on WhatsApp and your store's live chat, day and night, using your own products, prices and delivery details.

And you can sell products from verified suppliers without holding stock, book delivery partners in your city, and get paid by card, transfer or on delivery.

Between now and launch we'll send you a short email every few days so you're ready to sell on day one.

Talk soon,
The Shopinbos team`,
  }),
  email({
    at: "2026-10-19T09:00:00+01:00",
    image: "wa-06-rex-build",
    subject: "Meet Rex: your store, built in 5 minutes",
    cta: "See how Rex works",
    url: SITE,
    body: `
Hi {{first_name}},

On 1 November you'll meet Rex, who builds your Shopinbos store with you. Tell him what you sell in your own words and he designs your store, writes your pages and picks a look that fits your brand. You hit publish. You can change anything after.

To be live in minutes on launch day, get these five things ready this week:

• Your business name, and your logo if you have one
• Five to ten of your best products, with clear photos
• Your prices and sizes
• The areas you deliver to
• How you want to be paid (card, bank transfer, pay on delivery)

That's it. No website skills needed, and it's free to start.

The Shopinbos team`,
  }),
  email({
    at: "2026-10-23T09:00:00+01:00",
    image: "wa-07-add-products",
    subject: "Add your first products (Rex writes the descriptions)",
    cta: "Learn more",
    url: SITE,
    body: `
Hi {{first_name}},

Adding products on Shopinbos is quick: a photo, a price and your sizes. Rex writes the description for you, so every product reads well without you staring at a blank box.

No stock yet? You can still sell from day one. Our supplier marketplace lets you:

• Dropship: add a verified supplier's product to your store, set your own price, and the supplier sends it straight to your customer when it sells. You keep the difference.
• Buy wholesale: order in bulk at supplier prices when you're ready to hold stock.
• Request quotes: ask suppliers for a price on the quantity you need.

Suppliers are registering now, so there'll be products waiting for you on launch day.

The Shopinbos team`,
  }),
  email({
    at: "2026-10-27T09:00:00+01:00",
    image: "wa-08-feature-drop",
    subject: "Meet Peggy, who answers your customers",
    cta: "Learn more",
    url: SITE,
    body: `
Hi {{first_name}},

Customers ask the same questions all day: Is it available? What sizes? How much is delivery? On Shopinbos, Peggy answers them for you.

• One inbox for WhatsApp, Instagram, Facebook and email, so no message gets lost.
• Peggy replies straight away, even at night, from your own products, prices and delivery details, and hands the chat to you when a customer wants a person.

Then getting the order out and getting paid is easy too: book a delivery partner in your city from your dashboard and track it to the door, and take card payments, transfers or pay on delivery, with payment links for orders that start in a chat.

Five days to go.

The Shopinbos team`,
  }),
  email({
    at: "2026-10-31T12:00:00+01:00",
    skipAfter: LAUNCH_AT,
    image: "wa-05-claim-domain",
    subject: "Tomorrow, claim your free web address",
    cta: "Visit Shopinbos",
    url: SITE,
    body: `
Hi {{first_name}},

Shopinbos opens tomorrow, Sunday 1 November, at 9am. We'll email you the moment it's live, with your link to claim your free yourshop.mybos.store address before someone else takes the name you want.

A quick checklist for tomorrow:

• Business name and logo
• Your first products, with photos and prices
• Where you deliver
• How you want to be paid

Have those to hand and Rex will have your store ready in about five minutes.

See you tomorrow,
The Shopinbos team`,
  }),
  email({
    at: LAUNCH_AT,
    skipAfter: CATCH_UP_UNTIL,
    image: "wa-04-launch-live",
    subject: "We're live! Start free today",
    cta: "Create my store",
    url: `${APP}/signup`,
    body: `
Hi {{first_name}},

Shopinbos is open.

Create your account and claim your free yourshop.mybos.store address. Tell Rex what you sell and your store will be ready in about five minutes: your pages, your products, your prices and your brand. Then switch Peggy on to answer your customers, add products from verified suppliers, and share your store link.

It's free to start.

Welcome to Shopinbos,
The Shopinbos team`,
  }),
  email({
    delayHours: 72,
    image: "wa-05-claim-domain",
    subject: "{{first_name}}, your free web address is waiting",
    cta: "Claim my address",
    url: `${APP}/signup`,
    body: `
Hi {{first_name}},

Sellers have been claiming their free yourshop.mybos.store addresses since we opened, and yours is still waiting.

It takes about a minute to claim, and five more for Rex to build your store: a link you can share on WhatsApp, Instagram and anywhere your customers are.

If something's stopping you, just reply to this email or chat with us on WhatsApp. A real person on our team will help you get started.

The Shopinbos team`,
  }),
];

// ─── Suppliers ──────────────────────────────────────────────────────────────────────────────────────────────────

const SUPPLIER_SIGNUP = `${APP}/supplier/signup`;
const SUPPLIER_CALL = whatsappChatUrl("Hi Shopinbos, I'm a supplier and I'd like a setup call.");

const SUPPLIER_STEPS: Step[] = [
  email({
    skipAfter: PARTNER_REGISTRATION_AT,
    image: "wa-02-welcome-supplier",
    subject: "Thanks for joining, {{first_name}}. Supplier registration opens 22 October",
    cta: "See how it works",
    url: SITE,
    body: `
Hi {{first_name}},

Thank you for joining the Shopinbos supplier waitlist.

Shopinbos opens to sellers on Sunday 1 November. Suppliers get in ten days earlier: registration opens on Thursday 22 October, and we'll reach out to set up your listing, so your products are in the marketplace on launch day.

How it works for you:

• Sellers across Nigeria add your products to their online stores.
• Dropship orders: when one of their customers buys, you get the order and pack it, and a delivery partner picks it up from you.
• Wholesale orders and quote requests: sellers buying in bulk order from you directly.

To get listed quickly, have these ready:

• Your business details (and CAC registration if you have it)
• Clear photos of your products
• Your wholesale prices and stock levels
• Your pickup address
• The bank account you want to be paid into

The Shopinbos team`,
  }),
  email({
    at: "2026-10-19T10:00:00+01:00",
    image: "wa-15-supplier-call",
    subject: "How suppliers grow on Shopinbos",
    cta: "Book a setup call",
    url: SUPPLIER_CALL,
    body: `
Hi {{first_name}},

Most suppliers sell to the same handful of shops and resellers. Shopinbos puts your catalogue in front of thousands of online sellers, without you running a single store.

A few things the suppliers who do best get right:

• Leave room for resellers. Sellers set their own price on top of yours, so a fair wholesale price means more of them list you.
• Keep stock accurate. Sellers trust suppliers whose products are always available.
• Accept orders quickly. Fast acceptance and pickup lead to good reviews, and good reviews bring more sellers.

Registration opens on Thursday 22 October. Want a hand? Pick a time for a quick setup call with our team and we'll get you listed.

The Shopinbos team`,
  }),
  email({
    at: PARTNER_REGISTRATION_AT,
    skipAfter: CATCH_UP_UNTIL,
    image: "wa-15-supplier-call",
    subject: "Supplier registration is open. Let's get you listed",
    cta: "Register as a supplier",
    url: SUPPLIER_SIGNUP,
    body: `
Hi {{first_name}},

Supplier registration on Shopinbos is now open.

Set up takes four steps:

1. Create your supplier account.
2. Add your business details and verification documents.
3. Add your products with photos, prices and stock.
4. Set your pickup address and payout account.

Our team reviews every supplier before their products go live. Register this week and you'll be verified in time for launch on 1 November.

Rather do it together? Reply to this email or message us on WhatsApp to pick a time for a quick setup call.

The Shopinbos team`,
  }),
  email({
    at: "2026-10-25T10:00:00+01:00",
    image: "wa-02-welcome-supplier",
    subject: "Make your products easy to pick",
    cta: "Register as a supplier",
    url: SUPPLIER_SIGNUP,
    body: `
Hi {{first_name}},

When sellers browse the marketplace, they choose products they can sell with confidence. Yours stand out when they have:

• Clear photos on a plain background, more than one angle
• A name and description that say exactly what it is (size, material, colour)
• An honest stock count and a realistic dispatch time
• A wholesale price that leaves the seller room to add theirs

Not registered yet? There's still time to be verified before launch on 1 November.

The Shopinbos team`,
  }),
  email({
    at: "2026-10-29T09:00:00+01:00",
    image: "wa-15-supplier-call",
    subject: "3 days to launch: get verified now",
    cta: "Finish my registration",
    url: SUPPLIER_SIGNUP,
    body: `
Hi {{first_name}},

Shopinbos opens to sellers on Sunday. Suppliers who are verified by then are the ones sellers see first when they start adding products to their stores.

If you haven't registered yet, it takes a few minutes to start. Or pick a time for a quick setup call and our team will get you listed.

The Shopinbos team`,
  }),
  email({
    at: LAUNCH_AT,
    image: "wa-15-supplier-call",
    subject: "We're live. Sellers are choosing products today",
    cta: "Register as a supplier",
    url: SUPPLIER_SIGNUP,
    body: `
Hi {{first_name}},

Shopinbos is open, and sellers are building their stores and choosing what to sell right now.

You can still join as a supplier. Register, add your products, and once you're verified they'll appear in the marketplace for every seller on Shopinbos.

The Shopinbos team`,
  }),
  email({
    delayHours: 96,
    image: "wa-15-supplier-call",
    subject: "Let's get you listed, {{first_name}}",
    cta: "Book a setup call",
    url: SUPPLIER_CALL,
    body: `
Hi {{first_name}},

You showed interest in supplying on Shopinbos, and we'd love to have your products in the marketplace.

Pick a time for a quick setup call and our team will walk you through it: documents, pricing and how pickups work.

The Shopinbos team`,
  }),
];

// ─── Delivery partners ──────────────────────────────────────────────────────────────────────────────────────────

const LOGISTICS_SIGNUP = `${APP}/logistics/signup`;
const DELIVERY_CALL = whatsappChatUrl("Hi Shopinbos, I'm a delivery partner and I'd like an onboarding call.");

const DELIVERY_STEPS: Step[] = [
  email({
    skipAfter: PARTNER_REGISTRATION_AT,
    image: "wa-03-welcome-delivery",
    subject: "You're on the list, {{first_name}}. Delivery partner registration opens 22 October",
    cta: "See how it works",
    url: SITE,
    body: `
Hi {{first_name}},

Thank you for joining the Shopinbos delivery partner waitlist.

Shopinbos opens to sellers on Sunday 1 November. Delivery partners get in ten days earlier: registration opens on Thursday 22 October, and we'll reach out before jobs go live in your area.

How it works for you:

• Sellers in the areas you cover book you for their orders, and suppliers' pickups come to you too.
• You set your coverage zones, your vehicle types and your prices.
• Assign jobs to your riders and track every delivery from your dashboard.

To register quickly, have these ready:

• Your company details (and registration documents if you have them)
• The areas you cover
• Your vehicles (bikes, cars, vans) and your riders
• Your delivery prices by area
• The bank account you want to be paid into

The Shopinbos team`,
  }),
  email({
    at: "2026-10-20T10:00:00+01:00",
    image: "wa-16-delivery-call",
    subject: "How delivery partners grow on Shopinbos",
    cta: "Book an onboarding call",
    url: DELIVERY_CALL,
    body: `
Hi {{first_name}},

Every Shopinbos store needs deliveries, and sellers book the partners they trust in their area. Here's what helps you win those bookings:

• Clear coverage. List exactly the areas you serve, so you only get jobs you can do.
• Fair, simple prices. Sellers compare quotes before they book.
• Reliable updates. Pickups on time and status updates at every step lead to good reviews and repeat bookings.

Registration opens on Thursday 22 October. Want a hand? Pick a time for a quick onboarding call with our team.

The Shopinbos team`,
  }),
  email({
    at: PARTNER_REGISTRATION_AT,
    skipAfter: CATCH_UP_UNTIL,
    image: "wa-16-delivery-call",
    subject: "Delivery partner registration is open. Let's get you on the road",
    cta: "Register as a delivery partner",
    url: LOGISTICS_SIGNUP,
    body: `
Hi {{first_name}},

Delivery partner registration on Shopinbos is now open.

Set up takes four steps:

1. Create your delivery partner account.
2. Add your company details and verification documents.
3. Set your coverage areas, vehicles and prices.
4. Add your riders and your payout account.

Our team reviews every partner before they can take bookings. Register this week and you'll be verified in time for launch on 1 November.

Rather do it together? Reply to this email or message us on WhatsApp to pick a time for a quick onboarding call.

The Shopinbos team`,
  }),
  email({
    at: "2026-10-26T10:00:00+01:00",
    image: "wa-03-welcome-delivery",
    subject: "Be the partner sellers book first",
    cta: "Register as a delivery partner",
    url: LOGISTICS_SIGNUP,
    body: `
Hi {{first_name}},

When a seller books a delivery, they see the partners who cover the area, with their prices and reviews. The partners who get booked most:

• Cover their areas well, and say so clearly
• Keep prices simple and competitive
• Pick up on time and keep the status updated until delivery

Not registered yet? There's still time to be verified before launch on 1 November.

The Shopinbos team`,
  }),
  email({
    at: "2026-10-29T09:00:00+01:00",
    image: "wa-16-delivery-call",
    subject: "3 days to launch: get verified now",
    cta: "Finish my registration",
    url: LOGISTICS_SIGNUP,
    body: `
Hi {{first_name}},

Shopinbos opens to sellers on Sunday. Delivery partners who are verified by then are the ones sellers can book from their first orders.

If you haven't registered yet, it takes a few minutes to start. Or pick a time for a quick onboarding call and our team will get you on the road.

The Shopinbos team`,
  }),
  email({
    at: LAUNCH_AT,
    image: "wa-16-delivery-call",
    subject: "We're live. Sellers are taking their first orders",
    cta: "Register as a delivery partner",
    url: LOGISTICS_SIGNUP,
    body: `
Hi {{first_name}},

Shopinbos is open, and sellers are setting up their stores and taking their first orders.

You can still join as a delivery partner. Register, set your areas and prices, and once you're verified sellers in your areas can book you.

The Shopinbos team`,
  }),
  email({
    delayHours: 96,
    image: "wa-16-delivery-call",
    subject: "Let's get you on the road, {{first_name}}",
    cta: "Book an onboarding call",
    url: DELIVERY_CALL,
    body: `
Hi {{first_name}},

You showed interest in delivering for Shopinbos sellers, and we'd love to have you.

Pick a time for a quick onboarding call and our team will walk you through it: documents, coverage areas, pricing and payouts.

The Shopinbos team`,
  }),
];

export const LAUNCH_AUTOMATIONS: Array<{ name: string; audience: LeadAudienceType; steps: Step[]; includeExisting: boolean }> = [
  { name: "Launch sequence: sellers", audience: audience("seller"), steps: SELLER_STEPS, includeExisting: true },
  { name: "Launch sequence: suppliers", audience: audience("supplier"), steps: SUPPLIER_STEPS, includeExisting: true },
  { name: "Launch sequence: delivery partners", audience: audience("delivery"), steps: DELIVERY_STEPS, includeExisting: true },
];

// ─── Seller campaigns: wins and the season (drafts; fill in any [brackets], then send or schedule) ───────────────

type CampaignContent = Omit<Step, "delayHours" | "at" | "skipAfter">;

function campaign(input: { subject: string; body: string; cta: string; url: string; image: string }): CampaignContent {
  return { channel: "email", subject: input.subject, body: input.body.trim(), ctaLabel: input.cta, ctaUrl: input.url, waTemplate: null, waLanguage: null, imageUrl: banner(input.image) };
}

const SIGNUP = `${APP}/signup`;

export const WIN_CAMPAIGNS: Array<{ name: string; audience: LeadAudienceType; content: CampaignContent }> = [
  {
    name: "Win: OPay payments are live (edit before sending)",
    audience: audience("seller"),
    content: campaign({
      image: "wa-08-feature-drop",
      subject: "{{first_name}}, your customers can now pay with OPay",
      cta: "Create my store",
      url: SIGNUP,
      body: `
Hi {{first_name}},

Good news: Shopinbos stores now take OPay.

Millions of your customers already pay with OPay every day. Now they can pay you the same way, right on your store, and the money comes straight to you.

[One line on how it works for the seller, e.g. "Switch it on in Settings › Payments in one tap."]

If you haven't created your store yet, this is a great time. Rex will have it ready in about five minutes.

The Shopinbos team`,
    }),
  },
  {
    name: "Win: new delivery partners in [City] (edit before sending)",
    audience: audience("seller"),
    content: campaign({
      image: "wa-16-delivery-call",
      subject: "More delivery options in [City]",
      cta: "Create my store",
      url: SIGNUP,
      body: `
Hi {{first_name}},

[Number] new delivery partners now cover [City] on Shopinbos, including [Partner names].

That means more choice, better prices and faster deliveries for your customers in [City / areas]. Book them straight from your dashboard and track every order until it arrives.

Ready to sell in [City]? Rex will have your store ready in about five minutes.

The Shopinbos team`,
    }),
  },
  {
    name: "Win: new suppliers on the marketplace (edit before sending)",
    audience: audience("seller"),
    content: campaign({
      image: "wa-15-supplier-call",
      subject: "New on Shopinbos: [category] from [Number] new suppliers",
      cta: "Create my store",
      url: SIGNUP,
      body: `
Hi {{first_name}},

[Number] new verified suppliers have joined the Shopinbos marketplace this week, with [highlights, e.g. "ankara fabrics, skincare and kitchen essentials"].

Add their products to your store, set your own price, and they ship straight to your customer when it sells. No stock needed.

[Optional: one standout supplier or product, with a line on why sellers will love it.]

The Shopinbos team`,
    }),
  },
  {
    name: "Feature drop: one inbox with Peggy",
    audience: audience("seller"),
    content: campaign({
      image: "wa-08-feature-drop",
      subject: "New on Shopinbos: one inbox for every chat",
      cta: "Create my store",
      url: SIGNUP,
      body: `
Hi {{first_name}},

WhatsApp, Instagram, Facebook and email now land in one Shopinbos inbox, so no customer message gets lost between apps.

Peggy answers the easy questions straight away (is it available, what sizes, how much is delivery) from your own products and prices, and hands the chat to you when a customer wants a person.

The Shopinbos team`,
    }),
  },
  {
    name: "Seller school: price for profit",
    audience: audience("seller"),
    content: campaign({
      image: "wa-09-seller-school",
      subject: "This week's lesson: price for profit",
      cta: "Create my store",
      url: SIGNUP,
      body: `
Hi {{first_name}},

This week's Seller School lesson: price for profit.

Count every cost before you set a price: what you paid for the item, packaging, delivery you cover, payment fees and your time. Then add your margin on top. A price that only covers the item is a price that loses money.

[Link or one-line summary of the full lesson.]

The Shopinbos team`,
    }),
  },
  {
    name: "Season: get Black Friday ready (27 November)",
    audience: audience("seller"),
    content: campaign({
      image: "wa-10-black-friday",
      subject: "Get Black Friday ready, {{first_name}}",
      cta: "Create my store",
      url: SIGNUP,
      body: `
Hi {{first_name}},

Black Friday is on 27 November. The sellers who win it plan a week ahead:

• Pick your hero products, the two or three you can sell the most of
• Set an honest discount code, not a fake "was" price
• Book delivery early, because partners fill up fast

Create your Black Friday discount code from your dashboard in a minute, and let Peggy answer the "is this still available?" chats.

The Shopinbos team`,
    }),
  },
  {
    name: "Season: Cyber Monday last chance (30 November)",
    audience: audience("seller"),
    content: campaign({
      image: "wa-11-cyber-monday",
      subject: "Cyber Monday: one last offer",
      cta: "Create my store",
      url: SIGNUP,
      body: `
Hi {{first_name}},

Cyber Monday, 30 November, is your last big push of the season. One final offer, and a reminder to the shoppers whose carts didn't check out: Shopinbos can send those reminders for you automatically.

The Shopinbos team`,
    }),
  },
  {
    name: "Season: make your shop giftable (Christmas)",
    audience: audience("seller"),
    content: campaign({
      image: "wa-12-christmas",
      subject: "Make your shop giftable this Christmas",
      cta: "Create my store",
      url: SIGNUP,
      body: `
Hi {{first_name}},

Christmas shoppers buy gifts, so make it easy:

• Gift sets and bundles at a few price points
• Nice packaging they don't have to think about
• Clear order-by dates so presents arrive in time

The Shopinbos team`,
    }),
  },
  {
    name: "Season: Detty December",
    audience: audience("seller"),
    content: campaign({
      image: "wa-13-detty-december",
      subject: "Owambe season don land!",
      cta: "Create my store",
      url: SIGNUP,
      body: `
Hi {{first_name}},

Detty December is here and everyone needs an outfit, a gift or a treat for the next party.

Run weekend flash sales, post in the evenings when people are scrolling, and book your deliveries early. Peggy will keep up with the chats while you keep up with the orders.

The Shopinbos team`,
    }),
  },
  {
    name: "Season: new year, new shop goals",
    audience: audience("seller"),
    content: campaign({
      image: "wa-14-new-year",
      subject: "New year. New shop goals.",
      cta: "Create my store",
      url: SIGNUP,
      body: `
Hi {{first_name}},

Thank you for building with us this year. Here's to 2027.

If this is the year you start selling online, your free yourshop.mybos.store address is waiting, and Rex can have your store ready in about five minutes.

The Shopinbos team`,
    }),
  },
];
