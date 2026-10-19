import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { sellerStore } from "@/lib/inbox/auth";
import { META_LOGIN_PENDING_COOKIE, pickPage } from "@/lib/inbox/meta-login";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ channel: z.enum(["messenger", "instagram"]), pageId: z.string().trim().regex(/^\d{3,30}$/) }).strict();

// POST { channel, pageId }: after a Facebook sign-in that found several Pages, connect the one the seller chose.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Choose a Page to connect.");
  const result = await pickPage(store, req.cookies.get(META_LOGIN_PENDING_COOKIE)?.value, parsed.data.channel, parsed.data.pageId);
  if (!result.ok) return apiError("CONNECT_FAILED", result.error, 422);
  const response = NextResponse.json({ data: result.view });
  response.cookies.set(META_LOGIN_PENDING_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
});
