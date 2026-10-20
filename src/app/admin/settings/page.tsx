import { AppPage, Card, CardHead, PillLink } from "@/components/app-kit";
import { LanguageSettingsCard } from "@/components/i18n/LanguagePicker";
import { SecuritySettings } from "@/components/auth/SecuritySettings";
import { IdentityImageUploader } from "@/components/profile/IdentityImageUploader";
import { adminFrame } from "@/components/admin/AdminKit";
import { requireRole } from "@/lib/server-auth";

export default async function AdminSettingsPage() {
  const user = await requireRole(["admin"], "/admin/login");

  return (
    <AppPage
      frame={adminFrame(user)}
      title="Settings"
      sub="Your profile, notifications, language and sign-in security."
    >
      <Card className="mb-6 p-5">
        <CardHead title="Your profile" sub={user.email ?? undefined} />
        <div className="mt-4">
          <IdentityImageUploader kind="avatar" initialUrl={user.avatarUrl ?? null} name={user.name} title="Your photo" hint="Shows in the top bar and the menu." />
        </div>
      </Card>

      <Card className="mb-6 p-5">
        <CardHead title="Notifications" sub="Push to your phone and browser, email and quiet hours." action={<PillLink href="/home/notifications/preferences" size="sm" tone="ink">Open</PillLink>} />
      </Card>

      <LanguageSettingsCard className="mb-6" />

      <SecuritySettings className="mt-6 p-5" />
    </AppPage>
  );
}
