import "server-only";
import { db } from "@/lib/db/client";

/** How many active riders each delivery company has, shown to sellers and suppliers picking one. */
export async function activeRiderCounts(partnerIds: string[]): Promise<Map<string, number>> {
  if (partnerIds.length === 0) return new Map();
  const rows = await db.logisticsTeamMember.groupBy({
    by: ["logisticsPartnerId"],
    where: { logisticsPartnerId: { in: partnerIds }, role: "rider", status: "active" },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.logisticsPartnerId, row._count._all]));
}
