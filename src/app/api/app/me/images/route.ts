import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { getIdentity, IdentityImageError, setIdentityImage } from "@/lib/identity";
import type { IdentityImageKind } from "@shared/identity-images";

export const dynamic = "force-dynamic";

// The signed-in person's photo and logo (web uploader and the mobile app).
//   GET                               → { data: Identity }
//   POST   multipart kind=avatar|logo, file=<image>  → { data: Identity }
//   DELETE ?kind=avatar|logo          → { data: Identity }

function kindOf(value: unknown): IdentityImageKind | null {
  return value === "avatar" || value === "logo" ? value : null;
}

export const GET = withAuth(async (_req, { user }) => ok(await getIdentity(user)));

export const POST = withAuth(async (req, { user }) => {
  if (!checkRateLimit(`identity-image:${user.id}`, { maxRequests: 20, windowMs: 60_000 }).allowed) {
    return apiError("RATE_LIMITED", "Too many uploads. Wait a minute and try again.", 429);
  }
  const form = await req.formData().catch(() => null);
  const kind = kindOf(form?.get("kind"));
  const file = form?.get("file");
  if (!kind) return apiError("VALIDATION_ERROR", "Say whether this is your photo or your logo.", 400);
  if (!(file instanceof File)) return apiError("VALIDATION_ERROR", "Choose an image to upload.", 400);
  try {
    return ok(await setIdentityImage(user, kind, file));
  } catch (error) {
    if (error instanceof IdentityImageError) return apiError("VALIDATION_ERROR", error.message, 400);
    console.error("[me/images] upload failed", error);
    return apiError("UPLOAD_FAILED", "That upload didn't go through. Try again.", 500);
  }
});

export const DELETE = withAuth(async (req, { user }) => {
  const kind = kindOf(req.nextUrl.searchParams.get("kind"));
  if (!kind) return apiError("VALIDATION_ERROR", "Say whether to remove your photo or your logo.", 400);
  try {
    return ok(await setIdentityImage(user, kind, null));
  } catch (error) {
    if (error instanceof IdentityImageError) return apiError("VALIDATION_ERROR", error.message, 400);
    console.error("[me/images] remove failed", error);
    return apiError("UPLOAD_FAILED", "Couldn't remove that. Try again.", 500);
  }
});
