import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { SegmentsManager } from "./SegmentsManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Segments" };

export default async function SegmentsPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const segments = store
    ? await db.customerSegment.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 100 })
    : [];

  return (
    <SellerPage user={user} store={storeSummary(store)} title="Customer segments" sub="Group customers by what they buy, how much they spend, or by hand.">
      <SegmentsManager
        segments={segments.map((segment) => ({
          id: segment.id,
          name: segment.name,
          description: segment.description,
          type: segment.type === "auto" ? "auto" : "manual",
          rules: segment.rules && typeof segment.rules === "object" && Object.keys(segment.rules).length ? JSON.stringify(segment.rules, null, 2) : "",
          subscriberCount: segment.subscriberCount,
        }))}
      />
    </SellerPage>
  );
}
