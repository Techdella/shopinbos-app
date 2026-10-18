import { after, NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/ads";
import { createDeletionRequest, runDeletionRequest } from "@/lib/meta/user-data.server";
import { newConfirmationCode, parseSignedRequest, signedRequestFromBody } from "@/lib/meta/signed-request";

export const dynamic = "force-dynamic";

// Meta's Data Deletion Request Callback (App Dashboard › App settings › Basic › Data deletion): someone removed
// Shopinbos and asked for their data to be deleted. Meta needs JSON { url, confirmation_code } back: the url is our
// status page, where the person can check progress with the code. The deletion itself runs after the response
// (src/lib/meta/user-data.server.ts).
export async function POST(req: NextRequest) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "META_APP_SECRET is not set" } }, { status: 503 });
  const raw = await req.text();
  const signed = parseSignedRequest(signedRequestFromBody(raw, req.headers.get("content-type")), secret);
  if (!signed) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid signed_request" } }, { status: 400 });

  const code = newConfirmationCode();
  await createDeletionRequest(signed.userId, code);
  after(() => runDeletionRequest(signed.userId, code));

  // Meta's documented response shape (not our usual { data } envelope).
  return NextResponse.json({ url: `${appOrigin()}/meta-data-deletion?code=${code}`, confirmation_code: code });
}
