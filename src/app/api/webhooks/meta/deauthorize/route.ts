import { after, NextResponse, type NextRequest } from "next/server";
import { deauthorizeMetaUser } from "@/lib/meta/user-data.server";
import { parseSignedRequest, signedRequestFromBody } from "@/lib/meta/signed-request";

export const dynamic = "force-dynamic";

// Meta's Deauthorize Callback (App Dashboard › Facebook Login for Business › Settings): someone removed Shopinbos from
// their Facebook account. Posted as signed_request=…, signed with META_APP_SECRET. We switch off what they connected
// (src/lib/meta/user-data.server.ts) after answering, so Meta gets its 200 quickly.
export async function POST(req: NextRequest) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "META_APP_SECRET is not set" } }, { status: 503 });
  const raw = await req.text();
  const signed = parseSignedRequest(signedRequestFromBody(raw, req.headers.get("content-type")), secret);
  if (!signed) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid signed_request" } }, { status: 400 });

  after(() => deauthorizeMetaUser(signed.userId).catch((error) => console.error("[meta] deauthorize failed", error)));
  return NextResponse.json({ data: { received: true } });
}
