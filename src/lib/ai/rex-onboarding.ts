import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { DEFAULT_STORE_CONFIG, type StoreConfig } from "@/lib/ai/store-types";
import { db } from "@/lib/db/client";
import {
  createBlankEditorSnapshot,
  hydrateDraftFromStoreConfig,
  type StoreBrandSettingsLike,
} from "@/lib/store-templates";
import {
  mergeBrandSettings,
  slugify,
} from "@/lib/workspace";
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

  return `You are Rex, Shopinbos' AI commerce setup assistant. The signed-in user's name is ${JSON.stringify(args.user.name)}. Use their real first name naturally when addressing them and never replace it with a demo name. You are connected to a backend route and may ask guided setup questions, save onboarding answers, summarize store plans, and request draft generation. Never claim you published, deleted, changed payout details, submitted verification, or invited team members.

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
  const trimmed = raw.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Partial<RexStructuredResult>;
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

async function ensureOnboardingResponseTable() {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS onboarding_responses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      organization_id TEXT,
      account_type TEXT,
      question_key TEXT NOT NULL,
      answer JSONB NOT NULL,
      source TEXT NOT NULL DEFAULT 'rex',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await db.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS onboarding_responses_user_question_key
    ON onboarding_responses (user_id, question_key)
  `);
}

export async function getSavedRexAnswers(userId: string): Promise<SavedRexAnswer[]> {
  await ensureOnboardingResponseTable();
  const rows = await db.$queryRaw<Array<{ question_key: string; answer: Prisma.JsonValue; source: string; updated_at: Date }>>`
    SELECT question_key, answer, source, updated_at
    FROM onboarding_responses
    WHERE user_id = ${userId}
    ORDER BY updated_at ASC
  `;
  return rows.map((row) => ({
    questionKey: row.question_key,
    answer: row.answer,
    source: row.source,
    updatedAt: row.updated_at,
  }));
}

export async function saveRexAnswers(args: {
  user: AuthUser;
  writes: RexAnswerWrite[];
  source?: string;
}) {
  const writes = args.writes.filter(
    (write) => write.questionKey && write.answer !== undefined && write.answer !== null && write.answer !== "",
  );
  if (writes.length === 0) return;

  await ensureOnboardingResponseTable();
  for (const write of writes) {
    await db.$executeRaw`
      INSERT INTO onboarding_responses (id, user_id, account_type, question_key, answer, source, created_at, updated_at)
      VALUES (${randomUUID()}, ${args.user.id}, ${args.user.role}, ${write.questionKey}, ${JSON.stringify(write.answer)}::jsonb, ${args.source ?? "rex"}, now(), now())
      ON CONFLICT (user_id, question_key)
      DO UPDATE SET answer = EXCLUDED.answer, source = EXCLUDED.source, account_type = EXCLUDED.account_type, updated_at = now()
    `;
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

async function uniqueStoreSlug(baseName: string, userId: string, currentStoreId?: string) {
  const base = slugify(baseName) || `store-${userId.slice(0, 6)}`;
  const existing = await db.store.findUnique({
    where: { slug: base },
    select: { id: true },
  });
  if (!existing || existing.id === currentStoreId) return base;
  return `${base}-${userId.slice(0, 6)}`;
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

export async function createRexDraftFromPlan(args: {
  user: AuthUser;
  result: RexStructuredResult;
  savedAnswers: SavedRexAnswer[];
}) {
  const spec = coerceDraftSpec(args.result, args.savedAnswers);
  const existing = await db.store.findUnique({
    where: { userId: args.user.id },
    select: {
      id: true,
      brandSettings: true,
      country: true,
      city: true,
    },
  });
  const slug = await uniqueStoreSlug(spec.name, args.user.id, existing?.id);
  const baseBrandSettings = existing?.brandSettings ?? {};
  const fallback = createBlankEditorSnapshot(spec.name);
  const { slug: _slug, ...editorSpec } = spec;
  const hydrated = hydrateDraftFromStoreConfig(
    baseBrandSettings as StoreBrandSettingsLike,
    editorSpec,
    fallback,
  );
  const brandSettings = mergeBrandSettings(hydrated.brandSettings, {
    onboardingMemory: {
      storeName: spec.name,
      businessDescription: spec.heroSubline,
      buildPath: "rex",
      completed: false,
      updatedAt: new Date().toISOString(),
    },
    setup: { storeBuilt: true },
    rexDraft: {
      generatedAt: new Date().toISOString(),
      source: "rex-chat",
      plan: args.result.storePlan ?? null,
    },
  });

  const store = existing
    ? await db.store.update({
        where: { id: existing.id },
        data: {
          name: spec.name,
          slug,
          description: spec.heroSubline,
          status: "draft",
          onboardingState: "BUILDING_REX",
          brandSettings,
        },
      })
    : await db.store.create({
        data: {
          userId: args.user.id,
          name: spec.name,
          slug,
          description: spec.heroSubline,
          status: "draft",
          country: args.user.country ?? "Nigeria",
          city: args.user.city ?? "",
          currency: "NGN",
          onboardingState: "BUILDING_REX",
          brandSettings,
        },
      });

  const pageSeeds = [
    { type: "home", title: "Home", slug: "", order: 0 },
    { type: "products", title: "Products", slug: "products", order: 1 },
    { type: "about", title: "About", slug: "about", order: 2 },
    { type: "contact", title: "Contact", slug: "contact", order: 3 },
    { type: "faq", title: "FAQ", slug: "faq", order: 4 },
  ];

  let homePageId = "";

  for (const seed of pageSeeds) {
    const page = hydrated.updated.pages.find((candidate) => candidate.pageType === seed.type);
    const content = (page ?? {
      title: seed.title,
      slug: seed.slug,
      pageType: seed.type,
      sections: [],
      seo: {
        metaTitle: `${seed.title} | ${spec.name}`,
        metaDescription: spec.heroSubline,
      },
    }) as unknown as Prisma.InputJsonValue;

    const savedPage = await db.storePage.upsert({
      where: { storeId_slug: { storeId: store.id, slug: seed.slug } },
      update: {
        title: seed.title,
        type: seed.type,
        draftContent: content,
        status: "draft",
        isPublished: false,
        order: seed.order,
      },
      create: {
        storeId: store.id,
        title: seed.title,
        slug: seed.slug,
        type: seed.type,
        draftContent: content,
        content: {},
        status: "draft",
        isPublished: false,
        order: seed.order,
      },
      select: { id: true, type: true },
    });
    if (savedPage.type === "home") homePageId = savedPage.id;
  }

  return {
    storeId: store.id,
    storeName: store.name,
    slug: store.slug,
    homePageId,
    draft: hydrated.updated,
  };
}
