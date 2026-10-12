import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote } from "@/components/app-kit";
import { listSegments } from "@/lib/marketing/segments";
import { SegmentsManager } from "./SegmentsManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Groups of customers" };

export default async function SegmentsPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const [segments, products, tagRows] = store
    ? await Promise.all([
        listSegments(store.id),
        db.storeProduct.findMany({ where: { storeId: store.id, status: { not: "archived" } }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } }),
        db.subscriber.findMany({ where: { storeId: store.id, NOT: { tags: { isEmpty: true } } }, select: { tags: true }, take: 5000 }),
      ])
    : [[], [], []];
  const tags = [...new Set(tagRows.flatMap((row) => row.tags))].sort();

  return (
    <SellerPage user={user} store={storeSummary(store)} title="Groups of customers" sub="Customers grouped by what they spend, buy, where they live and how they joined. Counts are live.">
      <div className="grid gap-5">
        <SegmentsManager
          segments={segments.map((s) => ({ id: s.id, name: s.name, description: s.description, rules: s.rules, summary: s.summary, count: s.count }))}
          products={products}
          tags={tags}
        />
        <AssistantNote>Ask Peggy “make a group of people in Lagos who spent over ₦50,000” and she'll build it for you.</AssistantNote>
      </div>
    </SellerPage>
  );
}
