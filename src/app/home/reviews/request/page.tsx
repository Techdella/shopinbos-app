import { AppPage, Card, CardHead, Pill, PillLink, SplitLayout } from "@/components/app-kit";
import { sellerFrame, timeAgo } from "@/components/seller-core";
import { db } from "@/lib/db/client";
import { storeChannelReadiness } from "@/lib/reviews/requests";
import { getReviewSettings, reviewUrls } from "@/lib/reviews/server";
import { RequestForm, type RequestableOrder } from "../_components/RequestForm";
import { SettingsForm } from "../_components/SettingsForm";
import { ReviewTabs, reviewsContext } from "../_components/shared";

export const dynamic = "force-dynamic";

const STATUS_TONE = { sent: "info", opened: "warning", completed: "success", failed: "danger", pending: "muted" } as const;
const CHANNEL_LABEL: Record<string, string> = { email: "Email", sms: "SMS", whatsapp: "WhatsApp", link: "Your WhatsApp" };

export default async function RequestReviewsPage() {
  const { user, store } = await reviewsContext();
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
      status: order.status === "delivered" ? "Delivered" : order.status.charAt(0).toUpperCase() + order.status.slice(1),
      date: new Date(order.deliveredAt ?? order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }),
      asked: asked ? `${CHANNEL_LABEL[asked.channel] ?? asked.channel}, ${timeAgo(asked.createdAt)}` : null,
      reviewed: reviewed.has(order.id),
    };
  });

  const ready = await storeChannelReadiness(store.id);
  const sentCount = requests.filter((r) => ["sent", "opened", "completed"].includes(r.status)).length;
  const completed = requests.filter((r) => r.status === "completed").length;

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title="Ask for reviews"
      sub="Buyers get a link to rate every item in their order, with photos. No sign-in needed."
      actions={<PillLink href="/home/reviews" icon="arrowLeft">All reviews</PillLink>}
    >
      <ReviewTabs active="/home/reviews/request" />
      {!ready.links ? (
        <div className="mb-5 rounded-[18px] bg-app-danger-tint px-4 py-3 text-[14px] text-app-danger">Review links can&apos;t be made: set REVIEW_LINK_SECRET (or SUPABASE_SERVICE_ROLE_KEY) on the server.</div>
      ) : null}
      <SplitLayout
        main={
          <Card className="p-5 sm:p-6">
            <CardHead title="Ask buyers now" sub="Pick orders and how to reach them. Each buyer gets their own review link." />
            <div className="mt-4">
              <RequestForm orders={rows} ready={ready} />
            </div>
          </Card>
        }
        side={
          <>
            <Card className="p-5">
              <CardHead title="Automatic requests" />
              <div className="mt-4">
                <SettingsForm initial={settings} ready={ready} />
              </div>
            </Card>
            <Card className="p-5">
              <CardHead title="How you can send" />
              <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-[14px]">
                {(["email", "sms", "whatsapp"] as const).map((channel) => (
                  <li key={channel} className="flex items-center justify-between gap-3">
                    <span className="font-bold">{CHANNEL_LABEL[channel]}</span>
                    <Pill tone={ready[channel] ? "success" : "muted"}>{ready[channel] ? "Ready" : "Not set up"}</Pill>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3"><span className="font-bold">From your WhatsApp</span><Pill tone="success">Always works</Pill></li>
              </ul>
              <p className="m-0 mt-3 text-[12.5px] leading-[1.5] text-app-ink-soft">Email uses Resend. SMS and WhatsApp go from your own number when you connected it in the inbox ({ready.ownWhatsapp ? "WhatsApp connected" : "WhatsApp not connected"}, {ready.ownSms ? "SMS connected" : "SMS not connected"}), otherwise from the platform&apos;s SendChamp or Africa&apos;s Talking account. WhatsApp only delivers free-form messages to buyers who messaged you in the last 24 hours; others need an approved template.</p>
              <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">Reviews wall: <a href={reviewUrls(store.slug).wall} target="_blank" rel="noopener noreferrer" className="font-bold text-app-accent-ink">open</a></p>
            </Card>
            <Card className="p-5">
              <CardHead title="Recent requests" sub={`${sentCount} sent · ${completed} reviewed`} />
              {requests.length ? (
                <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                  {requests.slice(0, 12).map((request) => (
                    <li key={request.id} className="flex items-center justify-between gap-3 text-[13.5px]">
                      <span className="min-w-0 truncate"><span className="font-bold">{request.customerName}</span> · {CHANNEL_LABEL[request.channel] ?? request.channel} · {timeAgo(request.createdAt)}</span>
                      <Pill tone={STATUS_TONE[request.status as keyof typeof STATUS_TONE] ?? "muted"}>{request.status === "completed" ? "Reviewed" : request.status.charAt(0).toUpperCase() + request.status.slice(1)}</Pill>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 mt-2 text-[14px] text-app-ink-soft">No requests yet.</p>
              )}
            </Card>
          </>
        }
      />
    </AppPage>
  );
}
