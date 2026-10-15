import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { sendEmail, isEmailConfigured } from "@/lib/notifications/resend";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { escapeHtml, html } from "@/lib/email/shell";
import { buildPlatformEmail } from "@/lib/email/compliance.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 7 * 1024 * 1024;

const Body = z.object({
  to: z.array(z.string().trim().email("Check the printer's email address")).min(1, "Add the print shop's email").max(3, "Up to 3 email addresses"),
  message: z.string().trim().max(800).optional(),
  filename: z.string().trim().max(80).regex(/^[\w .-]+\.png$/i, "The file must be a PNG"),
  /** data:image/png;base64,… made in the browser from the print sheet. */
  file: z.string().max(Math.ceil(MAX_BYTES * 1.4) + 64).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "The labels must be a PNG"),
  summary: z.string().trim().max(200).optional(),
});

// Print studio: email the print-ready labels (a high-resolution PNG made in the browser) to a print shop.
// The seller's address is the reply-to, so the printer answers them directly.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  if (!isEmailConfigured()) return apiError("UNAVAILABLE", "Email isn't set up on this account yet. Download the file and send it from WhatsApp or your email instead.", 503);
  const limit = await checkRateLimitShared(rateLimitKey("print:send", user.id), { maxRequests: 10, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return apiError("RATE_LIMITED", "That's a lot of emails. Wait a little and try again.", 429);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the details");
  const input = parsed.data;
  const content = Buffer.from(input.file.slice(input.file.indexOf(",") + 1), "base64");
  if (content.byteLength > MAX_BYTES) return apiError("BAD_REQUEST", "That file is too big to email (7 MB). Print fewer labels at once.");

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true } });
  const shop = store?.name ?? user.name;
  const { html: body } = buildPlatformEmail({
    kind: "transactional",
    eyebrow: "Print job",
    heading: `Labels to print for ${shop}`,
    preheader: input.summary ?? "Print-ready labels attached.",
    bodyHtml: `${html.raw(`<b>${escapeHtml(shop)}</b> sent you labels to print${input.summary ? `: ${escapeHtml(input.summary)}` : ""}. The print-ready file is attached (PNG, actual size at 300 dpi).`)}${input.message ? html.quote(html.text(input.message)) : ""}${html.small(`Reply to this email to reach ${shop} directly.`)}`,
    reason: `a Shopinbos seller (${shop}) asked us to send you their print job`,
    serviceNote: "Sent once at the seller's request. We don't add you to any list.",
  });
  const result = await sendEmail({
    to: input.to,
    subject: `Print job from ${shop}${input.summary ? `: ${input.summary}` : ""}`.slice(0, 140),
    html: body,
    replyTo: user.email ?? undefined,
    attachments: [{ filename: input.filename, content }],
  });
  if (!result.success) return apiError("UNAVAILABLE", result.message ?? "The email didn't go. Try again or download the file.", 503);
  return ok({ sent: input.to.length });
});
