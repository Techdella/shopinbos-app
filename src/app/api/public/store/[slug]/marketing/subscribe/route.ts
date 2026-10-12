import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { SubscriberSource } from "@prisma/client";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { created, apiError } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { triggerAutomations } from "@/lib/automations/engine";
import { readDesign, readFields, readPopupConfig } from "@/lib/marketing/forms";
import { normalizeEmail } from "@/lib/marketing/segment-rules";
import { addSubscriber } from "@/lib/marketing/subscribers";
import { upsertStoreVisitor } from "@/lib/storefront/visitor-data";

// A shopper signs up through a pop-up or sign-up form: they join the list (with their consent recorded),
// the answers are saved as a form submission, a one-use reward code is made if the form offers one, and
// the welcome flow starts.

const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const Body = z.object({
  formId: z.string().min(1).max(64),
  visitorKey: z.string().min(8).max(80).optional(),
  values: z.record(z.string().max(40), z.union([z.string().max(2000), z.boolean()])),
  consent: z.object({ email: z.boolean(), sms: z.boolean().default(false), whatsapp: z.boolean().default(false) }),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // Shared across server instances (fails open): a signup can trigger a welcome email to the address given.
  if (!(await checkRateLimitShared(rateLimitKey("mkt-signup", ip), { maxRequests: 8, windowMs: 60_000 })).allowed) {
    return withCors(req, apiError("RATE_LIMITED", "Too many tries. Wait a minute and try again.", 429), CORS);
  }
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, name: true, status: true } });
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", "Check the form and try again"), CORS);
  const input = parsed.data;
  const form = await db.storeForm.findFirst({ where: { id: input.formId, storeId: store.id, active: true } });
  if (!form) return withCors(req, apiError("NOT_FOUND", "This form is no longer available", 404), CORS);

  const fields = readFields(form.fields);
  const design = readDesign(form.design, form.name);
  const value = (key: string) => {
    const v = input.values[key];
    return typeof v === "string" ? v.trim() : v === true ? "yes" : "";
  };
  for (const field of fields) {
    if (field.required && !value(field.key)) return withCors(req, apiError("BAD_REQUEST", `${field.label || "This field"} is required`), CORS);
  }
  const byType = (type: string) => fields.find((field) => field.type === type);
  const email = normalizeEmail(value(byType("email")!.key));
  if (!email) return withCors(req, apiError("BAD_REQUEST", "Enter a valid email address"), CORS);
  if (!input.consent.email) return withCors(req, apiError("BAD_REQUEST", "Tick the box to agree to emails"), CORS);
  const nameField = fields.find((field) => field.type === "text" && /name/i.test(field.label + field.key));
  const name = nameField ? value(nameField.key) || null : null;
  const phone = byType("phone") ? value(byType("phone")!.key) || null : null;
  const birthday = byType("birthday") ? value(byType("birthday")!.key) || null : null;

  const result = await addSubscriber(
    store.id,
    {
      email,
      name,
      phone,
      birthday,
      source: (form.isPopup ? "popup" : "newsletter_form") as SubscriberSource,
      consent: { email: true, sms: input.consent.sms, whatsapp: input.consent.whatsapp, formId: form.id, text: design.consentText, ip },
    },
    { optIn: true },
  );
  if (!result.ok) return withCors(req, apiError("BAD_REQUEST", result.error), CORS);

  const visitorId = input.visitorKey ? await upsertStoreVisitor({ storeId: store.id, visitorKey: input.visitorKey, email, name, phone }).catch(() => null) : null;
  const answers = Object.fromEntries(fields.map((field) => [field.label || field.key, value(field.key)]));
  await db.storeFormSubmission.create({
    data: { storeId: store.id, visitorId: visitorId ?? null, type: form.type, name, email, phone, message: null, payload: { formId: form.id, formName: form.name, answers } },
  }).catch((error) => console.error("[marketing] submission save failed", error));

  const day = new Date(new Date().toISOString().slice(0, 10));
  await db.marketingFormStat.upsert({
    where: { formId_day: { formId: form.id, day } },
    create: { storeId: store.id, formId: form.id, day, submissions: 1 },
    update: { submissions: { increment: 1 } },
  });

  // Reward: one code per new subscriber, so a code can't be passed around.
  let code: string | null = null;
  const reward = form.isPopup ? readPopupConfig(form.popupConfig).reward : null;
  if (reward && (result.created || result.reactivated)) {
    const prefix = store.name.replace(/[^A-Za-z]/g, "").slice(0, 6).toUpperCase() || "WELCOME";
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = `${prefix}-${randomBytes(3).toString("hex").toUpperCase()}`;
      const coupon = await db.coupon
        .create({ data: { storeId: store.id, code: candidate, type: reward.type, value: reward.value, maxUses: 1, expiresAt: new Date(Date.now() + reward.days * 86_400_000) } })
        .catch(() => null);
      if (coupon) code = coupon.code;
    }
  }

  if (result.created || result.reactivated) {
    await triggerAutomations("welcome_email", { storeId: store.id, storeName: store.name, buyerEmail: email, buyerName: name, buyerPhone: phone, dedupe: `welcome:${email}`, discountCode: code });
  }

  return withCors(req, created({ subscribed: true, alreadySubscribed: !result.created && !result.reactivated, code, message: design.successMessage }), CORS);
}
