import "server-only";
import { db } from "@/lib/db/client";

// Open jobs per rider, for the web rider picker (components/logistics/dispatch.tsx): busy riders go after free ones.

export async function withOpenJobs<T extends { id: string }>(partnerId: string, riders: T[]): Promise<Array<T & { openJobs: number }>> {
  if (!riders.length) return [];
  const open = await db.deliveryBooking.groupBy({
    by: ["riderId"],
    where: { logisticsPartnerId: partnerId, status: { in: ["confirmed", "picked_up", "in_transit", "out_for_delivery"] }, riderId: { not: null } },
    _count: { _all: true },
  });
  const openBy = new Map(open.map((row) => [row.riderId, row._count._all]));
  return riders.map((rider) => ({ ...rider, openJobs: openBy.get(rider.id) ?? 0 }));
}
