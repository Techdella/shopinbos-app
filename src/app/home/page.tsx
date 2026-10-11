import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppFrame } from "@/components/shell/AppFrame";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Mascot } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { getSellerDashboard, type SellerDashboard } from "@/lib/dashboard";
import type { Tone } from "@/lib/dashboard/compute";
import { naira } from "@shared/onboarding";
import type { OrderChannel } from "@shared/channels";

// Seller home, following the 2026 "Seller app · web" mockup.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Home" };

const TONE_DOT: Record<Tone, string> = {
  accent: "bg-app-accent",
  success: "bg-app-success",
  warning: "bg-[#F2A93B]",
  muted: "bg-app-ink-faint",
  danger: "bg-app-danger",
};

const TONE_BADGE: Record<Tone, string> = {
  accent: "bg-app-peach text-app-accent-ink",
  success: "bg-app-success-tint text-app-success",
  warning: "bg-[#FDF0D5] text-[#8A5A00]",
  muted: "bg-app-canvas text-app-ink-soft",
  danger: "bg-app-danger-tint text-app-danger",
};

const CHANNEL_BAR: Record<OrderChannel, string> = {
  whatsapp: "bg-app-success",
  instagram: "bg-[#B0479A]",
  facebook: "bg-[#2D5BD0]",
  tiktok: "bg-app-ink",
  email: "bg-app-accent",
  online_store: "bg-app-forest",
};

const TASK_ICON: Record<SellerDashboard["tasks"][number]["icon"], IconName> = {
  chat: "chat",
  mail: "mail",
  truck: "truck",
  box: "box",
  coin: "coin",
};

function lagosGreeting(now: Date) {
  const hour = (now.getUTCHours() + 1) % 24;
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function lagosDate(now: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long" }).format(now);
}

function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={cx("rounded-[22px] border border-app-line bg-white", className)}>{children}</section>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[96px] rounded-[16px] px-4 py-3">
      <div className="text-[13px] text-app-ink-soft">{label}</div>
      <div className="mt-0.5 text-[28px] font-extrabold leading-none tracking-[-0.5px]">{value.toLocaleString("en-NG")}</div>
    </div>
  );
}

function SalesChart({ daily, week, change }: { daily: SellerDashboard["daily"]; week: number; change: number | null }) {
  const max = Math.max(1, ...daily.data);
  const firstLabel = daily.labels.find(Boolean) ?? "";
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[17px] font-extrabold">Sales, last 14 days</h2>
        <span className="text-[13px] text-app-ink-soft">
          {naira(week)} this week{change !== null && ` · ${change >= 0 ? "up" : "down"} ${Math.abs(change)}%`}
        </span>
      </div>
      <div className="mt-5 flex h-[180px] items-end gap-2" role="img" aria-label={`Daily sales for the last 14 days. This week ${naira(week)}.`}>
        {daily.data.map((value, index) => {
          const isToday = index === daily.data.length - 1;
          const thisWeek = index >= daily.data.length - 7;
          return (
            <div
              key={index}
              title={naira(value)}
              className={cx("flex-1 rounded-[10px]", isToday ? "bg-app-accent" : thisWeek ? "bg-app-ink" : "bg-app-track")}
              style={{ height: `${Math.max(6, (value / max) * 100)}%` }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-app-ink-soft">
        <span>{firstLabel}</span>
        <span>Today</span>
      </div>
    </Card>
  );
}

export default async function HomePage() {
  const user = await requireRole(["seller"], "/login");

  // Resume mid-onboarding if the user hasn't finished setup.
  const onboardingStore = await db.store.findUnique({
    where: { userId: user.id },
    select: { onboardingState: true, firstDashboardVisitComplete: true },
  });
  if (!onboardingStore?.firstDashboardVisitComplete) {
    const state = onboardingStore?.onboardingState;
    if (!state || state === "NEW" || state === "BUILDING_REX") redirect("/onboarding/rex");
    if (state === "BUILDING_TEMPLATE") redirect("/builder/templates?onboarding=true");
  }

  const dashboard = await getSellerDashboard(user.id);
  if (!dashboard) redirect("/onboarding/rex");

  const now = new Date();
  const firstName = user.name.split(/\s+/)[0] || user.name;
  const doneCount = dashboard.checklist.filter((item) => item.done).length;
  const storeHost = dashboard.store.url?.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <AppFrame
      role="seller"
      storeName={dashboard.store.name}
      storeSlug={storeHost}
      storeInitial={dashboard.store.name.charAt(0).toUpperCase()}
      storeLogoUrl={dashboard.store.logoUrl}
      userName={user.name}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div className="mx-auto grid max-w-[1180px] gap-5 px-4 py-6 font-app text-app-ink sm:px-7 xl:grid-cols-[minmax(0,1fr)_405px]">
        {/* Hero */}
        <Card className="app-wash relative overflow-hidden p-6 sm:p-7">
          <div className="text-[14px] text-app-ink-soft">{lagosDate(now)}</div>
          <h1 className="mb-0 mt-3 text-[34px] font-medium leading-[1.05] tracking-[-1px] sm:text-[42px]">
            {lagosGreeting(now)}, {firstName}.
            <br />
            <span className="font-extrabold">{naira(dashboard.sales.today)} sold today.</span>
          </h1>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link href="/products/new" className="inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white no-underline">Add product</Link>
            <Link href="/home/orders/new" className="inline-flex min-h-[44px] items-center rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink no-underline">Record a sale</Link>
            <Link href="/marketplace" className="inline-flex min-h-[44px] items-center rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink no-underline">Find stock</Link>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Stat label="Orders" value={dashboard.counts.ordersToday} />
            <Stat label="Visitors" value={dashboard.counts.visitorsToday} />
            <Stat label="Chats" value={dashboard.counts.chatsToday} />
          </div>
        </Card>

        {/* Peggy's brief */}
        <section className="rounded-[22px] bg-app-mint p-5">
          <div className="mb-4 flex items-center gap-3">
            <Mascot name="peggy" className="h-12 w-12" alt="Peggy" />
            <div>
              <h2 className="m-0 text-[17px] font-extrabold">Peggy&apos;s brief</h2>
              <div className="text-[13px] text-app-ink-soft">
                {dashboard.tasks.length ? `${dashboard.tasks.length} thing${dashboard.tasks.length === 1 ? "" : "s"} need you today` : "Nothing needs you right now"}
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            {dashboard.tasks.map((task) => (
              <Link key={task.key} href={task.href} className="flex min-h-[56px] items-center gap-3 rounded-[16px] bg-white px-4 py-2.5 text-app-ink no-underline hover:shadow-sm">
                {task.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={task.image} alt="" className="h-9 w-9 rounded-[10px] object-cover" />
                ) : (
                  <Icon name={TASK_ICON[task.icon]} size={18} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-extrabold">{task.title}</span>
                  <span className="block truncate text-[12.5px] text-app-ink-soft">{task.hint}</span>
                </span>
                {task.action ? (
                  <span className="rounded-full bg-app-ink px-3.5 py-2 text-[13px] font-extrabold text-white">{task.action.label}</span>
                ) : (
                  <Icon name="chevRight" size={16} className="text-app-ink-soft" />
                )}
              </Link>
            ))}
            {!dashboard.tasks.length && (
              <div className="rounded-[16px] bg-white px-4 py-3 text-[13.5px] text-app-ink-soft">
                No unread messages, every paid order is on its way and stock looks healthy.
              </div>
            )}
          </div>
        </section>

        <SalesChart daily={dashboard.daily} week={dashboard.sales.week} change={dashboard.sales.weekChange} />

        {/* Finish setting up */}
        <Card className="p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 text-[17px] font-extrabold">Finish setting up</h2>
            <span className="text-[13px] text-app-ink-soft">{doneCount} of {dashboard.checklist.length}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-app-canvas">
            <div className="h-full rounded-full bg-app-success" style={{ width: `${(doneCount / Math.max(1, dashboard.checklist.length)) * 100}%` }} />
          </div>
          <ul className="m-0 mt-1 list-none divide-y divide-app-line p-0">
            {dashboard.checklist.map((item) => (
              <li key={item.key} className="flex min-h-[48px] items-center gap-3 py-2">
                {item.done ? <Icon name="check" size={16} className="text-app-success" /> : <span className="h-4 w-4 rounded-full border-2 border-app-toggle-off" />}
                <span className={cx("flex-1 text-[14px]", item.done ? "text-app-ink-soft line-through" : "font-semibold")}>{item.label}</span>
                {!item.done && (
                  <Link href={item.href} className="rounded-full border border-app-line px-3.5 py-1.5 text-[13px] font-extrabold text-app-ink no-underline hover:border-app-line-strong">
                    Set up
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {/* Latest orders */}
        <Card className="overflow-hidden">
          <div className="flex items-baseline justify-between px-5 pb-3 pt-5">
            <h2 className="m-0 text-[17px] font-extrabold">Latest orders</h2>
            <Link href="/home/orders" className="text-[14px] font-extrabold text-app-accent-ink no-underline">All orders</Link>
          </div>
          {dashboard.latestOrders.length ? (
            <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
              {dashboard.latestOrders.map((order) => (
                <li key={order.id}>
                  <Link href={`/home/orders/${order.id}`} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 text-app-ink no-underline hover:bg-app-canvas sm:grid-cols-[40px_minmax(0,1.2fr)_minmax(0,1fr)_auto_auto]">
                    {order.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={order.image} alt="" className="h-10 w-10 rounded-[10px] object-cover" />
                    ) : (
                      <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-app-canvas text-[13px] font-extrabold">{order.buyer.charAt(0).toUpperCase()}</span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-extrabold">{order.buyer}</span>
                      <span className="block truncate text-[12.5px] text-app-ink-soft">{order.summary}</span>
                    </span>
                    <span className="hidden min-w-0 items-center gap-2 text-[13px] font-semibold sm:flex">
                      <span className={cx("h-2 w-2 shrink-0 rounded-full", TONE_DOT[order.stage.tone])} />
                      <span className="truncate">{order.stage.label}</span>
                    </span>
                    <span className={cx("hidden rounded-full px-2.5 py-1 text-[12px] font-bold sm:inline-block", TONE_BADGE[order.payment.tone])}>{order.payment.label}</span>
                    <span className="text-right text-[14px] font-extrabold">{naira(order.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-t border-app-line px-5 py-8 text-center text-[14px] text-app-ink-soft">
              No orders yet. Share your shop link on WhatsApp to get the first one.
            </div>
          )}
        </Card>

        <div className="grid content-start gap-5">
          {/* Where orders come from */}
          <Card className="p-5">
            <h2 className="m-0 text-[17px] font-extrabold">Where orders come from</h2>
            {dashboard.sources.length ? (
              <div className="mt-3 grid gap-3.5">
                {dashboard.sources.map((source) => (
                  <div key={source.channel}>
                    <div className="flex justify-between text-[14px]">
                      <span className="font-bold">{source.label}</span>
                      <span className="text-app-ink-soft">{source.count} order{source.count === 1 ? "" : "s"}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-app-canvas">
                      <div className={cx("h-full rounded-full", CHANNEL_BAR[source.channel])} style={{ width: `${source.share * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-0 mt-2 text-[13.5px] leading-[1.5] text-app-ink-soft">
                Share your link from the app (WhatsApp, Instagram) and orders from the last 30 days show up here by channel.
              </p>
            )}
          </Card>

          {dashboard.imports.length > 0 && (
            <Link href="/home/dropship" className="flex items-center gap-3 rounded-[22px] border border-app-line bg-white p-4 text-app-ink no-underline hover:border-app-line-strong">
              <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-app-peach text-app-accent-ink"><Icon name="truck" size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold">{dashboard.imports.length} import{dashboard.imports.length === 1 ? "" : "s"} on the way</span>
                <span className="block truncate text-[13px] text-app-ink-soft">{dashboard.imports[0].product} from {dashboard.imports[0].supplier}</span>
              </span>
              <Icon name="chevRight" size={16} className="text-app-ink-soft" />
            </Link>
          )}
        </div>

        {/* Selling fast */}
        <section className="xl:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="m-0 text-[17px] font-extrabold">Selling fast</h2>
            <Link href="/products" className="text-[14px] font-extrabold text-app-accent-ink no-underline">All products</Link>
          </div>
          {dashboard.sellingFast.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {dashboard.sellingFast.map((product) => (
                <Link key={product.id} href={`/products/${product.id}`} className="overflow-hidden rounded-[18px] border border-app-line bg-white text-app-ink no-underline hover:border-app-line-strong">
                  <div className="relative aspect-square bg-app-canvas">
                    {product.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image} alt="" className="h-full w-full object-cover" />
                    )}
                    <span className={cx("absolute left-2 top-2 rounded-full px-2.5 py-1 text-[11.5px] font-bold", product.stock.low ? "bg-app-peach text-app-accent-ink" : "bg-white text-app-ink")}>{product.stock.label}</span>
                  </div>
                  <div className="p-3">
                    <div className="truncate text-[14px] font-extrabold">{product.name}</div>
                    <div className="mt-0.5 flex justify-between text-[13px]">
                      <span className="font-bold">{naira(product.price)}</span>
                      <span className="text-app-ink-soft">{product.sold} sold</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="px-5 py-6 text-center text-[14px] text-app-ink-soft">Your best sellers show up here after the first sales.</Card>
          )}
        </section>
      </div>
    </AppFrame>
  );
}
