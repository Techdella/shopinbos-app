import { AppPage, Card, CardHead, PillLink } from "@/components/app-kit";
import { LanguageSettingsCard } from "@/components/i18n/LanguagePicker";
import { SecuritySettings } from "@/components/auth/SecuritySettings";
import { IdentityImageUploader } from "@/components/profile/IdentityImageUploader";
import { adminFrame, buttonClass, fieldClass } from "@/components/admin/AdminKit";
import { Notice } from "@/components/app-ui";
import { updateAdminName } from "@/app/actions/admin-profile";
import { requireRole } from "@/lib/server-auth";

export default async function AdminSettingsPage(props: { searchParams?: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const search = (await props.searchParams) ?? {};

  return (
    <AppPage
      frame={adminFrame(user)}
      title="Settings"
      sub="Your profile, notifications, language and sign-in security."
    >
      {search.error && <div className="mb-4"><Notice>{search.error}</Notice></div>}
      {search.saved === "name" && <div className="mb-4"><Notice tone="success">Your name is saved.</Notice></div>}
      <Card className="mb-6 p-5">
        <CardHead title="Your profile" sub={user.email ?? undefined} />
        <form action={updateAdminName} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[240px] flex-1 flex-col gap-1.5 text-[13.5px] font-bold">
            Your name
            <input name="name" defaultValue={user.name} required minLength={2} maxLength={120} autoComplete="name" placeholder="First and last name" className={fieldClass} />
          </label>
          <button type="submit" className={buttonClass("ink", "sm")}>Save name</button>
        </form>
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
