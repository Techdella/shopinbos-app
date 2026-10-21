import type { Metadata } from "next";
import { addLogisticsTeamMember, revokeRiderLink, setRiderPay, updateLogisticsTeamMemberStatus } from "@/app/actions/logistics";
import { Card, CardHead, EmptyState, FilterChips, ListCard, Pill, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { db } from "@/lib/db/client";
import { logisticsPlanLimits, planName } from "@/lib/plan-limits";
import { atLimit } from "@shared/plans";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";
import { ActionNotice, PartnerPage, SubmitButton, bookingNet, inputClass, labelClass, lagosDate, lagosStartOfToday, naira, timeAgo, type LogisticsT } from "@/components/logistics/kit";
import { getT } from "@/lib/i18n/server";
import { RiderLinkButton } from "@/components/logistics/RiderLinkButton";
import { riderPresence } from "@/components/logistics/dispatch";
import { riderWhereWords } from "@shared/delivery-geo";
import { isRiderOut, riderEarning } from "@/lib/logistics/job-rules";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("riders.title") };
}

const ROLES = [
  { value: "rider", label: "Rider" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "manager", label: "Manager" },
  { value: "support", label: "Support" },
];

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2) || "·";
}

export default async function LogisticsCouriersPage({ searchParams }: { searchParams: Promise<{ role?: string; saved?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { role, saved, error } = await searchParams;
  const t = await getT("logistics", "common");
  const roleLabel = (value: string) => {
    const found = ROLES.find((item) => item.value === value);
    return found ? t.dynamic(`riders.role.${found.value}`, found.label) : value;
  };

  const now = new Date();
  const startOfToday = lagosStartOfToday(now);
  const [teamMembers, dbUser, riderJobs] = await Promise.all([
    db.logisticsTeamMember.findMany({
      where: { logisticsPartnerId: partner.id },
      orderBy: [{ status: "asc" }, { invitedAt: "desc" }],
    }),
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
    // Today's work per rider, plus any cash they still hold.
    db.deliveryBooking.findMany({
      where: {
        logisticsPartnerId: partner.id,
        riderId: { not: null },
        OR: [
          { status: { in: ["confirmed", "picked_up", "in_transit", "out_for_delivery"] } },
          { status: "delivered", deliveredAt: { gte: startOfToday } },
          { codMethod: "cash", remittanceId: null, codCollected: { gt: 0 } },
        ],
      },
      select: { riderId: true, status: true, deliveredAt: true, deliveryFee: true, platformFee: true, netAmount: true, riderPay: true, codCollected: true, codMethod: true, remittanceId: true },
    }),
  ]);
  const payByRider = new Map(teamMembers.map((member) => [member.id, { payType: member.payType, payRate: member.payRate }]));
  const workByRider = new Map<string, RiderWorkToday>();
  for (const job of riderJobs) {
    const work = workByRider.get(job.riderId!) ?? { open: 0, delivered: 0, fees: 0, pay: null, cash: 0 };
    if (["confirmed", "picked_up", "in_transit", "out_for_delivery"].includes(job.status)) work.open += 1;
    if (job.status === "delivered" && job.deliveredAt && job.deliveredAt >= startOfToday) {
      work.delivered += 1;
      work.fees += bookingNet(job);
      // What the rider earned today, once their pay is set (or saved on the job when it was delivered).
      const earned = riderEarning(payByRider.get(job.riderId!), job);
      if (earned !== null) work.pay = (work.pay ?? 0) + earned;
    }
    if (job.codMethod === "cash" && !job.remittanceId) work.cash += job.codCollected ?? 0;
    workByRider.set(job.riderId!, work);
  }
  const active = teamMembers.filter((member) => member.status === "active");
  const riders = teamMembers.filter((member) => member.role === "rider");
  const presence = riderPresence(riders, now);
  const teamLimit = logisticsPlanLimits(dbUser ?? {}).teamMembers;
  const proPlan = teamLimit === null;
  const atStarterLimit = atLimit(active.length, teamLimit);
  const shown = role === "rider" ? riders : role === "staff" ? teamMembers.filter((member) => member.role !== "rider") : teamMembers;
  const filterKey = role === "rider" || role === "staff" ? role : "all";

  return (
    <PartnerPage
      frame={{ user, partner }}
      title={t("riders.title")}
      sub={t("riders.sub")}
      actions={<PillLink href="#add-rider" icon="plus">{t("today.addRider")}</PillLink>}
    >
      <ActionNotice saved={saved} error={error} savedText={t("riders.updated")} />

      <StatGrid className="mb-5">
        <StatTile tone="card" label={t("today.ridersOutNow")} value={presence.out} hint={t("riders.offlineActive", { offline: presence.offline, total: presence.total })} />
        <StatTile tone="card" label={t("riders.wholeTeam")} value={teamMembers.length} hint={t("riders.activeCount", { count: active.length })} />
        <StatTile tone="card" label={t("riders.vehicles")} value={partner.vehicleTypes.length} hint={partner.vehicleTypes.join(", ") || t("riders.vehiclesHint")} />
        <StatTile tone="card" label={t("riders.plan")} value={planName({ ...dbUser, role: "logistics_partner" })} hint={proPlan ? t("riders.noLimit") : t("riders.activePeople", { count: Math.min(active.length, teamLimit ?? 0), limit: teamLimit ?? 0 })} />
      </StatGrid>

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <FilterChips
            className="mb-4"
            items={[
              { label: t("riders.everyone"), href: "/logistics/couriers", count: teamMembers.length, active: filterKey === "all" },
              { label: t("riders.title"), href: "/logistics/couriers?role=rider", count: riders.length, active: filterKey === "rider" },
              { label: t("riders.staff"), href: "/logistics/couriers?role=staff", count: teamMembers.length - riders.length, active: filterKey === "staff" },
            ]}
          />
          {shown.length === 0 ? (
            <EmptyState icon="truck" title={teamMembers.length ? t("riders.noOne") : t("riders.emptyTitle")}>
              {teamMembers.length ? t("quotes.tryFilter") : t("riders.emptyBody")}
            </EmptyState>
          ) : (
            <ListCard>
              {shown.map((member) => (
                <li key={member.id} className="px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap">
                    <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-canvas text-[15px] font-extrabold">{initials(member.name)}</span>
                    <div className="min-w-0 flex-1 basis-[180px]">
                      <div className="truncate text-[15px] font-extrabold">{member.name}</div>
                      <div className="truncate text-[15px] text-app-ink-soft">{[member.email, member.phone].filter(Boolean).join(" · ")}</div>
                      {member.role === "rider" && member.lastLocationAt && (
                        <div className="truncate text-[15px] text-app-ink-soft">{riderWhereWords({ lat: member.lastLat, lng: member.lastLng, locationAt: member.lastLocationAt }, now)}</div>
                      )}
                  </div>
                  <span className="text-[15px] capitalize text-app-ink-soft">{roleLabel(member.role)}</span>
                  {member.status !== "active" ? (
                    <Pill tone="muted" dot>{t("riders.inactive")}</Pill>
                  ) : member.role === "rider" ? (
                    <Pill tone={isRiderOut(member, now) ? "success" : "muted"} dot>
                      {isRiderOut(member, now) ? t("riders.online") : member.lastSeenAt ? t("riders.offlineSeen", { when: timeAgo(member.lastSeenAt, now, t) }) : t("riders.offline")}
                    </Pill>
                  ) : (
                    <Pill tone="success" dot>{t("riders.active")}</Pill>
                  )}
                  <span className="hidden text-[15px] text-app-ink-soft lg:inline">{t("riders.added", { date: lagosDate(member.invitedAt, undefined, now, t) })}</span>
                  <form action={updateLogisticsTeamMemberStatus} className="ml-auto">
                    <input type="hidden" name="teamMemberId" value={member.id} />
                    <input type="hidden" name="status" value={member.status === "active" ? "inactive" : "active"} />
                    <SubmitButton tone="white" size="sm" aria-label={member.status === "active" ? t("riders.deactivateAria", { name: member.name }) : t("riders.reactivateAria", { name: member.name })}>
                      {member.status === "active" ? t("riders.deactivate") : t("riders.reactivate")}
                    </SubmitButton>
                  </form>
                  </div>
                  {member.role === "rider" && member.status === "active" && <RiderWork work={workByRider.get(member.id)} t={t} />}
                  {member.role === "rider" && member.status === "active" && <RiderPayForm member={member} t={t} />}
                  {member.role === "rider" && member.status === "active" && (
                    <div className="mt-2 flex w-full min-w-0 flex-wrap items-start gap-2 sm:pl-[60px]">
                      <div className="min-w-0 flex-1">
                        <RiderLinkButton teamMemberId={member.id} riderName={member.name} hasLink={Boolean(member.riderTokenHash)} />
                      </div>
                      {member.riderTokenHash && (
                        <form action={revokeRiderLink}>
                          <input type="hidden" name="teamMemberId" value={member.id} />
                          <SubmitButton tone="white" size="sm" aria-label={t("riders.switchOffAria", { name: member.name })}>{t("riders.switchOff")}</SubmitButton>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ListCard>
          )}
        </div>

        <Card className="h-fit p-5">
          <div id="add-rider" className="scroll-mt-24" />
          <CardHead title={t("riders.addSomeone")} sub={t("riders.addSub")} />
          <form action={addLogisticsTeamMember} className="mt-4 grid gap-3">
            <div>
              <label htmlFor="member-name" className={labelClass}>{t("riders.name")}</label>
              <input id="member-name" name="name" required autoComplete="off" placeholder="Musa Bello" disabled={atStarterLimit} className={inputClass} />
            </div>
            <div>
              <label htmlFor="member-email" className={labelClass}>{t("riders.email")}</label>
              <input id="member-email" name="email" type="email" required placeholder="musa@example.com" disabled={atStarterLimit} className={inputClass} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div>
                <label htmlFor="member-phone" className={labelClass}>{t("riders.phone")}</label>
                <input id="member-phone" name="phone" type="tel" placeholder="+234…" disabled={atStarterLimit} className={inputClass} />
              </div>
              <div>
                <label htmlFor="member-role" className={labelClass}>{t("riders.roleLabel")}</label>
                <select id="member-role" name="role" defaultValue="rider" disabled={atStarterLimit} className={inputClass}>
                  {ROLES.map((item) => <option key={item.value} value={item.value}>{roleLabel(item.value)}</option>)}
                </select>
              </div>
            </div>
            {atStarterLimit && (
              <Notice tone="info">
                {t("riders.starterLimit", { limit: teamLimit ?? 0 })}
              </Notice>
            )}
            <SubmitButton disabled={atStarterLimit}>{t("riders.sendInvite")}</SubmitButton>
          </form>
        </Card>
      </div>
    </PartnerPage>
  );
}

type RiderWorkToday = { open: number; delivered: number; fees: number; pay: number | null; cash: number };

function RiderWork({ work, t }: { work?: RiderWorkToday; t: LogisticsT }) {
  const items = [
    t("riders.openJobs", { count: work?.open ?? 0 }),
    t("riders.deliveredToday", { count: work?.delivered ?? 0 }),
    t("riders.feesToday", { amount: naira(work?.fees ?? 0) }),
    ...(work?.pay ? [t("riders.payToday", { amount: naira(work.pay) })] : []),
    ...(work?.cash ? [t("riders.cashInHand", { amount: naira(work.cash) })] : []),
  ];
  return <p className="m-0 mt-2 text-[15px] text-app-ink-soft sm:pl-[60px]">{items.join(" · ")}</p>;
}

/** What the partner pays a rider: the Riders app shows the rider these earnings instead of delivery fees. */
function RiderPayForm({ member, t }: { member: { id: string; name: string; payType: string | null; payRate: number | null }; t: LogisticsT }) {
  const current =
    member.payType === "per_drop" && member.payRate
      ? t("riders.payPerDrop", { amount: naira(member.payRate) })
      : member.payType === "share" && member.payRate
      ? t("riders.payShare", { percent: member.payRate })
      : t("riders.payNotSet");
  return (
    <details className="mt-2 sm:pl-[60px]">
      <summary className="cursor-pointer text-[15px] font-bold">{t("riders.payLabel", { pay: current })}</summary>
      <form action={setRiderPay} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="teamMemberId" value={member.id} />
        <div className="min-w-[180px] flex-1">
          <label htmlFor={`pay-type-${member.id}`} className={labelClass}>{t("riders.payHow")}</label>
          <select id={`pay-type-${member.id}`} name="payType" defaultValue={member.payType ?? "none"} className={inputClass}>
            <option value="none">{t("riders.payOptionNone")}</option>
            <option value="per_drop">{t("riders.payOptionPerDrop")}</option>
            <option value="share">{t("riders.payOptionShare")}</option>
          </select>
        </div>
        <div className="w-[140px]">
          <label htmlFor={`pay-rate-${member.id}`} className={labelClass}>{t("riders.payAmount")}</label>
          <input id={`pay-rate-${member.id}`} name="payRate" type="number" inputMode="decimal" min="0" step="any" defaultValue={member.payRate ?? ""} className={inputClass} />
        </div>
        <SubmitButton tone="white" size="sm" aria-label={t("riders.paySaveAria", { name: member.name })}>{t("riders.paySave")}</SubmitButton>
      </form>
      <p className="m-0 mt-2 text-[14px] text-app-ink-soft">{t("riders.payHint")}</p>
    </details>
  );
}
