import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { saveSellerProfile, sellerProfile } from "@/lib/seller-settings.server";
import { ProfilePatchSchema } from "@/lib/seller-settings-rules";

export const dynamic = "force-dynamic";

// The seller's basics for the phone app's Settings screen (web: /home/settings and its server actions; the same
// rules in src/lib/seller-settings.server.ts). The logo goes through /api/app/me/images.
//   GET   → { data: { me: { name, email, phone }, shop: { name, slug, description, city, state, phone, country, currency, logoUrl } | null } }
//   PATCH { shop?: { name?, description?, city?, state?, phone? }, me?: { name?, phone? } } → GET's data

export const GET = withSeller(async (_req, { user }) => ok(await sellerProfile(user.id)));

export const PATCH = withSeller(async (req: NextRequest, { user }) => {
  const parsed = ProfilePatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your details.");
  if (!(await saveSellerProfile(user.id, parsed.data))) return apiError("NOT_FOUND", "Store not found.", 404);
  return ok(await sellerProfile(user.id));
});
