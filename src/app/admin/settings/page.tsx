import { AppPage, ListCard, ListRow, Pill } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { requireRole } from "@/lib/server-auth";

export default async function AdminSettingsPage() {
  const user = await requireRole(["admin"], "/admin/login");

  // Only the number of invited emails is shown, never the addresses themselves.
  const inviteCount = (process.env.SHOPINBOS_ADMIN_INVITE_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean).length;

  const settings = [
    {
      id: "admin-invites",
      key: "Admin invites",
      help: "Comma-separated emails allowed to sign up as admin.",
      value: "SHOPINBOS_ADMIN_INVITE_EMAILS",
      status: inviteCount > 0 ? <Pill tone="success" dot>{inviteCount} {inviteCount === 1 ? "email" : "emails"}</Pill> : <Pill tone="warning" dot>Not set</Pill>,
    },
    { id: "public-docs", key: "OpenAPI", help: "Public marketplace API reference used by the website.", value: "/api/docs", status: null },
    { id: "sync-contract", key: "Sync contract", help: "How the website reads marketplace data (read-only).", value: "SHOPINBOS_APP_SYNC.md", status: null },
  ];

  return (
    <AppPage
      frame={adminFrame(user)}
      title="Settings"
      sub="Settings behind invite-only admin access and the read-only sync with the marketing website."
    >
      <h2 className="mb-3 mt-0 text-[17px] font-extrabold">Operational settings</h2>
      <ListCard>
        {settings.map((row) => (
          <ListRow key={row.id}>
            <div className="min-w-0 flex-1 basis-[220px]">
              <div className="text-[15px] font-extrabold">{row.key}</div>
              <div className="text-[13px] text-app-ink-soft">{row.help}</div>
            </div>
            <code className="min-w-0 max-w-full truncate rounded-[10px] bg-app-canvas px-2.5 py-1.5 font-mono text-[13px]">{row.value}</code>
            {row.status}
          </ListRow>
        ))}
      </ListCard>
    </AppPage>
  );
}
