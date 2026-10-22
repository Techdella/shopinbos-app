import Link from "next/link";
import { Mascot } from "@/components/brand/Mascot";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";
import { getT } from "@/lib/i18n/server";
import type { BriefItem } from "@shared/partner-brief";
import { AskPeggy, AskRex, IdeasGate } from "./AskButtons";

// Peggy's brief and Rex's ideas on the supplier and delivery-partner dashboards (shared/partner-brief.ts), the
// way Peggy's brief sits on the seller's /home: what needs doing now, then ways to grow. Each row goes straight to
// the page where it's done.

type Role = "supplier" | "partner";

async function Row({ item, role }: { item: BriefItem; role: Role }) {
  const t = await getT("briefs");
  const vars = item.count === undefined ? undefined : { count: item.count };
  return (
    <Link href={item.href} className={cx("flex min-h-[56px] items-center gap-3 rounded-[16px] bg-white px-4 py-2.5 text-app-ink no-underline hover:shadow-sm", item.urgent && "ring-2 ring-app-danger/40")}>
      <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-full", item.urgent ? "bg-app-danger-tint text-app-danger" : "bg-app-canvas")}><Icon name={item.icon} size={17} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14px] font-extrabold">{t.dynamic(`${role}.${item.key}.title`, item.key, vars)}</span>
          {item.urgent ? <span className="shrink-0 rounded-full bg-app-danger px-2 py-0.5 text-[11px] font-extrabold uppercase text-white">{t("urgent")}</span> : null}
        </span>
        <span className="block text-[12.5px] leading-[1.4] text-app-ink-soft">{t.dynamic(`${role}.${item.key}.hint`, "", vars)}</span>
      </span>
      <span className="shrink-0 rounded-full bg-app-ink px-3.5 py-2 text-[13px] font-extrabold text-white">{t.dynamic(`${role}.${item.key}.action`, "Open")}</span>
    </Link>
  );
}

export async function PartnerBrief({ role, peggy, rex, subtitle, className }: { role: Role; peggy: BriefItem[]; rex: BriefItem[]; subtitle?: string; className?: string }) {
  const t = await getT("briefs");
  const firstIdea = rex[0] ? t.dynamic(`${role}.${rex[0].key}.title`, "", rex[0].count === undefined ? undefined : { count: rex[0].count }) : "";
  return (
    <div className={cx("grid gap-4", className)}>
      <section className="rounded-[22px] bg-app-mint p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Mascot who="peggy" className="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[17px] font-extrabold">{t("peggyTitle")}</h2>
            <div className="text-[13px] text-app-ink-soft">{subtitle ? `${subtitle} · ` : ""}{t("peggyCount", { count: peggy.length })}</div>
          </div>
          <AskPeggy />
        </div>
        <div className="grid gap-2">
          {peggy.length ? peggy.map((item) => <Row key={item.key} item={item} role={role} />) : <div className="rounded-[16px] bg-white px-4 py-3 text-[13.5px] text-app-ink-soft">{t("peggyNothing")}</div>}
        </div>
      </section>
      {rex.length ? (
        <IdeasGate>
          <section className="rounded-[22px] bg-app-peach p-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Mascot who="rex" className="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <h2 className="m-0 text-[17px] font-extrabold">{t("rexTitle")}</h2>
                <div className="text-[13px] text-app-ink-soft">{t("rexSub")}</div>
              </div>
              <AskRex question={firstIdea || undefined} />
            </div>
            <div className="grid gap-2">{rex.map((item) => <Row key={item.key} item={item} role={role} />)}</div>
          </section>
        </IdeasGate>
      ) : null}
    </div>
  );
}
