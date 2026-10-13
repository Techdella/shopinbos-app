import { PillLink } from "@/components/app-kit";
import { NotificationSettingsPanel } from "@/components/notifications/NotificationSettingsPanel";
import { NotificationsShell } from "../NotificationsShell";

export const dynamic = "force-dynamic";

export default async function NotificationPreferencesPage() {
  return (
    <NotificationsShell
      title="Notification settings"
      sub="Choose what reaches your phone, browser, email and texts, and when to keep quiet."
      actions={<PillLink href="/home/notifications" icon="arrowLeft">Notifications</PillLink>}
    >
      <NotificationSettingsPanel />
    </NotificationsShell>
  );
}
