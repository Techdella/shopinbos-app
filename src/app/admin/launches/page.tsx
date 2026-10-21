import { AppPage } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { LaunchesManager } from "@/components/admin/LaunchesManager";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// Admin › Launches: features that stay hidden until the team switches them on. Owners and admins only (the
// "launches" segment isn't given to any other admin role in src/lib/admin-team/pure.ts).
export default async function AdminLaunchesPage() {
  const user = await requireRole(["admin"], "/admin/login");
  return (
    <AppPage frame={adminFrame(user)} title="Launches" sub="Features that stay hidden until you switch them on.">
      <LaunchesManager />
    </AppPage>
  );
}
