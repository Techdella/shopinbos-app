import { toggleChannelConnection } from "@/app/actions/workspace";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, socialChannels } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Pill } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";

export default async function ChannelsPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);

  if (!workspace) {
    return null;
  }

  const connected = new Set(workspace.settings.connectedChannels ?? []);

  return (
    <SellerPage
      user={user}
      store={storeSummary(workspace.store)}
      title="Sell everywhere"
      sub="Connect the places you sell and chat with customers. Your choices are saved with your store."
    >
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {socialChannels.map((channel) => {
          const isConnected = connected.has(channel.key);
          return (
            <li key={channel.key} className="flex min-w-0 flex-col gap-4 rounded-[22px] border border-app-line bg-white p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] text-white" style={{ background: channel.color }}>
                  <Icon name={channel.icon} size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="m-0 truncate text-[16px] font-extrabold">{channel.label}</h2>
                  <p className="mb-0 mt-0.5 text-[13.5px] leading-[1.45] text-app-ink-soft">{channel.help}</p>
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between gap-3">
                <Pill tone={isConnected ? "success" : "muted"} dot>{isConnected ? "Connected" : "Not connected"}</Pill>
                <form action={toggleChannelConnection}>
                  <input type="hidden" name="channel" value={channel.key} />
                  <button
                    type="submit"
                    aria-label={`${isConnected ? "Disconnect" : "Connect"} ${channel.label}`}
                    className={cx(
                      "inline-flex min-h-[40px] items-center rounded-full px-4 text-[13.5px] font-extrabold transition",
                      isConnected ? "border border-app-line bg-white text-app-ink hover:border-app-line-strong" : "bg-app-ink text-white hover:bg-black",
                    )}
                  >
                    {isConnected ? "Disconnect" : "Connect"}
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </SellerPage>
  );
}
