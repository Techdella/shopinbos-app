import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { readDesign, readFields, readPopupConfig } from "@/lib/marketing/forms";
import { publicRewardSummary } from "@/lib/marketing/popup-rewards.server";
import { readGameConfig, sliceLabel, sliceOdds } from "@/lib/gamification/logic";

// Storefront pop-ups and sign-up forms: GET lists the live pop-ups (what the storefront mount shows),
// POST counts a view (or a button click on a no-form pop-up). No personal data either way.
// Never sent before sign-up: reward codes, a mystery gift's value, a lead magnet's download link.

const CORS = { methods: ["GET", "POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

async function activeStore(slug: string) {
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, status: true, brandSettings: true } });
  return store && store.status === "active" ? store : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const store = await activeStore((await params).slug);
  if (!store) return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  const forms = await db.storeForm.findMany({ where: { storeId: store.id, active: true, isPopup: true }, orderBy: { updatedAt: "desc" }, take: 5 });
  const games = readGameConfig((store.brandSettings as Record<string, unknown> | null)?.gamification ?? {});
  const prizes = {
    slices: games.prizes.slices.map((slice) => ({ id: slice.id, label: sliceLabel(slice) })),
    odds: sliceOdds(games.prizes.slices),
    codeDays: games.prizes.codeDays,
    minOrder: games.prizes.minOrder,
  };
  const popups = await Promise.all(
    forms.map(async (form) => {
      const config = readPopupConfig(form.popupConfig);
      // What the reward is, never the code itself: that is only handed out when someone signs up.
      const { leadMagnet, ...rest } = config;
      return {
        id: form.id,
        fields: readFields(form.fields),
        design: readDesign(form.design, form.name),
        config: {
          ...rest,
          reward: config.kind === "signup" || config.kind === "lead_magnet" ? await publicRewardSummary(store.id, config.reward) : null,
          // Only its name: the link itself comes back after sign-up.
          leadMagnet: leadMagnet ? { name: leadMagnet.name } : null,
        },
        prizes: config.kind === "game" ? prizes : null,
      };
    }),
  );
  const res = withCors(req, ok({ popups }), CORS);
  res.headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return res;
}

const ViewSchema = z.object({ formId: z.string().min(1).max(64), event: z.enum(["view", "click"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const store = await activeStore((await params).slug);
  if (!store) return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(`mkt-view:${ip}`, { maxRequests: 30, windowMs: 60_000 }).allowed) return withCors(req, ok({ counted: false }), CORS);
  const parsed = ViewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", "Bad event"), CORS);
  const form = await db.storeForm.findFirst({ where: { id: parsed.data.formId, storeId: store.id }, select: { id: true } });
  if (!form) return withCors(req, apiError("NOT_FOUND", "Form not found", 404), CORS);
  const day = new Date(new Date().toISOString().slice(0, 10));
  // A click on a no-form pop-up's button counts where sign-ups do for the others.
  const click = parsed.data.event === "click";
  await db.marketingFormStat.upsert({
    where: { formId_day: { formId: form.id, day } },
    create: { storeId: store.id, formId: form.id, day, ...(click ? { submissions: 1 } : { views: 1 }) },
    update: click ? { submissions: { increment: 1 } } : { views: { increment: 1 } },
  });
  return withCors(req, ok({ counted: true }), CORS);
}
