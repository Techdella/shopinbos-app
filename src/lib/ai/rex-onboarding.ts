import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { DEFAULT_STORE_CONFIG, type StoreConfig } from "@/lib/ai/store-types";
import { db } from "@/lib/db/client";
import { slugify } from "@/lib/workspace";
import { createSampleProducts, writeStoreDraft } from "@/lib/ai/rex/build-store";
import { validateStoreConfig } from "@/lib/ai/rex/store-config";
import { firstJsonObject } from "@/lib/ai/text";
import type { AuthUser } from "@/lib/auth/types";
import type { StoreOnboardingMemory } from "@/lib/onboarding-memory";

export type RexIntent =
  | "answer"
  | "collect_onboarding"
  | "summarize_store_plan"
  | "generate_store_draft"
  | "generate_landing_page_draft"
  | "sensitive_action";

export interface RexAnswerWrite {
  questionKey: string;
  answer: unknown;
}

export interface RexStructuredResult {
  reply: string;
  intent: RexIntent;
  nextQuestion?: string | null;
  needsConfirmation?: boolean;
  confirmationLabel?: string | null;
  answerWrites?: RexAnswerWrite[];
  memoryPatch?: Partial<StoreOnboardingMemory>;
  storePlan?: {
    storeName?: string;
    style?: string;
    pages?: string[];
    colors?: string[];
    products?: number;
    primaryCta?: string;
    businessDescription?: string;
  } | null;
  draftSpec?: Partial<StoreConfig> | null;
}

export interface SavedRexAnswer {
  questionKey: string;
  answer: unknown;
  source: string;
  updatedAt: Date;
}

const REQUIRED_ANSWER_KEYS = [
  "business_name",
  "business_description",
  "target_customers",
  "sales_region",
  "store_goal",
  "fulfillment",
  "brand_style",
  "brand_colors",
  "product_setup",
  "content_help",
] as const;

const QUESTION_COPY: Record<(typeof REQUIRED_ANSWER_KEYS)[number], string> = {
  business_name: "Great. I can build this with you. First, what is your business name?",
  business_description: "What do you sell, and what makes it different?",
  target_customers: "Who are your main customers?",
  sales_region: "Where do you sell from, and do you sell locally, nationwide, or internationally?",
  store_goal: "Are you creating a full online store, a landing page, or both?",
  fulfillment: "Do you offer delivery, pickup, or both?",
  brand_style: "What style should your store feel like: clean and premium, bold and colorful, minimal, friendly, corporate, luxury, youthful, or local market style?",
  brand_colors: "What brand colors do you prefer? If you are not sure, I can choose a clean professional palette.",
  product_setup: "Do you want to add products manually, bulk import them, or have Rex help write the first product descriptions?",
  content_help: "Should Rex write your homepage copy, About page, FAQs, and product descriptions?",
};

export function buildRexCommerceSystemPrompt(args: {
  user: AuthUser;
  savedAnswers: SavedRexAnswer[];
  snapshot: unknown;
  pageContext?: {
    path?: string;
    label?: string;
  };
}) {
  const missing = REQUIRED_ANSWER_KEYS.filter(
    (key) => !args.savedAnswers.some((answer) => answer.questionKey === key),
  );

  return `You are Rex, Shopinbos' AI commerce setup assistant. The signed-in user's name is ${JSON.stringify(args.user.name)}. Use their real first name naturally when addressing them and never replace it with a demo name.

You are connected to the Shopinbos backend through the JSON you return, and only through it:
- "answerWrites" are saved as the user's onboarding answers, so you never need to ask for them again.
- "memoryPatch" is merged into the store's onboarding memory (store name, category, description, customers, vibe).
- intent "generate_store_draft" or "generate_landing_page_draft" (only after the user clearly confirms) makes the backend build a DRAFT store from "draftSpec": editor draft, draft pages and, if the store has no products yet, clearly marked sample products. It never publishes.
- Everything else is only your reply.
You cannot publish the store, take payments, delete anything, change payout or bank details, submit verification, or invite team members. Never claim you did. For those, tell the user where in the app to do it (publishing: the Rex builder or store editor, "Publish"; payouts: Settings).

Use the live context below. Reuse saved answers and do not ask for the same durable answer twice.

Current user:
${JSON.stringify({ id: args.user.id, role: args.user.role, name: args.user.name, city: args.user.city, country: args.user.country })}

Saved onboarding answers:
${JSON.stringify(args.savedAnswers)}

Live workspace snapshot:
${JSON.stringify(args.snapshot)}

Current app context:
${JSON.stringify(args.pageContext ?? {})}

Missing guided answer keys, in order:
${missing.join(", ") || "none"}

Reply with JSON only, no Markdown. Shape:
{
  "reply": "1-3 short conversational sentences",
  "intent": "answer|collect_onboarding|summarize_store_plan|generate_store_draft|generate_landing_page_draft|sensitive_action",
  "nextQuestion": "ask exactly one next setup question when needed",
  "needsConfirmation": false,
  "confirmationLabel": "Generate draft",
  "answerWrites": [{"questionKey":"business_name","answer":"..."}],
  "memoryPatch": {},
  "storePlan": {"storeName":"...", "style":"...", "pages":["Home","Products","About","Contact","FAQ"], "colors":["..."], "products":0, "primaryCta":"Buy Now"},
  "draftSpec": {
    "name": "Store Name",
    "slug": "store-name",
    "tagline": "Short tagline",
    "heroHeadline": "Homepage headline",
    "heroSubline": "Homepage subline",
    "heroCtaText": "Buy Now",
    "palette": {"heroBg":"#0E2A38","heroText":"#FAF7F1","accent":"#73D8C8","ctaBg":"#73D8C8","ctaText":"#0E2A38","paperBg":"#FAF7F1"},
    "fontStyle": "fraunces",
    "navLinks": ["Products","About","FAQ","Contact"],
    "products": [{"name":"Starter product","subtitle":"Short descriptor","price":"NGN 2500","color":"#2E7E78"}],
    "changed": ["name","palette","hero","products"]
  }
}

Guidance:
- If the user asks to build/create/launch a store or landing page and key answers are missing, intent must be collect_onboarding and nextQuestion must be the earliest missing question.
- Ask one question at a time.
- Once enough answers exist, summarize the plan and ask "Should I generate the draft now?"
- Only use generate_store_draft or generate_landing_page_draft when the user clearly confirms generation.
- Use the current app path to make help relevant. On product pages suggest descriptions, categories, and imports. In the builder suggest sections, copy, colors, and layout changes. On verification pages explain missing documents.
- For sensitive actions, set needsConfirmation true and do not perform the action.`;
}

export function parseRexStructuredResult(raw: string): RexStructuredResult | null {
  const parsed = firstJsonObject(raw) as Partial<RexStructuredResult> | null;
  if (!parsed) return null;
  try {
    if (!parsed.reply || typeof parsed.reply !== "string") return null;
    return {
      reply: parsed.reply,
      intent: parsed.intent ?? "answer",
      nextQuestion: parsed.nextQuestion ?? null,
      needsConfirmation: Boolean(parsed.needsConfirmation),
      confirmationLabel: parsed.confirmationLabel ?? null,
      answerWrites: Array.isArray(parsed.answerWrites) ? parsed.answerWrites : [],
      memoryPatch: parsed.memoryPatch ?? {},
      storePlan: parsed.storePlan ?? null,
      draftSpec: parsed.draftSpec ?? null,
    };
  } catch {
    return null;
  }
}

export async function getSavedRexAnswers(userId: string): Promise<SavedRexAnswer[]> {
  const rows = await db.onboardingResponse.findMany({
    // Peggy's call notes share the table (source "peggy_call"); they aren't Rex's answers.
    where: { userId, source: { not: "peggy_call" } },
    orderBy: { updatedAt: "asc" },
    select: { questionKey: true, answer: true, source: true, updatedAt: true },
  });
  return rows.map((row) => ({
    questionKey: row.questionKey,
    answer: row.answer,
    source: row.source,
    updatedAt: row.updatedAt,
  }));
}

export async function saveRexAnswers(args: {
  user: AuthUser;
  writes: RexAnswerWrite[];
  source?: string;
}) {
  const writes = args.writes.filter(
    (write) => typeof write.questionKey === "string" && write.questionKey.trim() && write.answer !== undefined && write.answer !== null && write.answer !== "",
  );
  if (writes.length === 0) return;

  for (const write of writes.slice(0, 20)) {
    const questionKey = write.questionKey.trim().slice(0, 80);
    const answer = write.answer as Prisma.InputJsonValue;
    await db.onboardingResponse.upsert({
      where: { userId_questionKey: { userId: args.user.id, questionKey } },
      create: { id: randomUUID(), userId: args.user.id, accountType: args.user.role, questionKey, answer, source: args.source ?? "rex" },
      update: { answer, source: args.source ?? "rex", accountType: args.user.role },
    });
  }
}

function answerString(savedAnswers: SavedRexAnswer[], key: string) {
  const value = savedAnswers.find((answer) => answer.questionKey === key)?.answer;
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return "";
}

function completePlanReply(savedAnswers: SavedRexAnswer[]) {
  const name = answerString(savedAnswers, "business_name") || "your store";
  const style = answerString(savedAnswers, "brand_style") || "clean and professional";
  const colors = answerString(savedAnswers, "brand_colors") || "Rex-selected professional palette";
  const goal = answerString(savedAnswers, "store_goal") || "online store";
  const productSetup = answerString(savedAnswers, "product_setup") || "starter products";

  return `I have enough to create your first store draft.

Store Name: ${name}
Style: ${style}
Pages: Home, Products, About, Contact, FAQ
Colors: ${colors}
Products: ${productSetup}
Primary CTA: ${goal.toLowerCase().includes("quote") ? "Request Quote" : "Buy Now"}

Should I generate the draft now?`;
}

export function applyGuidedQuestionFallback(result: RexStructuredResult, savedAnswers: SavedRexAnswer[]) {
  if (result.intent === "generate_store_draft" || result.intent === "generate_landing_page_draft") {
    return result;
  }

  const missing = REQUIRED_ANSWER_KEYS.find(
    (key) => !savedAnswers.some((answer) => answer.questionKey === key),
  );

  if (missing && /build|create|launch|store|landing|shop/i.test(result.reply)) {
    return {
      ...result,
      intent: "collect_onboarding" as RexIntent,
      nextQuestion: result.nextQuestion || QUESTION_COPY[missing],
      reply: `${result.reply}\n\n${result.nextQuestion || QUESTION_COPY[missing]}`,
    };
  }

  if (!missing && result.intent === "collect_onboarding") {
    return {
      ...result,
      intent: "summarize_store_plan" as RexIntent,
      needsConfirmation: true,
      confirmationLabel: "Generate draft",
      reply: completePlanReply(savedAnswers),
    };
  }

  return result;
}

function coerceDraftSpec(
  result: RexStructuredResult,
  savedAnswers: SavedRexAnswer[],
): StoreConfig {
  const businessName =
    result.draftSpec?.name ||
    result.storePlan?.storeName ||
    answerString(savedAnswers, "business_name") ||
    DEFAULT_STORE_CONFIG.name;
  const description =
    result.draftSpec?.heroSubline ||
    result.storePlan?.businessDescription ||
    answerString(savedAnswers, "business_description") ||
    DEFAULT_STORE_CONFIG.heroSubline;
  const cta =
    result.draftSpec?.heroCtaText ||
    result.storePlan?.primaryCta ||
    (answerString(savedAnswers, "store_goal").toLowerCase().includes("quote") ? "Request Quote" : "Buy Now");

  return {
    ...DEFAULT_STORE_CONFIG,
    ...result.draftSpec,
    name: businessName,
    slug: result.draftSpec?.slug || slugify(businessName) || DEFAULT_STORE_CONFIG.slug,
    tagline: result.draftSpec?.tagline || `${businessName} online`,
    heroHeadline: result.draftSpec?.heroHeadline || `Shop ${businessName}`,
    heroSubline: description,
    heroCtaText: cta,
    navLinks: result.draftSpec?.navLinks?.length ? result.draftSpec.navLinks : ["Products", "About", "FAQ", "Contact"],
    products: result.draftSpec?.products?.length ? result.draftSpec.products : DEFAULT_STORE_CONFIG.products,
    changed: Array.from(new Set([...(result.draftSpec?.changed ?? []), "rex-draft"])),
  };
}

/**
 * Builds the draft from a confirmed plan through the same writer as /api/ai/build-store. A live store keeps
 * its status, slug and live look; only its draft changes until the seller publishes.
 */
export async function createRexDraftFromPlan(args: {
  user: AuthUser;
  result: RexStructuredResult;
  savedAnswers: SavedRexAnswer[];
}) {
  const spec = coerceDraftSpec(args.result, args.savedAnswers);
  const validated = validateStoreConfig(spec, DEFAULT_STORE_CONFIG);
  const config = validated.ok ? validated.config : spec;
  const written = await writeStoreDraft({ user: args.user, config, source: "rex-chat", plan: args.result.storePlan ?? null });

  // Sample products only when the store has none yet; real products are never touched.
  const productCount = await db.storeProduct.count({ where: { storeId: written.store.id, status: { not: "archived" } } });
  const samples = productCount === 0
    ? await createSampleProducts({ storeId: written.store.id, userId: args.user.id, products: config.products, currency: written.store.currency })
    : [];
  const sampleProducts = samples.length;

  return {
    storeId: written.store.id,
    storeName: written.store.name,
    slug: written.store.slug,
    live: written.store.live,
    homePageId: written.homePageId,
    sampleProducts,
    draft: written.draft,
  };
}
