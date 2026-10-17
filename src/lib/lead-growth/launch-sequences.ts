// The launch email sequences (sellers, suppliers, delivery partners) and the seller "win" campaigns, as content.
// Loaded into Admin › Lead campaigns with "Add launch sequences" (src/app/actions/admin-lead-growth.ts), which
// creates whatever isn't there yet, switched off, so an admin reads them before turning them on.
//
// Timeline (Lagos time): launch Sunday 1 November 09:00. Suppliers and delivery partners can register from
// Thursday 22 October (10 days before), so their sequences send the app's sign-up link from then. Sellers sign up
// on launch day, so their pre-launch emails point at shopinbos.com, not the app.
//
// Every step either waits after the previous one or goes out on a date. Dated updates are skipped once stale (36 h
// after their date), so someone who joins on the 30th gets the welcome and what's still ahead, not old news. The
// "registration is open" and "we're live" emails catch late joiners up (skipAfter far ahead) and read fine as a
// first email. Each sequence ends for a lead the moment they create an account or opt out.

import type { LeadAudienceType, LeadStepType } from "./pure.ts";

export const LAUNCH_AT = "2026-11-01T09:00:00+01:00";
export const PARTNER_REGISTRATION_AT = "2026-10-22T09:00:00+01:00";
const CATCH_UP_UNTIL = "2026-12-31T23:00:00+01:00";

const APP = "https://app.shopinbos.com";
const SITE = "https://shopinbos.com";

type Step = LeadStepType;

function email(input: { subject: string; body: string; cta: string; url: string; at?: string; delayHours?: number; skipAfter?: string }): Step {
  return {
    channel: "email",
    subject: input.subject,
    body: input.body.trim(),
    ctaLabel: input.cta,
    ctaUrl: input.url,
    waTemplate: null,
    waLanguage: null,
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
    subject: "You're in, {{first_name}}. Shopinbos opens on 1 November",
    cta: "See what's coming",
    url: SITE,
    body: `
Hi {{first_name}},

Thank you for joining the Shopinbos waitlist. You're on the list, and you'll be one of the first to get in when we open on Sunday 1 November.

Here's what you're getting:

• An online store built for you by Chip, our AI. Tell Chip what you sell and it sets up your pages, products and look in about five minutes.
• Products to sell even without stock. Add items from verified suppliers to your store and they ship straight to your customers.
• Delivery and payments sorted. Book trusted delivery partners in your city and get paid by card, transfer or on delivery.

Between now and launch we'll send you a short email every few days so you're ready to start selling on day one.

Talk soon,
The Shopinbos team`,
  }),
  email({
    at: "2026-10-19T09:00:00+01:00",
    subject: "Meet Chip: your store, built in 5 minutes",
    cta: "See how Chip works",
    url: SITE,
    body: `
Hi {{first_name}},

On 1 November you'll meet Chip, the AI that builds your Shopinbos store with you. You describe your business in your own words and Chip writes your pages, organises your products and picks a look that fits your brand. You can change anything after.

To be live in minutes on launch day, get these five things ready this week:

• Your business name, and your logo if you have one
• Five to ten of your best products, with clear photos
• Your prices
• The areas you deliver to
• How you want to be paid (card, bank transfer, pay on delivery)

That's it. No website skills needed, and it's free to start.

The Shopinbos team`,
  }),
  email({
    at: "2026-10-23T09:00:00+01:00",
    subject: "No stock? You can still sell from day one",
    cta: "Learn more",
    url: SITE,
    body: `
Hi {{first_name}},

One of the biggest things holding sellers back is stock: buying inventory before you know what will sell.

On Shopinbos you won't have to. Our supplier marketplace lets you:

• Dropship: add a supplier's product to your store, set your own price, and the supplier sends it straight to your customer when it sells. You keep the difference.
• Buy wholesale: order in bulk at supplier prices when you're ready to hold stock.
• Request quotes: ask suppliers for a price on the quantity you need.

Every supplier is verified before their products appear. Suppliers are registering now, so there'll be products waiting for you on launch day.

The Shopinbos team`,
  }),
  email({
    at: "2026-10-27T09:00:00+01:00",
    subject: "Delivery and payments, sorted",
    cta: "Learn more",
    url: SITE,
    body: `
Hi {{first_name}},

Getting an order to a customer, and getting paid for it, should be the easy part. On Shopinbos it is.

Delivery: book a delivery partner in your city from your dashboard, compare prices, and track every order until it arrives. Your customers get updates too.

Payments: take card payments and bank transfers on your store, accept pay on delivery where you choose, and send payment links on WhatsApp or Instagram for orders that start in a chat.

Five days to go. If you haven't yet, pick the products you want to start with. We open on Sunday.

The Shopinbos team`,
  }),
  email({
    at: "2026-10-31T12:00:00+01:00",
    skipAfter: LAUNCH_AT,
    subject: "Tomorrow we open the doors",
    cta: "Visit Shopinbos",
    url: SITE,
    body: `
Hi {{first_name}},

Shopinbos opens tomorrow, Sunday 1 November, at 9am. We'll email you the moment it's live, with your link to create your store.

A quick checklist for tomorrow:

• Business name and logo
• Your first products, with photos and prices
• Where you deliver
• How you want to be paid

Have those to hand and Chip will have your store ready in about five minutes.

See you tomorrow,
The Shopinbos team`,
  }),
  email({
    at: LAUNCH_AT,
    skipAfter: CATCH_UP_UNTIL,
    subject: "Shopinbos is live. Create your store now",
    cta: "Create my store",
    url: `${APP}/signup`,
    body: `
Hi {{first_name}},

Shopinbos is open.

Create your account, tell Chip what you sell, and your online store will be ready in about five minutes: your pages, your products, your prices and your brand. Then add products from verified suppliers, connect delivery in your city, and share your store link.

It's free to start.

Welcome to Shopinbos,
The Shopinbos team`,
  }),
  email({
    delayHours: 72,
    subject: "{{first_name}}, your store is one step away",
    cta: "Create my store",
    url: `${APP}/signup`,
    body: `
Hi {{first_name}},

Sellers have been setting up their stores since Shopinbos opened, and yours is still waiting.

It takes about five minutes: sign up, tell Chip what you sell, and you'll have a store you can share on WhatsApp, Instagram and anywhere your customers are.

If something's stopping you, just reply to this email. A real person on our team reads every reply and will help you get started.

The Shopinbos team`,
  }),
];

// ─── Suppliers ──────────────────────────────────────────────────────────────────────────────────────────────────

const SUPPLIER_SIGNUP = `${APP}/supplier/signup`;

const SUPPLIER_STEPS: Step[] = [
  email({
    skipAfter: PARTNER_REGISTRATION_AT,
    subject: "Welcome, {{first_name}}. Supplier registration opens on 22 October",
    cta: "See how it works",
    url: SITE,
    body: `
Hi {{first_name}},

Thank you for your interest in supplying on Shopinbos.

Shopinbos opens to sellers on Sunday 1 November. Suppliers get in ten days earlier: registration opens on Thursday 22 October, and we'll email you the link that morning, so your products are ready in the marketplace on launch day.

How it works for you:

• Sellers across Nigeria add your products to their online stores.
• Dropship orders: when one of their customers buys, you get the order and pack it, and a delivery partner picks it up from you.
• Wholesale orders and quote requests: sellers buying in bulk order from you directly.

To register quickly on the 22nd, get these ready:

• Your business details (and CAC registration if you have it)
• Clear photos of your products
• Your wholesale prices and stock levels
• Your pickup address
• The bank account you want to be paid into

The Shopinbos team`,
  }),
  email({
    at: "2026-10-19T10:00:00+01:00",
    subject: "How suppliers grow on Shopinbos",
    cta: "Learn more",
    url: SITE,
    body: `
Hi {{first_name}},

Most suppliers sell to the same handful of shops and resellers. Shopinbos puts your catalogue in front of thousands of online sellers, without you running a single store.

A few things the suppliers who do best get right:

• Leave room for resellers. Sellers set their own price on top of yours, so a fair wholesale price means more of them list you.
• Keep stock accurate. Sellers trust suppliers whose products are always available.
• Accept orders quickly. Fast acceptance and pickup lead to good reviews, and good reviews bring more sellers.

Registration opens on Thursday 22 October. Look out for our email that morning.

The Shopinbos team`,
  }),
  email({
    at: PARTNER_REGISTRATION_AT,
    skipAfter: CATCH_UP_UNTIL,
    subject: "Supplier registration is open. Set up your account",
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

Our team reviews every supplier before their products go live. Register this week and you'll be verified in time for launch on 1 November, when sellers start building their stores and choosing products.

The Shopinbos team`,
  }),
  email({
    at: "2026-10-25T10:00:00+01:00",
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
    subject: "3 days to launch: get verified now",
    cta: "Finish my registration",
    url: SUPPLIER_SIGNUP,
    body: `
Hi {{first_name}},

Shopinbos opens to sellers on Sunday. Suppliers who are verified by then are the ones sellers see first when they start adding products to their stores.

If you haven't registered yet, it takes a few minutes to start. Add your business details, your verification documents and your first products, and our team will review you before launch.

The Shopinbos team`,
  }),
  email({
    at: LAUNCH_AT,
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
    subject: "Still want to supply Shopinbos sellers?",
    cta: "Register as a supplier",
    url: SUPPLIER_SIGNUP,
    body: `
Hi {{first_name}},

You showed interest in supplying on Shopinbos, and we'd love to have your products in the marketplace.

If anything's unclear (documents, pricing, how pickups work), just reply to this email. Someone on our supplier team will get back to you.

The Shopinbos team`,
  }),
];

// ─── Delivery partners ──────────────────────────────────────────────────────────────────────────────────────────

const LOGISTICS_SIGNUP = `${APP}/logistics/signup`;

const DELIVERY_STEPS: Step[] = [
  email({
    skipAfter: PARTNER_REGISTRATION_AT,
    subject: "Welcome, {{first_name}}. Delivery partner registration opens on 22 October",
    cta: "See how it works",
    url: SITE,
    body: `
Hi {{first_name}},

Thank you for your interest in delivering for Shopinbos.

Shopinbos opens to sellers on Sunday 1 November. Delivery partners get in ten days earlier: registration opens on Thursday 22 October, and we'll email you the link that morning, so you're ready to take orders from launch day.

How it works for you:

• Sellers in the areas you cover book you for their orders, and suppliers' pickups come to you too.
• You set your coverage zones, your vehicle types and your prices.
• Assign jobs to your riders and track every delivery from your dashboard.

To register quickly on the 22nd, get these ready:

• Your company details (and registration documents if you have them)
• The areas you cover
• Your vehicles (bikes, cars, vans) and your riders
• Your delivery prices by area
• The bank account you want to be paid into

The Shopinbos team`,
  }),
  email({
    at: "2026-10-20T10:00:00+01:00",
    subject: "How delivery partners grow on Shopinbos",
    cta: "Learn more",
    url: SITE,
    body: `
Hi {{first_name}},

Every Shopinbos store needs deliveries, and sellers book the partners they trust in their area. Here's what helps you win those bookings:

• Clear coverage. List exactly the areas you serve, so you only get jobs you can do.
• Fair, simple prices. Sellers compare quotes before they book.
• Reliable updates. Pickups on time and status updates at every step lead to good reviews and repeat bookings.

Registration opens on Thursday 22 October. Look out for our email that morning.

The Shopinbos team`,
  }),
  email({
    at: PARTNER_REGISTRATION_AT,
    skipAfter: CATCH_UP_UNTIL,
    subject: "Delivery partner registration is open. Set up your account",
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

Our team reviews every partner before they can take bookings. Register this week and you'll be verified in time for launch on 1 November, when sellers start taking orders.

The Shopinbos team`,
  }),
  email({
    at: "2026-10-26T10:00:00+01:00",
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
    subject: "3 days to launch: get verified now",
    cta: "Finish my registration",
    url: LOGISTICS_SIGNUP,
    body: `
Hi {{first_name}},

Shopinbos opens to sellers on Sunday. Delivery partners who are verified by then are the ones sellers can book from their first orders.

If you haven't registered yet, it takes a few minutes to start. Add your company details, your coverage areas and your prices, and our team will review you before launch.

The Shopinbos team`,
  }),
  email({
    at: LAUNCH_AT,
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
    subject: "Still want to deliver for Shopinbos sellers?",
    cta: "Register as a delivery partner",
    url: LOGISTICS_SIGNUP,
    body: `
Hi {{first_name}},

You showed interest in delivering for Shopinbos sellers, and we'd love to have you.

If anything's unclear (documents, coverage areas, pricing or payouts), just reply to this email. Someone on our partner team will get back to you.

The Shopinbos team`,
  }),
];

export const LAUNCH_AUTOMATIONS: Array<{ name: string; audience: LeadAudienceType; steps: Step[]; includeExisting: boolean }> = [
  { name: "Launch sequence: sellers", audience: audience("seller"), steps: SELLER_STEPS, includeExisting: true },
  { name: "Launch sequence: suppliers", audience: audience("supplier"), steps: SUPPLIER_STEPS, includeExisting: true },
  { name: "Launch sequence: delivery partners", audience: audience("delivery"), steps: DELIVERY_STEPS, includeExisting: true },
];

// ─── Seller "win" campaigns (drafts; fill in the [brackets] and send when it happens) ────────────────────────────

export const WIN_CAMPAIGNS: Array<{ name: string; audience: LeadAudienceType; content: Omit<Step, "delayHours" | "at" | "skipAfter"> }> = [
  {
    name: "Win: OPay payments are live (edit before sending)",
    audience: audience("seller"),
    content: {
      channel: "email",
      subject: "{{first_name}}, your customers can now pay with OPay",
      ctaLabel: "Create my store",
      ctaUrl: `${APP}/signup`,
      waTemplate: null,
      waLanguage: null,
      body: `
Hi {{first_name}},

Good news: Shopinbos stores now take OPay.

Millions of your customers already pay with OPay every day. Now they can pay you the same way, right on your store, and the money comes straight to you.

[One line on how it works for the seller, e.g. "Switch it on in Settings › Payments in one tap."]

If you haven't created your store yet, this is a great time. It takes about five minutes with Chip.

The Shopinbos team`.trim(),
    },
  },
  {
    name: "Win: new delivery partners in [City] (edit before sending)",
    audience: audience("seller"),
    content: {
      channel: "email",
      subject: "More delivery options in [City]",
      ctaLabel: "Create my store",
      ctaUrl: `${APP}/signup`,
      waTemplate: null,
      waLanguage: null,
      body: `
Hi {{first_name}},

[Number] new delivery partners now cover [City] on Shopinbos, including [Partner names].

That means more choice, better prices and faster deliveries for your customers in [City / areas]. Book them straight from your dashboard and track every order until it arrives.

Ready to sell in [City]? Your store takes about five minutes to set up.

The Shopinbos team`.trim(),
    },
  },
  {
    name: "Win: new suppliers on the marketplace (edit before sending)",
    audience: audience("seller"),
    content: {
      channel: "email",
      subject: "New on Shopinbos: [category] from [Number] new suppliers",
      ctaLabel: "Create my store",
      ctaUrl: `${APP}/signup`,
      waTemplate: null,
      waLanguage: null,
      body: `
Hi {{first_name}},

[Number] new verified suppliers have joined the Shopinbos marketplace this week, with [highlights, e.g. "ankara fabrics, skincare and kitchen essentials"].

Add their products to your store, set your own price, and they ship straight to your customer when it sells. No stock needed.

[Optional: one standout supplier or product, with a line on why sellers will love it.]

The Shopinbos team`.trim(),
    },
  },
];
