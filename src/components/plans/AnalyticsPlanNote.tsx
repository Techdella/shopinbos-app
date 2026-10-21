import { Card } from "@/components/app-kit";
import { getT } from "@/lib/i18n/server";

// What a supplier's or delivery partner's plan shows on their analytics page (shared/plans.ts `analytics`): Free
// sees the headline numbers, Plus the full charts, Pro also downloads them as a spreadsheet.

export async function AnalyticsPlanNote({ level, billingHref, exportHref }: { level: "basic" | "full" | "export"; billingHref: string; exportHref: string }) {
  const t = await getT("payments");
  if (level === "export") {
    return (
      <div className="mb-5 flex justify-end">
        <a href={exportHref} download className="inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white no-underline hover:bg-black">
          {t("an.download")}
        </a>
      </div>
    );
  }
  return (
    <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 p-5">
      <p className="m-0 min-w-0 flex-1 text-[14px] text-app-ink-soft">{level === "basic" ? t("an.basic") : t("an.full")}</p>
      <a href={billingHref} className="inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white no-underline hover:bg-black">
        {t("an.seePlans")}
      </a>
    </Card>
  );
}
