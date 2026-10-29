import { NextResponse } from "next/server";
import { appleAppSiteAssociation, isAppleTeamId } from "@shared/app-links";

// GET /.well-known/apple-app-site-association: tells iPhones which app.shopinbos.com pages open the Shopinbos app
// (universal links) and lets the app offer saved passwords (shared/app-links.ts has the list). Apple fetches it
// through its CDN when the app is installed or updated: plain JSON, no sign-in, no redirect. Needs APPLE_TEAM_ID
// (Apple Developer › Membership); without it there's no file and links keep opening Safari.

export const dynamic = "force-dynamic";

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  if (!isAppleTeamId(teamId)) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  return NextResponse.json(appleAppSiteAssociation(teamId), { headers: { "Cache-Control": "public, max-age=3600" } });
}
