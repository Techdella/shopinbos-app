import { NextRequest, NextResponse } from "next/server";
import { verifyMetaSignature } from "@/lib/inbox/pure";
import { metaVerifyHandshake } from "@/lib/inbox/webhooks";
import { parseCatalogWebhook } from "@/lib/sales-channels/pure";
import { refreshCatalogCount } from "@/lib/sales-channels/server";
import { checkBatchHandle } from "@/lib/whatsapp-catalog/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Meta catalog webhooks (object "catalog"). Callback URL: https://<app>/api/webhooks/meta-catalog, fields
// "items_batch" and "product_feed", verify token META_WEBHOOK_VERIFY_TOKEN. Each catalog subscribes our app when a
// seller connects it (setCatalogSubscription). Signed with X-Hub-Signature-256 using META_APP_SECRET.
//   items_batch   a batch we pushed finished: record the WhatsApp catalog's per-product results now
//   both          refresh the Facebook & Instagram card's product count

export function GET(req: NextRequest) {
  return metaVerifyHandshake(req, []);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const events = parseCatalogWebhook(payload);
  for (const catalogId of new Set(events.map((event) => event.catalogId))) {
    await refreshCatalogCount(catalogId).catch((error) => console.error("[webhooks/meta-catalog] count failed", error));
  }
  for (const event of events) {
    if (event.field !== "items_batch" || !event.handle) continue;
    await checkBatchHandle(event.catalogId, event.handle).catch((error) => console.error("[webhooks/meta-catalog] batch check failed", error));
  }
  return NextResponse.json({ received: true });
}
