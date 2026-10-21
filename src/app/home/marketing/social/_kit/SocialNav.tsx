import { FilterChips } from "@/components/app-kit";
import { getT } from "@/lib/i18n/server";

// The Social posts sub-menu: Calendar, Queue, Posted, Drafts, Rex designs, Accounts.

export type SocialView = "calendar" | "queue" | "posted" | "drafts" | "designs" | "accounts";

export async function SocialNav({ active, counts }: { active: SocialView; counts?: Partial<Record<SocialView, number>> }) {
  const t = await getT("socialPosts");
  const items: Array<{ key: SocialView; href: string }> = [
    { key: "calendar", href: "/home/marketing/social" },
    { key: "queue", href: "/home/marketing/social?view=queue" },
    { key: "posted", href: "/home/marketing/social?view=posted" },
    { key: "drafts", href: "/home/marketing/social?view=drafts" },
    { key: "designs", href: "/home/marketing/social/designs" },
    { key: "accounts", href: "/home/marketing/social/accounts" },
  ];
  return <FilterChips className="mb-5" items={items.map((item) => ({ label: t(`nav.${item.key}`), href: item.href, active: item.key === active, count: counts?.[item.key] }))} />;
}
