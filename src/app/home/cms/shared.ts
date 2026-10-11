import type { IconName } from "@/components/ui/Icon";
import type { Tone } from "@/components/app-kit";

// Bits shared by the Content (CMS) screens.

export const TEMPLATE_ICON: Record<string, IconName> = {
  blog: "document",
  size_guide: "tag",
  recipe: "leaf",
  course: "book",
  faq: "info",
  lookbook: "image",
  team: "users",
  events: "calendar",
  blank: "layers",
};

export function statusLook(status: string, publishAt: Date | string | null, now = new Date()): { label: string; tone: Tone } {
  if (status === "published") return { label: "Live", tone: "success" };
  if (status === "scheduled") {
    if (publishAt && new Date(publishAt).getTime() <= now.getTime()) return { label: "Live", tone: "success" };
    return { label: publishAt ? `Scheduled ${new Date(publishAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Scheduled", tone: "info" };
  }
  return { label: "Draft", tone: "muted" };
}

export const REX_SETUP_PROMPT =
  "Help me set up content collections for my store (like a blog, size guide, recipe book, FAQ or course). Look at what I sell, suggest the right collections with their fields, set them up, and write a first draft item in each.";

export const studioHref = (prompt: string) => `/studio?prompt=${encodeURIComponent(prompt)}`;
