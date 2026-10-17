import { AppPage, Card, CardHead, Pill, type Tone } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { MyRiders } from "@/app/home/logistics/MyRiders";
import { FleetJobActions, RiderDelivery } from "@/app/home/logistics/RiderDelivery";
import { InviteCompany } from "@/app/home/logistics/InviteCompany";
import { db } from "@/lib/db/client";
import { fleetRiderLimit, sellerRiders } from "@/lib/logistics/fleet.server";
import { sellerInvites } from "@/lib/logistics/invites.server";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatDate } from "@shared/i18n";

// The supplier's own delivery: their riders ("My riders", src/lib/logistics/fleet.server.ts), deliveries given to
// them, and invites for the delivery company they already use (who then gets their order pickups first).

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("shipping");
  return { title: t("sup.title") };
}

const API = "/api/supplier/logistics";
const OPEN = ["confirmed", "picked_up", "in_transit"];
const BOOKING_TONE: Record<string, Tone> = { pending: "warning", confirmed: "info", picked_up: "info", in_transit: "info", delivered: "success", failed: "danger", cancelled: "muted" };

export default async function SupplierDeliveryPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const t = await getT("shipping", "common");
  const locale = await getLocale();
  const date = (d: Date) => formatDate(d, locale, { day: "numeric", month: "short" });

  const [riders, invites, riderPlan, jobs] = await Promise.all([
    sellerRiders(user.id),
    sellerInvites(user.id),
    fleetRiderLimit(user.id),
    db.deliveryBooking.findMany({
      where: { sellerId: user.id, logisticsPartner: { ownerId: user.id } },
      include: { rider: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <AppPage frame={supplierFrame(user, supplier)} title={t("sup.title")} sub={t("sup.sub")}>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="grid min-w-0 content-start gap-5">
          {riders.length > 0 && (
            <Card className="scroll-mt-4 p-5">
              <div id="my-riders-delivery" className="scroll-mt-4" />
              <CardHead title={t("fleet.giveTitle")} sub={t("fleet.giveSub")} />
              <div className="mt-4">
                <RiderDelivery riders={riders.map((r) => ({ id: r.id, name: r.name }))} defaultPickup={supplier.address ?? supplier.city ?? undefined} api={API} />
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="px-5 pb-4 pt-5">
              <CardHead title={t("sup.deliveries")} sub={t("sup.latest")} />
            </div>
            {jobs.length === 0 ? (
              <p className="m-0 border-t border-app-line px-5 py-8 text-center text-[14px] text-app-ink-soft">{t("sup.noJobs")}</p>
            ) : (
              <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
                {jobs.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5 sm:flex-nowrap">
                    <div className="min-w-0 flex-1 basis-[220px]">
                      <div className="truncate text-[14.5px] font-extrabold">{b.pickupLocation} → {b.destination}</div>
                      <div className="truncate text-[13px] text-app-ink-soft">{t("fleet.byRider", { name: b.rider?.name ?? "" })} · {date(b.createdAt)}</div>
                    </div>
                    <Pill tone={BOOKING_TONE[b.status] ?? "muted"} dot>{t.dynamic(`booking.${b.status}`, b.status.replace(/_/g, " "))}</Pill>
                    {OPEN.includes(b.status) && <FleetJobActions bookingId={b.id} status={b.status} api={API} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="grid min-w-0 content-start gap-5">
          <Card className="scroll-mt-4 p-5">
            <div id="my-riders" className="scroll-mt-4" />
            <CardHead title={t("fleet.title")} sub={t("fleet.sub")} />
            <div className="mt-4">
              <MyRiders riders={riders} storeName={supplier.displayName} limit={riderPlan.limit} api={API} />
            </div>
          </Card>

          <Card className="scroll-mt-4 p-5">
            <div id="invite" className="scroll-mt-4" />
            <CardHead title={t("invite.title")} sub={t("sup.inviteSub")} />
            <div className="mt-4">
              <InviteCompany
                api={API}
                note={t("sup.inviteNote")}
                invites={invites.map((i) => ({ id: i.id, companyName: i.companyName, status: i.status, url: i.url, partner: i.partner ? { displayName: i.partner.displayName, verificationStatus: String(i.partner.verificationStatus), status: i.partner.status } : null }))}
              />
            </div>
          </Card>
        </aside>
      </div>
    </AppPage>
  );
}
