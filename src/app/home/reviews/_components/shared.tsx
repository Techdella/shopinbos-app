import Link from "next/link";
import { redirect } from "next/navigation";
import { cx } from "@/components/app-kit";
import { requireRole } from "@/lib/server-auth";
import { sellerStore } from "@/lib/reviews/server";
import { REVIEW_SOURCES, sourceLabel, type ReviewItem, type ReviewSource } from "@/lib/reviews/pure";
import { getT } from "@/lib/i18n/server";
import { formatDate, type Locale, type TFunction } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";

// Bits shared by the Reviews screens (server-safe).

export async function reviewsContext() {
  const user = await requireRole(["seller"], "/login");
  const store = await sellerStore(user.id);
  if (!store) redirect("/builder?firstRun=1");
  return { user, store };
}

const TABS = [
  { href: "/home/reviews", label: "tabs.all" },
  { href: "/home/reviews/request", label: "tabs.ask" },
  { href: "/home/reviews/sources", label: "tabs.sources" },
  { href: "/home/reviews/share", label: "tabs.share" },
] as const;

/** A review source's name in the person's language (brand names stay as they are). */
export function reviewSourceLabel(source: string, t: TFunction<MessageKey<"reviews">>) {
  return t.dynamic(`source.${source}`, sourceLabel(source));
}

export async function ReviewTabs({ active }: { active: string }) {
  const t = await getT("reviews");
  return (
    <nav aria-label={t("tabs.aria")} className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1">
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
          {t(tab.label)}
        </Link>
      ))}
    </nav>
  );
}

export async function Stars({ rating, size = 14 }: { rating: number | null; size?: number }) {
  const t = await getT("reviews");
  if (!rating) return <span className="text-[12.5px] text-app-ink-soft">{t("stars.none")}</span>;
  return (
    <span className="tracking-[1px] text-[#E8A23A]" style={{ fontSize: size }} role="img" aria-label={t("stars.aria", { rating })}>
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

export async function SourcePill({ item }: { item: Pick<ReviewItem, "source" | "importMethod"> }) {
  const t = await getT("reviews");
  const imported = item.importMethod !== "form";
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold", SOURCE_TONE[item.source] ?? "bg-app-lilac text-app-ink")}>
      {reviewSourceLabel(item.source, t)}
      {imported ? <span className="font-semibold opacity-75">· {item.importMethod === "api" ? t("import.synced") : item.importMethod === "screenshot" ? t("import.screenshot") : t("import.imported")}</span> : null}
    </span>
  );
}

export const STATUS_TONE = { approved: "success", pending: "warning", rejected: "muted" } as const;

export function sourceOptions(t?: TFunction<MessageKey<"reviews">>) {
  return (Object.keys(REVIEW_SOURCES) as ReviewSource[]).map((key) => ({ value: key, label: t ? reviewSourceLabel(key, t) : REVIEW_SOURCES[key].label }));
}

export function formatDay(iso: string, locale: Locale = "en") {
  if (locale !== "en") return formatDate(iso, locale);
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
}
