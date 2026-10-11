import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { readDesign, readFields, readPopupConfig } from "@/lib/marketing/forms";

// Storefront pop-ups and sign-up forms: GET lists the live pop-ups (what the storefront mount shows),
// POST counts a view. No personal data either way.

const CORS = { methods: ["GET", "POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

async function activeStore(slug: string) {
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, status: true } });
  return store && store.status === "active" ? store : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const store = await activeStore((await params).slug);
  if (!store) return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  const forms = await db.storeForm.findMany({ where: { storeId: store.id, active: true, isPopup: true }, orderBy: { updatedAt: "desc" }, take: 5 });
  const popups = forms.map((form) => {
    const config = readPopupConfig(form.popupConfig);
    return {
      id: form.id,
      fields: readFields(form.fields),
      design: readDesign(form.design, form.name),
      config: { ...config, reward: config.reward ? { type: config.reward.type, value: config.reward.value, days: config.reward.days } : null },
    };
  });
  const res = withCors(req, ok({ popups }), CORS);
  res.headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return res;
}

const ViewSchema = z.object({ formId: z.string().min(1).max(64), event: z.literal("view") });

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
  await db.marketingFormStat.upsert({
    where: { formId_day: { formId: form.id, day } },
    create: { storeId: store.id, formId: form.id, day, views: 1 },
    update: { views: { increment: 1 } },
  });
  return withCors(req, ok({ counted: true }), CORS);
}
