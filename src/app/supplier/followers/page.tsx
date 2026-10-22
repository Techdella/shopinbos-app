import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage, AssistantNote, Card, CardHead, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { db } from "@/lib/db/client";
import { getT } from "@/lib/i18n/server";
import { supplierPlanLimits } from "@/lib/plan-limits";
import { broadcastsLeft, followerCount } from "@/lib/suppliers/follow.server";
import { BroadcastForm } from "./BroadcastForm";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("supplier"))("fol.title") };
}

// Sellers following this supplier, and updates to them (Supplier Pro).
export default async function SupplierFollowersPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const t = await getT("supplier", "common");
  const [dbUser, followers, left, recent] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
    followerCount(supplier.id),
    broadcastsLeft(supplier.id),
    db.supplierBroadcast.findMany({ where: { supplierId: supplier.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const allowed = supplierPlanLimits(dbUser ?? {}).broadcast;
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

  return (
    <AppPage frame={supplierFrame(user, supplier)} title={t("fol.title")} sub={t("fol.sub")}>
      <div className="grid gap-5">
        <StatGrid>
          <StatTile tone="card" label={t("fol.followers")} value={followers} />
          <StatTile tone="card" label={t("fol.left")} value={allowed ? left : "—"} />
        </StatGrid>
        {allowed ? (
          <BroadcastForm disabled={left <= 0 || followers === 0} />
        ) : (
          <AssistantNote who="rex" action={<PillLink href="/supplier/profile?tab=Billing%20%26%20Plan" tone="ink" size="sm">{t("products.seePlans")}</PillLink>}>
            {t("fol.locked")}
          </AssistantNote>
        )}
        {recent.length ? (
          <Card className="p-5">
            <CardHead title={t("fol.sent")} />
            <ul className="m-0 mt-3 grid list-none gap-3 p-0">
              {recent.map((row) => (
                <li key={row.id} className="text-[14px]">
                  <div className="font-extrabold">{row.title}</div>
                  <div className="text-app-ink-soft">{date.format(row.createdAt)} · {t("fol.reached", { count: row.recipients })}</div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </AppPage>
  );
}
