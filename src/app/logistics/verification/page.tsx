import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { getLogisticsPartnerForUser } from "@/lib/role-queries";
import { AppFrame } from "@/components/shell/AppFrame";
import { Icon } from "@/components/ui";
import type { IconName } from "@/components/ui/Icon";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LogisticsVerificationPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  if (!partner) redirect("/logistics/onboarding");
  if (partner.verificationStatus === "verified") redirect("/logistics/dashboard");

  const messageMap: Record<string, { title: string; desc: string; icon: IconName }> = {
    pending: {
      title: "Verification pending",
      desc: "Your logistics profile is under review by our admin team. You will get full access to your dashboard, bookings, quotes, and billing once verified. This usually takes 1-2 business days.",
      icon: "clock",
    },
    rejected: {
      title: "Verification rejected",
      desc: "Your profile did not pass verification. Please check your onboarding details and ensure all required documents are correct, then resubmit.",
      icon: "warn",
    },
    unverified: {
      title: "Complete your onboarding",
      desc: "You need to complete the onboarding process before your profile can be verified by our admin team.",
      icon: "flag",
    },
  };

  const status = partner.verificationStatus;
  const msg = messageMap[status] ?? messageMap.unverified;

  return (
    <AppFrame
      role="logistics_partner"
      storeName={partner.displayName}
      storeSlug={`${partner.city ?? "Lagos"} · Fleet`}
      storeInitial={partner.displayName.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18, alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div className="card" style={{ padding: 40, maxWidth: 520, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: status === "rejected" ? "var(--danger-bg)" : "var(--amber-100)", display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
            <Icon name={msg.icon} size={24} color={status === "rejected" ? "var(--danger)" : "var(--amber-700)"} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>{msg.title}</h1>
          <p style={{ fontSize: 13.5, color: "var(--ink-600)", lineHeight: 1.6, margin: "0 0 24px" }}>{msg.desc}</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            {status === "rejected" || status === "unverified" ? (
              <Link href="/logistics/onboarding" className="dbtn dBtn-mint" style={{ textDecoration: "none" }}>
                <Icon name="edit" size={14} /> Complete onboarding
              </Link>
            ) : (
              <Link href="/logistics/profile" className="dbtn dBtn-mint" style={{ textDecoration: "none" }}>
                <Icon name="shop" size={14} /> View profile
              </Link>
            )}
            <Link href="/logistics/profile" className="dbtn dBtn-ghost" style={{ textDecoration: "none" }}>
              <Icon name="settings" size={14} /> Profile settings
            </Link>
          </div>
          {status === "pending" && (
            <div style={{ marginTop: 20, padding: "12px 16px", background: "var(--ink-50)", borderRadius: 10, fontSize: 12.5, color: "var(--ink-600)", lineHeight: 1.5 }}>
              <strong>What happens next?</strong><br />
              Once verified, you will unlock: Dashboard with live ops · Booking management · Quote responses · Billing & payouts · Team management · Public marketplace listing
            </div>
          )}
        </div>
      </div>
    </AppFrame>
  );
}
