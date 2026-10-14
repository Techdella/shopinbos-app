import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppFrame } from "@/components/shell/AppFrame";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Mascot } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { cookies } from "next/headers";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { getSellerDashboard, type SellerDashboard } from "@/lib/dashboard";
import { START_SEEN_COOKIE } from "@/lib/setup/checklist";
import { getSetupOverview, syncStartNav } from "@/lib/setup/server";
import type { Tone } from "@/lib/dashboard/compute";
import { formatDate, formatMoney, formatNumber, type Locale } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { isPeggyNight } from "@shared/mascots";
import type { OrderChannel } from "@shared/channels";

// Seller home, following the 2026 "Seller app · web" mockup.

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("home");
  return { title: t("metaTitle") };
}

type HomeT = Awaited<ReturnType<typeof getT<["home", "orders", "common"]>>>;

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
  google: "bg-[#4285F4]",
  email: "bg-app-accent",
  online_store: "bg-app-forest",
  in_person: "bg-[#F2A93B]",
};

const TASK_ICON: Record<SellerDashboard["tasks"][number]["icon"], IconName> = {
  chat: "chat",
  mail: "mail",
  truck: "truck",
  box: "box",
  coin: "coin",
};

function lagosGreeting(now: Date, t: HomeT) {
  const hour = (now.getUTCHours() + 1) % 24;
  return hour < 12 ? t("greeting.morning") : hour < 17 ? t("greeting.afternoon") : t("greeting.evening");
}

function lagosDate(now: Date, locale: Locale) {
  return formatDate(now, locale, { weekday: "long", day: "numeric", month: "long" });
}

function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={cx("rounded-[22px] border border-app-line bg-white", className)}>{children}</section>;
}

function Stat({ label, value, locale }: { label: string; value: number; locale: Locale }) {
  return (
    <div className="min-w-[96px] rounded-[16px] px-4 py-3">
      <div className="text-[13px] text-app-ink-soft">{label}</div>
      <div className="mt-0.5 text-[28px] font-extrabold leading-none tracking-[-0.5px]">{formatNumber(value, locale)}</div>
    </div>
  );
}

function SalesChart({ daily, week, change, t, naira }: { daily: SellerDashboard["daily"]; week: number; change: number | null; t: HomeT; naira: (amount: number) => string }) {
  const max = Math.max(1, ...daily.data);
  const firstLabel = daily.labels.find(Boolean) ?? "";
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[17px] font-extrabold">{t("sales.title")}</h2>
        <span className="text-[13px] text-app-ink-soft">
          {t("sales.thisWeek", { amount: naira(week) })}{change !== null && ` · ${change >= 0 ? t("sales.up", { percent: Math.abs(change) }) : t("sales.down", { percent: Math.abs(change) })}`}
        </span>
      </div>
      <div className="mt-5 flex h-[180px] items-end gap-2" role="img" aria-label={t("sales.aria", { amount: naira(week) })}>
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
        <span>{t("time.today")}</span>
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

  const [dashboard, setup] = await Promise.all([getSellerDashboard(user.id), getSetupOverview(user.id)]);
  if (!dashboard) redirect("/onboarding/rex");
  // New sellers land on Start here (once per visit) until their checklist is done or dismissed.
  if (setup?.checklist.showStart && !(await cookies()).get(START_SEEN_COOKIE)) redirect("/home/start");
  // Setup finished elsewhere (or dismissed): take "Start here" out of the menu. Writes only when it changes.
  if (setup && !setup.checklist.showStart) await syncStartNav(user.id, false).catch(() => undefined);

  const t = await getT("home", "orders", "common");
  const locale = await getLocale();
  const naira = (amount: number) => formatMoney(Math.round(amount), locale);
  const now = new Date();
  const firstName = user.name.split(/\s+/)[0] || user.name;
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
      <div className="grid w-full gap-5 px-4 py-6 font-app text-app-ink sm:px-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:px-8 2xl:grid-cols-[minmax(0,1fr)_480px] 2xl:px-10">
        {/* Hero */}
        <Card className="app-wash relative overflow-hidden p-6 sm:p-7">
          <div className="text-[14px] text-app-ink-soft">{lagosDate(now, locale)}</div>
          <h1 className="mb-0 mt-3 text-[34px] font-medium leading-[1.05] tracking-[-1px] sm:text-[42px]">
            {t("greeting.line", { greeting: lagosGreeting(now, t), name: firstName })}
            <br />
            <span className="font-extrabold">{t("soldToday", { amount: naira(dashboard.sales.today) })}</span>
          </h1>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link href="/products/new" className="inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white no-underline">{t("addProduct")}</Link>
            <Link href="/home/orders/new" className="inline-flex min-h-[44px] items-center rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink no-underline">{t("recordSale")}</Link>
            <Link href="/marketplace" className="inline-flex min-h-[44px] items-center rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink no-underline">{t("findStock")}</Link>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Stat label={t("stat.orders")} value={dashboard.counts.ordersToday} locale={locale} />
            <Stat label={t("stat.visitors")} value={dashboard.counts.visitorsToday} locale={locale} />
            <Stat label={t("stat.chats")} value={dashboard.counts.chatsToday} locale={locale} />
          </div>
        </Card>

        {/* Peggy's brief */}
        <section className="rounded-[22px] bg-app-mint p-5">
          <div className="mb-4 flex items-center gap-3">
            <Mascot name="peggy" mood={isPeggyNight() ? "sleep" : "idle"} className="h-12 w-12" alt="Peggy" />
            <div>
              <h2 className="m-0 text-[17px] font-extrabold">{t("brief.title")}</h2>
              <div className="text-[13px] text-app-ink-soft">
                {dashboard.tasks.length ? t("brief.count", { count: dashboard.tasks.length }) : t("brief.nothing")}
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
                {t("brief.allGood")}
              </div>
            )}
          </div>
        </section>

        <SalesChart daily={dashboard.daily} week={dashboard.sales.week} change={dashboard.sales.weekChange} t={t} naira={naira} />

        {/* Finish setting up: a compact link back to Start here while steps are left */}
        {setup && !setup.checklist.complete ? (
          <Link href="/home/start" className="flex items-center gap-4 rounded-[22px] border border-app-line bg-white p-5 text-app-ink no-underline hover:border-app-line-strong">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name="flag" size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[16px] font-extrabold">{t("setup.title")}</span>
                <span className="shrink-0 text-[13px] text-app-ink-soft">{t("setup.progress", { done: setup.checklist.done, total: setup.checklist.total })}</span>
              </span>
              <span className="mt-2 block h-2 overflow-hidden rounded-full bg-app-canvas">
                <span className="block h-full rounded-full bg-app-success" style={{ width: `${setup.checklist.percent}%` }} />
              </span>
              {setup.checklist.next && <span className="mt-2 block truncate text-[13px] text-app-ink-soft">{t("setup.next", { title: setup.checklist.next.title })}</span>}
            </span>
            <Icon name="chevRight" size={16} className="shrink-0 text-app-ink-soft" />
          </Link>
        ) : (
          <Card className="flex items-center gap-4 p-5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-app-success-tint text-app-success"><Icon name="shop" size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-extrabold">{t("yourShop")}</span>
              <span className="block truncate text-[13px] text-app-ink-soft">{storeHost ?? dashboard.store.name}</span>
            </span>
            <Link href="/home/store" className="shrink-0 rounded-full border border-app-line px-3.5 py-2 text-[13px] font-extrabold text-app-ink no-underline hover:border-app-line-strong">{t("manage")}</Link>
          </Card>
        )}

        {/* Latest orders */}
        <Card className="overflow-hidden">
          <div className="flex items-baseline justify-between px-5 pb-3 pt-5">
            <h2 className="m-0 text-[17px] font-extrabold">{t("latestOrders")}</h2>
            <Link href="/home/orders" className="text-[14px] font-extrabold text-app-accent-ink no-underline">{t("allOrders")}</Link>
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
                      <span className="truncate">{t.dynamic(`stage.${order.stage.label}`, order.stage.label)}</span>
                    </span>
                    <span className={cx("hidden rounded-full px-2.5 py-1 text-[12px] font-bold sm:inline-block", TONE_BADGE[order.payment.tone])}>{t.dynamic(`pay.${order.payment.label}`, order.payment.label)}</span>
                    <span className="text-right text-[14px] font-extrabold">{naira(order.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-t border-app-line px-5 py-8 text-center text-[14px] text-app-ink-soft">
              {t("noOrders")}
            </div>
          )}
        </Card>

        <div className="grid content-start gap-5">
          {/* Where orders come from */}
          <Card className="p-5">
            <h2 className="m-0 text-[17px] font-extrabold">{t("sources.title")}</h2>
            {dashboard.sources.length ? (
              <div className="mt-3 grid gap-3.5">
                {dashboard.sources.map((source) => (
                  <div key={source.channel}>
                    <div className="flex justify-between text-[14px]">
                      <span className="font-bold">{t.dynamic(`channel.${source.label}`, source.label)}</span>
                      <span className="text-app-ink-soft">{t("count.orders", { count: source.count })}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-app-canvas">
                      <div className={cx("h-full rounded-full", CHANNEL_BAR[source.channel])} style={{ width: `${source.share * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-0 mt-2 text-[13.5px] leading-[1.5] text-app-ink-soft">
                {t("sources.empty")}
              </p>
            )}
          </Card>

          {dashboard.imports.length > 0 && (
            <Link href="/home/dropship" className="flex items-center gap-3 rounded-[22px] border border-app-line bg-white p-4 text-app-ink no-underline hover:border-app-line-strong">
              <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-app-peach text-app-accent-ink"><Icon name="truck" size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold">{t("imports.onTheWay", { count: dashboard.imports.length })}</span>
                <span className="block truncate text-[13px] text-app-ink-soft">{t("imports.from", { product: dashboard.imports[0].product, supplier: dashboard.imports[0].supplier })}</span>
              </span>
              <Icon name="chevRight" size={16} className="text-app-ink-soft" />
            </Link>
          )}
        </div>

        {/* Selling fast */}
        <section className="xl:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="m-0 text-[17px] font-extrabold">{t("sellingFast")}</h2>
            <Link href="/products" className="text-[14px] font-extrabold text-app-accent-ink no-underline">{t("allProducts")}</Link>
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
                    <span className={cx("absolute left-2 top-2 rounded-full px-2.5 py-1 text-[11.5px] font-bold", product.stock.low ? "bg-app-peach text-app-accent-ink" : "bg-white text-app-ink")}>{t.dynamic(`stock.${product.stock.label}`, product.stock.label)}</span>
                  </div>
                  <div className="p-3">
                    <div className="truncate text-[14px] font-extrabold">{product.name}</div>
                    <div className="mt-0.5 flex justify-between text-[13px]">
                      <span className="font-bold">{naira(product.price)}</span>
                      <span className="text-app-ink-soft">{t("sold", { count: product.sold })}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="px-5 py-6 text-center text-[14px] text-app-ink-soft">{t("sellingFastEmpty")}</Card>
          )}
        </section>
      </div>
    </AppFrame>
  );
}
