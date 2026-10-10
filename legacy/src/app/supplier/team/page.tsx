import { addSupplierTeamMember, updateSupplierTeamMemberStatus, removeSupplierTeamMember } from "@/app/actions/supplier";
import { AppFrame } from "@/components/shell/AppFrame";
import { Badge, FilterBar, Icon, PageHead, StatTile } from "@/components/ui";
import { db } from "@/lib/db/client";
import { SUPPLIER_FREE_TEAM_MEMBER_LIMIT } from "@/lib/plan-limits";
import { ensureSupplierAccess, getSupplierForUser, isProPlan } from "@/lib/role-queries";
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

export default async function SupplierTeamPage() {
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

  return (
    <AppFrame
      role="supplier"
      storeName={supplier.displayName}
      storeSlug={`${supplier.city ?? "Aba"} · ${supplier.country ?? "Nigeria"}`}
      storeInitial={supplier.displayName.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Team members"
          sub={`${activeTeamMembers.length} active · Manage the people who help run your supplier operations`}
          actions={
            <>
              <a className="dbtn dBtn-ghost" href="/supplier/profile?tab=Billing%20%26%20Plan" style={{ textDecoration: "none" }}>
                <Icon name="upload" size={14} /> {proPlan ? "Supplier Max plan" : "Free plan"}
              </a>
              <button className="dbtn dBtn-mint" form="add-team-member-form" disabled={atFreeTeamLimit}>
                <Icon name="plus" size={14} /> Add member
              </button>
            </>
          }
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <StatTile label="Active members" value={String(activeTeamMembers.length)} delta="Team members" deltaDir="flat" />
          <StatTile
            label="Free limit"
            value={String(SUPPLIER_FREE_TEAM_MEMBER_LIMIT)}
            delta={proPlan ? "Unlimited (Supplier Max)" : `${Math.min(activeTeamMembers.length, SUPPLIER_FREE_TEAM_MEMBER_LIMIT)}/${SUPPLIER_FREE_TEAM_MEMBER_LIMIT} used`}
            deltaDir="flat"
          />
          <StatTile label="Roles" value={String(new Set(teamMembers.map((m) => m.role)).size)} delta="different roles" deltaDir="flat" />
          <StatTile label="Pending invites" value={String(teamMembers.filter((m) => m.status === "inactive").length)} delta="awaiting activation" deltaDir="flat" />
        </div>

        <form
          id="add-team-member-form"
          action={addSupplierTeamMember}
          className="card"
          style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 0.9fr 0.9fr auto", gap: 10, alignItems: "end" }}
        >
          <label className="field">
            <span className="label">Name</span>
            <input className="inp" name="name" placeholder="Chidi Okafor" disabled={atFreeTeamLimit} required />
          </label>
          <label className="field">
            <span className="label">Email</span>
            <input className="inp" name="email" type="email" placeholder="chidi@example.com" disabled={atFreeTeamLimit} required />
          </label>
          <label className="field">
            <span className="label">Phone</span>
            <input className="inp" name="phone" placeholder="+234..." disabled={atFreeTeamLimit} />
          </label>
          <label className="field">
            <span className="label">Role</span>
            <select className="inp" name="role" defaultValue="manager" disabled={atFreeTeamLimit}>
              <option value="manager">Manager</option>
              <option value="inventory">Inventory</option>
              <option value="support">Support</option>
              <option value="sales">Sales</option>
            </select>
          </label>
          <button className="dbtn dBtn-mint" type="submit" disabled={atFreeTeamLimit}>
            Invite
          </button>
          {atFreeTeamLimit && (
            <div style={{ gridColumn: "1 / -1", color: "var(--warning)", fontSize: 12.5, fontWeight: 600 }}>
              Free plan includes up to {SUPPLIER_FREE_TEAM_MEMBER_LIMIT} active team members. Upgrade to Supplier Max (₦25,000/month) for unlimited team members.
            </div>
          )}
        </form>

        <FilterBar />

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th>Invited</th>
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
                  <td style={{ fontSize: 13 }}>{member.role}</td>
                  <td>
                    <Badge variant={member.status === "active" ? "mint" : "warn"}>{member.status}</Badge>
                  </td>
                  <td style={{ fontSize: 13 }}>{new Date(member.invitedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <form action={updateSupplierTeamMemberStatus}>
                        <input type="hidden" name="teamMemberId" value={member.id} />
                        <input type="hidden" name="status" value={member.status === "active" ? "inactive" : "active"} />
                        <button className="dbtn dBtn-ghost" type="submit" style={{ padding: "5px 9px", fontSize: 12 }}>
                          {member.status === "active" ? "Deactivate" : "Reactivate"}
                        </button>
                      </form>
                      <form action={removeSupplierTeamMember}>
                        <input type="hidden" name="teamMemberId" value={member.id} />
                        <button className="dbtn dBtn-ghost" type="submit" style={{ padding: "5px 9px", fontSize: 12, color: "var(--danger)" }}>
                          <Icon name="x" size={12} />
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {teamMembers.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 24, color: "var(--ink-500)", textAlign: "center" }}>
                    No team members yet. Invite your first team member to start collaborating.
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
