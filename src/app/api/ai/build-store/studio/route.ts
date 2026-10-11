import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { aiConfigured } from "@/lib/ai/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { meterAi } from "@/lib/ai/usage";
import { rexStudioSystemPrompt } from "@/lib/ai/rex/prompts";
import { applyRexStudioPlan, parseRexStudioPlan, summariseDraftForRex } from "@/lib/ai/rex/studio-plan";
import { pushRexVersion, recordDraftBeforeChange, summariseRexVersions } from "@/lib/ai/rex/studio-versions";
import {
  allowedKindsFor,
  loadHealthFacts,
  saveStudioDraft,
  settingsOf,
  studioApplyContext,
  studioDraft,
  studioStoreSelect,
  studioThemes,
  themeNameFor,
  versionsOf,
} from "@/lib/ai/rex/studio.server";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/ai/build-store/studio: one Rex Studio chat turn. Rex replies with a JSON plan that is applied to
// the editor DRAFT only, recorded as a new version (v1 is the store before Rex's first change), and returned
// with the new draft for the live preview. Shoppers see nothing until the seller publishes.
const BodySchema = z.object({
  message: z.string().trim().min(1, "Tell Rex what to change.").max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .optional(),
  imageUrls: z.array(z.string().trim().max(2000).regex(/^https:\/\/\S+$/)).max(4).optional(),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid request" } }, { status: 400 });
  }
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: { code: "AI_OFF", message: "Rex's AI isn't switched on yet. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to the server, then try again." } },
      { status: 503 },
    );
  }
  const store = await db.store.findUnique({ where: { userId: user.id }, select: studioStoreSelect });
  if (!store) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Set up your store first." } }, { status: 404 });

  const limited = await meterAi(user.id, "text");
  if (limited) return limited;

  const body = parsed.data;
  const { draft } = studioDraft(store);
  const settings = settingsOf(store) as Record<string, unknown>;
  const memory = (settings.onboardingMemory && typeof settings.onboardingMemory === "object" ? settings.onboardingMemory : {}) as Record<string, unknown>;
  const customer = (memory.customerProfile && typeof memory.customerProfile === "object" ? memory.customerProfile : {}) as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

  const [facts, products] = await Promise.all([
    loadHealthFacts(store, draft),
    db.storeProduct
      .findMany({ where: { storeId: store.id, status: "published" }, orderBy: { createdAt: "desc" }, take: 12, select: { name: true, retailPrice: true, currency: true, images: true } })
      .catch(() => []),
  ]);

  const system = rexStudioSystemPrompt({
    storeName: store.name,
    location: [store.city, store.country].filter(Boolean).join(", "),
    currency: store.currency,
    description: store.description ?? "",
    memory: {
      category: str(memory.category),
      businessDescription: str(memory.businessDescription),
      customers: str(customer.who),
      vibe: str(customer.vibe),
      languages: Array.isArray(memory.languages) ? memory.languages.filter((entry): entry is string => typeof entry === "string") : undefined,
    },
    theme: { id: draft.templateId, name: themeNameFor(draft.templateId, draft.templateName) },
    themes: studioThemes(draft.templateId),
    allowedKinds: allowedKindsFor(draft.templateId),
    draft: summariseDraftForRex(draft),
    products: products.map((product) => ({ name: product.name, price: formatStoreMoney(product.retailPrice, product.currency), hasPhoto: product.images.some(Boolean) })),
    facts: [
      `${facts.products} published products`,
      `${facts.approvedReviews} approved customer reviews`,
      facts.deliveryOptions ? `${facts.deliveryOptions} delivery option(s) set up` : "no delivery fees set up yet",
      facts.paymentMethods ? `${facts.paymentMethods} payment method(s) on` : "no payment methods on yet",
      facts.hasWhatsapp ? "WhatsApp ordering is on" : "no WhatsApp number yet",
      facts.hasLogo ? "has a logo" : "no logo yet",
    ],
    imageUrls: body.imageUrls ?? [],
  });

  // Alternating turns, oldest first, starting and ending with the seller.
  const turns: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const turn of [
    ...(body.history ?? []).filter((entry) => entry.content.trim()).slice(-12),
    { role: "user" as const, content: body.imageUrls?.length ? `${body.message}\n\n[Attached pictures: ${body.imageUrls.join(", ")}]` : body.message },
  ]) {
    const last = turns[turns.length - 1];
    if (last && last.role === turn.role) last.content = `${last.content}\n\n${turn.content}`;
    else turns.push({ ...turn });
  }
  while (turns.length && turns[0].role === "assistant") turns.shift();

  const reply = await aiText({ system, messages: turns, maxTokens: 12000 });
  if (!reply) {
    return NextResponse.json({ error: { code: "AI_UNAVAILABLE", message: "Rex couldn't reach the AI right now. Nothing was changed; try again in a moment." } }, { status: 503 });
  }

  const plan = parseRexStudioPlan(firstJsonObject(reply.text));
  if (!plan) {
    // Rex answered in prose (a question, or something he can't do here): show it, change nothing.
    const text = reply.text.replace(/```[\s\S]*?```/g, "").trim().slice(0, 1200);
    return NextResponse.json({ data: { reply: text || "I couldn't work that out. Try saying it another way.", changes: [], draft: null, version: null, undoTo: null, provider: reply.provider } });
  }

  const applied = applyRexStudioPlan(draft, plan, await studioApplyContext(store));
  if (!applied.changes.length) {
    return NextResponse.json({ data: { reply: plan.reply || "I didn't change anything this time.", changes: [], draft: null, version: null, undoTo: null, provider: reply.provider } });
  }
  if (applied.themeChanged) applied.changes.push("Kept your products and prices");

  const before = recordDraftBeforeChange(versionsOf(store), draft);
  const undoTo = before.current;
  const { state, version } = pushRexVersion(before, { label: body.message, snapshot: applied.snapshot });
  await saveStudioDraft(store, applied.snapshot, state);

  return NextResponse.json({
    data: {
      reply: plan.reply || "Done. Have a look at the preview.",
      changes: applied.changes,
      draft: applied.snapshot,
      version: { id: version.id, n: version.n },
      undoTo,
      versions: summariseRexVersions(state, applied.snapshot.updatedAt),
      provider: reply.provider,
    },
  });
});
