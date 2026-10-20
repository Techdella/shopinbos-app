import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { aiConfigured } from "@/lib/ai/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { meterAi } from "@/lib/ai/usage";
import { MARKETING_PROMPTS, type MarketingCopyType } from "@/lib/ai/marketing-prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AI_OFF_NOTICE = "AI isn't switched on, so these are starter templates, not copy written for your store. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to turn on Rex's writing.";

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const body = await req.json().catch(() => null);
  if (!body?.type) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Copy type is required" } }, { status: 400 });
  }

  const promptConfig = MARKETING_PROMPTS[body.type as MarketingCopyType];
  if (!promptConfig) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: `Unknown copy type: ${body.type}` } }, { status: 400 });
  }

  // Canned templates only when no AI key is configured at all, and labelled as such.
  if (!aiConfigured()) {
    return NextResponse.json({ data: generateFallback(body.type), demo: true, aiOff: true, notice: AI_OFF_NOTICE });
  }

  const limited = await meterAi(user.id, "text", 1, "caption");
  if (limited) return limited;

  const storeName = String(body.storeName ?? "your store").slice(0, 120);
  const userPrompt = Object.entries((body.fields ?? {}) as Record<string, unknown>)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 2000)}`)
    .join("\n");

  const prompt = `Store: ${storeName}
${userPrompt ? `Context:\n${userPrompt}\n` : ""}
Generate the requested marketing copy now. Return ONLY valid JSON.`;

  try {
    const result = await aiText({ system: promptConfig.systemPrompt, prompt, maxTokens: 8000 });
    if (!result) {
      return NextResponse.json({ error: { code: "AI_FAILED", message: "Rex couldn't reach the AI right now. Try again in a moment." } }, { status: 502 });
    }
    const data = firstJsonObject(result.text);
    if (!data) {
      return NextResponse.json({ error: { code: "AI_FORMAT", message: "Rex's copy came back in a format that couldn't be read. Try again." } }, { status: 502 });
    }
    return NextResponse.json({ data, provider: result.provider });
  } catch (error) {
    console.error("[ai/marketing-copy] failed", error);
    return NextResponse.json({ error: { code: "AI_FAILED", message: "Rex couldn't write that right now. Try again." } }, { status: 500 });
  }
});

function generateFallback(type: string) {
  switch (type) {
    case "email_subject":
      return { subjects: ["Just landed — something for you", "Don't miss what's new", "A little something special inside", "Your style just upgraded", "Fresh picks, just in"] };
    case "email_body":
      return { subject: "Something new is waiting for you", body: "Hi {{name}},\n\nWe just added some new items to {{store}} that we think you'll love. From trending styles to customer favorites, there's plenty to explore.\n\nTake a look and see what catches your eye.\n\nShop the collection → {{link}}\n\n— The {{store}} team" };
    case "coupon_description":
      return { variations: [
        { headline: "Your exclusive discount", description: "Save on your next order at {{store}}. Limited time only.", cta: "Shop Now" },
        { headline: "Special offer, just for you", description: "Enjoy a discount on your favourite products.", cta: "Claim Offer" },
        { headline: "Don't miss this deal", description: "Limited time offer at {{store}}. Grab it while it lasts.", cta: "Shop Sale" },
      ]};
    case "whatsapp_template":
      return { templates: [
        "Hi {{name}}! Great news from {{store}} — we have something new you'll love. Check it out here: {{link}}",
        "Hey {{name}}, just a quick heads up from {{store}}. Your favourites are back in stock. Tap to see: {{link}}",
        "{{name}}, thanks for shopping at {{store}}! We'd love your feedback on your recent order.",
      ]};
    case "sms_promo":
      return { messages: [
        "{{store}} flash sale! Limited time offer. Shop now: {{link}}",
        "Hey, {{name}} at {{store}} — new items just dropped. Check them out: {{link}}",
        "Exclusive offer from {{store}}. Don't miss out: {{link}}",
      ]};
    case "social_caption":
      return { captions: [
        "New arrival alert. Something fresh just landed at {{store}}. Link in bio to shop.",
        "The one you've been waiting for. Now available at {{store}}. Tap to explore.",
        "Details make the difference. New collection at {{store}}. Shop now.",
      ]};
    case "product_description":
      return { variations: [
        { title: "Premium Quality", description: "Crafted with care and designed to impress. This product delivers on quality, comfort, and style — everything you need in one package.", highlights: ["Premium materials", "Designed for comfort", "Built to last"], cta: "Add to Cart" },
        { title: "Why You'll Love It", description: "From the moment you try it, you'll notice the difference. Thoughtfully designed and made to exceed expectations.", highlights: ["Thoughtful design", "Customer favourite", "Best value"], cta: "Shop Now" },
      ]};
    case "abandoned_cart":
      return { messages: [
        { subject: "You left something behind", body: "Hi {{name}}, you have items waiting in your cart at {{store}}. Complete your order before they sell out.", cta: "Return to Cart" },
        { subject: "Still thinking it over?", body: "Hi {{name}}, your cart at {{store}} is saved. Whenever you're ready, just pick up where you left off.", cta: "Continue Shopping" },
      ]};
    default:
      return { result: "Marketing copy generated." };
  }
}
