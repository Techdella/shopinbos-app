"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Card, Pill } from "@/components/app-kit";
import { cx, Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { ChannelMark, inboxApi } from "@/components/messaging/inbox-ui";
import { Fold, TechFold } from "@/components/simple/Fold";
import { SetupHelpRequest } from "@/components/support/SetupHelpRequest";
import type { ConnectableChannel } from "@/lib/inbox/meta";
import type { ChannelView } from "@/lib/inbox/connect";
import { Mascot } from "@/components/brand/Mascot";
import { useT } from "@/components/i18n/I18nProvider";

// Inbox channels below the one-tap cards: live chat, forms, email, and (folded) SMS, phone calls and Telegram.
// Keys go to the server once, are checked with the provider and stored encrypted; they never come back here.

interface Field {
  name: string;
  label: string;
  secret?: boolean;
  optional?: boolean;
  placeholder?: string;
  hint?: string;
  /** A choice instead of free text. */
  options?: Array<{ value: string; label: string }>;
  /** Only shown when the form's "provider" is one of these (SMS: Termii, Africa's Talking, Sendchamp). */
  only?: string[];
}

interface Setup {
  title: string;
  blurb: string;
  needs: string;
  steps: string[];
  fields: Field[];
}

// WhatsApp, Instagram and Messenger connect with one tap on the cards above this list (src/app/channels/
// ConnectAccounts.tsx: Meta's sign-up popup, or one Facebook sign-in for Page and Instagram messages). What's left
// here needs an account with an SMS, phone-call or Telegram provider.
type KeyChannel = Exclude<ConnectableChannel, "whatsapp" | "instagram" | "messenger">;

const SETUPS: Record<KeyChannel, Setup> = {
  sms: {
    title: "SMS",
    blurb: "Text customers from your own Termii, Africa's Talking or Sendchamp account. With a Termii number or an Africa's Talking shortcode, their replies arrive here too.",
    needs: "An account with Termii, Africa's Talking or Sendchamp, and a sender ID approved for Nigeria (takes a few days). To get replies: a Termii number, or an Africa's Talking shortcode. Sendchamp can only send.",
    steps: [
      "Sign up with one provider and request a sender ID (your shop name, 3 to 11 characters). Use the DND route for order updates so they reach numbers on Do-Not-Disturb.",
      "Termii: copy your API key, secret key and base URL from the dashboard. Africa's Talking: copy your app's username and API key (Settings → API Key). Sendchamp: copy the public access key from Account → API Keys & Webhooks.",
      "Paste them below and connect. We check the keys with the provider before saving.",
      "After connecting, copy the webhook URL shown here into your provider's dashboard (Termii: Webhook; Africa's Talking: SMS → Callback URLs for incoming messages and delivery reports; Sendchamp: Webhooks) so replies and delivery ticks come back.",
    ],
    fields: [
      { name: "provider", label: "Provider", options: [{ value: "termii", label: "Termii" }, { value: "africastalking", label: "Africa's Talking" }, { value: "sendchamp", label: "Sendchamp" }] },
      { name: "username", label: "App username", placeholder: "myshop", only: ["africastalking"], hint: "Use \"sandbox\" to test with Africa's Talking's sandbox." },
      { name: "apiKey", label: "API key", secret: true, only: ["termii", "africastalking", "sendchamp"] },
      { name: "senderId", label: "Sender ID", optional: true, placeholder: "AdasCloset", only: ["termii", "africastalking", "sendchamp"], hint: "Approved by the provider. Leave empty on Termii to send from your Termii number instead." },
      { name: "phoneNumber", label: "Number or shortcode for replies", optional: true, placeholder: "+234… or 33012", only: ["termii", "africastalking"], hint: "Without it, messages go out but customers can't reply." },
      {
        name: "route",
        label: "Route",
        optional: true,
        only: ["termii", "sendchamp"],
        options: [{ value: "dnd", label: "DND (transactional, reaches DND numbers)" }, { value: "generic", label: "Generic (Termii, promotional)" }, { value: "non_dnd", label: "Non-DND (Sendchamp, promotional)" }, { value: "international", label: "International (Sendchamp)" }],
      },
      { name: "secretKey", label: "Secret key", secret: true, optional: true, only: ["termii"], hint: "Lets us check that webhooks really come from Termii." },
      { name: "baseUrl", label: "Base URL", optional: true, placeholder: "https://v3.api.termii.com", only: ["termii"], hint: "Shown on your Termii dashboard, if it isn't the default." },
    ],
  },
  voice: {
    title: "Phone calls",
    blurb: "Calls to your Africa's Talking number are logged here and ring your own phone, or go to voicemail. Call customers back from the inbox.",
    needs: "An Africa's Talking account with a voice number (Voice → Phone numbers). If SMS is connected with Africa's Talking, leave the username and API key empty to reuse them.",
    steps: [
      "In Africa's Talking, request a voice number for your app.",
      "Add your own phone number so calls ring you; leave it empty to send every call to voicemail. Calls that ring your phone and aren't answered are logged as missed, without a voicemail.",
      "Connect, then paste the webhook URL shown here as the number's callback URL in Africa's Talking (Voice → Phone numbers).",
      "Voicemails arrive as recordings you can play here (no transcript).",
    ],
    fields: [
      { name: "phoneNumber", label: "Africa's Talking voice number", placeholder: "+234…" },
      { name: "forwardCallsTo", label: "Ring my phone first", optional: true, placeholder: "+2348012345678" },
      { name: "username", label: "App username", optional: true },
      { name: "apiKey", label: "API key", secret: true, optional: true },
    ],
  },
  telegram: {
    title: "Telegram",
    blurb: "Messages to your Telegram bot.",
    needs: "A Telegram bot made with @BotFather.",
    steps: [
      "In Telegram, message @BotFather, send /newbot and follow the steps.",
      "Copy the bot token it gives you and paste it below. We register the webhook with Telegram for you.",
      "Share your bot's link (t.me/yourbot) on your store and socials.",
    ],
    fields: [{ name: "botToken", label: "Bot token", secret: true, placeholder: "123456:ABC-DEF…" }],
  },
  email: {
    title: "Email",
    blurb: "Customers email your store's inbox address; you reply from here.",
    needs: "Nothing from you. Shopinbos sends through Resend; receiving needs the platform's inbound email domain.",
    steps: [
      "Connect to turn email on for your store.",
      "Give customers your inbox address, or set your business mailbox (Gmail, Outlook) to forward customer mail to it.",
      "Replies are sent from your inbox address, so the customer's answers come back here.",
    ],
    fields: [],
  },
};

/** Phone and bot channels, folded under "More ways customers can reach you". */
const MORE: KeyChannel[] = ["sms", "voice", "telegram"];

function CopyRow({ label, value }: { label: string; value: string }) {
  const t = useT("inbox");
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1">
      <span className="text-[12.5px] font-bold text-app-ink-soft">{label}</span>
      <div className="flex min-w-0 items-center gap-2 rounded-[12px] bg-app-canvas px-3 py-2">
        <code className="min-w-0 flex-1 break-all font-mono text-[12.5px]">{value}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
          aria-label={t("ch.copy", { label })}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-white"
        >
          <Icon name={copied ? "check" : "copy"} size={15} />
        </button>
      </div>
    </div>
  );
}

// Each channel (simplicity rules, section 8A): a plain status and one action, "Ask us to connect it". The keys,
// steps, webhook URLs and the connect form are for "the person who manages your … account", in a TechFold.

function ChannelCard({ view, setup, onChange, encryptionReady, extra, tech }: { view: ChannelView; setup: Setup; onChange: (view: ChannelView) => void; encryptionReady: boolean; extra?: ReactNode; tech?: ReactNode }) {
  const t = useT("inbox", "common");
  const title = t.dynamic(`ch.${view.channel}.title`, setup.title);
  const connected = view.status === "connected";
  const [open, setOpen] = useState(false);
  const [askUs, setAskUs] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function connect() {
    setBusy(true);
    setMessage(null);
    try {
      // Only send what's on screen (switching SMS provider hides the other providers' fields).
      const shown = new Set(setup.fields.filter((f) => !f.only || f.only.includes(values.provider ?? "")).map((f) => f.name));
      const body = Object.fromEntries(Object.entries(values).filter(([k, v]) => shown.has(k) && v.trim()));
      const next = await inboxApi<ChannelView>(`/api/app/inbox/channels/${view.channel}`, { method: "POST", body: JSON.stringify(body) });
      onChange(next);
      setValues({});
      setOpen(false);
      setMessage({ tone: "success", text: t("ch.isConnected", { title }) });
    } catch {
      setMessage({ tone: "error", text: t("ch.rejected", { title }) });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!(await confirmDialog(t("ch.confirmDisconnect", { title })))) return;
    setBusy(true);
    try {
      await inboxApi(`/api/app/inbox/channels/${view.channel}`, { method: "DELETE" });
      onChange({ ...view, status: "disconnected", verifyToken: null, lastError: null });
      setMessage({ tone: "success", text: t("ch.disconnected") });
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const needsKeys = setup.fields.some((f) => !f.optional) || view.channel === "voice";
  const blocked = needsKeys && !encryptionReady && view.channel !== "email";

  return (
    <Card className="grid content-start gap-3 p-5">
      <div className="flex items-start gap-3">
        <ChannelMark channel={view.channel} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-[16px] font-extrabold">{title}</h2>
            {connected ? <Pill tone={view.lastError ? "warning" : "success"} dot>{view.lastError ? t("ch.attention") : t("ch.connected")}</Pill> : view.status === "error" ? <Pill tone="warning" dot>{t("ch.reconnect")}</Pill> : <Pill tone="muted">{t("ch.notConnected")}</Pill>}
          </div>
          <p className="mb-0 mt-1 text-[13.5px] leading-[1.5] text-app-ink-soft">{connected && view.displayName ? view.displayName : t.dynamic(`ch.${view.channel}.blurb`, setup.blurb)}</p>
        </div>
      </div>

      {view.lastError && (connected || view.status === "error") && (
        <Notice tone="error">{t("ch.cantReach", { title })}</Notice>
      )}
      {extra}

      {!connected && setup.fields.length > 0 && (
        askUs ? (
          <SetupHelpRequest title={t("ch.helpTitle", { title })} description={t("ch.helpDesc", { title })} feature={`inbox_${view.channel}`} />
        ) : (
          <div><PillButton size="md" tone="ink" onClick={() => setAskUs(true)}>{t("ch.askUs")}</PillButton></div>
        )
      )}
      {connected && view.lastError && !askUs && <div><PillButton size="sm" tone="white" onClick={() => setAskUs(true)}>{t("ch.askHelp")}</PillButton></div>}
      {connected && view.lastError && askUs && <SetupHelpRequest title={t("ch.fixTitle", { title })} description={t("ch.fixDesc", { title })} feature={`inbox_${view.channel}`} />}

      {setup.fields.length > 0 || tech ? (
      <TechFold forWho={t("ch.forWho", { title })}>
      <div className="grid gap-3">
      {view.lastError && <p className="m-0 break-words text-[12.5px] text-app-ink-soft">{t("ch.lastProblem", { error: view.lastError })}</p>}
      {tech}

      <div className="grid gap-2">
        <p className="m-0 text-[13px] leading-[1.5] text-app-ink-soft"><strong className="text-app-ink">{t("ch.youNeed")}</strong> {setup.needs}</p>
        <ol className="m-0 grid gap-1.5 pl-5 text-[13px] leading-[1.5]">
          {setup.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </div>

      {open && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void connect();
          }}
          className="grid gap-3"
        >
          {setup.fields.filter((field) => !field.only || field.only.includes(values.provider ?? "")).map((field) => (
            <label key={field.name} className="grid gap-1 text-[13.5px] font-bold">
              <span>{field.label}{field.optional ? <span className="font-normal text-app-ink-soft"> {t("ch.optional")}</span> : null}</span>
              {field.options ? (
                <select
                  required={!field.optional}
                  value={values[field.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                  className="h-11 w-full rounded-[14px] border border-app-line bg-white px-3 text-[14px] font-normal outline-none focus:border-app-ink"
                >
                  <option value="">{field.optional ? t("ch.default") : t("ch.choose")}</option>
                  {field.options
                    .filter((option) => field.name !== "route" || (values.provider === "termii" ? ["dnd", "generic"] : ["dnd", "non_dnd", "international"]).includes(option.value))
                    .map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
              <input
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                required={!field.optional}
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                placeholder={field.placeholder}
                className="h-11 w-full rounded-[14px] border border-app-line bg-white px-3 font-mono text-[14px] font-normal outline-none focus:border-app-ink"
              />
              )}
              {field.hint && <span className="text-[12px] font-normal text-app-ink-soft">{field.hint}</span>}
            </label>
          ))}
          {(connected || view.status === "error") && setup.fields.length > 0 && <p className="m-0 text-[12.5px] text-app-ink-soft">{t("ch.savedKeys")}</p>}
          <div className="flex flex-wrap gap-2">
            <PillButton type="submit" size="md" busy={busy}>{connected || view.status === "error" ? t("ch.saveReconnect") : t("ch.connect")}</PillButton>
            <PillButton size="md" tone="ghost" onClick={() => setOpen(false)}>{t("cancel")}</PillButton>
          </div>
        </form>
      )}

      {!open && setup.fields.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {blocked ? (
            <p className="m-0 text-[13px] text-app-ink-soft">{t("ch.noKeyStore")}</p>
          ) : (
            <PillButton size="md" tone="white" onClick={() => setOpen(true)}>{connected ? t("ch.updateKeys") : t("ch.connectKeys")}</PillButton>
          )}
        </div>
      )}
      <p className="m-0 text-[12px] text-app-ink-soft">{t("ch.keysNote")}</p>
      </div>
      </TechFold>
      ) : null}

      {connected ? (
        <div className="flex flex-wrap gap-2">
          <PillButton size="md" tone="ghost" busy={busy} onClick={() => void disconnect()}>{t("ch.disconnect")}</PillButton>
        </div>
      ) : null}
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
  const connectedCount = views.filter((v) => MORE.includes(v.channel as KeyChannel) && v.status === "connected").length;

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

      <Fold summary={t("ch.more")} hint={t("ch.moreHint", { count: connectedCount })}>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {MORE.map((key) => {
            const view = views.find((v) => v.channel === key)!;
            let extra: ReactNode = null;
            let tech: ReactNode = null;
            if (key === "voice" && view.status === "connected") {
              extra = (
                <p className="m-0 text-[13px] text-app-ink-soft">{forwardCallsTo ? t("ch.callsRing", { phone: forwardCallsTo }) : t("ch.voicemail")} {t("ch.changeIn")} <Link href="/home/inbox/settings" className="font-bold text-app-ink">{t("ch.inboxSettings")}</Link>.</p>
              );
              if (view.webhookUrl) tech = <CopyRow label={t("ch.voiceCallback")} value={view.webhookUrl} />;
            }
            if (key === "sms" && view.status === "connected" && view.webhookUrl) tech = <CopyRow label={t("ch.smsWebhook")} value={view.webhookUrl} />;
            if (key === "telegram" && view.status === "connected" && view.webhookUrl) tech = <CopyRow label={t("ch.telegramWebhook")} value={view.webhookUrl} />;
            return <ChannelCard key={key} view={view} setup={SETUPS[key]} onChange={update} encryptionReady={platform.encryption} extra={extra} tech={tech} />;
          })}
        </div>
      </Fold>
      <p className={cx("m-0 text-[13px] text-app-ink-soft")}>
        {t("ch.notSure")}
      </p>
    </div>
  );
}
