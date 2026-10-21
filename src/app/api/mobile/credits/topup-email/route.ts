import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { appBase, sendPlatformEmail } from "@/lib/email/compliance.server";
import { html } from "@/lib/email/shell";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { creditBalance } from "@/lib/ai/credits.server";
import { creditsUrlFor } from "@shared/ai-credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Top up" in the phone app. AI credits are digital goods, so the app can't sell them (Apple 3.1.1, Google Play
// payments): like the launch fee (/api/mobile/onboarding/launch-email), we email the person how to top up on the
// website instead. No prices or payment in the app or here. At most 3 a day per person → { sent: true }.

export const POST = withAuth(async (_req: NextRequest, { user }) => {
  if (!user.email) return apiError("NO_EMAIL", "Add an email address to your account first, so we can send you the steps.", 422);

  const limit = await checkRateLimitShared(rateLimitKey("credits-topup-email", user.id), { maxRequests: 3, windowMs: 24 * 60 * 60_000 });
  if (!limit.allowed) return apiError("RATE_LIMITED", "We've already emailed you the steps today. Check your inbox (and spam).", 429);

  const url = `${appBase()}${creditsUrlFor(user.role)}`;
  const balance = await creditBalance(user.id).catch(() => null);
  const result = await sendPlatformEmail({
    to: user.email,
    user: { id: user.id, role: user.role },
    kind: "transactional",
    subject: "How to top up your AI credits",
    eyebrow: "AI credits",
    heading: "Top up on the Shopinbos website",
    preheader: "Add AI credits for Peggy and Rex on the website.",
    bodyHtml: [
      html.p(`You asked how to top up your AI credits in the Shopinbos app.${balance !== null ? ` You have ${balance} credit${balance === 1 ? "" : "s"} now.` : ""}`),
      html.p("Credits are bought on the Shopinbos website. Sign in with the same account, open AI credits and choose a pack. They work in the app as soon as the payment is confirmed, for both Peggy and Rex."),
    ].join(""),
    cta: { label: "Open AI credits", url },
    reason: "You tapped Top up in the Shopinbos app.",
  }).catch(() => ({ success: false }));
  if (!result.success) return apiError("UNAVAILABLE", "We couldn't send the email just now. Try again in a moment.", 503);
  return ok({ sent: true as const });
}, ["seller", "supplier", "logistics_partner"]);
