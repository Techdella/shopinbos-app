import Link from "next/link";
import { AppFrame } from "@/components/shell/AppFrame";
import { Icon } from "@/components/ui/Icon";
import { MascotAvatar } from "@/components/ui";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, safeQuery } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { SetupBanner } from "@/components/rex/SetupBanner";

export const dynamic = "force-dynamic";

function fmtMoney(n: number, sym = "₦") {
  return `${sym}${Math.round(n).toLocaleString("en-US")}`;
}
function fmtK(n: number, sym = "₦") {
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${sym}${(n / 1_000).toFixed(1)}K`;
  return `${sym}${n}`;
}

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  paid:       { bg: "var(--success-bg)", color: "var(--success)" },
  delivered:  { bg: "var(--success-bg)", color: "var(--success)" },
  processing: { bg: "var(--info-bg)",    color: "var(--info)" },
  shipped:    { bg: "var(--info-bg)",    color: "var(--info)" },
  cancelled:  { bg: "var(--danger-bg)", color: "var(--danger)" },
  refunded:   { bg: "var(--danger-bg)", color: "var(--danger)" },
  pending:    { bg: "var(--warning-bg)",color: "var(--warning)" },
};
function statusBadge(status: string) {
  return STATUS_BADGE[status] ?? { bg: "var(--ink-100)", color: "var(--ink-700)" };
}

/* Tiny inline sparkline SVG */
function Sparkline({ data, color = "var(--teal-600)" }: { data: number[]; color?: string }) {
  if (!data.length) return null;
  const w = 100, h = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const r = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - ((v - min) / r) * (h * 0.85) - 2,
  ]);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  const filled = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`spk-${color.replace(/[^a-z]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={filled} fill={`url(#spk-${color.replace(/[^a-z]/gi, "")})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* Revenue line chart */
function RevenueChart({ data }: { data: number[] }) {
  if (!data.length) return null;
  const w = 600, h = 200, padL = 44, padR = 12, padT = 12, padB = 24;
  const max = Math.max(...data) * 1.1 || 1;
  const cw = w - padL - padR;
  const ch = h - padT - padB;
  const denom = Math.max(data.length - 1, 1);
  const x = (i: number) => padL + (i / denom) * cw;
  const y = (v: number) => padT + ch - (v / max) * ch;
  const path = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const filled = `${path} L${x(data.length - 1)},${padT + ch} L${x(0)},${padT + ch} Z`;
  const ticks = [0, max * 0.25, max * 0.5, max * 0.75, max];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: "block" }}>
      <defs>
        <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--teal-600)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--teal-600)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="var(--ink-100)" strokeWidth="1" />
          <text x={padL - 8} y={y(t) + 4} fill="var(--ink-400)" fontSize="9.5" textAnchor="end"
            fontFamily="var(--font-mono)">{fmtK(t)}</text>
        </g>
      ))}
      <path d={filled} fill="url(#rev-fill)" />
      <path d={path} fill="none" stroke="var(--teal-600)" strokeWidth="2.2" strokeLinecap="round" />
      {data.map((v, i) =>
        i % Math.ceil(data.length / 6) === 0 ? (
          <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="var(--paper)" stroke="var(--teal-600)" strokeWidth="2" />
        ) : null,
      )}
    </svg>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period = "30d" } = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;

  const paidStatuses = ["paid", "processing", "shipped", "delivered"] as const;

  const [recentOrders, orderCount, paidRevenueAggregate, allPaidOrders, refundedOrders, uniqueBuyers] =
    workspace.store
      ? await Promise.all([
          safeQuery(
            () =>
              db.retailOrder.findMany({
                where: { storeId: workspace.store!.id },
                orderBy: { createdAt: "desc" },
                take: 6,
              }),
            [],
          ),
          safeQuery(() => db.retailOrder.count({ where: { storeId: workspace.store!.id } }), 0),
          safeQuery(
            () =>
              db.retailOrder.aggregate({
                where: { storeId: workspace.store!.id, status: { in: [...paidStatuses] } },
                _sum: { total: true },
              }),
            { _sum: { total: 0 } },
          ),
          safeQuery(
            () =>
              db.retailOrder.findMany({
                where: { storeId: workspace.store!.id, status: { in: [...paidStatuses] } },
                select: { total: true, createdAt: true },
                orderBy: { createdAt: "asc" },
              }),
            [],
          ),
          safeQuery(
            () =>
              db.retailOrder.findMany({
                where: { storeId: workspace.store!.id, status: "refunded" },
                select: { id: true },
              }),
            [],
          ),
          safeQuery(
            () =>
              db.retailOrder.findMany({
                where: { storeId: workspace.store!.id },
                select: { buyerEmail: true },
                distinct: ["buyerEmail"],
              }),
            [],
          ),
        ])
      : [[], 0, { _sum: { total: 0 } }, [], [], []];

  /* Products with lowest margin treated as "at risk" for restocking UI */
  const lowStockProducts = [...workspace.storeProducts]
    .sort((a, b) => (a.margin ?? 100) - (b.margin ?? 100))
    .slice(0, 4);

  const paidRevenue = Math.round(Number(paidRevenueAggregate._sum.total ?? 0));
  const publishedProducts = workspace.storeProducts.filter((p) => p.status === "published").length;
  const activeCustomers = uniqueBuyers.length;
  const firstName = user.name.split(" ")[0];
  const storeName = workspace.store?.name ?? "Your Store";
  const storeSlug = workspace.store?.slug ? `${workspace.store.slug}.shopinbos.shop` : undefined;
  const storeCity = workspace.store?.city ?? workspace.store?.country ?? "your market";

  /* Setup progress */
  const publishedCount = workspace.storeProducts.filter((p) => p.status === "published").length;
  const bannerSetup = workspace.settings.setup ?? {};
  let setupPercent = 0;
  if (workspace.store) setupPercent += 20;
  setupPercent += Math.min(30, publishedCount * 10);
  if (bannerSetup.channelsConnected) setupPercent += 25;
  if (bannerSetup.profileCompleted) setupPercent += 15;
  if (bannerSetup.marketplaceReviewed) setupPercent += 10;
  const productsNeeded = Math.max(0, 3 - publishedCount);
  const paymentNeeded = !bannerSetup.channelsConnected;
  const showSetupBanner = !workspace.completedSetup;

  const todayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric",
  }).format(new Date());

  /* Compute daily revenue for chart */
  const dailyRevenueMap: Record<string, number> = {};
  for (const o of allPaidOrders) {
    const day = o.createdAt.toISOString().slice(0, 10);
    dailyRevenueMap[day] = (dailyRevenueMap[day] || 0) + Number(o.total);
  }
  const dailyRevenueValues = Object.values(dailyRevenueMap);
  const chartData = dailyRevenueValues.length > 0 ? dailyRevenueValues : [paidRevenue || 1];

  /* Compute sparkline data (last 10 days) */
  const sparkData = dailyRevenueValues.slice(-10);
  while (sparkData.length < 10) sparkData.push(0);

  /* Compute 7-day revenue */
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const last7dRevenue = allPaidOrders
    .filter((o) => o.createdAt >= sevenDaysAgo)
    .reduce((s, o) => s + Number(o.total), 0);

  /* Compute 7-day order count */
  const last7dOrders = recentOrders.filter((o) => new Date(o.createdAt) >= sevenDaysAgo).length;

  /* Refund rate */
  const refundRate = orderCount > 0 ? ((refundedOrders.length / orderCount) * 100).toFixed(1) : "0";

  const channels = (workspace.settings.connectedChannels ?? []).length > 0
    ? (workspace.settings.connectedChannels ?? []).map((ch, i) => {
        const colors: Record<string, string> = {
          instagram: "var(--berry-500)",
          tiktok: "var(--ink-900)",
          whatsapp: "#25d366",
          facebook: "#1877F2",
          google: "#4285F4",
          shopify: "#95BF47",
          website: "var(--teal-600)",
        };
        const labels: Record<string, string> = {
          instagram: "Instagram",
          tiktok: "TikTok",
          whatsapp: "WhatsApp",
          facebook: "Facebook",
          google: "Google Shop",
          shopify: "Shopify Import",
          website: "Storefront",
        };
        return { color: colors[ch] ?? "var(--teal-600)", label: labels[ch] ?? ch, v: "—", p: "—" };
      })
    : [{ color: "var(--teal-600)", label: "Storefront", v: "—", p: "100%" }];

  /* Build activity feed from real recent orders */
  const activityFeed: Array<{ t: string; b: string; w: string; c: string }> = [
    ...recentOrders.slice(0, 4).map((o) => ({
      t: "Order placed",
      b: `${o.orderNumber} · ${fmtMoney(Number(o.total), o.currency)}`,
      w: (() => { const m = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000); return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)}h ago`; })(),
      c: "var(--teal-600)" as const,
    })),
    ...(refundedOrders.length > 0 ? [{
      t: "Refund processed",
      b: `${refundedOrders.length} order(s) refunded`,
      w: "today",
      c: "var(--danger)" as const,
    }] : []),
  ];
  if (activityFeed.length === 0) {
    activityFeed.push({ t: "No recent activity", b: "Orders will appear here as they come in", w: "", c: "var(--ink-400)" });
  }

  const kpis = [
    {
      label: "Revenue · 7d",
      value: fmtMoney(last7dRevenue),
      delta: `₦${(last7dRevenue / 1000).toFixed(1)}K this week`,
      dir: last7dRevenue > 0 ? "up" as const : "flat" as const,
      iconBg: "var(--teal-100)",
      iconColor: "var(--teal-800)",
      sparkColor: "var(--teal-600)",
      sparkData,
      icon: "coin" as const,
      money: true,
    },
    {
      label: "Orders · all time",
      value: String(orderCount),
      delta: `${last7dOrders} this week`,
      dir: orderCount > 0 ? "up" as const : "flat" as const,
      iconBg: "var(--amber-100)",
      iconColor: "var(--amber-500)",
      sparkColor: "var(--amber-500)",
      sparkData: sparkData.map((v) => Math.round(v / (paidRevenue || 1) * orderCount)),
      icon: "cart" as const,
    },
    {
      label: "Customers",
      value: String(activeCustomers),
      delta: `from ${uniqueBuyers.length} unique buyers`,
      dir: activeCustomers > 0 ? "up" as const : "flat" as const,
      iconBg: "var(--berry-100)",
      iconColor: "var(--berry-500)",
      sparkColor: "var(--berry-500)",
      sparkData: sparkData.map((_, i) => Math.max(1, Math.round(activeCustomers / (sparkData.length - i || 1)))),
      icon: "users" as const,
    },
    {
      label: "Products",
      value: String(publishedProducts),
      delta: `${workspace.storeProducts.length} total in catalog`,
      dir: "flat" as const,
      iconBg: "var(--indigo-100)",
      iconColor: "var(--indigo-500)",
      sparkColor: "var(--indigo-500)",
      sparkData: sparkData.map(() => publishedProducts),
      icon: "box" as const,
    },
    {
      label: "Refund rate",
      value: `${refundRate}%`,
      delta: refundedOrders.length > 0 ? `${refundedOrders.length} orders refunded` : "no refunds",
      dir: "flat" as const,
      iconBg: "var(--rose-100)",
      iconColor: "var(--rose-500)",
      sparkColor: "var(--rose-500)",
      sparkData: sparkData.map(() => Number(refundRate)),
      icon: "refresh" as const,
    },
  ];

  /* Peggy brief items */
  const briefItems = [
    {
      icon: "package" as const,
      iconBg: "var(--teal-100)",
      iconColor: "var(--teal-700)",
      title: `${recentOrders.length} order${recentOrders.length !== 1 ? "s" : ""} need${recentOrders.length === 1 ? "s" : ""} attention.`,
      body: "Check your latest orders and confirm dispatch.",
      action: "View orders",
      href: "/home/orders",
      primary: false,
    },
    ...(lowStockProducts.length > 0 ? [{
      icon: "warn" as const,
      iconBg: "var(--warning-bg)" as const,
      iconColor: "var(--warning)" as const,
      title: `${lowStockProducts.length} product${lowStockProducts.length !== 1 ? "s" : ""} running low.`,
      body: "Peggy can build a restock plan based on your sales velocity.",
      action: "Draft plan",
      href: "/products",
      primary: true,
    }] : []),
    ...(workspace.trendingProducts.length > 0 ? [{
      icon: "sparkle" as const,
      iconBg: "var(--berry-100)" as const,
      iconColor: "var(--berry-500)" as const,
      title: `${workspace.trendingProducts.length} trending product${workspace.trendingProducts.length !== 1 ? "s" : ""} in marketplace.`,
      body: `These match your store's style and are selling fast in ${storeCity}.`,
      action: "Show me",
      href: "/marketplace",
      primary: false,
    }] : []),
  ];

  return (
    <AppFrame
      role="seller"
      storeName={storeName}
      storeSlug={storeSlug}
      storeInitial={storeName.charAt(0).toUpperCase()}
      storeLogoUrl={workspace.store?.logoUrl}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div className="px-7 py-6 pb-10 flex flex-col gap-[18px]">

        {/* ── Setup banner ── */}
        {showSetupBanner && (
          <SetupBanner
            percent={setupPercent}
            productsNeeded={productsNeeded}
            paymentNeeded={paymentNeeded}
            storeName={storeName}
            hasLogo={!!workspace.store?.logoUrl}
            hasTheme={!!workspace.store?.brandSettings?.palette}
            hasDelivery={!!workspace.store?.brandSettings?.shippingConfig}
            isPublished={workspace.store?.status === "active"}
          />
        )}

        {/* ── Page header ── */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 style={{
              fontFamily: "var(--font-accent)",
              fontWeight: 400,
              fontSize: 32,
              letterSpacing: "-0.01em",
              lineHeight: 1.05,
              margin: "0 0 4px",
              color: "var(--ink-900)",
            }}>
              Morning, {firstName}.{" "}
              <span style={{ color: "var(--teal-700)", fontStyle: "italic" }}>{storeCity}.</span>
            </h1>
            <div style={{ color: "var(--ink-600)", fontSize: 13.5 }}>
              {todayLabel} · {storeName} · {fmtMoney(paidRevenue)} total revenue
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              href="/home/insights"
              className="inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13.5px] font-semibold no-underline"
              style={{ border: "1px solid var(--ink-150)", background: "var(--paper)", color: "var(--ink-800)" }}
            >
              <Icon name="download" size={14} /> Export
            </Link>
            <Link
              href={storeSlug ? `https://${storeSlug}` : "#"}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13.5px] font-semibold no-underline"
              style={{ border: "1px solid var(--ink-150)", background: "var(--paper)", color: "var(--ink-800)" }}
            >
              <Icon name="eye" size={14} /> View storefront
            </Link>
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13.5px] font-semibold text-white no-underline"
              style={{ background: "var(--teal-700)" }}
            >
              <Icon name="plus" size={14} color="white" /> Add product
            </Link>
          </div>
        </div>

        {/* ── Peggy daily brief ── */}
        <div className="rounded-[16px] p-[18px]" style={{
          background: "linear-gradient(120deg, var(--teal-50) 0%, var(--teal-100) 60%, var(--paper) 100%)",
          border: "1px solid var(--teal-200)",
        }}>
          <div className="flex gap-[14px] items-flex-start">
            <MascotAvatar role="seller" size={56} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-3">
                <div style={{ fontSize: 11, color: "var(--teal-700)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Peggy's brief · {todayLabel}
                </div>
                <span className="rounded-full px-2 py-px text-[10px] font-semibold"
                  style={{ background: "var(--teal-200)", color: "var(--teal-800)" }}>
                  {briefItems.length} things
                </span>
              </div>
              <div className="grid grid-cols-3 gap-[14px]">
                {briefItems.map((c, i) => (
                  <div key={i} className="rounded-[12px] p-3 flex flex-col gap-2"
                    style={{ background: "var(--paper)", border: "1px solid var(--ink-100)" }}>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-[7px] flex items-center justify-center shrink-0"
                        style={{ background: c.iconBg, color: c.iconColor }}>
                        <Icon name={c.icon} size={13} color={c.iconColor} />
                      </div>
                      <div className="font-semibold text-[12.5px]" style={{ color: "var(--ink-900)" }}>{c.title}</div>
                    </div>
                    <div className="text-[12px] leading-[1.5]" style={{ color: "var(--ink-600)" }}>{c.body}</div>
                    <div className="flex gap-1.5 mt-auto">
                      <Link href={c.href}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold no-underline"
                        style={{
                          background: c.primary ? "var(--teal-700)" : "var(--paper)",
                          color: c.primary ? "white" : "var(--ink-800)",
                          border: c.primary ? "none" : "1px solid var(--ink-150)",
                        }}>
                        {c.action} <Icon name="arrow" size={11} color={c.primary ? "white" : "var(--ink-700)"} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── KPI tiles ── */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
          {kpis.map((kpi, i) => (
            <div key={i} className="rounded-[14px] px-4 py-3.5"
              style={{ background: "var(--paper)", border: "1px solid var(--ink-100)", boxShadow: "var(--shd-xs)" }}>
              <div className="flex justify-between items-start mb-1">
                <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em]"
                  style={{ color: "var(--ink-500)" }}>{kpi.label}</div>
                <div className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center shrink-0"
                  style={{ background: kpi.iconBg }}>
                  <Icon name={kpi.icon} size={18} color={kpi.iconColor} />
                </div>
              </div>
              <div className="text-[28px] leading-none mb-1.5"
                style={{ fontFamily: "var(--font-accent)", fontWeight: 400, color: "var(--ink-900)" }}>
                {kpi.value}
              </div>
              <div className="flex items-center gap-1 text-[11.5px] font-semibold mb-2"
                style={{ color: kpi.dir === "up" ? "var(--success)" : "var(--ink-500)" }}>
                <Icon name={kpi.dir === "up" ? "arrowUp" : "minus"} size={12}
                  color={kpi.dir === "up" ? "var(--success)" : "var(--ink-500)"} />
                {kpi.delta}
              </div>
              <Sparkline data={kpi.sparkData} color={kpi.sparkColor} />
            </div>
          ))}
        </div>

        {/* ── Sales chart + channel donut ── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "1.7fr 1fr" }}>
          {/* Sales chart */}
          <div className="rounded-[16px] p-[18px]"
            style={{ background: "var(--paper)", border: "1px solid var(--ink-100)" }}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="font-semibold text-[15px]" style={{ color: "var(--ink-900)" }}>Sales · last 30 days</div>
                <div className="text-[12.5px] mt-0.5" style={{ color: "var(--ink-500)" }}>Across all channels · settled in ₦</div>
              </div>
              <div className="flex gap-1.5">
                {["7d", "30d", "90d", "12m"].map((p) => (
                  <Link key={p} href={`/home?period=${p}`}
                    className="rounded-[8px] px-3 py-1 text-[11.5px] font-semibold no-underline"
                    style={{
                      background: p === period ? "var(--teal-100)" : "var(--paper)",
                      color: p === period ? "var(--teal-800)" : "var(--ink-700)",
                      border: "1px solid var(--ink-150)",
                    }}>{p}</Link>
                ))}
              </div>
            </div>
            <RevenueChart data={chartData} />
            <div className="grid grid-cols-4 gap-3 mt-3.5 pt-3.5" style={{ borderTop: "1px solid var(--ink-100)" }}>
              {channels.map((ch, i) => (
                <div key={i}>
                  <div className="flex items-center gap-1.5 text-[11.5px] mb-1" style={{ color: "var(--ink-500)" }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: ch.color }} />
                    {ch.label}
                  </div>
                  <div style={{ fontFamily: "var(--font-accent)", fontSize: 20, color: "var(--ink-900)" }}>{ch.v}</div>
                  <div className="text-[11px]" style={{ color: "var(--ink-500)" }}>{ch.p} of total</div>
                </div>
              ))}
            </div>
          </div>

          {/* Channel mix */}
          <div className="rounded-[16px] p-[18px]"
            style={{ background: "var(--paper)", border: "1px solid var(--ink-100)" }}>
            <div className="font-semibold text-[15px] mb-3.5" style={{ color: "var(--ink-900)" }}>
              Order channels · today
            </div>
            {/* Donut placeholder */}
            <div className="flex items-center gap-4 mb-4">
              <svg width={110} height={110} viewBox="0 0 110 110">
                <circle cx="55" cy="55" r="44" stroke="var(--ink-100)" strokeWidth="16" fill="none" />
                <circle cx="55" cy="55" r="44" stroke="var(--teal-600)" strokeWidth="16" fill="none"
                  strokeDasharray={`${276} ${276}`} strokeDashoffset="0" style={{ transform: "rotate(-90deg)", transformOrigin: "55px 55px" }} />
                <text x="55" y="51" textAnchor="middle" fill="var(--ink-900)" fontSize="18"
                  fontFamily="var(--font-accent)">{recentOrders.length || 0}</text>
                <text x="55" y="65" textAnchor="middle" fill="var(--ink-500)" fontSize="9.5"
                  fontFamily="var(--font-mono)" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>orders</text>
              </svg>
              <div className="flex flex-col gap-2 flex-1">
                {channels.map((ch) => (
                  <div key={ch.label} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: ch.color }} />
                    <div className="flex-1 text-[12.5px]" style={{ color: "var(--ink-800)" }}>{ch.label}</div>
                    <div className="text-[11px]" style={{ color: "var(--ink-500)", fontFamily: "var(--font-mono)" }}>—</div>
                    <div className="text-[11.5px] font-semibold min-w-[56px] text-right" style={{ color: "var(--ink-900)" }}>—</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ height: 1, background: "var(--ink-100)", margin: "12px 0" }} />
            <div className="text-[12px] leading-[1.5] mb-2.5" style={{ color: "var(--ink-500)" }}>
              Channel breakdown will appear here once orders start coming in through different channels.
            </div>
          </div>
        </div>

        {/* ── Recent orders + Product alerts ── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
          {/* Orders table */}
          <div className="rounded-[16px] overflow-hidden"
            style={{ background: "var(--paper)", border: "1px solid var(--ink-100)" }}>
            <div className="flex items-center justify-between px-4 py-3.5">
              <div>
                <div className="font-semibold text-[14px]" style={{ color: "var(--ink-900)" }}>Recent orders</div>
                <div className="text-[12px]" style={{ color: "var(--ink-500)" }}>Last 24 hours</div>
              </div>
              <Link href="/home/orders"
                className="text-[12.5px] font-semibold no-underline"
                style={{ color: "var(--teal-700)" }}>
                See all {orderCount} →
              </Link>
            </div>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
              <thead>
                <tr>
                  {["Order", "Customer", "Channel", "Total", "Status"].map((h) => (
                    <th key={h} style={{
                      textAlign: "left", padding: "10px 14px",
                      color: "var(--ink-500)", fontWeight: 600, fontSize: 11.5,
                      letterSpacing: "0.04em", textTransform: "uppercase",
                      borderBottom: "1px solid var(--ink-100)",
                      background: "var(--ink-50)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentOrders.length > 0 ? recentOrders.slice(0, 6).map((order, i) => {
                  const badge = statusBadge(order.status);
                  return (
                    <tr key={order.id} style={{ borderBottom: i < recentOrders.length - 1 ? "1px solid var(--ink-100)" : "none" }}>
                      <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 12 }}>
                        {order.orderNumber}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <div className="flex items-center gap-2">
                          <div className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                            style={{ background: "var(--teal-700)" }}>
                            {(order.buyerName ?? "?").charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontSize: 13 }}>{order.buyerName}</span>
                        </div>
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <Icon name="shop" size={14} color="var(--teal-700)" />
                      </td>
                      <td style={{ padding: "11px 14px", fontWeight: 600, fontFamily: "var(--font-accent)" }}>
                        {fmtMoney(Number(order.total), order.currency)}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-px text-[11.5px] font-semibold capitalize"
                          style={{ background: badge.bg, color: badge.color }}>
                          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: badge.color }} />
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={5} style={{ padding: "18px 14px", color: "var(--ink-500)", fontSize: 13 }}>
                      No orders yet. Rex is polishing your storefront while you add products.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Product alerts */}
          <div className="rounded-[16px] overflow-hidden"
            style={{ background: "var(--paper)", border: "1px solid var(--ink-100)" }}>
            <div className="flex items-center justify-between px-4 py-3.5">
              <div>
                <div className="font-semibold text-[14px]" style={{ color: "var(--ink-900)" }}>Running low</div>
                <div className="text-[12px]" style={{ color: "var(--ink-500)" }}>Peggy suggests restocking</div>
              </div>
              <Link href="/marketplace"
                className="rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-semibold no-underline"
                style={{ background: "var(--teal-100)", color: "var(--teal-800)" }}>
                Restock plan
              </Link>
            </div>
            {(lowStockProducts.length > 0 ? lowStockProducts : workspace.storeProducts.slice(0, 4)).map((p, i) => {
              const margin = p.margin ?? 0;
              const pct = Math.min(100, margin);
              const warn = margin < 20;
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5"
                  style={{ borderTop: "1px solid var(--ink-100)" }}>
                  {/* Product swatch */}
                  <div className="w-[38px] h-[38px] rounded-[8px] shrink-0 flex items-center justify-center text-[14px] font-bold"
                    style={{
                      background: ["#f3e4d5","#dde7d3","#e6dff5","#fae0d2"][i % 4],
                      color: ["#8a5a3c","#3e5c2c","#5b4d8a","#a14a2a"][i % 4],
                      fontFamily: "var(--font-accent)",
                    }}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[12.5px] truncate" style={{ color: "var(--ink-900)" }}>{p.name}</div>
                    <div className="flex items-center gap-1.5 text-[11px] mt-0.5"
                      style={{ color: warn ? "var(--warning)" : "var(--ink-500)" }}>
                      <strong style={{ color: warn ? "var(--warning)" : "var(--ink-700)" }}>
                        {margin > 0 ? `${Math.round(margin)}% margin` : "No margin set"}
                      </strong>
                      {" · "}{p.status}
                    </div>
                    <div className="h-1 rounded-full overflow-hidden mt-1.5" style={{ background: "var(--ink-100)" }}>
                      <div style={{
                        width: `${pct}%`, height: "100%",
                        background: pct < 15 ? "var(--danger)" : pct < 25 ? "var(--warning)" : "var(--teal-600)",
                      }} />
                    </div>
                  </div>
                  <Link href="/marketplace"
                    className="rounded-[8px] px-2 py-1 text-[11.5px] font-semibold shrink-0 no-underline"
                    style={{ border: "1px solid var(--ink-150)", background: "var(--paper)", color: "var(--ink-800)" }}>
                    Restock
                  </Link>
                </div>
              );
            })}
            {lowStockProducts.length === 0 && workspace.storeProducts.length === 0 && (
              <div className="px-4 py-5 text-[13px]" style={{ color: "var(--ink-500)" }}>
                No products yet. Add your first products in Products.
              </div>
            )}
          </div>
        </div>

        {/* ── Activity feed ── */}
        <div className="rounded-[16px] p-[18px]"
          style={{ background: "var(--paper)", border: "1px solid var(--ink-100)" }}>
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="font-semibold text-[14px]" style={{ color: "var(--ink-900)" }}>Activity · last 24 hours</div>
              <div className="text-[12px]" style={{ color: "var(--ink-500)" }}>What happened while you were away</div>
            </div>
            <Link href="/home/orders"
              className="rounded-[8px] px-3 py-1.5 text-[11.5px] font-semibold no-underline"
              style={{ border: "1px solid var(--ink-150)", background: "var(--paper)", color: "var(--ink-800)" }}>
              All activity
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {[activityFeed.slice(0, 3), activityFeed.slice(3, 6), activityFeed.slice(6, 9)].map((col, ci) => (
              <div key={ci} className="flex flex-col gap-2.5">
                {col.map((e, ei) => (
                  <div key={ei} className="flex gap-2.5 text-[12.5px]">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: e.c }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold" style={{ color: "var(--ink-800)" }}>{e.t}</div>
                      <div className="text-[12px] mt-px" style={{ color: "var(--ink-600)" }}>{e.b}</div>
                    </div>
                    <div className="text-[11px] shrink-0" style={{ color: "var(--ink-400)" }}>{e.w}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── Rex AI notice ── */}
        <div className="flex items-center gap-3 rounded-[14px] px-4 py-3"
          style={{ background: "var(--teal-50)", border: "1px solid var(--teal-200)" }}>
          <MascotAvatar role="seller" size={32} />
          <div className="flex-1 text-[13px]" style={{ color: "var(--teal-800)" }}>
            <strong>Rex noticed:</strong> {workspace.storeProducts.filter(p => p.status === "published").length} products published,{" "}
            {workspace.trendingProducts.length} marketplace products waiting. Peggy can help tighten your store copy.
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href="/builder"
              className="rounded-[8px] px-3 py-1.5 text-[12px] font-semibold text-white no-underline"
              style={{ background: "var(--teal-700)" }}>
              Continue building
            </Link>
            <Link href="/home/cms"
              className="rounded-[8px] px-3 py-1.5 text-[12px] font-medium no-underline"
              style={{ border: "1px solid var(--teal-300)", color: "var(--teal-700)" }}>
              Open CMS
            </Link>
          </div>
        </div>

      </div>
    </AppFrame>
  );
}
