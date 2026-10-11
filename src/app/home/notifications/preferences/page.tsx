import { PillLink } from "@/components/app-kit";
import { NotificationsShell } from "../NotificationsShell";
import { NotificationPreferences } from "./NotificationPreferences";

export const dynamic = "force-dynamic";

export default async function NotificationPreferencesPage() {
  return (
    <NotificationsShell
      title="Notification preferences"
      sub="Choose how and when we tell you about each kind of update."
      actions={<PillLink href="/home/notifications" icon="arrowLeft">Notifications</PillLink>}
    >
      <NotificationPreferences />
    </NotificationsShell>
  );
}
