"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import type { RiderInboxSummary } from "@shared/logistics-chats";

// The web Riders app's "Messages" card on Today: shown only while the company or a shop wrote and the rider hasn't
// read it yet (GET /api/mobile/logistics/rider/messages/summary, X-Rider-Token). Tapping a row opens that chat.
// Checks again every 30 seconds while the page is visible.

const POLL_MS = 30_000;

export function RiderMessagesCard({ token, jobIds, onOpenCompany, onOpenShop }: { token: string; jobIds: string[]; onOpenCompany: () => void; onOpenShop: (jobId: string) => void }) {
  const t = useT("rider");
  const [summary, setSummary] = useState<RiderInboxSummary | null>(null);
  // Rows tapped since the last check (opening a chat marks it read; the next check agrees).
  const [opened, setOpened] = useState<string[]>([]);

  const load = useCallback(async () => {
    const response = await fetch("/api/mobile/logistics/rider/messages/summary", { headers: { Accept: "application/json", "X-Rider-Token": token }, cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { data?: RiderInboxSummary } | null;
    if (response?.ok && body?.data) {
      setSummary(body.data);
      setOpened([]);
    }
  }, [token]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const poll = () => document.visibilityState === "visible" && void load();
    const timer = window.setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [load]);

  if (!summary) return null;
  // Shops only for jobs on this screen (their chat sits on the job's drop).
  const shops = summary.shops.filter((shop) => shop.unread > 0 && jobIds.includes(shop.jobId));
  const rows = [
    ...(summary.company.unread > 0 ? [{ key: "company", name: summary.company.name, sub: t("msgs.company"), unread: summary.company.unread, text: summary.company.last?.text ?? "", open: onOpenCompany }] : []),
    ...shops.map((shop) => ({ key: shop.jobId, name: shop.name || t("msgs.shop"), sub: t("msgs.shop"), unread: shop.unread, text: shop.last?.text ?? "", open: () => onOpenShop(shop.jobId) })),
  ];
  const shown = rows.filter((row) => !opened.includes(row.key));
  if (!shown.length) return null;
  const total = shown.reduce((sum, row) => sum + row.unread, 0);

  return (
    <section aria-label={t("msgs.title")} className="grid gap-1 rounded-[22px] bg-white p-4">
      <h2 className="m-0 flex items-center gap-2 text-[16px] font-extrabold">
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-[10px] bg-app-mint text-app-forest"><Icon name="chat" size={16} /></span>
        {t("msgs.new", { count: total })}
      </h2>
      <ul className="m-0 grid list-none p-0">
        {shown.map((row) => (
          <li key={row.key}>
            <button type="button" onClick={() => { setOpened((keys) => [...keys, row.key]); row.open(); }} className="flex min-h-[56px] w-full items-center gap-3 border-t border-app-line py-2 text-left first:border-t-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-extrabold">{row.name} <span className="font-semibold text-app-ink-soft">· {row.sub}</span></span>
                <span className="block truncate text-[14px] text-app-ink">{row.text}</span>
              </span>
              <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-app-accent px-1.5 text-[12px] font-extrabold text-white">{row.unread > 99 ? "99+" : row.unread}</span>
              <Icon name="chevRight" size={18} className="shrink-0 text-app-ink-faint" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
