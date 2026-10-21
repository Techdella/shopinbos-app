import "server-only";
import { db } from "@/lib/db/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { rexStudioSystemPrompt } from "@/lib/ai/rex/prompts";
import { rexPreferencesBlock } from "@shared/rex-preferences";
import { applyRexStudioPlan, parseRexStudioPlan, summariseDraftForRex, type RexStudioPlan } from "@/lib/ai/rex/studio-plan";
import { pushRexVersion, recordDraftBeforeChange, summariseRexVersions, type RexVersionSummary } from "@/lib/ai/rex/studio-versions";
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
  type StudioStore,
} from "@/lib/ai/rex/studio.server";
import type { StoreEditorSnapshot } from "@/lib/store-templates";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import { checkThemeSwitch } from "@/lib/theme-access";
import { loadSellerThemeAccess } from "@/lib/theme-access.server";

// One edit to the store's DRAFT, shared by the Rex Studio chat route (/api/ai/build-store/studio) and Rex's
// edit_store_section / rebuild_section / switch_theme tools. The store designer replies with a JSON plan
// (src/lib/ai/rex/studio-plan.ts) that is applied to the draft only and recorded as a new version.

export interface StudioEditResult {
  reply: string;
  changes: string[];
  draft: StoreEditorSnapshot | null;
  version: { id: string; n: number } | null;
  undoTo: string | null;
  versions?: RexVersionSummary[];
  provider?: "anthropic" | "openai";
}

export async function loadStudioStore(userId: string): Promise<StudioStore | null> {
  return db.store.findUnique({ where: { userId }, select: studioStoreSelect });
}

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

async function designerPrompt(store: StudioStore, draft: StoreEditorSnapshot, imageUrls: string[]) {
  const settings = settingsOf(store) as Record<string, unknown>;
  const memory = (settings.onboardingMemory && typeof settings.onboardingMemory === "object" ? settings.onboardingMemory : {}) as Record<string, unknown>;
  const customer = (memory.customerProfile && typeof memory.customerProfile === "object" ? memory.customerProfile : {}) as Record<string, unknown>;
  const [facts, products] = await Promise.all([
    loadHealthFacts(store, draft),
    db.storeProduct
      .findMany({ where: { storeId: store.id, status: "published" }, orderBy: { createdAt: "desc" }, take: 12, select: { name: true, retailPrice: true, currency: true, images: true } })
      .catch(() => []),
  ]);
  const prompt = rexStudioSystemPrompt({
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
    themes: studioThemes(draft.templateId, await loadSellerThemeAccess(store.userId)),
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
    imageUrls,
  });
  // How the seller wants Rex to work (Settings > Peggy & Rex); empty until they've saved it.
  return [prompt, rexPreferencesBlock(settings)].filter(Boolean).join("\n\n");
}

/** Applies a plan to the store's draft and records the version. Returns null changes when nothing changed. */
export async function applyStudioPlan(store: StudioStore, plan: RexStudioPlan, label: string): Promise<StudioEditResult> {
  const { draft } = studioDraft(store);
  // Rex only switches to themes the seller's plan includes; the rest of the plan still applies.
  if (plan.theme) {
    const themeAccess = await loadSellerThemeAccess(store.userId);
    const access = checkThemeSwitch(plan.theme, themeAccess.tier, draft.templateId, themeAccess.owned);
    if (!access.ok) plan = { ...plan, theme: undefined, reply: [plan.reply, access.message].filter(Boolean).join(" ") };
  }
  const applied = applyRexStudioPlan(draft, plan, await studioApplyContext(store));
  if (!applied.changes.length) {
    return { reply: plan.reply || "I didn't change anything this time.", changes: [], draft: null, version: null, undoTo: null };
  }
  if (applied.themeChanged) applied.changes.push("Kept your products and prices");
  const before = recordDraftBeforeChange(versionsOf(store), draft);
  const undoTo = before.current;
  const { state, version } = pushRexVersion(before, { label: label.slice(0, 200), snapshot: applied.snapshot });
  await saveStudioDraft(store, applied.snapshot, state);
  return {
    reply: plan.reply || "Done. Have a look at the preview.",
    changes: applied.changes,
    draft: applied.snapshot,
    version: { id: version.id, n: version.n },
    undoTo,
    versions: summariseRexVersions(state, applied.snapshot.updatedAt),
  };
}

/**
 * Asks the store designer for a plan for `message` and applies it to the draft. Returns null when the AI
 * didn't answer (nothing changed). A prose answer (a question, or something not doable here) changes nothing.
 */
export async function runStudioEdit(
  store: StudioStore,
  input: { message: string; history?: Array<{ role: "user" | "assistant"; content: string }>; imageUrls?: string[]; label?: string },
): Promise<StudioEditResult | null> {
  const { draft } = studioDraft(store);
  const imageUrls = input.imageUrls ?? [];
  const system = await designerPrompt(store, draft, imageUrls);

  // Alternating turns, oldest first, starting and ending with the seller.
  const turns: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const turn of [
    ...(input.history ?? []).filter((entry) => entry.content.trim()).slice(-12),
    { role: "user" as const, content: imageUrls.length ? `${input.message}\n\n[Attached pictures: ${imageUrls.join(", ")}]` : input.message },
  ]) {
    const last = turns[turns.length - 1];
    if (last && last.role === turn.role) last.content = `${last.content}\n\n${turn.content}`;
    else turns.push({ ...turn });
  }
  while (turns.length && turns[0].role === "assistant") turns.shift();

  const reply = await aiText({ system, messages: turns, maxTokens: 24000, timeoutMs: 110_000, prefer: "anthropic" });
  if (!reply) return null;

  const plan = parseRexStudioPlan(firstJsonObject(reply.text));
  if (!plan) {
    const text = reply.text.replace(/```[\s\S]*?```/g, "").trim().slice(0, 1200);
    return { reply: text || "I couldn't work that out. Try saying it another way.", changes: [], draft: null, version: null, undoTo: null, provider: reply.provider };
  }
  return { ...(await applyStudioPlan(store, plan, input.label ?? input.message)), provider: reply.provider };
}
