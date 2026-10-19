"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatNumber } from "@shared/i18n";
import { pageHref, pageNumbers, type PageParams } from "@/lib/pagination";

/**
 * Pages under a list: "Showing 101–200 of 1,000", Previous / numbered pages (with "…") / Next. Plain links to
 * ?page=N that keep the list's other params (search, filter, sort), so it works before JavaScript loads and from a
 * server page or a client one alike. Work out the page with `pageWindow()` from "@/lib/pagination".
 */
export function Pagination({
  page,
  pages,
  total,
  from,
  to,
  base,
  params = {},
  pageParam = "page",
  label,
  summary,
  className = "mt-4",
}: {
  page: number;
  pages: number;
  total: number;
  /** 1-based first and last row shown. */
  from: number;
  to: number;
  /** The list's path, e.g. "/home/orders". */
  base: string;
  /** The list's other URL params, kept on every page link (any `page` in here is replaced). */
  params?: PageParams;
  pageParam?: string;
  /** Name of the page links for screen readers, e.g. "Order pages". */
  label?: string;
  /** Replaces the "Showing 1–50 of 120" line. */
  summary?: ReactNode;
  /** Outer spacing and extras (default "mt-4"). */
  className?: string;
}) {
  const t = useT("common");
  const locale = useLocale();
  if (total <= 0) return null;
  const num = (value: number) => formatNumber(value, locale);
  const href = (n: number) => pageHref(base, params, n, pageParam);

  return (
    <div className={cx("flex flex-col items-center gap-3 sm:flex-row sm:justify-between", className)}>
      <p className="m-0 text-[13px] text-app-ink-soft">
        {summary ?? t("page.showing", { from: num(from), to: num(to), total: num(total) })}
      </p>
      {pages > 1 && (
        <nav aria-label={label ?? t("page.nav")} className="flex items-center gap-1.5">
          <PageStep href={page > 1 ? href(page - 1) : null} label={t("page.prev")} rel="prev" />
          <span className="px-2 text-[13.5px] font-bold sm:hidden">{t("page.of", { page: num(page), pages: num(pages) })}</span>
          <span className="hidden items-center gap-1 sm:flex">
            {pageNumbers(page, pages).map((n, i) =>
              n === "gap" ? (
                <span key={`gap-${i}`} className="px-1 text-app-ink-soft" aria-hidden>
                  …
                </span>
              ) : (
                <Link
                  key={n}
                  href={href(n)}
                  aria-current={n === page ? "page" : undefined}
                  aria-label={t("page.number", { page: num(n) })}
                  className={cx(
                    "grid h-9 min-w-9 place-items-center rounded-full px-2 text-[13.5px] font-bold no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-ink",
                    n === page ? "bg-app-ink text-white" : "border border-app-line bg-white text-app-ink hover:border-app-line-strong",
                  )}
                >
                  {num(n)}
                </Link>
              ),
            )}
          </span>
          <PageStep href={page < pages ? href(page + 1) : null} label={t("page.next")} rel="next" />
        </nav>
      )}
    </div>
  );
}

function PageStep({ href, label, rel }: { href: string | null; label: string; rel: "prev" | "next" }) {
  const inner = (
    <>
      {rel === "prev" && <Icon name="arrowLeft" size={14} />}
      <span>{label}</span>
      {rel === "next" && <Icon name="arrow" size={14} />}
    </>
  );
  const cls = "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-bold no-underline";
  // On the first and last page the button stays visible but greyed out, and isn't a link.
  return href ? (
    <Link href={href} rel={rel} className={cx(cls, "border-app-line bg-white text-app-ink hover:border-app-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-ink")}>
      {inner}
    </Link>
  ) : (
    <span aria-disabled="true" className={cx(cls, "border-app-line bg-app-canvas text-app-ink-faint")}>
      {inner}
    </span>
  );
}
