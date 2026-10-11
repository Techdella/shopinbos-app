import { NextResponse } from "next/server";
import type { Prisma, SubscriberStatus } from "@prisma/client";
import { db } from "@/lib/db/client";
import { toCsv } from "@/lib/csv";
import { marketingRoute } from "@/lib/marketing/api";
import { consentSummary } from "@/lib/marketing/subscribers";

const STATUSES: SubscriberStatus[] = ["active", "unsubscribed", "bounced", "spam"];

// CSV of the list (optionally one status or tag), with how each person agreed.
export const GET = marketingRoute(async ({ req, store }) => {
  const status = req.nextUrl.searchParams.get("status") as SubscriberStatus | null;
  const tag = req.nextUrl.searchParams.get("tag");
  const where: Prisma.SubscriberWhereInput = { storeId: store.id, ...(status && STATUSES.includes(status) ? { status } : {}), ...(tag ? { tags: { has: tag } } : {}) };
  const rows = await db.subscriber.findMany({ where, orderBy: { createdAt: "desc" }, take: 100_000 });
  const csv = toCsv([
    ["email", "name", "phone", "country", "status", "source", "tags", "birthday", "orders", "total_spent", "joined", "unsubscribed_at", "email_consent", "sms_consent", "whatsapp_consent", "consent_at"],
    ...rows.map((row) => {
      const consent = consentSummary(row.metadata);
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      return [
        row.email, row.name ?? "", row.phone ?? "", row.country ?? "", row.status, row.source, row.tags.join("; "), typeof meta.birthday === "string" ? meta.birthday : "",
        row.orderCount, row.totalSpent, row.createdAt.toISOString(), row.unsubscribedAt?.toISOString() ?? "",
        consent ? (consent.email ? "yes" : "no") : "", consent ? (consent.sms ? "yes" : "no") : "", consent ? (consent.whatsapp ? "yes" : "no") : "", consent?.at ?? "",
      ];
    }),
  ]);
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${store.slug}-subscribers.csv"` },
  });
});
