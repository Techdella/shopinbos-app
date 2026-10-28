"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { naira } from "@/lib/marketplace/find";
import { markupLabel } from "@shared/supplier-markup";
import type { StarterPackView } from "@/lib/marketplace/quick-add.server";
import { useWebQuickAdd, type MarkupState } from "./QuickAddKit";

// Starter packs on the web (/marketplace top, /marketplace/packs): ready-made bundles worked out on the server
// (shared/starter-packs.ts) — top-rated, in stock, verified suppliers near the seller, not already in the shop. The
// preview lists each product with what you pay and the price it goes in at, the totals, and "Add all 25 to my shop".

export function PackCard({ pack }: { pack: StarterPackView }) {
  const t = useT("marketplace");
  const name = t.dynamic(`pack.${pack.id}`, pack.title);
  const photos = pack.items.filter((item) => item.image).slice(0, 4);
  return (
    <Link href={`/marketplace/packs?id=${encodeURIComponent(pack.id)}`} data-testid={`pack-${pack.id}`} className="grid min-w-[240px] gap-2.5 rounded-[20px] border border-app-line bg-white p-3 text-app-ink no-underline hover:border-app-line-strong">
      <span className="grid grid-cols-4 gap-1">
        {Array.from({ length: 4 }, (_, i) => photos[i]).map((item, i) =>
          item?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={item.id} src={item.image} alt="" loading="lazy" className="aspect-square w-full rounded-[10px] bg-app-canvas object-cover" />
          ) : (
            <span key={`blank-${i}`} className="aspect-square w-full rounded-[10px] bg-app-canvas" />
          ),
        )}
      </span>
      <span className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-app-peach text-app-accent-ink"><Icon name={pack.icon} size={16} /></span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{t("packs.title", { name, count: pack.count })}</span>
      </span>
      <span className="text-[13px] text-app-ink-soft">{t("packs.cardSub", { cost: naira(pack.totalCost), price: naira(pack.totalPrice) })}</span>
    </Link>
  );
}

export function PackStrip({ packs }: { packs: StarterPackView[] }) {
  const t = useT("marketplace");
  return (
    <section aria-labelledby="starter-packs" className="grid gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="starter-packs" className="m-0 text-[16px] font-extrabold">{t("packs.heading")}</h2>
        <Link href="/marketplace/packs" className="text-[14px] font-bold text-app-accent-ink no-underline hover:underline">{t("packs.seeAll")}</Link>
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {packs.map((pack) => <PackCard key={pack.id} pack={pack} />)}
      </div>
    </section>
  );
}

export function PackPreview({ pack, markup }: { pack: StarterPackView; markup: MarkupState }) {
  const t = useT("marketplace");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const quick = useWebQuickAdd({ initial: markup, onChange: (more, less) => setAdded((now) => { const next = new Set(now); more.forEach((id) => next.add(id)); less.forEach((id) => next.delete(id)); return next; }) });
  const name = t.dynamic(`pack.${pack.id}`, pack.title);
  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <Link href="/marketplace/packs" className="text-[14px] font-bold text-app-ink-soft no-underline hover:underline">← {t("packs.heading")}</Link>
          <h2 className="m-0 mt-1 text-[26px] font-extrabold tracking-[-0.02em]">{t("packs.title", { name, count: pack.count })}</h2>
        </div>
        <button type="button" data-testid="pack-add-all" onClick={() => quick.addMany(pack.items.map((item) => item.id))} className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-full bg-app-accent px-6 text-[15.5px] font-extrabold text-app-ink">
          <Icon name="plus" size={17} /> {t("packs.addAll", { count: pack.count })}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[18px] border border-app-line bg-white p-4">
          <p className="m-0 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-app-ink-soft">{t("packs.totalCost")}</p>
          <p className="m-0 mt-1 text-[22px] font-extrabold">{naira(pack.totalCost)}</p>
        </div>
        <div className="rounded-[18px] border border-app-line bg-white p-4">
          <p className="m-0 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-app-ink-soft">{t("packs.totalPrice")}</p>
          <p className="m-0 mt-1 text-[22px] font-extrabold text-app-success">{naira(pack.totalPrice)}</p>
        </div>
        <div className="rounded-[18px] border border-app-line bg-white p-4">
          <p className="m-0 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-app-ink-soft">{t("packs.yourMarkup")}</p>
          <p className="m-0 mt-1 flex items-baseline gap-2 text-[22px] font-extrabold">{markupLabel(quick.markup.markup, naira)} <Link href="/marketplace/mine#markup" className="text-[14px] font-bold text-app-accent-ink">{t("packs.changeMarkup")}</Link></p>
        </div>
      </div>
      <p className="m-0 text-[14px] leading-[1.5] text-app-ink-soft">{t("packs.totalNote")}</p>
      {pack.needsAgreement.length ? (
        <p className="m-0 rounded-[16px] bg-[#FDF0D5] px-4 py-3 text-[14px] leading-[1.5] text-[#8A5A08]">
          <strong className="font-extrabold">{t("packs.readyCount", { ready: pack.readyCount, count: pack.count })}</strong> {t("packs.agreeWith", { names: pack.needsAgreement.map((entry) => entry.name).join(", ") })}
        </p>
      ) : null}
      <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
        {pack.items.map((item) => (
          <li key={item.id} style={{ contentVisibility: "auto", containIntrinsicSize: "auto 84px" }} className="flex items-center gap-3 rounded-[18px] border border-app-line bg-white p-2.5">
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-[12px] bg-app-canvas object-cover" />
            ) : (
              <span className="h-14 w-14 shrink-0 rounded-[12px] bg-app-canvas" />
            )}
            <span className="min-w-0 flex-1">
              <Link href={`/marketplace/product/${encodeURIComponent(item.id)}`} className="block truncate text-[14.5px] font-bold text-app-ink no-underline hover:underline">{item.name}</Link>
              <span className="block truncate text-[12.5px] text-app-ink-soft">{item.supplierName}</span>
              {added.has(item.id) ? <span className="text-[12px] font-bold text-app-success">{t("grid.inShop")}</span> : !item.ready ? <span className="text-[12px] font-bold text-[#8A5A08]">{t("packs.agreeFirst")}</span> : null}
            </span>
            <span className="text-right">
              <span className="block text-[15px] font-extrabold">{naira(item.price)}</span>
              <span className="block text-[12px] text-app-ink-soft">{t("packs.youPay", { cost: naira(item.cost) })}</span>
            </span>
          </li>
        ))}
      </ul>
      {quick.ui}
    </div>
  );
}
