import { addLogisticsTeamMember, updateLogisticsTeamMemberStatus } from "@/app/actions/logistics";
import { AppFrame } from "@/components/shell/AppFrame";
import { Badge, FilterBar, Icon, PageHead, StatTile } from "@/components/ui";
import { db } from "@/lib/db/client";
import { LOGISTICS_FREE_TEAM_MEMBER_LIMIT } from "@/lib/plan-limits";
import { ensureLogisticsAccess, getLogisticsPartnerForUser, isProPlan } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

function Av({ name, size = 36, seed = 0, square }: { name: string; size?: number; seed?: number; square?: boolean }) {
  const initials = name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2);
  const gradients = [
    ["#D4A574", "#6B4A2C"],
    ["#F2C8B4", "#D4A574"],
    ["#195754", "#0c4a44"],
    ["#E86A4F", "#6B4A2C"],
    ["#5b6ad0", "#3a4ba6"],
    ["#8aa843", "#5a7a28"],
    ["#b14a8a", "#7a2a6a"],
    ["#e8a647", "#b97511"],
  ];
  const gradient = gradients[seed % gradients.length];

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: square ? 7 : "50%",
        background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
        display: "grid",
        placeItems: "center",
        color: "white",
        fontWeight: 700,
        fontSize: size * 0.38,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

export default async function LogisticsCouriersPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  const [teamMembers, dbUser] = await Promise.all([
    db.logisticsTeamMember.findMany({
      where: { logisticsPartnerId: partner.id },
      orderBy: [{ status: "asc" }, { invitedAt: "desc" }],
    }),
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
  ]);
  const activeTeamMembers = teamMembers.filter((member) => member.status === "active");
  const proPlan = isProPlan(dbUser ?? {});
  const atStarterTeamLimit = !proPlan && activeTeamMembers.length >= LOGISTICS_FREE_TEAM_MEMBER_LIMIT;

  return (
    <AppFrame
      role="logistics_partner"
      storeName={partner.displayName}
      storeSlug={`${partner.city ?? "Lagos"} - Fleet`}
      storeInitial={partner.displayName.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={user.name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Riders & couriers"
          sub={`${partner.vehicleTypes.length} vehicles - ${activeTeamMembers.length} active team members`}
          actions={
            <>
              <a className="dbtn dBtn-ghost" href="/logistics/profile?tab=Billing%20%26%20Plan" style={{ textDecoration: "none" }}>
                <Icon name="upload" size={14} /> {proPlan ? "Pro team" : "Starter team"}
              </a>
              <button className="dbtn dBtn-mint" form="add-team-member-form" disabled={atStarterTeamLimit}>
                <Icon name="plus" size={14} /> Add rider
              </button>
            </>
          }
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <StatTile label="Active fleet" value={String(partner.vehicleTypes.length)} delta={`${partner.vehicleTypes.length} vehicles`} deltaDir="flat" />
          <StatTile
            label="On shift now"
            value={String(activeTeamMembers.length)}
            delta={proPlan ? "Pro team" : `${Math.min(activeTeamMembers.length, LOGISTICS_FREE_TEAM_MEMBER_LIMIT)}/${LOGISTICS_FREE_TEAM_MEMBER_LIMIT} starter`}
            deltaDir="flat"
          />
          <StatTile label="Avg deliveries / day" value="0" delta="connect bookings to riders next" deltaDir="flat" />
          <StatTile label="Best on-time rate" value="--" delta="starts after first delivery" deltaDir="flat" />
        </div>

        <form
          id="add-team-member-form"
          action={addLogisticsTeamMember}
          className="card"
          style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 0.9fr 0.9fr auto", gap: 10, alignItems: "end" }}
        >
          <label className="field">
            <span className="label">Name</span>
            <input className="inp" name="name" placeholder="Amina Dispatch" disabled={atStarterTeamLimit} required />
          </label>
          <label className="field">
            <span className="label">Email</span>
            <input className="inp" name="email" type="email" placeholder="amina@example.com" disabled={atStarterTeamLimit} required />
          </label>
          <label className="field">
            <span className="label">Phone</span>
            <input className="inp" name="phone" placeholder="+234..." disabled={atStarterTeamLimit} />
          </label>
          <label className="field">
            <span className="label">Role</span>
            <select className="inp" name="role" defaultValue="dispatcher" disabled={atStarterTeamLimit}>
              <option value="dispatcher">Dispatcher</option>
              <option value="rider">Rider</option>
              <option value="manager">Manager</option>
              <option value="support">Support</option>
            </select>
          </label>
          <button className="dbtn dBtn-mint" type="submit" disabled={atStarterTeamLimit}>
            Invite
          </button>
          {atStarterTeamLimit && (
            <div style={{ gridColumn: "1 / -1", color: "var(--warning)", fontSize: 12.5, fontWeight: 600 }}>
              Starter logistics includes {LOGISTICS_FREE_TEAM_MEMBER_LIMIT} active team members. Upgrade to Pro to add more riders, dispatchers, and managers.
            </div>
          )}
        </form>

        <FilterBar />

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Rider</th>
                <th>Vehicle</th>
                <th>Zone</th>
                <th>Status</th>
                <th>Today</th>
                <th>Rating</th>
                <th>On-time</th>
                <th>This month</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((member, index) => (
                <tr key={member.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Av name={member.name} seed={index} />
                      <div>
                        <div style={{ fontWeight: 700 }}>{member.name}</div>
                        <div style={{ color: "var(--ink-500)", fontSize: 12 }}>{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>{member.role}</td>
                  <td>{partner.coverageZones[index % Math.max(partner.coverageZones.length, 1)] ?? partner.city}</td>
                  <td>
                    <Badge variant={member.status === "active" ? "mint" : "warn"}>{member.status}</Badge>
                  </td>
                  <td>0</td>
                  <td>--</td>
                  <td>--</td>
                  <td>{new Date(member.invitedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                  <td>
                    <form action={updateLogisticsTeamMemberStatus}>
                      <input type="hidden" name="teamMemberId" value={member.id} />
                      <input type="hidden" name="status" value={member.status === "active" ? "inactive" : "active"} />
                      <button className="dbtn dBtn-ghost" type="submit" style={{ padding: "5px 9px", fontSize: 12 }}>
                        {member.status === "active" ? "Deactivate" : "Reactivate"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {teamMembers.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 24, color: "var(--ink-500)", textAlign: "center" }}>
                    No riders yet. Add your first rider to start managing your fleet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppFrame>
  );
}
