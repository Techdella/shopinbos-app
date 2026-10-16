import type { Metadata, Viewport } from "next";
import { db } from "@/lib/db/client";
import { addressLines } from "@/lib/labels";
import { bookingNet, lagosStartOfToday, packageSummary } from "@/components/logistics/kit";
import { cashToPayIn } from "@/lib/logistics/job-rules";
import { riderFromToken } from "@/lib/logistics/rider-session";
import { toE164 } from "@shared/phone";
import { addressPoint, directionsUrl } from "@shared/delivery-geo";
import { RiderApp, type RiderRun } from "./RiderApp";
import { pickupWindowText } from "@shared/supplier-pickup";
import { getT } from "@/lib/i18n/server";

// Shopinbos Riders app: a phone-first page the partner shares as a private link. No account, no login.

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("rider");
  return {
    title: "Shopinbos Riders",
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
  const [active, doneToday, cashJobs] = await Promise.all([
    db.deliveryBooking.findMany({
      where: { riderId: rider.id, logisticsPartnerId: rider.partnerId, status: { in: ["confirmed", "picked_up", "in_transit"] } },
      orderBy: { createdAt: "asc" },
      take: 60,
      select: {
        id: true, status: true, sellerId: true, orderId: true, pickupLocation: true, destination: true, packageDetails: true,
        deliveryFee: true, platformFee: true, netAmount: true, codAmount: true, pickupWindowStart: true, pickupWindowEnd: true,
        pickupLat: true, pickupLng: true,
        seller: { select: { name: true, store: { select: { name: true } } } },
      },
    }),
    db.deliveryBooking.findMany({
      where: { riderId: rider.id, logisticsPartnerId: rider.partnerId, status: "delivered", deliveredAt: { gte: startOfToday } },
      select: { deliveryFee: true, platformFee: true, netAmount: true },
    }),
    db.deliveryBooking.findMany({
      where: { riderId: rider.id, logisticsPartnerId: rider.partnerId, codMethod: "cash", remittanceId: null, codCollected: { not: null } },
      select: { codCollected: true, codMethod: true, remittanceId: true },
    }),
  ]);

  // Only what the rider needs at the door: name, phone and address of each buyer on an open job.
  const orderIds = active.map((job) => job.orderId).filter((id): id is string => Boolean(id));
  const orders = orderIds.length
    ? await db.retailOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, buyerName: true, buyerPhone: true, deliveryAddress: true } })
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
      pickupMapUrl: directionsUrl({ point: job.pickupLat !== null && job.pickupLng !== null ? { lat: job.pickupLat, lng: job.pickupLng } : null, address: job.pickupLocation }),
      fees: 0,
      drops: [],
    };
    const order = job.orderId ? orderById.get(job.orderId) : undefined;
    const lines = order ? addressLines(order.deliveryAddress) : [];
    const phone = order?.buyerPhone ? toE164(order.buyerPhone) : null;
    run.fees += bookingNet(job);
    run.drops.push({
      id: job.id,
      status: job.status,
      address: lines.length ? lines.join(", ") : job.destination,
      area: job.destination,
      mapUrl: directionsUrl({ point: order ? addressPoint(order.deliveryAddress) : null, address: lines.length ? lines.join(", ") : job.destination }),
      buyerName: order?.buyerName ?? null,
      buyerPhone: phone,
      collect: job.codAmount && job.codAmount > 0 ? job.codAmount : 0,
      item: packageSummary(job.packageDetails, t),
    });
    runs.set(key, run);
  }

  return (
    <Shell>
      <RiderApp
        token={token}
        rider={{ name: rider.name, partnerName: rider.partnerName, online: rider.online }}
        earnedToday={doneToday.reduce((sum, job) => sum + bookingNet(job), 0)}
        dropsDone={doneToday.length}
        cashInHand={cashToPayIn(cashJobs)}
        runs={[...runs.values()]}
      />
    </Shell>
  );
}
