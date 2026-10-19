import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { adLandingUrl, appOrigin, sellerWhatsapp } from "@/lib/ads";
import { cleanAffiliateCode } from "@shared/affiliates";

export const dynamic = "force-dynamic";

// Link previews (WhatsApp, Facebook, Slack…) fetch the link too; don't count those as taps.
const PREVIEW_BOTS = /bot|crawler|spider|facebookexternalhit|whatsapp|slackbot|telegrambot|twitterbot|linkedinbot|discordbot|preview/i;

// Ad tracking link: counts the tap, then sends the buyer to WhatsApp or the product page.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = cleanAffiliateCode((await params).code);
  const ad = code
    ? await db.adCampaign.findUnique({
        where: { code },
        select: { id: true, code: true, platform: true, destination: true, headline: true, storeProductId: true, productIds: true, store: { select: { id: true, slug: true, customDomain: true, user: { select: { phone: true } } } } },
      })
    : null;
  if (!ad) return NextResponse.redirect(appOrigin());

  if (!PREVIEW_BOTS.test(req.headers.get("user-agent") ?? "") && req.method === "GET") {
    await db.adCampaign.update({ where: { id: ad.id }, data: { clicks: { increment: 1 } } }).catch(() => null);
  }
  const whatsapp = ad.destination === "whatsapp" ? await sellerWhatsapp(ad.store.id, ad.store.user.phone) : null;
  // A campaign with several products sends each ad's taps to its own product (?p=).
  const asked = req.nextUrl.searchParams.get("p");
  const productId = asked && ad.productIds.includes(asked) ? asked : ad.storeProductId;
  return NextResponse.redirect(adLandingUrl(ad, ad.store, productId, whatsapp), 302);
}
