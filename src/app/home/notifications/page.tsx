import { PillLink } from "@/components/app-kit";
import { NotificationFeed } from "@/components/notifications/NotificationFeed";
import { PushPromptCard } from "@/components/notifications/PushToggle";
import { NotificationsShell } from "./NotificationsShell";

export const dynamic = "force-dynamic";

export default async function NotificationCenterPage() {
  return (
    <NotificationsShell
      title="Notifications"
      sub="Everything happening in your account, in one place."
      actions={<PillLink href="/home/notifications/preferences" icon="settings">Settings</PillLink>}
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
