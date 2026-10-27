"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import type { BackendCountdown } from "@/lib/store-campaigns/types";
import { CampaignStatusTimer, useServerTimeSeed } from "./CampaignTimer";

// Seller home: "Active & upcoming campaigns". Up to five live or scheduled countdowns (seasonal campaigns, countdown
// pop-ups and countdown sections), live first, each ticking on the server clock, with a link to manage them.

export function CampaignsWidget({ items, serverNow }: { items: BackendCountdown[]; serverNow: string }) {
  const t = useT("campaigns");
  useServerTimeSeed(serverNow);
  return (
    <section className="rounded-[22px] border border-app-line bg-white p-5" aria-labelledby="campaigns-widget-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="campaigns-widget-title" className="m-0 text-[17px] font-extrabold">{t("widget.title")}</h2>
        <Link href="/home/campaigns" className="text-[14px] font-extrabold text-app-accent-ink no-underline hover:underline">{t("widget.all")}</Link>
      </div>
      {items.length ? (
        <ul className="m-0 mt-3 grid list-none gap-2 p-0">
          {items.map((item) => (
            <li key={item.key}>
              <Link href={item.href} className="flex min-h-[56px] items-center gap-3 rounded-[16px] border border-app-line px-3.5 py-2.5 text-app-ink no-underline hover:border-app-line-strong">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-app-canvas">
                  <Icon name={item.source === "campaign" ? "calendar" : item.source === "popup" ? "megaphone" : "clock"} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-extrabold">{item.name}</span>
                  <span className="mt-1 block">
                    <CampaignStatusTimer timing={{ startsAt: item.startsAt, endsAt: item.endsAt }} initialStatus={item.status} compact />
                  </span>
                </span>
                {item.source !== "campaign" ? <span className="hidden shrink-0 text-[12px] text-app-ink-soft sm:inline">{item.source === "popup" ? t("widget.popup") : t("widget.section")}</span> : null}
                <Icon name="chevRight" size={16} className="shrink-0 text-app-ink-soft" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-app-canvas px-4 py-3">
          <span className="text-[13.5px] text-app-ink-soft">{t("widget.empty")}</span>
          <Link href="/home/campaigns?create=1" className="inline-flex min-h-[38px] items-center rounded-full bg-app-ink px-4 text-[13px] font-bold text-white no-underline">{t("widget.create")}</Link>
        </div>
      )}
    </section>
  );
}
