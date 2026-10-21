import type { PostFormat } from "@/lib/social-posts/pure";

// Where "Make one with Rex" goes for each post size. Rex's image studio makes square, portrait (2:3) and landscape
// pictures; the post crops them to its exact size (src/lib/social-posts/server.ts renderPostImage).

const STUDIO_SIZE: Record<PostFormat, string> = { square: "square", portrait: "portrait", story: "portrait", landscape: "landscape" };

export function rexImageHref(format: PostFormat) {
  return `/studio/images?size=${STUDIO_SIZE[format]}&from=social`;
}

export const REX_REEL_HREF = "/home/video/studio?purpose=social";
