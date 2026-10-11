import { PillLink } from "@/components/app-kit";
import { NotificationCenter } from "./NotificationCenter";
import { NotificationsShell } from "./NotificationsShell";

export const dynamic = "force-dynamic";

export default async function NotificationCenterPage() {
  return (
    <NotificationsShell
      title="Notifications"
      sub="Everything happening in your account, in one place."
      actions={<PillLink href="/home/notifications/preferences" icon="settings">Preferences</PillLink>}
    >
      <NotificationCenter />
    </NotificationsShell>
  );
}
