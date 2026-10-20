import { AppPage } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { TeamManager, type TeamRow } from "@/components/admin/TeamManager";
import { listTeam, requireAdminSection } from "@/lib/admin-team/service.server";

export const dynamic = "force-dynamic";

export default async function AdminTeamPage() {
  const user = await requireAdminSection("team");
  const members = await listTeam();
  const rows: TeamRow[] = members.map((member) => ({
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
    lastSignInAt: member.lastSignInAt?.toISOString() ?? null,
    you: member.id === user.id,
  }));

  return (
    <AppPage frame={adminFrame(user)} title="Team" sub="Add people to the admin portal and choose what each of them can open.">
      <TeamManager members={rows} canManage={user.adminRole === "owner"} />
    </AppPage>
  );
}
