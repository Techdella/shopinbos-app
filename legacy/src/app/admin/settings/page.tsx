import { requireRole } from "@/lib/server-auth";
import { DataTable, RolePage } from "@/components/role/RolePage";

export default async function AdminSettingsPage() {
  await requireRole(["admin"], "/admin/login");

  const settings = [
    { id: "admin-invites", key: "Admin invites", value: "SHOPINBOS_ADMIN_INVITE_EMAILS" },
    { id: "public-docs", key: "OpenAPI", value: "/api/docs" },
    { id: "sync-contract", key: "Sync contract", value: "SHOPINBOS_APP_SYNC.md" },
  ];

  return (
    <RolePage
      role="admin"
      eyebrow="Admin settings"
      title="Settings"
      description="Operational settings that support invite-only admin access and the WordPress read-only sync model."
    >
      <DataTable
        title="Operational Settings"
        empty="No settings."
        rows={settings}
        columns={[
          { label: "Setting", value: (row) => row.key },
          { label: "Value", value: (row) => row.value },
        ]}
      />
    </RolePage>
  );
}
