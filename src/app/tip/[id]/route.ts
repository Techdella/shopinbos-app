import { NextRequest, NextResponse } from "next/server";
import { openTip } from "@/lib/member-messaging/tips.server";

export const dynamic = "force-dynamic";

// GET /tip/<tip>?m=<message>: the button in a weekly tip (email or WhatsApp). Records the tap, then opens the page the
// tip is about (signed-out people sign in first and come back to it).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const message = req.nextUrl.searchParams.get("m");
  const path = await openTip(id, message && /^[a-z0-9]{10,40}$/i.test(message) ? message : null);
  const response = NextResponse.redirect(new URL(path.startsWith("/") ? path : "/", req.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
