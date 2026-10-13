import { PillLink } from "@/components/app-kit";
import { NotificationSettingsPanel } from "@/components/notifications/NotificationSettingsPanel";
import { NotificationsShell } from "../NotificationsShell";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NotificationPreferencesPage() {
  const t = await getT("inbox");
  return (
    <NotificationsShell
      title={t("notifPage.settingsTitle")}
      sub={t("notifPage.settingsSub")}
      actions={<PillLink href="/home/notifications" icon="arrowLeft">{t("notifPage.title")}</PillLink>}
    >
      <NotificationSettingsPanel />
    </NotificationsShell>
  );
}
