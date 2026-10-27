import { NextResponse } from "next/server";
import { GOOGLE_FILES, safeFontPath } from "@/lib/google-fonts-proxy";

export const runtime = "nodejs";

// A font file from fonts.gstatic.com, served by the app (see ../../css/route.ts). Font files never change at a URL.

const TYPES: Record<string, string> = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf" };

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = safeFontPath((await params).path ?? []);
  if (!path) return new NextResponse("Not found", { status: 404 });
  const reply = await fetch(`${GOOGLE_FILES}/${path}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!reply?.ok || !reply.body) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(reply.body, { headers: { "Content-Type": TYPES[path.split(".").pop()!] ?? "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable" } });
}
