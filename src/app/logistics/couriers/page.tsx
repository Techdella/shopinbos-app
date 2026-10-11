import type { Metadata } from "next";
import { addLogisticsTeamMember, updateLogisticsTeamMemberStatus } from "@/app/actions/logistics";
import { Card, CardHead, EmptyState, FilterChips, ListCard, ListRow, Pill, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { db } from "@/lib/db/client";
import { LOGISTICS_FREE_TEAM_MEMBER_LIMIT } from "@/lib/plan-limits";
import { ensureLogisticsAccess, getLogisticsPartnerForUser, isProPlan } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";
import { ActionNotice, PartnerPage, SubmitButton, inputClass, labelClass, lagosDate } from "@/components/logistics/kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Riders" };

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

  const [teamMembers, dbUser] = await Promise.all([
    db.logisticsTeamMember.findMany({
      where: { logisticsPartnerId: partner.id },
      orderBy: [{ status: "asc" }, { invitedAt: "desc" }],
    }),
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
  ]);
  const active = teamMembers.filter((member) => member.status === "active");
  const riders = teamMembers.filter((member) => member.role === "rider");
  const proPlan = isProPlan(dbUser ?? {});
  const atStarterLimit = !proPlan && active.length >= LOGISTICS_FREE_TEAM_MEMBER_LIMIT;
  const shown = role === "rider" ? riders : role === "staff" ? teamMembers.filter((member) => member.role !== "rider") : teamMembers;
  const filterKey = role === "rider" || role === "staff" ? role : "all";

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Riders"
      sub="The riders and dispatch staff who carry your jobs. Riders use the Shopinbos Riders app."
      actions={<PillLink href="#add-rider" tone="accent" icon="plus">Add a rider</PillLink>}
    >
      <ActionNotice saved={saved} error={error} savedText="Team updated." />

      <StatGrid className="mb-5">
        <StatTile tone="card" label="Riders" value={riders.length} hint={`${riders.filter((member) => member.status === "active").length} active`} />
        <StatTile tone="card" label="Whole team" value={teamMembers.length} hint={`${active.length} active`} />
        <StatTile tone="card" label="Vehicles you run" value={partner.vehicleTypes.length} hint={partner.vehicleTypes.join(", ") || "Set them in Coverage and rates"} />
        <StatTile tone="card" label="Plan" value={proPlan ? "Pro" : "Starter"} hint={proPlan ? "No team limit" : `${Math.min(active.length, LOGISTICS_FREE_TEAM_MEMBER_LIMIT)} of ${LOGISTICS_FREE_TEAM_MEMBER_LIMIT} active people`} />
      </StatGrid>

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <FilterChips
            className="mb-4"
            items={[
              { label: "Everyone", href: "/logistics/couriers", count: teamMembers.length, active: filterKey === "all" },
              { label: "Riders", href: "/logistics/couriers?role=rider", count: riders.length, active: filterKey === "rider" },
              { label: "Dispatch and staff", href: "/logistics/couriers?role=staff", count: teamMembers.length - riders.length, active: filterKey === "staff" },
            ]}
          />
          {shown.length === 0 ? (
            <EmptyState icon="truck" title={teamMembers.length ? "No one in this group" : "No riders yet"}>
              {teamMembers.length ? "Try another filter." : "Add your first rider so you can see who is carrying each job."}
            </EmptyState>
          ) : (
            <ListCard>
              {shown.map((member) => (
                <ListRow key={member.id}>
                  <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-canvas text-[14px] font-extrabold">{initials(member.name)}</span>
                  <div className="min-w-0 flex-1 basis-[180px]">
                    <div className="truncate text-[15px] font-extrabold">{member.name}</div>
                    <div className="truncate text-[13px] text-app-ink-soft">{[member.email, member.phone].filter(Boolean).join(" · ")}</div>
                  </div>
                  <span className="text-[13.5px] capitalize text-app-ink-soft">{member.role}</span>
                  <Pill tone={member.status === "active" ? "success" : "muted"} dot>{member.status === "active" ? "Active" : "Inactive"}</Pill>
                  <span className="hidden text-[13px] text-app-ink-soft lg:inline">Added {lagosDate(member.invitedAt)}</span>
                  <form action={updateLogisticsTeamMemberStatus} className="ml-auto">
                    <input type="hidden" name="teamMemberId" value={member.id} />
                    <input type="hidden" name="status" value={member.status === "active" ? "inactive" : "active"} />
                    <SubmitButton tone="white" size="sm" aria-label={`${member.status === "active" ? "Deactivate" : "Reactivate"} ${member.name}`}>
                      {member.status === "active" ? "Deactivate" : "Reactivate"}
                    </SubmitButton>
                  </form>
                </ListRow>
              ))}
            </ListCard>
          )}
        </div>

        <Card className="h-fit p-5">
          <div id="add-rider" className="scroll-mt-24" />
          <CardHead title="Add someone" sub="They get an invite by email." />
          <form action={addLogisticsTeamMember} className="mt-4 grid gap-3">
            <div>
              <label htmlFor="member-name" className={labelClass}>Name</label>
              <input id="member-name" name="name" required autoComplete="off" placeholder="Musa Bello" disabled={atStarterLimit} className={inputClass} />
            </div>
            <div>
              <label htmlFor="member-email" className={labelClass}>Email</label>
              <input id="member-email" name="email" type="email" required placeholder="musa@example.com" disabled={atStarterLimit} className={inputClass} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div>
                <label htmlFor="member-phone" className={labelClass}>Phone</label>
                <input id="member-phone" name="phone" type="tel" placeholder="+234…" disabled={atStarterLimit} className={inputClass} />
              </div>
              <div>
                <label htmlFor="member-role" className={labelClass}>Role</label>
                <select id="member-role" name="role" defaultValue="rider" disabled={atStarterLimit} className={inputClass}>
                  {ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
            </div>
            {atStarterLimit && (
              <Notice tone="info">
                Starter logistics includes {LOGISTICS_FREE_TEAM_MEMBER_LIMIT} active team members. Deactivate someone or move to Pro to add more.
              </Notice>
            )}
            <SubmitButton disabled={atStarterLimit}>Send invite</SubmitButton>
          </form>
        </Card>
      </div>
    </PartnerPage>
  );
}
