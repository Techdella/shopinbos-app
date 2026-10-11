import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { aiConfigured } from "@/lib/ai/client";
import { aiText } from "@/lib/ai/text";
import { meterAi } from "@/lib/ai/usage";

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
- Build or redesign the store with Rex: /builder/rex. Visual store editor: /builder/editor. Publishing the store happens from the builder or editor with "Publish"/"Apply changes"; the first launch has a one-time launch fee.
- Supplier marketplace (find products to sell, request quotes): /marketplace and /marketplace/suppliers. Logistics marketplace (find and book couriers): /marketplace/logistics; a seller's bookings are under /home/logistics. Payouts: /home/payouts. Shipping zones: /home/shipping. Customers: /home/customers. Marketing: /home/marketing.
- Suppliers use /supplier (dashboard, products, orders, quote requests). Logistics partners use /logistics (dashboard, bookings, quotes, couriers).

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

  const system = `${SUPPORT_SYSTEM}\n\nThe person is a ${user.role.replace("_", " ")}${user.name ? ` named ${user.name.split(" ")[0]}` : ""}${parsed.data.path ? ` and is on ${parsed.data.path}` : ""}.`;
  const result = await aiText({ system, messages, fast: true, maxTokens: 3000 });
  if (!result) {
    return NextResponse.json(
      { error: { code: "AI_FAILED", message: "I couldn't answer just now. Try again, or use \"Talk to a person\" below." } },
      { status: 502 },
    );
  }
  return NextResponse.json({ data: { text: result.text } });
});
