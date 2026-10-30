"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Confetti } from "@/components/brand/Celebrate";
import { useT } from "@/components/i18n/I18nProvider";
import { moreProductsWanted, type ShopReadyItem } from "@shared/seller-onboarding";
import { track, type ShopReady } from "./api";

// Home's "Get your shop ready" on the web (spec F4, the phone's Home list; the facts come from the same
// shopReadyFor as GET /api/mobile/onboarding/ready): bank account, delivery partner, pay on delivery, share, first
// post, more products, WhatsApp or Instagram, and the optional domain, each from the shop's real state. Done items drop
// off; when all are done, confetti and "Your shop is fully set up" once per seller in this browser. Each item done
// since Home last looked is sent as checklist_item_done.

export const SHOP_READY_HREF: Record<ShopReadyItem, string> = {
  bank: "/home/wallet",
  delivery: "/home/logistics",
  pod: "/home/payments",
  share: "/home/store",
  post: "/home/social",
  products: "/products/new",
  channels: "/home/connections",
  domain: "/home/domain",
};

const ICON: Record<ShopReadyItem, IconName> = { bank: "bank", delivery: "truck", pod: "coin", share: "send", post: "megaphone", products: "box", channels: "chat", domain: "globe" };

const key = (uid: string, what: string) => `shopinbos.shopReady.${what}.${uid}`;

function read(name: string) {
  try {
    return window.localStorage.getItem(name);
  } catch {
    return null;
  }
}

function write(name: string, value: string) {
  try {
    window.localStorage.setItem(name, value);
  } catch {
    // No storage: the moment may show again.
  }
}

export function ShopReadyCard({ ready, uid }: { ready: ShopReady; uid: string }) {
  const t = useT("rexBuild");
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    const done = ready.rows.filter((row) => row.done).map((row) => row.key);
    const before = read(key(uid, "done"));
    if (before !== null) {
      const seen = new Set(before.split(",").filter(Boolean));
      for (const item of done) if (!seen.has(item)) track("checklist_item_done", { item });
    }
    write(key(uid, "done"), done.join(","));
    if (ready.complete && read(key(uid, "celebrated")) !== "1") {
      setCelebrate(true);
      write(key(uid, "celebrated"), "1");
    }
  }, [ready, uid]);

  if (ready.complete) {
    if (!celebrate) return null;
    return (
      <section aria-live="polite" className="relative overflow-hidden rounded-[22px] bg-app-success-tint p-5">
        <Confetti count={40} />
        <div className="flex items-center gap-2.5 text-app-success">
          <Icon name="checkCircle" size={22} />
          <h2 className="m-0 text-[20px] font-extrabold">{t("ready.allDone")}</h2>
        </div>
        <p className="m-0 mt-1.5 text-[15px] text-app-ink">{t("ready.allDoneSub")}</p>
      </section>
    );
  }

  const label = (item: ShopReadyItem) => {
    if (item === "products") {
      const count = moreProductsWanted(ready.facts.products);
      return count === 1 ? t("ready.productsOne") : t("ready.products", { count });
    }
    return t.dynamic(`ready.${item}`, item);
  };

  return (
    <section data-testid="shop-ready" className="rounded-[22px] border border-app-line bg-white p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-[17px] font-extrabold">{t("ready.title")}</h2>
        <span className="shrink-0 text-[13px] text-app-ink-soft">{t("ready.progress", { done: ready.done, total: ready.total })}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-app-canvas" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ready.percent}>
        <span className="block h-full rounded-full bg-app-success" style={{ width: `${ready.percent}%` }} />
      </div>
      <ul className="m-0 mt-3 grid list-none gap-2 p-0">
        {ready.open.map((row) => (
          <li key={row.key}>
            <Link href={SHOP_READY_HREF[row.key]} className="flex min-h-[56px] items-center gap-3 rounded-[16px] border border-app-line px-3.5 py-2.5 text-app-ink no-underline hover:border-app-line-strong">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name={ICON[row.key]} size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-extrabold">{label(row.key)}</span>
                <span className="block text-[12.5px] leading-[1.35] text-app-ink-soft">{t.dynamic(`ready.${row.key}Sub`, "")}</span>
              </span>
              <Icon name="chevRight" size={16} className="shrink-0 text-app-ink-soft" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Finish your shop · Step 3 of 5": a seller who left Rex's build with Save & exit carries on from here. */
export function FinishShopCard({ step }: { step: number | null }) {
  const t = useT("rexBuild");
  return (
    <Link href="/onboarding/rex" data-testid="finish-shop" className="flex items-center gap-4 rounded-[22px] bg-app-forest p-5 text-white no-underline hover:brightness-110">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-app-mint text-app-forest"><Icon name="sparkle" size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-extrabold">{t("resume.title")}</span>
        <span className="block text-[13px] text-white/80">{t("resume.step", { step: step ?? 1 })}</span>
      </span>
      <span className="shrink-0 rounded-full bg-app-accent px-4 py-2 text-[13.5px] font-extrabold text-app-ink">{t("resume.go")}</span>
    </Link>
  );
}
