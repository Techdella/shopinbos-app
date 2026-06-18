import { AppFrame } from "@/components/shell/AppFrame";
import { TopBar } from "@/components/shell/TopBar";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { toggleChannelConnection } from "@/app/actions/workspace";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, socialChannels } from "@/lib/workspace";

export default async function ChannelsPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);

  if (!workspace) {
    return null;
  }

  const connected = new Set(workspace.settings.connectedChannels ?? []);

  return (
    <AppFrame role="seller" chipMode="rail" chipRole="seller" avatarUrl={user.avatarUrl} userEmail={user.email}>
      <TopBar
        eyebrow="CHANNELS"
        title="Connect your sales and messaging channels"
        subtitle="The channel state below is persisted in your store settings, so the setup flow and dashboard stay in sync."
      />

      <div className="flex-1 overflow-y-auto p-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {socialChannels.map((channel) => {
            const isConnected = connected.has(channel.key);
            return (
              <Card key={channel.key}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[14px]" style={{ background: channel.color }}>
                      <Icon name={channel.icon} size={20} color="white" />
                    </div>
                    <div>
                      <div className="font-semibold text-[var(--color-navy)]">{channel.label}</div>
                      <div className="text-[12px] text-[var(--color-muted)]">{channel.help}</div>
                    </div>
                  </div>
                  <Pill bg={isConnected ? "var(--color-mint-pale)" : "rgb(14 42 56 / 0.05)"} color={isConnected ? "var(--color-teal-deep)" : "var(--color-muted)"}>
                    {isConnected ? "Connected" : "Disconnected"}
                  </Pill>
                </div>
                <form action={toggleChannelConnection} className="mt-4">
                  <input type="hidden" name="channel" value={channel.key} />
                  <Btn type="submit" variant={isConnected ? "outline" : "mint"} size="sm">
                    {isConnected ? "Disconnect" : "Connect"}
                  </Btn>
                </form>
              </Card>
            );
          })}
        </div>
      </div>
    </AppFrame>
  );
}
