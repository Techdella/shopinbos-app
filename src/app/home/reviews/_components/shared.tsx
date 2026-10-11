import Link from "next/link";
import { redirect } from "next/navigation";
import { cx } from "@/components/app-kit";
import { requireRole } from "@/lib/server-auth";
import { sellerStore } from "@/lib/reviews/server";
import { REVIEW_SOURCES, sourceLabel, type ReviewItem, type ReviewSource } from "@/lib/reviews/pure";

// Bits shared by the Reviews screens (server-safe).

export async function reviewsContext() {
  const user = await requireRole(["seller"], "/login");
  const store = await sellerStore(user.id);
  if (!store) redirect("/builder?firstRun=1");
  return { user, store };
}

const TABS = [
  { href: "/home/reviews", label: "All reviews" },
  { href: "/home/reviews/request", label: "Ask for reviews" },
  { href: "/home/reviews/sources", label: "Sources and import" },
  { href: "/home/reviews/share", label: "Share" },
];

export function ReviewTabs({ active }: { active: string }) {
  return (
    <nav aria-label="Reviews sections" className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={active === tab.href ? "page" : undefined}
          className={cx(
            "inline-flex min-h-[40px] shrink-0 items-center rounded-full px-4 text-[14px] font-bold no-underline transition",
            active === tab.href ? "bg-app-ink text-white" : "text-app-ink hover:bg-white",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function Stars({ rating, size = 14 }: { rating: number | null; size?: number }) {
  if (!rating) return <span className="text-[12.5px] text-app-ink-soft">No stars</span>;
  return (
    <span className="tracking-[1px] text-[#E8A23A]" style={{ fontSize: size }} role="img" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rating)}
      <span className="text-app-track">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

const SOURCE_TONE: Partial<Record<ReviewSource, string>> = {
  store: "bg-app-canvas text-app-ink",
  google: "bg-[#E8EAFB] text-[#3D4FB8]",
  whatsapp: "bg-app-success-tint text-app-success",
  instagram: "bg-app-peach text-app-accent-ink",
  facebook: "bg-[#E8EAFB] text-[#3D4FB8]",
};

export function SourcePill({ item }: { item: Pick<ReviewItem, "source" | "importMethod"> }) {
  const imported = item.importMethod !== "form";
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold", SOURCE_TONE[item.source] ?? "bg-app-lilac text-app-ink")}>
      {sourceLabel(item.source)}
      {imported ? <span className="font-semibold opacity-75">· {item.importMethod === "api" ? "synced" : item.importMethod === "screenshot" ? "screenshot" : "imported"}</span> : null}
    </span>
  );
}

export const STATUS_TONE = { approved: "success", pending: "warning", rejected: "muted" } as const;

export function sourceOptions() {
  return (Object.keys(REVIEW_SOURCES) as ReviewSource[]).map((key) => ({ value: key, label: REVIEW_SOURCES[key].label }));
}

export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
}
