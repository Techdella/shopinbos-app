import { PillLink } from "@/components/app-kit";
import { NotificationFeed } from "@/components/notifications/NotificationFeed";
import { PushPromptCard } from "@/components/notifications/PushToggle";
import { NotificationsShell } from "./NotificationsShell";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NotificationCenterPage() {
  const t = await getT("inbox", "common");
  return (
    <NotificationsShell
      title={t("notifPage.title")}
      sub={t("notifPage.sub")}
      actions={<PillLink href="/home/notifications/preferences" icon="settings">{t("settings")}</PillLink>}
    >
      {(role) => (
        <div className="grid gap-4">
          <PushPromptCard />
          <NotificationFeed role={role} />
        </div>
      )}
    </NotificationsShell>
  );
}
