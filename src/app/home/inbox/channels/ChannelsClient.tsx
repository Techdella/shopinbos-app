"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Card, Pill } from "@/components/app-kit";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { ChannelMark, inboxApi } from "@/components/messaging/inbox-ui";
import { Fold } from "@/components/simple/Fold";
import type { ConnectableChannel } from "@/lib/inbox/meta";
import type { ChannelView } from "@/lib/inbox/connect";
import { Mascot } from "@/components/brand/Mascot";
import { useT } from "@/components/i18n/I18nProvider";

// Inbox channels below the one-tap cards: live chat, forms, email, and (folded) SMS, phone calls and Telegram.
// WhatsApp, Instagram and Messenger connect with one tap on the cards above this list (src/app/channels/
// ConnectAccounts.tsx). SMS, phone calls and Telegram need an account with a provider and can't be connected in one
// tap, so they only show (status and Disconnect) for stores that already have them. No keys, webhooks, steps or
// "Ask us" buttons are shown to sellers; the API still accepts provider keys.
type KeyChannel = Exclude<ConnectableChannel, "whatsapp" | "instagram" | "messenger" | "email">;

const FALLBACK: Record<KeyChannel, { title: string; blurb: string }> = {
  sms: { title: "SMS", blurb: "Text customers, and get their replies here." },
  voice: { title: "Phone calls", blurb: "Calls to your business number are logged here and ring your phone." },
  telegram: { title: "Telegram", blurb: "Messages to your Telegram bot." },
};

/** Phone and bot channels, folded under "More ways customers can reach you". */
const MORE: KeyChannel[] = ["sms", "voice", "telegram"];

// Each channel (simplicity rules, section 8A): a plain status and one action, "Ask us to set it up".
function ChannelCard({ view, onChange, extra }: { view: ChannelView; onChange: (view: ChannelView) => void; extra?: ReactNode }) {
  const key = view.channel as KeyChannel;
  const t = useT("inbox", "common");
  const title = t.dynamic(`ch.${key}.title`, FALLBACK[key].title);
  const connected = view.status === "connected";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function disconnect() {
    if (!(await confirmDialog(t("ch.confirmDisconnect", { title })))) return;
    setBusy(true);
    try {
      await inboxApi(`/api/app/inbox/channels/${view.channel}`, { method: "DELETE" });
      onChange({ ...view, status: "disconnected", verifyToken: null, lastError: null });
      setMessage({ tone: "success", text: t("ch.disconnected") });
    } catch {
      setMessage({ tone: "error", text: t("ch.cantReach", { title }) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="grid content-start gap-3 p-5">
      <div className="flex items-start gap-3">
        <ChannelMark channel={view.channel} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-[16px] font-extrabold">{title}</h2>
            {connected ? <Pill tone={view.lastError ? "warning" : "success"} dot>{view.lastError ? t("ch.attention") : t("ch.connected")}</Pill> : view.status === "error" ? <Pill tone="warning" dot>{t("ch.reconnect")}</Pill> : <Pill tone="muted">{t("ch.notConnected")}</Pill>}
          </div>
          <p className="mb-0 mt-1 text-[13.5px] leading-[1.5] text-app-ink-soft">{connected && view.displayName ? view.displayName : t.dynamic(`ch.${key}.blurb`, FALLBACK[key].blurb)}</p>
        </div>
      </div>

      {view.lastError && (connected || view.status === "error") && <Notice tone="error">{t("ch.cantReach", { title })}</Notice>}
      {extra}

      {connected && (
        <div className="flex flex-wrap gap-2">
          <PillButton size="md" tone="ghost" busy={busy} onClick={() => void disconnect()}>{t("ch.disconnect")}</PillButton>
        </div>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </Card>
  );
}

/** Email has its own page (Inbox → Email): Gmail, the store's own domain, or the Shopinbos inbox address. */
function EmailChannelCard({ view }: { view: ChannelView }) {
  const t = useT("inbox");
  const connected = view.status === "connected";
  return (
    <Card className="grid content-start gap-3 p-5">
      <div className="flex items-start gap-3">
        <ChannelMark channel="email" size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-[16px] font-extrabold">{t("ch.email.title")}</h2>
            {connected ? <Pill tone={view.lastError ? "warning" : "success"} dot>{view.lastError ? t("ch.attention") : t("ch.connected")}</Pill> : <Pill tone="muted">{t("ch.notConnected")}</Pill>}
          </div>
          <p className="mb-0 mt-1 break-words text-[13.5px] leading-[1.5] text-app-ink-soft">{connected && view.displayName ? t("email.card.sendsFrom", { address: view.displayName }) : t("email.card.blurb")}</p>
        </div>
      </div>
      <div>
        <Link href="/home/inbox/email" className="inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14px] font-bold text-white no-underline hover:bg-black">
          {connected ? t("email.card.manage") : t("email.card.connect")}
        </Link>
      </div>
    </Card>
  );
}

export function ChannelsClient({
  initial,
  platform,
  liveChat,
  forwardCallsTo,
}: {
  initial: ChannelView[];
  platform: { encryption: boolean; resend: boolean; resendInbound: boolean; emailDomain: string | null; metaAppSecret: boolean; metaVerifyToken: boolean };
  liveChat: { on: boolean; mode: string };
  forwardCallsTo: string;
}) {
  const t = useT("inbox");
  const [views, setViews] = useState(initial);
  const update = (next: ChannelView) => setViews((current) => current.map((v) => (v.channel === next.channel ? next : v)));
  // SMS, phone calls and Telegram can't be connected in one tap, so they only show for stores that already have them.
  const connectedCount = views.filter((v) => MORE.includes(v.channel as KeyChannel) && v.status !== "disconnected").length;

  return (
    <div className="grid gap-5">
      {!platform.encryption && (
        <Notice tone="info">{t("ch.noEncryption")}</Notice>
      )}

      <section aria-label={t("ch.builtIn")} className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <Card className="grid content-start gap-3 p-5">
          <div className="flex items-start gap-3">
            <ChannelMark channel="livechat" size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h2 className="m-0 text-[16px] font-extrabold">{t("channel.livechat")}</h2><Pill tone={liveChat.on ? "success" : "muted"} dot>{liveChat.on ? t("ch.onStore") : t("ch.off")}</Pill></div>
              <p className="mb-0 mt-1 text-[13.5px] leading-[1.5] text-app-ink-soft">{t("ch.liveBlurb")}</p>
            </div>
          </div>
          <div><Link href="/home/marketing/chat" className="inline-flex min-h-[44px] items-center rounded-full border border-app-line px-5 text-[14px] font-bold text-app-ink no-underline hover:border-app-line-strong">{t("ch.styleChat")}</Link></div>
        </Card>
        <Card className="grid content-start gap-3 p-5">
          <div className="flex items-start gap-3">
            <ChannelMark channel="form" size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h2 className="m-0 text-[16px] font-extrabold">{t("ch.forms")}</h2><Pill tone="success" dot>{t("ch.on")}</Pill></div>
              <p className="mb-0 mt-1 text-[13.5px] leading-[1.5] text-app-ink-soft">{t("ch.formsBlurb")}</p>
            </div>
          </div>
          <div><Link href="/home/marketing/forms" className="inline-flex min-h-[44px] items-center rounded-full border border-app-line px-5 text-[14px] font-bold text-app-ink no-underline hover:border-app-line-strong">{t("ch.manageForms")}</Link></div>
        </Card>
        <Card className="grid content-start gap-3 p-5 md:col-span-2">
          <div className="flex items-start gap-3">
            <ChannelMark channel="tiktok" size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h2 className="m-0 text-[16px] font-extrabold">{t("ch.tiktok")}</h2><Pill tone="muted">{t("ch.notAvailable")}</Pill></div>
              <p className="mb-0 mt-1 text-[13.5px] leading-[1.5] text-app-ink-soft">
                {t("ch.tiktokBody")}
              </p>
            </div>
          </div>
        </Card>
      </section>

      <section aria-label={t("ch.toConnect")} className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        <EmailChannelCard view={views.find((v) => v.channel === "email")!} />
        <Link href="/home/inbox/chatbot?tab=whatsapp" className="flex min-h-[48px] items-center gap-3 self-start rounded-[18px] border border-app-line bg-white px-4 py-3 text-app-ink no-underline hover:bg-app-mint">
          <Mascot who="peggy" className="h-9 w-9 rounded-full bg-app-canvas p-0.5" decorative />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold">{t("ch.peggyOnWhatsApp")}</span>
            <span className="block text-[12.5px] text-app-ink-soft">{views.find((v) => v.channel === "whatsapp")?.status === "connected" ? t("ch.peggyConnected") : t("ch.peggySetup")}</span>
          </span>
          <Icon name="chevRight" size={16} />
        </Link>
      </section>

      {connectedCount > 0 && (
      <Fold summary={t("ch.more")} hint={t("ch.moreHint", { count: connectedCount })}>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {MORE.filter((key) => views.find((v) => v.channel === key)?.status !== "disconnected").map((key) => {
            const view = views.find((v) => v.channel === key)!;
            const extra =
              key === "voice" && view.status === "connected" ? (
                <p className="m-0 text-[13px] text-app-ink-soft">{forwardCallsTo ? t("ch.callsRing", { phone: forwardCallsTo }) : t("ch.voicemail")} {t("ch.changeIn")} <Link href="/home/inbox/settings" className="font-bold text-app-ink">{t("ch.inboxSettings")}</Link>.</p>
              ) : null;
            return <ChannelCard key={key} view={view} onChange={update} extra={extra} />;
          })}
        </div>
      </Fold>
      )}
    </div>
  );
}
