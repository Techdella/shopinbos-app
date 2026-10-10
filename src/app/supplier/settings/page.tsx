import { saveSupplierNotificationPreferences } from "@/app/actions/supplier";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon } from "@/components/ui";
import { db } from "@/lib/db/client";
import { getSupplierForUser } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ saved?: string }>;
};

function ToggleRow({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 0",
        borderTop: "1px solid var(--ink-100)",
        cursor: "pointer",
      }}
    >
      <input name={name} type="checkbox" defaultChecked={defaultChecked} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-900)" }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>{description}</div>
      </div>
    </label>
  );
}

export default async function SupplierSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  const preference = await db.notificationPreference.findUnique({
    where: {
      userId_eventKey_category: {
        userId: user.id,
        eventKey: "message_received",
        category: "marketplace",
      },
    },
  });

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
          title="Settings"
          sub={`${supplier.displayName} · notification and account preferences`}
          actions={<button className="dbtn dBtn-mint" form="supplier-notification-settings"><Icon name="check" size={14} /> Save</button>}
        />

        {params?.saved && (
          <div className="card" style={{ padding: 14, borderColor: "var(--teal-200)", background: "var(--teal-50)", color: "var(--teal-800)", fontSize: 13, fontWeight: 600 }}>
            Notification preferences saved.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0, 1fr)", gap: 24 }}>
          <aside style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {["Notifications", "Account", "Security", "Payouts"].map((item) => (
              <a
                key={item}
                href={item === "Payouts" ? "/supplier/payouts" : "/supplier/settings"}
                style={{
                  padding: "9px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: item === "Notifications" ? 700 : 600,
                  color: item === "Notifications" ? "var(--teal-800)" : "var(--ink-600)",
                  background: item === "Notifications" ? "var(--teal-100)" : "transparent",
                  textDecoration: "none",
                }}
              >
                {item}
              </a>
            ))}
          </aside>

          <form id="supplier-notification-settings" action={saveSupplierNotificationPreferences} className="card" style={{ padding: "4px 20px 20px" }}>
            <div style={{ padding: "18px 0 8px" }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Message notifications</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 2 }}>
                Choose how Shopinbos alerts you when sellers send in-app messages.
              </div>
            </div>

            <ToggleRow
              name="messageInApp"
              label="In-app notifications"
              description="Create a notification inside the supplier portal."
              defaultChecked={preference?.inApp ?? true}
            />
            <ToggleRow
              name="messageEmail"
              label="Email notifications"
              description={`Send message alerts to ${user.email}.`}
              defaultChecked={preference?.email ?? false}
            />
            <ToggleRow
              name="messageSms"
              label="SMS via Sendchamp"
              description={user.phone ? `Send SMS alerts to ${user.phone}.` : "Add a phone number to your account before SMS alerts can be delivered."}
              defaultChecked={preference?.sms ?? false}
            />

            <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "var(--ink-50)", color: "var(--ink-600)", fontSize: 12.5, lineHeight: 1.5 }}>
              Email and SMS delivery only run when the matching provider keys are configured. In-app notifications stay available by default.
            </div>
          </form>
        </div>
      </div>
    </AppFrame>
  );
}
