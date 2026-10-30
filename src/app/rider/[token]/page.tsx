import type { Metadata, Viewport } from "next";
import { db } from "@/lib/db/client";
import { addressLines } from "@/lib/labels";
import { lagosStartOfToday, packageSummary } from "@/components/logistics/kit";
import { cashToPayIn, riderAmount } from "@/lib/logistics/job-rules";
import { riderFromToken } from "@/lib/logistics/rider-session";
import { riderWeek } from "@/lib/logistics/rider-app.server";
import { toE164 } from "@shared/phone";
import { RiderApp, type RiderRun, type RiderWeek } from "./RiderApp";
import { pickupWindowText } from "@shared/supplier-pickup";
import { getT } from "@/lib/i18n/server";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { isPayOnDelivery, payAtDoorPaid } from "@shared/pay-at-door";
import { doorAmountNaira } from "@/lib/commerce/pay-at-door.server";

// Shopinbos Riders app: a phone-first page the partner shares as a private link. No account, no login.

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("rider");
  return {
    // "Riders · Shopinbos Business" through the root title template.
    title: "Riders",
    description: t("meta.description"),
    robots: { index: false, follow: false },
    // The link itself is the credential: never send it to the sites a rider opens from here (WhatsApp, maps).
    referrer: "no-referrer",
    appleWebApp: { capable: true, title: "Riders", statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F6F5F9",
};

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const lagosDayNumber = (at: Date) => Math.floor((at.getTime() + LAGOS_OFFSET_MS) / DAY_MS);

/** Earnings tab: Monday-to-Sunday bars (today's index), and the week's deliveries under Today, Yesterday and Earlier. */
function weekView(week: Awaited<ReturnType<typeof riderWeek>>, now = new Date()): RiderWeek {
  const today = lagosDayNumber(now);
  const todayIndex = (new Date(now.getTime() + LAGOS_OFFSET_MS).getUTCDay() + 6) % 7; // Monday = 0
  const bars = [0, 0, 0, 0, 0, 0, 0];
  const groups: RiderWeek["groups"] = [];
  for (const job of week.deliveries) {
    const at = new Date(job.deliveredAt);
    const ago = today - lagosDayNumber(at);
    if (ago >= 0 && ago <= todayIndex) bars[todayIndex - ago] += 1;
    const group = ago <= 0 ? "today" : ago === 1 ? "yesterday" : "earlier";
    let entry = groups.find((item) => item.group === group);
    if (!entry) groups.push((entry = { group, items: [] }));
    entry.items.push({ id: job.id, from: job.from, to: job.to, time: new Date(at.getTime() + LAGOS_OFFSET_MS).toISOString().slice(11, 16), amount: job.amount });
  }
  return { total: week.total, count: week.count, bars, today: todayIndex, groups };
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh bg-app-canvas font-app text-app-ink">{children}</main>;
}

export default async function RiderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await riderFromToken(token);
  const t = await getT("rider", "logistics");

  if (!session.ok) {
    return (
      <Shell>
        <div className="mx-auto grid min-h-dvh w-full max-w-[560px] content-center gap-3 px-5 py-10 text-center">
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.02em]">
            {session.reason === "limited" ? t("link.slowDown") : t("link.broken")}
          </h1>
          <p className="m-0 text-[16px] leading-[1.5] text-app-ink-soft">
            {session.reason === "limited"
              ? t("link.slowDownBody")
              : t("link.brokenBody")}
          </p>
        </div>
      </Shell>
    );
  }

  const rider = session.rider;
  const startOfToday = lagosStartOfToday();
  const [active, doneToday, cashJobs, week] = await Promise.all([
    db.deliveryBooking.findMany({
      where: { riderId: rider.id, logisticsPartnerId: rider.partnerId, status: { in: ["confirmed", "picked_up", "in_transit", "out_for_delivery"] } },
      orderBy: { createdAt: "asc" },
      take: 60,
      select: {
        id: true, status: true, sellerId: true, orderId: true, pickupLocation: true, destination: true, packageDetails: true,
        deliveryFee: true, platformFee: true, netAmount: true, codAmount: true, pickupWindowStart: true, pickupWindowEnd: true, service: true,
        seller: { select: { name: true, store: { select: { name: true } } } },
      },
    }),
    db.deliveryBooking.findMany({
      where: { riderId: rider.id, logisticsPartnerId: rider.partnerId, status: "delivered", deliveredAt: { gte: startOfToday } },
      select: { deliveryFee: true, platformFee: true, netAmount: true, riderPay: true },
    }),
    db.deliveryBooking.findMany({
      where: { riderId: rider.id, logisticsPartnerId: rider.partnerId, codMethod: "cash", remittanceId: null, codCollected: { not: null } },
      select: { codCollected: true, codMethod: true, remittanceId: true },
    }),
    riderWeek(rider),
  ]);

  // Only what the rider needs at the door: name, phone and address of each buyer on an open job.
  const orderIds = active.map((job) => job.orderId).filter((id): id is string => Boolean(id));
  const orders = orderIds.length
    ? await db.retailOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, buyerName: true, buyerPhone: true, deliveryAddress: true, total: true, paymentMethod: true, status: true, paystackStatus: true, depositPaidAt: true, paymentDueAt: true, paymentSplit: true, store: { select: { slug: true, customDomain: true } } } })
    : [];
  const orderById = new Map(orders.map((order) => [order.id, order]));

  const runs = new Map<string, RiderRun>();
  for (const job of active) {
    const key = `${job.sellerId}|${job.pickupLocation.trim().toLowerCase()}`;
    const run = runs.get(key) ?? {
      key,
      pickupName: job.seller.store?.name ?? job.seller.name,
      pickupAddress: job.pickupLocation,
      pickupWindow: pickupWindowText(job.pickupWindowStart, job.pickupWindowEnd),
      fees: 0,
      drops: [],
    };
    const order = job.orderId ? orderById.get(job.orderId) : undefined;
    const lines = order ? addressLines(order.deliveryAddress) : [];
    const phone = order?.buyerPhone ? toE164(order.buyerPhone) : null;
    run.fees += riderAmount(rider, job);
    run.drops.push({
      id: job.id,
      status: job.status,
      toPickupPoint: job.service === "pickup_point",
      address: lines.length ? lines.join(", ") : job.destination,
      area: job.destination,
      buyerName: order?.buyerName ?? null,
      buyerPhone: phone,
      // Cash only on older jobs that still carry an amount; pay on delivery is paid in the app at the door now.
      collect: job.codAmount && job.codAmount > 0 ? job.codAmount : 0,
      payInApp: order && isPayOnDelivery(order) && !(job.codAmount && job.codAmount > 0)
        ? { amount: doorAmountNaira(order), paid: payAtDoorPaid(order), url: buildStorefrontUrl(order.store, `/order/${order.id}#pay`) }
        : null,
      item: packageSummary(job.packageDetails, t),
    });
    runs.set(key, run);
  }

  return (
    <Shell>
      <RiderApp
        token={token}
        rider={{
          name: rider.name,
          partnerName: rider.partnerName,
          partnerPhone: rider.partnerPhone ? toE164(rider.partnerPhone) : null,
          plate: rider.plate,
          online: rider.online,
        }}
        earnedToday={doneToday.reduce((sum, job) => sum + riderAmount(rider, job), 0)}
        paySet={Boolean(rider.payType)}
        dropsDone={doneToday.length}
        cashInHand={cashToPayIn(cashJobs)}
        runs={[...runs.values()]}
        week={weekView(week)}
      />
    </Shell>
  );
}
