"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/ui/dialogs";
import { Notice, PillButton } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate } from "@shared/i18n";
import { naira } from "@shared/onboarding";
import { PaymentLinkDialog, type LinkProduct } from "@/components/payment-links/PaymentLinkDialog";
import type { LinkListRow } from "@/lib/payment-links/service.server";
import type { PageWindow } from "@/lib/pagination";
import { Pagination } from "@/components/seller/Pagination";

// The seller's payment links: status, who made them (you, Peggy, a customer chat with Peggy, link in bio), the order
// that paid each one, copy and cancel; and "New payment link" with a product picker.

const FILTERS = ["all", "active", "paid", "expired", "cancelled"] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_TONE: Record<LinkListRow["status"], string> = {
  active: "bg-app-mint text-app-forest",
  paid: "bg-app-success text-white",
  expired: "bg-app-canvas text-app-ink-soft",
  cancelled: "bg-app-canvas text-app-ink-soft",
};

export function PaymentLinksManager({
  links,
  filter,
  paging,
  storeHasLinks,
  ready,
  storeName,
  catalog,
}: {
  /** One page of links, already filtered on the server (?status=, ?page=). */
  links: LinkListRow[];
  filter: Filter;
  paging: PageWindow;
  storeHasLinks: boolean;
  ready: boolean;
  storeName: string;
  catalog: LinkProduct[];
}) {
  const t = useT("paylinks");
  const locale = useLocale();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function copy(link: LinkListRow) {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(link.id);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {}
  }

  async function cancel(link: LinkListRow) {
    const yes = await confirmDialog({ title: t("cancel.title"), message: t("cancel.message"), confirmLabel: t("cancel.confirm"), cancelLabel: t("cancel.keep"), tone: "danger" });
    if (!yes) return;
    setBusy(link.id);
    setError(null);
    try {
      const response = await fetch(`/api/app/payment-links/${link.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
      const json = await response.json().catch(() => null);
      if (!response.ok) setError(json?.error?.message ?? t("cancel.failed"));
      router.refresh();
    } catch {
      setError(t("cancel.failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      {!ready ? (
        <Notice tone="info">
          {t("list.notReady")} <Link href="/home/payments" className="font-bold underline">{t("dialog.setUpPayments")}</Link>
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1.5" aria-label={t("list.title")}>
          {FILTERS.map((key) => (
            <Link
              key={key}
              href={key === "all" ? "/home/payment-links" : `/home/payment-links?status=${key}`}
              aria-current={filter === key ? "page" : undefined}
              className={cx("inline-flex min-h-[40px] items-center rounded-full px-4 text-[13.5px] font-bold no-underline", filter === key ? "bg-app-ink text-white" : "border border-app-line bg-white text-app-ink")}
            >
              {t(`filter.${key}`)}
            </Link>
          ))}
        </nav>
        <PillButton size="md" tone="ink" onClick={() => setCreating(true)} disabled={!catalog.length}>
          <Icon name="plus" size={16} />
          {t("new")}
        </PillButton>
      </div>
      {error ? <Notice>{error}</Notice> : null}

      {!storeHasLinks ? (
        <section className="flex flex-col items-center rounded-[22px] border border-app-line bg-white px-6 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name="link" size={22} /></span>
          <h2 className="mb-0 mt-4 text-[18px] font-extrabold">{t("list.empty")}</h2>
          <p className="mb-0 mt-1.5 max-w-[460px] text-[14.5px] leading-[1.55] text-app-ink-soft">{t("list.emptySub")}</p>
        </section>
      ) : links.length === 0 ? (
        <p className="m-0 rounded-[20px] border border-app-line bg-white px-5 py-8 text-center text-[14.5px] text-app-ink-soft">{t("list.noneHere")}</p>
      ) : (
        <div>
        <ul className="m-0 grid list-none gap-3 p-0">
          {links.map((link) => (
            <li key={link.id} className="rounded-[20px] border border-app-line bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cx("rounded-full px-2.5 py-0.5 text-[12px] font-extrabold", STATUS_TONE[link.status])}>{t(`status.${link.status}`)}</span>
                    <span className="text-[12.5px] font-semibold text-app-ink-soft">{link.oneTime ? t("row.oneTime") : t("row.reusable")} · {t.dynamic(`by.${link.createdBy}`, link.createdBy)}</span>
                  </div>
                  <h3 className="m-0 mt-1.5 truncate text-[16px] font-extrabold">{link.title}</h3>
                  <p className="m-0 mt-0.5 text-[13px] text-app-ink-soft">
                    {[
                      formatDate(link.createdAt, locale, { day: "numeric", month: "short" }),
                      link.buyerName ? t("row.for", { name: link.buyerName }) : null,
                      t("row.views", { count: link.views }),
                      link.paidCount ? t("row.paidTimes", { count: link.paidCount }) : null,
                    ].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="text-[16px] font-extrabold">{naira(link.amount)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 basis-[200px] truncate rounded-[12px] bg-app-canvas px-3 py-2 text-[12.5px]">{link.url}</code>
                {link.status === "active" ? (
                  <button type="button" onClick={() => void copy(link)} className="min-h-[40px] rounded-full border border-app-line bg-white px-4 text-[13px] font-extrabold">
                    {copied === link.id ? t("done.copied") : t("row.copy")}
                  </button>
                ) : null}
                {link.order ? (
                  <Link href={`/home/orders/${link.order.id}`} className="inline-flex min-h-[40px] items-center rounded-full bg-app-ink px-4 text-[13px] font-extrabold text-white no-underline">
                    {t("row.order", { number: link.order.orderNumber })}
                  </Link>
                ) : null}
                {link.status === "active" ? (
                  <button type="button" disabled={busy === link.id} onClick={() => void cancel(link)} className="min-h-[40px] rounded-full px-3 text-[13px] font-bold text-app-danger disabled:opacity-50">
                    {t("row.cancel")}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <Pagination {...paging} base="/home/payment-links" params={{ status: filter === "all" ? undefined : filter }} label={t("list.pages")} />
        </div>
      )}

      {creating ? <PaymentLinkDialog catalog={catalog} storeName={storeName} ready={ready} onClose={() => setCreating(false)} onCreated={() => router.refresh()} /> : null}
    </div>
  );
}
