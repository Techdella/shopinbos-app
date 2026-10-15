import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { created, apiError } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey, requestIp } from "@/lib/rate-limit";
import { addSubscriber } from "@/lib/marketing/subscribers";
import { readBioBlocks } from "@/lib/bio/pure";

// The link in bio "sign up" block: the shopper joins the store's list (email consent recorded, tagged link-in-bio).
const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const Body = z.object({
  blockId: z.string().min(1).max(40),
  email: z.string().trim().email("Enter a valid email address.").max(200),
  name: z.string().trim().max(120).optional(),
}).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await checkRateLimitShared(rateLimitKey("bio-signup", requestIp(req.headers)), { maxRequests: 8, windowMs: 60_000 })).allowed) {
    return withCors(req, apiError("RATE_LIMITED", "Too many tries. Wait a minute and try again.", 429), CORS);
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your email and try again."), CORS);
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, status: true, bioPage: { select: { published: true, blocks: true } } } });
  if (!store || store.status !== "active" || !store.bioPage?.published) return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  // Only a sign-up block that is on the page can collect emails.
  if (!readBioBlocks(store.bioPage.blocks).some((block) => block.id === parsed.data.blockId && block.type === "signup")) {
    return withCors(req, apiError("NOT_FOUND", "This sign-up is no longer available.", 404), CORS);
  }
  const result = await addSubscriber(
    store.id,
    {
      email: parsed.data.email,
      name: parsed.data.name || null,
      tags: ["link-in-bio"],
      source: "landing_page",
      consent: { email: true, sms: false, whatsapp: false, text: "Signed up on the link in bio page", ip: requestIp(req.headers) },
    },
    { optIn: true },
  );
  if (!result.ok) return withCors(req, apiError("BAD_REQUEST", result.error), CORS);
  return withCors(req, created({ subscribed: true }), CORS);
}
