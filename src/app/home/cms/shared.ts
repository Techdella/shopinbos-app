import type { IconName } from "@/components/ui/Icon";
import type { Tone } from "@/components/app-kit";
import { formatDate, type TFunction } from "@shared/i18n";

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

type StatusKey = "status.live" | "status.scheduled" | "status.scheduledOn" | "status.draft";

export function statusLook(t: TFunction<StatusKey>, status: string, publishAt: Date | string | null, now = new Date()): { label: string; tone: Tone } {
  if (status === "published") return { label: t("status.live"), tone: "success" };
  if (status === "scheduled") {
    if (publishAt && new Date(publishAt).getTime() <= now.getTime()) return { label: t("status.live"), tone: "success" };
    return { label: publishAt ? t("status.scheduledOn", { date: formatDate(publishAt, t.locale, { day: "numeric", month: "short" }) }) : t("status.scheduled"), tone: "info" };
  }
  return { label: t("status.draft"), tone: "muted" };
}

export const REX_SETUP_PROMPT =
  "Help me set up content collections for my store (like a blog, size guide, recipe book, FAQ or course). Look at what I sell, suggest the right collections with their fields, set them up, and write a first draft item in each.";

export const studioHref = (prompt: string) => `/studio?prompt=${encodeURIComponent(prompt)}`;
