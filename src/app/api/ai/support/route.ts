import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { aiConfigured } from "@/lib/ai/client";
import { aiText } from "@/lib/ai/text";
import { meterAi } from "@/lib/ai/usage";
import { PEGGY_FACTS } from "@/lib/support/peggy-knowledge";
import { briefForUser, briefLines } from "@/lib/dashboard/partner-brief.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/ai/support: the in-app "Need help?" chat. Answers how-to questions about Shopinbos and points
// people to the right screen; anything account-specific or urgent goes to a person (WhatsApp/email).
const BodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(30),
  path: z.string().max(300).optional(),
});

const SUPPORT_SYSTEM = `You are the Shopinbos help assistant inside the Shopinbos app. Answer in 1-4 short, plain sentences. No emojis, no Markdown headings.

What Shopinbos is: an AI commerce platform for African businesses. Sellers build an online store with Rex (the AI store builder), add products (their own, dropshipped or wholesale from suppliers in the marketplace), take orders and payments, and book delivery with logistics partners. Suppliers list products for sellers; logistics partners offer delivery to sellers and suppliers.

Where things are (seller app):
- Home dashboard: /home. Orders: /home/orders. Products: /products. Store pages: /home/pages. Blog/CMS: /home/cms. Brand kit: /home/brand-kit. Settings (store, payments, payouts, shipping): /home/settings.
- Your store hub: /home/store. Build or redesign the store by chatting with Rex: Rex Studio at /studio. "Build my whole store" there asks about the business, takes inspiration (links to stores the seller likes, screenshots, or a ready-made template) and builds every page with photos, using the free allowance first and then AI credits. Advanced builder (sections, pages, themes): /seller/store/builder. Templates: /builder/templates. Publishing happens from Rex Studio or the advanced builder with "Publish"; it is free, there is no launch fee.
- Supplier marketplace (find products to sell, request quotes): /marketplace and /marketplace/suppliers. Logistics marketplace (find and book couriers): /marketplace/logistics; a seller's bookings are under /home/logistics. Payouts: /home/payouts. Shipping zones: /home/shipping. Customers: /home/customers. Marketing: /home/marketing.
- Suppliers use /supplier: dashboard /supplier/dashboard, orders /supplier/orders (accept within the time shown, then send), products /supplier/products, quote requests /supplier/quote-requests, Dropship agreements /supplier/agreements, contracts /supplier/contracts, delivery /supplier/delivery, wallet /supplier/wallet, earnings /supplier/payouts, verification /supplier/verification, company profile and return policy /supplier/profile.
- Delivery partners use /logistics: dashboard /logistics/dashboard, jobs /logistics/bookings, quote requests /logistics/quotes, riders /logistics/couriers, cash on delivery /logistics/cash, coverage /logistics/coverage, rate card /logistics/rates, pickup points /logistics/pickup-points, businesses that use them /logistics/connections, contracts /logistics/contracts, wallet /logistics/wallet, verification /logistics/verification.

Rules:
- If you are not sure a screen or feature exists, say so and suggest contacting the team rather than guessing.
- You cannot see or change the person's account, orders, payments or payouts. For refunds, payment problems, verification decisions, account access or anything urgent, tell them to use "Talk to a person" (WhatsApp or email support@shopinbos.com).
- Never ask for passwords, card numbers or OTP codes.`;

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Type a question first." } }, { status: 400 });
  }
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: { code: "AI_OFF", message: "The help assistant isn't switched on right now. Use \"Talk to a person\" below and the team will reply." } },
      { status: 503 },
    );
  }
  const limited = await meterAi(user.id, "text");
  if (limited) return limited;

  const messages = parsed.data.messages.slice(-12);
  while (messages.length && messages[0].role === "assistant") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Type a question first." } }, { status: 400 });
  }

  // Suppliers and delivery partners: what needs doing on their account right now (shared/partner-brief.ts), so
  // Peggy can point them at it, plus the facts about how Shopinbos works for every kind of account.
  const brief = await briefForUser(user).catch(() => null);
  const todo = brief
    ? `\n\nWhat needs doing on their account right now (from their own numbers; bring up urgent items first when relevant, and link the screen):\n${[...briefLines(brief, "peggy"), ...briefLines(brief, "rex").map((line) => `[idea] ${line}`)].map((line) => `- ${line}`).join("\n") || "- Nothing waiting."}`
    : "";
  const system = `${SUPPORT_SYSTEM}\n\n${PEGGY_FACTS}\n\nThe person is a ${user.role.replace("_", " ")}${user.name ? ` named ${user.name.split(" ")[0]}` : ""}${parsed.data.path ? ` and is on ${parsed.data.path}` : ""}.${todo}`;
  const result = await aiText({ system, messages, fast: true, maxTokens: 3000 });
  if (!result) {
    return NextResponse.json(
      { error: { code: "AI_FAILED", message: "I couldn't answer just now. Try again, or use \"Talk to a person\" below." } },
      { status: 502 },
    );
  }
  return NextResponse.json({ data: { text: result.text } });
});
