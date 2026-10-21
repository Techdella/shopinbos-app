// What Peggy knows about Shopinbos when she answers people in the admin inbox (src/lib/support/peggy.server.ts).
// Written from the code, not the marketing site: where the two disagree, the app is right. Prices that admins can
// change aren't here; peggy.server.ts adds today's prices and marketplace numbers from the database.
// Keep it true: when a feature ships or changes, change this too.

export const PEGGY_FACTS = `SHOPINBOS FACTS

What it is
- Shopinbos (https://shopinbos.com, app at https://app.shopinbos.com) is an AI commerce platform for African businesses, starting in Nigeria. Launch: Sunday 1 November 2026. Suppliers and delivery partners can register from Thursday 22 October 2026; sellers sign up from launch day (they can join the waitlist on shopinbos.com before then).
- Sellers get an online store with a free yourshop.mybos.store address, built with Rex (the AI store builder: design, pages, product descriptions, logo, pictures, videos) in about five minutes. Peggy is the seller's assistant: she answers their customers on the store's live chat and the seller's WhatsApp Business number, and helps the seller with products, prices, discounts, payment links, campaigns, reviews and ads (the seller confirms before anything is sent or published).
- Three kinds of accounts: sellers, suppliers (sell to sellers: dropship and wholesale) and delivery partners (deliver for sellers and suppliers).

Selling supplier products without buying stock (dropshipping)
- Yes. A seller can list a supplier's product in their own store without buying stock. When a customer orders, the supplier packs it and a delivery partner's rider collects it from the supplier and delivers it straight to the customer. The label shows the seller's shop name, never the supplier's.
- For now sellers dropship from suppliers near them (same city or within about 50 km), so delivery is fast and the seller can check the stock. Each supplier shows whether it's verified and a risk score.
- Before listing, the seller and supplier agree a Dropship agreement inside Shopinbos: the seller calls the supplier and checks the stock (a visit or a video call), then both accept.
- The supplier sets the wholesale cost; the seller sets their own selling price (the app won't let it go below cost plus the payment fee plus ₦100). The seller keeps the difference minus the payment fee (Paystack: 1.5% + ₦100, the ₦100 waived under ₦2,500, capped at ₦2,000).
- Money is split at checkout by the payment gateway: the supplier's cost goes to the supplier, the rest to the seller (minus any Shopinbos store-sales fee). Shopinbos doesn't hold the money; it settles to bank accounts.
- The supplier must accept a dropship order within 4 hours (wholesale: 24 hours). If they don't, the seller can switch to another supplier or cancel and refund.
- Wholesale: sellers can also buy stock from verified suppliers at their price tiers (minimum order quantities apply). The supplier invoices and the seller pays the supplier directly. Sellers can request a quote (product, quantity, destination) and the supplier replies with a price.
- Product categories in the marketplace include Fashion & Clothing (clothing, shoes and accessories), Beauty & Skincare, Electronics & Gadgets, Food & Groceries, Home & Living, Health & Wellness, Kids & Baby, Ankara & Fabrics and Wholesale Supply. Which exact items (e.g. watches) are available depends on the suppliers joining; don't promise specific products.
- Sellers can of course also sell their own products.

Delivery
- Shopinbos doesn't run its own fleet. Verified delivery partners (logistics companies and riders) deliver for sellers, and set their own coverage areas and prices. Coverage grows as partners join; there's no fixed city list.
- Sellers book a partner from the logistics marketplace, or ask for quotes and accept one. For dropship orders the pickup from the supplier is arranged automatically (the shop's preferred partner, else the most reliable verified partner covering the area).
- The customer pays the delivery fee the seller sets at checkout (delivery zones per area). The seller pays the partner's fee; Shopinbos takes nothing from delivery bookings today.
- Pay on delivery (cash or transfer to the rider) is available, up to ₦50,000 per order by default (the seller can change or switch it off). The customer gives the rider a 4-digit delivery code. The partner pays the cash to the seller by 6pm the same day.

Payments and payouts
- At checkout: Paystack (card, bank transfer, USSD), transfer to the seller's own bank account, and pay on delivery. Korapay where enabled. OPay is not live yet: don't say it is.
- The Shopinbos Wallet settles straight to the business's bank account. Setting it up needs a BVN or NIN check and a bank account in the business or owner's name.

Fees (see LIVE NUMBERS for today's amounts)
- Free to sign up and build the store; new accounts get free AI credits.
- Publishing the store and going live is free on every plan. There is no launch fee.
- Sellers: Free (₦0, 3% fee on online sales, 20 products, 20 AI credits a month), Starter (₦6,000/month, 2%, 200 products, own domain, 150 credits), Growth (₦18,000/month, 1%, unlimited products, 500 credits, pay on delivery, exceptions inbox), Pro (₦40,000/month, 0.5%, 1,500 credits, priority support). Yearly plans are ten months' price (two months free) and include a free domain. Suppliers and delivery partners join and get verified free; Supplier Plus ₦10,000 and Pro ₦30,000, Logistics Plus ₦8,000 and Pro ₦25,000 a month lower their commission or job fee. LIVE NUMBERS has today's exact fees.
- Where the plan extras live: staff (sign in with their own email and work in the store; billing, payouts, bank and the team stay with the owner) and extra seats in Settings › Team; SMS/WhatsApp packs in Settings › Billing (Growth includes 200 messages a month, Pro 1,000; a seller's own connected SMS provider or WhatsApp number isn't counted); the chatbot's monthly cap on AI replies in Inbox › Chatbot. Plan limits in the delivery marketplace: delivery partners a seller can connect (Free 1, Starter 3, Growth 10, Pro unlimited) or a supplier (Free 2, Plus 10, Pro unlimited); where a seller sells (Free 1 state, Starter 5, Growth and Pro nationwide); pay on delivery (sellers on Growth and up); private rates (partners send them on Logistics Plus and up; sellers accept them on Starter and up, suppliers on Plus and up); pickup points (Logistics Free 3, Plus 20, Pro unlimited). Suppliers: featured weeks and product boosts in Company profile › Billing & Plan, CSV upload (Plus+) in Products › Upload CSV, followers and updates (Pro) in Buyers › Followers. Delivery partners: featured weeks per state in Earnings › Fees.
- Paystack's card fee applies to card payments. There are no other hidden fees. Never quote a commission or a payout schedule that isn't in LIVE NUMBERS (ignore anything about 2%, 5% or 8% commissions, "paid out every Friday" or "held 48 hours": those are not true).

Sellers who already have a website or social pages
- They can connect a domain they already own to their Shopinbos store (or buy one in Shopinbos), so customers keep using their address.
- They can import their products from a CSV/spreadsheet export (up to 2,000 rows; columns from other shops are matched automatically).
- Selling channels that work today: the Shopinbos store, WhatsApp, Facebook & Instagram shops (Meta catalog), Google (Merchant Center feed), payment links and a link-in-bio page.
- Shopify, WooCommerce, Jumia and Konga connections are coming soon, not live: Shopinbos can't plug into another website's checkout yet, and there's no embed widget or seller API. The usual path is to run the store on Shopinbos with their own domain.

Suppliers and delivery partners
- Suppliers sign up at https://app.shopinbos.com/supplier/signup, delivery partners at https://app.shopinbos.com/logistics/signup (from 22 October 2026).
- Verification: suppliers upload CAC (business name or company) and product photos; delivery partners upload CAC and insurance. There's also an instant CAC lookup and a BVN/NIN check. The Shopinbos team reviews and verifies.
- Suppliers get dropship and wholesale orders from sellers, earnings tracking and rider pickups. Free suppliers can list 50 products (Supplier Max: unlimited). Delivery partners get delivery jobs and quote requests from sellers.

Getting started and contacts
- Sellers: https://app.shopinbos.com/signup (from 1 November; waitlist on https://shopinbos.com before).
- WhatsApp: +1 711-695-1381 (https://wa.me/17116951381). Email: support@shopinbos.com.
- The team speaks English and Pidgin.`;
