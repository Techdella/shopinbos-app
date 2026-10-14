import { AppPage, Card, CardHead, Pill, PillLink, SplitLayout } from "@/components/app-kit";
import { sellerFrame, timeAgo } from "@/components/seller-core";
import { db } from "@/lib/db/client";
import { storeChannelReadiness } from "@/lib/reviews/requests";
import { getReviewSettings, reviewUrls } from "@/lib/reviews/server";
import { RequestForm, type RequestableOrder } from "../_components/RequestForm";
import { SettingsForm } from "../_components/SettingsForm";
import { ReviewTabs, reviewsContext } from "../_components/shared";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatDate } from "@shared/i18n";

export const dynamic = "force-dynamic";

const STATUS_TONE = { sent: "info", opened: "warning", completed: "success", failed: "danger", pending: "muted" } as const;

export default async function RequestReviewsPage() {
  const { user, store } = await reviewsContext();
  const t = await getT("reviews");
  const locale = await getLocale();
  const CHANNEL_LABEL: Record<string, string> = { email: t("req.email"), sms: "SMS", whatsapp: "WhatsApp", link: t("ask.yourWhatsApp") };
  const since = new Date(Date.now() - 120 * 86_400_000);
  const [settings, orders, requests] = await Promise.all([
    getReviewSettings(store.id),
    db.retailOrder.findMany({
      where: { storeId: store.id, status: { in: ["paid", "processing", "packed", "shipped", "delivered"] }, createdAt: { gte: since } },
      orderBy: [{ deliveredAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 300,
      select: { id: true, orderNumber: true, buyerName: true, buyerEmail: true, buyerPhone: true, status: true, createdAt: true, deliveredAt: true },
    }),
    db.reviewRequest.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 500 }).catch(() => []),
  ]);
  const reviewedRows = orders.length
    ? await db.$queryRawUnsafe<Array<{ orderId: string }>>(`SELECT DISTINCT "orderId" FROM "ProductReview" WHERE "storeId" = $1 AND "orderId" = ANY($2)`, store.id, orders.map((o) => o.id)).catch(() => [])
    : [];
  const reviewed = new Set(reviewedRows.map((row) => row.orderId));
  const lastAsked = new Map<string, (typeof requests)[number]>();
  for (const request of requests) if (!lastAsked.has(request.orderId) && request.status !== "failed") lastAsked.set(request.orderId, request);

  const rows: RequestableOrder[] = orders.map((order) => {
    const asked = lastAsked.get(order.id);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.buyerName,
      contact: [order.buyerEmail, order.buyerPhone].filter(Boolean).join(" · "),
      hasEmail: Boolean(order.buyerEmail?.includes("@")),
      hasPhone: Boolean(order.buyerPhone),
      status: t.dynamic(`orderStatus.${order.status}`, order.status === "delivered" ? "Delivered" : order.status.charAt(0).toUpperCase() + order.status.slice(1)),
      date: locale === "en" ? new Date(order.deliveredAt ?? order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }) : formatDate(order.deliveredAt ?? order.createdAt, locale, { day: "numeric", month: "short" }),
      asked: asked ? `${CHANNEL_LABEL[asked.channel] ?? asked.channel}, ${timeAgo(asked.createdAt, Date.now(), locale)}` : null,
      reviewed: reviewed.has(order.id),
    };
  });

  const ready = await storeChannelReadiness(store.id);
  const sentCount = requests.filter((r) => ["sent", "opened", "completed"].includes(r.status)).length;
  const completed = requests.filter((r) => r.status === "completed").length;

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={t("tabs.ask")}
      sub={t("ask.sub")}
      actions={<PillLink href="/home/reviews" icon="arrowLeft">{t("tabs.all")}</PillLink>}
    >
      <ReviewTabs active="/home/reviews/request" />
      {!ready.links ? (
        <div className="mb-5 rounded-[18px] bg-app-danger-tint px-4 py-3 text-[14px] text-app-danger">{t("ask.noLinks")}</div>
      ) : null}
      <SplitLayout
        main={
          <Card className="p-5 sm:p-6">
            <CardHead title={t("ask.now")} sub={t("ask.nowSub")} />
            <div className="mt-4">
              <RequestForm orders={rows} ready={ready} />
            </div>
          </Card>
        }
        side={
          <>
            <Card className="p-5">
              <CardHead title={t("ask.automatic")} />
              <div className="mt-4">
                <SettingsForm initial={settings} ready={ready} />
              </div>
            </Card>
            <Card className="p-5">
              <CardHead title={t("ask.how")} />
              <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-[14px]">
                {(["email", "sms", "whatsapp"] as const).map((channel) => (
                  <li key={channel} className="flex items-center justify-between gap-3">
                    <span className="font-bold">{CHANNEL_LABEL[channel]}</span>
                    <Pill tone={ready[channel] ? "success" : "muted"}>{ready[channel] ? t("ask.ready") : t("ask.notSetUp")}</Pill>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3"><span className="font-bold">{t("ask.fromYourWhatsApp")}</span><Pill tone="success">{t("ask.alwaysWorks")}</Pill></li>
              </ul>
              <p className="m-0 mt-3 text-[12.5px] leading-[1.5] text-app-ink-soft">{t("ask.howNote", { wa: ready.ownWhatsapp ? t("ask.waConnected") : t("ask.waNotConnected"), sms: ready.ownSms ? t("ask.smsConnected") : t("ask.smsNotConnected") })}</p>
              <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">{t("ask.wall")} <a href={reviewUrls(store.slug).wall} target="_blank" rel="noopener noreferrer" className="font-bold text-app-accent-ink">{t("ask.open")}</a></p>
            </Card>
            <Card className="p-5">
              <CardHead title={t("ask.recent")} sub={t("ask.recentSub", { sent: sentCount, completed })} />
              {requests.length ? (
                <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                  {requests.slice(0, 12).map((request) => (
                    <li key={request.id} className="flex items-center justify-between gap-3 text-[13.5px]">
                      <span className="min-w-0 truncate"><span className="font-bold">{request.customerName}</span> · {CHANNEL_LABEL[request.channel] ?? request.channel} · {timeAgo(request.createdAt, Date.now(), locale)}</span>
                      <Pill tone={STATUS_TONE[request.status as keyof typeof STATUS_TONE] ?? "muted"}>{request.status === "completed" ? t("req.reviewed") : t.dynamic(`reqStatus.${request.status}`, request.status.charAt(0).toUpperCase() + request.status.slice(1))}</Pill>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 mt-2 text-[14px] text-app-ink-soft">{t("ask.noRequests")}</p>
              )}
            </Card>
          </>
        }
      />
    </AppPage>
  );
}
