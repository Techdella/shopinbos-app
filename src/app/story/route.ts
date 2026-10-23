import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/server-auth";
import { STORY_PAGE } from "@/components/member-stories/paths";

export const dynamic = "force-dynamic";

// GET /story: Share your story for whoever is signed in (the link in the tip emails doesn't know the portal).
export async function GET(req: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/story")}`, req.url));
  const page = STORY_PAGE[user.role as keyof typeof STORY_PAGE];
  return NextResponse.redirect(new URL(page ?? "/", req.url));
}
