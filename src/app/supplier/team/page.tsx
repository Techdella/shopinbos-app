import { addSupplierTeamMember, updateSupplierTeamMemberStatus, removeSupplierTeamMember } from "@/app/actions/supplier";
import { AppPage, AssistantNote, Card, EmptyState, ListCard, Pill, PillLink, StatGrid, StatTile, Thumb } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { buttonClass, fieldClass, labelClass, shortDate, supplierFrame } from "@/components/supplier/supplier-kit";
import { db } from "@/lib/db/client";
import { SUPPLIER_FREE_TEAM_MEMBER_LIMIT } from "@/lib/plan-limits";
import { ensureSupplierAccess, getSupplierForUser, isProPlan } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const ROLES = [
  { value: "manager", label: "Manager" },
  { value: "inventory", label: "Inventory" },
  { value: "support", label: "Support" },
  { value: "sales", label: "Sales" },
];

type PageProps = {
  searchParams?: Promise<{ saved?: string; error?: string }>;
};

export default async function SupplierTeamPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  const [teamMembers, dbUser] = await Promise.all([
    db.supplierTeamMember.findMany({
      where: { supplierId: supplier.id },
      orderBy: [{ status: "asc" }, { invitedAt: "desc" }],
    }),
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
  ]);
  const activeTeamMembers = teamMembers.filter((member) => member.status === "active");
  const proPlan = isProPlan(dbUser ?? {});
  const atFreeTeamLimit = !proPlan && activeTeamMembers.length >= SUPPLIER_FREE_TEAM_MEMBER_LIMIT;
  const roleLabel = (role: string) => ROLES.find((r) => r.value === role)?.label ?? role;

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title="Team"
      sub="The people who help you run orders, stock and replies."
      actions={<PillLink href="/supplier/profile?tab=Billing%20%26%20Plan">{proPlan ? "Supplier Max plan" : "Free plan"}</PillLink>}
    >
      {(params.error || params.saved) && (
        <div className="mb-4"><Notice tone={params.error ? "error" : "success"}>{params.error ?? "Team updated."}</Notice></div>
      )}

      <StatGrid className="mb-5">
        <StatTile tone="card" label="Active" value={activeTeamMembers.length} />
        <StatTile
          tone="card"
          label="Plan limit"
          value={proPlan ? "Unlimited" : `${Math.min(activeTeamMembers.length, SUPPLIER_FREE_TEAM_MEMBER_LIMIT)} of ${SUPPLIER_FREE_TEAM_MEMBER_LIMIT}`}
          hint={proPlan ? "Supplier Max" : "free plan"}
        />
        <StatTile tone="card" label="Roles in use" value={new Set(teamMembers.map((m) => m.role)).size} />
        <StatTile tone="card" label="Inactive" value={teamMembers.filter((m) => m.status === "inactive").length} />
      </StatGrid>

      <Card className="mb-5 p-5">
        <h2 className="m-0 text-[17px] font-extrabold">Add someone</h2>
        <form action={addSupplierTeamMember} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] xl:items-end">
          <div>
            <label htmlFor="member-name" className={labelClass}>Name</label>
            <input id="member-name" className={fieldClass} name="name" placeholder="Chidi Okafor" disabled={atFreeTeamLimit} required />
          </div>
          <div>
            <label htmlFor="member-email" className={labelClass}>Email</label>
            <input id="member-email" className={fieldClass} name="email" type="email" placeholder="chidi@example.com" disabled={atFreeTeamLimit} required />
          </div>
          <div>
            <label htmlFor="member-phone" className={labelClass}>Phone</label>
            <input id="member-phone" className={fieldClass} name="phone" type="tel" placeholder="+234…" disabled={atFreeTeamLimit} />
          </div>
          <div>
            <label htmlFor="member-role" className={labelClass}>Role</label>
            <select id="member-role" className={fieldClass} name="role" defaultValue="manager" disabled={atFreeTeamLimit}>
              {ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
            </select>
          </div>
          <button className={`${buttonClass.ink} min-h-[48px]`} type="submit" disabled={atFreeTeamLimit}>
            <Icon name="plus" size={15} /> Add member
          </button>
        </form>
        {atFreeTeamLimit && (
          <div className="mt-4">
            <AssistantNote who="rex" action={<PillLink href="/supplier/profile?tab=Billing%20%26%20Plan" tone="ink" size="sm">See plans</PillLink>}>
              The free plan includes up to {SUPPLIER_FREE_TEAM_MEMBER_LIMIT} active team members. Supplier Max (₦25,000/month) has no limit.
            </AssistantNote>
          </div>
        )}
      </Card>

      {teamMembers.length === 0 ? (
        <EmptyState icon="users" title="No team members yet">
          Add the first person who helps you pack orders, update stock or answer sellers.
        </EmptyState>
      ) : (
        <ListCard>
          {teamMembers.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:flex-nowrap sm:px-5">
              <Thumb label={member.name} size={44} />
              <span className="min-w-0 flex-1 basis-[calc(100%-72px)] sm:basis-0">
                <span className="block truncate text-[14.5px] font-extrabold">{member.name}</span>
                <span className="block truncate text-[13px] text-app-ink-soft">{member.email}{member.phone ? ` · ${member.phone}` : ""}</span>
              </span>
              <span className="w-[90px] text-[13.5px] font-semibold">{roleLabel(member.role)}</span>
              <Pill tone={member.status === "active" ? "success" : "muted"}>{member.status === "active" ? "Active" : "Inactive"}</Pill>
              <span className="hidden w-[110px] text-[13px] text-app-ink-soft md:block">Added {shortDate(member.invitedAt)}</span>
              <span className="flex gap-2">
                <form action={updateSupplierTeamMemberStatus}>
                  <input type="hidden" name="teamMemberId" value={member.id} />
                  <input type="hidden" name="status" value={member.status === "active" ? "inactive" : "active"} />
                  <button className={buttonClass.smallWhite} type="submit">
                    {member.status === "active" ? "Deactivate" : "Reactivate"}
                  </button>
                </form>
                <form action={removeSupplierTeamMember}>
                  <input type="hidden" name="teamMemberId" value={member.id} />
                  <button className="grid h-10 w-10 place-items-center rounded-full border border-app-line bg-white text-app-danger transition hover:border-app-danger" type="submit" aria-label={`Remove ${member.name}`}>
                    <Icon name="trash" size={15} />
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ListCard>
      )}
    </AppPage>
  );
}
