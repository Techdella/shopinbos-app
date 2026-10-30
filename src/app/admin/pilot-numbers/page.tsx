import Link from "next/link";
import type { Metadata } from "next";
import { AppPage, Card, EmptyState, PillLink } from "@/components/app-kit";
import { CountRow, adminFrame, formatMoney } from "@/components/admin/AdminKit";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { pilotShopNumbers } from "@/lib/pilot-numbers.server";
import { PILOT_NUMBER_FEATURES } from "@shared/pilot-numbers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata: Metadata = { title: "Pilot numbers" };

// Admin › Pilot numbers: every pilot shop's numbers (shared/pilot-numbers.ts) for the founder's "what to measure"
// list: link and QR visits, Plug joins (from launch), followers, repeat buyers, resell sales and commission, and the
// top video. Pilot shops: a pilot feature (post_to_plug, resell, notify_followers or plug_follow_card) is on for
// them. Same numbers each shop sees on /home/pilot-numbers. CSV: /api/admin/pilot-numbers/export.

const n = (value: number) => value.toLocaleString("en-NG");

export default async function AdminPilotNumbersPage() {
  const user = await requireAdminSection("analytics");
  const rows = await pilotShopNumbers();
  const sum = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((total, row) => total + pick(row), 0);

  return (
    <AppPage
      frame={adminFrame(user, "Search")}
      title="Pilot numbers"
      sub={`Each pilot shop's numbers: shops with ${PILOT_NUMBER_FEATURES.join(", ")} on. Video "orders" are orders for the video's product since it went up, not proof the video made them.`}
      actions={<PillLink href="/api/admin/pilot-numbers/export" icon="download">Download CSV</PillLink>}
    >
      <CountRow
        items={[
          { label: "Pilot shops", value: rows.length },
          { label: "Link + QR visits (30 days)", value: n(sum((row) => row.numbers.visits.total30)), hint: `${n(sum((row) => row.numbers.visits.qr30))} from QR codes` },
          { label: "Repeat buyers", value: n(sum((row) => row.numbers.buyers.repeat)) },
          { label: "Resell sales", value: n(sum((row) => row.numbers.resell.sales)), hint: `${formatMoney(sum((row) => row.numbers.resell.commission))} commission` },
          { label: "Video views", value: n(sum((row) => row.numbers.videoViews)) },
        ]}
      />
      {rows.length ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[980px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-app-line text-[12px] uppercase tracking-[0.08em] text-app-ink-soft">
                <th className="px-3 py-2.5">Shop</th>
                <th className="px-3 py-2.5 text-right">Visits 7d (link / QR)</th>
                <th className="px-3 py-2.5 text-right">Visits 30d (link / QR)</th>
                <th className="px-3 py-2.5 text-right">Plug joins</th>
                <th className="px-3 py-2.5 text-right">Followers (from link/QR)</th>
                <th className="px-3 py-2.5 text-right">Repeat / buyers</th>
                <th className="px-3 py-2.5 text-right">Resell sales · value · commission</th>
                <th className="px-3 py-2.5">Top video (views · orders since)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const v = row.numbers.visits;
                const top = row.numbers.videos[0];
                return (
                  <tr key={row.storeId} className="border-b border-app-line last:border-0">
                    <td className="px-3 py-2.5">
                      <Link href={`/admin/sellers?q=${encodeURIComponent(row.handle ?? row.shopName)}`} className="font-bold underline-offset-2 hover:underline">{row.shopName}</Link>
                      <div className="text-app-ink-soft">{row.handle ? `@${row.handle}` : "no handle yet"}{row.status !== "active" ? ` · ${row.status}` : ""}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right">{n(v.total7)} <span className="text-app-ink-soft">({n(v.link7)} / {n(v.qr7)})</span></td>
                    <td className="px-3 py-2.5 text-right">{n(v.total30)} <span className="text-app-ink-soft">({n(v.link30)} / {n(v.qr30)})</span></td>
                    <td className="px-3 py-2.5 text-right">{row.numbers.plugLive ? n(row.numbers.plugJoins) : <span className="text-app-ink-soft">Starts when Plug launches</span>}</td>
                    <td className="px-3 py-2.5 text-right">{n(row.numbers.followers.total)} <span className="text-app-ink-soft">({n(row.numbers.followers.fromLink + row.numbers.followers.fromQr)})</span></td>
                    <td className="px-3 py-2.5 text-right">{n(row.numbers.buyers.repeat)} / {n(row.numbers.buyers.buyers)}</td>
                    <td className="px-3 py-2.5 text-right">{n(row.numbers.resell.sales)} · {formatMoney(row.numbers.resell.value)} · {formatMoney(row.numbers.resell.commission)}</td>
                    <td className="px-3 py-2.5">
                      {top ? (
                        <>
                          <div className="max-w-[220px] truncate font-bold">{top.productName || top.caption || "Video"}</div>
                          <div className="text-app-ink-soft">{n(top.views)} views · {n(top.ordersSince)} orders since · {row.videoCount} video{row.videoCount === 1 ? "" : "s"}</div>
                        </>
                      ) : (
                        <span className="text-app-ink-soft">No videos</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState icon="chart" title="No pilot shops yet">Turn a pilot feature on for some shops in Pilot features, and their numbers show here.</EmptyState>
      )}
    </AppPage>
  );
}
