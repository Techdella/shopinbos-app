import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { appBase, sendPlatformEmail } from "@/lib/email/compliance.server";
import { html } from "@/lib/email/shell";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { storeLaunchPrices } from "@/lib/store-launch-billing";

// The phone app can't take the store launch fee (app store rules: digital items only through in-app purchase), so
// when a seller finishes onboarding there, we email them the next steps on the website instead. Email is outside the
// app, which both stores allow. At most twice a day per seller; the answer says whether this call sent one.
export const POST = withSeller(async (_req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true } });
  if (!store || !user.email) return ok({ emailed: false, email: null });

  const limit = await checkRateLimitShared(rateLimitKey("launch-email", user.id), { maxRequests: 2, windowMs: 24 * 60 * 60_000 });
  if (!limit.allowed) return ok({ emailed: false, email: null });

  const url = `${appBase()}/home/start`;
  const price = (await storeLaunchPrices()).totalNgn;
  const result = await sendPlatformEmail({
    to: user.email,
    user: { id: user.id, role: user.role },
    kind: "transactional",
    subject: `Put ${store.name} live`,
    eyebrow: "Your shop",
    heading: `${store.name} is ready`,
    preheader: "One last step to put your shop live.",
    bodyHtml: [
      html.p(`You've set up ${store.name} in the Shopinbos app. The last step, launching it, is on the Shopinbos website.`),
      html.p(`Sign in with the same account and open Start here to pay the one-time launch fee (₦${price.toLocaleString("en-NG")}). Your shop goes live as soon as the payment is confirmed.`),
    ].join(""),
    cta: { label: "Open Start here", url },
    reason: "You finished setting up your shop in the Shopinbos app.",
  }).catch(() => ({ success: false }));
  return ok({ emailed: result.success, email: result.success ? user.email : null });
});
