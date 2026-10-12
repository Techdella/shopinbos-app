import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, created, apiError } from "@/lib/api/response";
import { sendSellerNotification } from "@/lib/email/notices.server";
import { upsertStoreVisitor } from "@/lib/storefront/visitor-data";
import { ingestFormMessage } from "@/lib/inbox/forms";
import { overPublicLimit } from "@/lib/rate-limit";

const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const FormSchema = z.object({
  visitorKey: z.string().min(8),
  type: z.string().default("contact"),
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  message: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (overPublicLimit(req.headers, "form")) return withCors(req, apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429), CORS);
  const { slug } = await params;
  const store = await db.store.findUnique({
    where: { slug },
    select: { id: true, name: true, status: true, userId: true, user: { select: { email: true } } },
  });
  if (!store || store.status !== "active") {
    return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  }

  const body = await req.json().catch(() => null);
  const parsed = FormSchema.safeParse(body);
  if (!parsed.success) {
    return withCors(req, apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid form submission"), CORS);
  }

  const input = parsed.data;
  const visitorId = await upsertStoreVisitor({
    storeId: store.id,
    visitorKey: input.visitorKey,
    email: input.email,
    name: input.name,
    phone: input.phone,
  });

  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
    `
      INSERT INTO "StoreFormSubmission" (id, "storeId", "visitorId", type, name, email, phone, message, payload)
      VALUES (gen_random_uuid()::text, $1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), $8::jsonb)
      RETURNING id
    `,
    store.id,
    visitorId,
    input.type,
    input.name ?? "",
    input.email ?? "",
    input.phone ?? "",
    input.message ?? "",
    JSON.stringify(input.payload ?? {}),
  );

  // Messages from contact forms land in the seller's inbox so they can reply from there.
  if (input.message?.trim()) {
    await ingestFormMessage({ storeId: store.id, submissionId: rows[0]?.id ?? null, type: input.type, name: input.name, email: input.email, phone: input.phone, message: input.message, visitorId }).catch((error) => console.error("[forms] inbox copy failed", error));
  }

  if (input.email || input.message) {
    void sendSellerNotification(store.user.email, {
      title: `New ${input.type} submission from ${store.name}`,
      description: `${input.name || input.email || "A visitor"} submitted ${input.type}. ${input.message ?? ""}`,
      type: "form_submission",
      link: "/home/messages",
      actionLabel: "Open your inbox",
    }, { id: store.userId, role: "seller" });
  }

  return withCors(req, created({ id: rows[0]?.id ?? null }), CORS);
}
