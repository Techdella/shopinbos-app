"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Card, Pill } from "@/components/app-kit";
import { Notice, PillButton, Segmented, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { inboxApi } from "@/components/messaging/inbox-ui";
import type { ChatbotSettings, WhatsAppBotSettings } from "@/lib/inbox/assistant";
import type { ChannelView } from "@/lib/inbox/connect";
import { Fold } from "@/components/simple/Fold";
import { plainMetaError } from "@/components/simple/plain";
import type { WhatsAppHealth } from "@/lib/inbox/whatsapp-bot.server";
import { useT } from "@/components/i18n/I18nProvider";
import { EmbeddedSignupError, runEmbeddedSignup } from "@/components/meta/embedded-signup";
import { ConnectGuide } from "../channels/ConnectGuide";
import { friendlyError } from "@/lib/errors/report-client";

// "Peggy on WhatsApp", kept to one action at a time: not connected → one "Connect with Facebook" button (Embedded
// Signup) and a "Show me how" tour; connected → one switch for Peggy, her settings folded away, and a test message.
// Connecting with your own Meta app (tokens) lives on Inbox → Channels.

const input = "h-11 w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px] outline-none focus:border-app-ink";
const area = "w-full rounded-[14px] border border-app-line bg-white px-3 py-2.5 text-[15px] leading-[1.5] outline-none focus:border-app-ink";
const facebookButton = "inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-[#1877F2] px-6 text-[16px] font-bold text-white transition hover:brightness-95 disabled:opacity-60";

type Message = { tone: "error" | "success" | "info"; text: string } | null;

function Switch({ label, sub, on, onChange }: { label: string; sub?: ReactNode; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex min-h-[56px] items-center justify-between gap-3 rounded-[14px] bg-app-canvas px-4 py-2">
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{label}</span>
        {sub ? <span className="block text-[12.5px] text-app-ink-soft">{sub}</span> : null}
      </span>
      <Toggle on={on} onChange={onChange} label={label} />
    </div>
  );
}

export function WhatsAppPeggyClient({
  initialBot,
  initialView,
  ready,
  aiAvailable,
  hoursOn,
  encryptionReady,
  signup,
  ownerPhone,
}: {
  initialBot: ChatbotSettings;
  initialView: ChannelView;
  initialHealth?: WhatsAppHealth | null;
  ready: boolean;
  aiAvailable: boolean;
  hoursOn: boolean;
  encryptionReady: boolean;
  signup: { appId: string; configId: string } | null;
  ownerPhone: string;
  storeName?: string;
}) {
  const t = useT("inbox", "common");
  const [bot, setBot] = useState(initialBot);
  const [view, setView] = useState(initialView);
  const connected = view.status === "connected";
  const wa = bot.whatsapp;
  const setWa = (patch: Partial<WhatsAppBotSettings>) => setBot((b) => ({ ...b, whatsapp: { ...b.whatsapp, ...patch } }));

  const [connecting, setConnecting] = useState(false);
  const [connectMessage, setConnectMessage] = useState<Message>(null);
  const [testTo, setTestTo] = useState(initialBot.whatsapp.testNumber || ownerPhone);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<Message>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<Message>(null);

  async function connect() {
    if (!signup) return;
    setConnecting(true);
    setConnectMessage(null);
    try {
      const info = await runEmbeddedSignup(signup);
      const result = await inboxApi<{ view: ChannelView }>("/api/app/inbox/whatsapp", { method: "POST", body: JSON.stringify({ action: "embedded_signup", code: info.code, phoneNumberId: info.phoneNumberId, wabaId: info.wabaId }) });
      setView(result.view);
      setConnectMessage({ tone: "success", text: t("wa.connectedEmbedded") });
    } catch (error) {
      const code = error instanceof EmbeddedSignupError ? error.code : null;
      setConnectMessage({ tone: code === "closed" ? "info" : "error", text: code === "closed" ? t("wa.signupClosed") : code === "no_number" ? t("wa.noNumber") : plainMetaError(friendlyError(error)) });
    } finally {
      setConnecting(false);
    }
  }

  async function save(next: ChatbotSettings) {
    setSaving(true);
    setSaveMessage(null);
    try {
      const saved = await inboxApi<{ chatbot: ChatbotSettings }>("/api/app/inbox/automation", { method: "PUT", body: JSON.stringify({ chatbot: { ...next, whatsapp: { ...next.whatsapp, testNumber: testTo.trim() } } }) });
      setBot(saved.chatbot);
      setSaveMessage({ tone: "success", text: saved.chatbot.whatsapp.mode === "live" ? t("wa.live") : t("wa.offSaved") });
    } catch (error) {
      setSaveMessage({ tone: "error", text: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestMessage(null);
    try {
      await inboxApi("/api/app/inbox/whatsapp", { method: "POST", body: JSON.stringify({ action: "send_test", to: testTo }) });
      setTestMessage({ tone: "success", text: t("wa.testSent") });
    } catch (error) {
      setTestMessage({ tone: "error", text: friendlyError(error) });
    } finally {
      setTesting(false);
    }
  }

  if (!connected) {
    return (
      <Card className="grid max-w-[640px] gap-4 p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#25D366] text-white" aria-hidden><Icon name="whatsapp" size={22} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[20px] font-extrabold leading-tight">{t("wa.oneTitle")}</h2>
            <p className="mb-0 mt-1 text-[15px] leading-[1.5] text-app-ink-soft">{t("wa.oneSub")}</p>
          </div>
        </div>
        {view.status === "error" && view.lastError ? <Notice tone="error">{plainMetaError(view.lastError)}</Notice> : null}
        {signup && encryptionReady ? (
          <>
            <div>
              <button type="button" disabled={connecting} onClick={() => void connect()} className={facebookButton}>
                <Icon name="facebook" size={18} /> {connecting ? t("wa.connecting") : t("wa.withFacebook")}
              </button>
            </div>
            <ConnectGuide kind="whatsapp" />
          </>
        ) : (
          <Notice tone="info">
            {t("wa.oneUnavailable")} <Link href="/home/inbox/channels" className="font-bold underline">{t("ar.channels")}</Link>.
          </Notice>
        )}
        {connectMessage ? <Notice tone={connectMessage.tone}>{connectMessage.text}</Notice> : null}
      </Card>
    );
  }

  const live = wa.mode === "live";
  return (
    <div className="grid max-w-[720px] gap-5">
      <Card className="grid gap-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#25D366] text-white" aria-hidden><Icon name="whatsapp" size={22} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-[18px] font-extrabold">{view.displayName ?? "WhatsApp"}</h2>
              <Pill tone={view.lastError ? "warning" : "success"} dot>{view.lastError ? t("ch.attention") : t("ch.connected")}</Pill>
            </div>
            <Link href="/home/inbox/channels" className="text-[13px] font-bold text-app-ink-soft underline">{t("wa.change")}</Link>
          </div>
        </div>
        {view.lastError ? <Notice tone="error">{plainMetaError(view.lastError)}</Notice> : null}
        {connectMessage ? <Notice tone={connectMessage.tone}>{connectMessage.text}</Notice> : null}

        <Switch
          label={t("wa.peggyOn")}
          sub={aiAvailable ? t("wa.peggyOnSub") : t("wa.peggyOnSubNoAi")}
          on={live}
          onChange={(on) => {
            const next = { ...bot, whatsapp: { ...bot.whatsapp, mode: on ? ("live" as const) : ("off" as const) } };
            setBot(next);
            if (ready) void save(next);
          }}
        />
        {!ready ? <Notice tone="info">{t("wa.notReady")}</Notice> : null}
        {saveMessage ? <Notice tone={saveMessage.tone}>{saveMessage.text}</Notice> : null}
      </Card>

      <Fold summary={t("wa.moreSettings")} hint={t("wa.moreSettingsHint")}>
        <div className="grid gap-4">
          <Switch label={t("wa.productList")} sub={t("wa.productListSub")} on={wa.productList} onChange={(on) => setWa({ productList: on })} />
          <div className="grid gap-1.5">
            <span className="text-[13.5px] font-bold">{t("wa.wantsBuy")}</span>
            <Segmented
              options={[{ value: "cart", label: t("wa.cart") }, { value: "link", label: t("wa.sendLink") }, { value: "collect", label: t("wa.takeOrder") }, { value: "off", label: t("ch.off") }]}
              value={wa.ordering}
              onChange={(ordering) => setWa({ ordering })}
              className="border border-app-line"
            />
          </div>
          {wa.ordering === "cart" ? <Link href="/home/inbox/whatsapp-store" className="text-[13px] font-bold underline">{t("ws.title")}</Link> : null}
          <Switch label={t("wa.orderStatus")} sub={t("wa.orderStatusSub")} on={wa.orderStatus} onChange={(on) => setWa({ orderStatus: on })} />
          <div className="grid gap-1.5">
            <span className="text-[13.5px] font-bold">{t("bot.whenAnswers")}</span>
            <Segmented options={[{ value: "always", label: t("bot.always") }, { value: "outside_hours", label: hoursOn ? t("bot.outsideHours") : t("bot.whenAway") }]} value={wa.when} onChange={(value) => setWa({ when: value })} className="border border-app-line" />
          </div>
          <label className="grid gap-1 text-[13.5px] font-bold">
            {t("bot.tone")}
            <select value={bot.tone} onChange={(e) => setBot((b) => ({ ...b, tone: e.target.value as ChatbotSettings["tone"] }))} className={input}>
              <option value="friendly">{t("bot.friendly")}</option>
              <option value="professional">{t("bot.professional")}</option>
              <option value="playful">{t("bot.playful")}</option>
            </select>
          </label>
          <label className="grid gap-1 text-[13.5px] font-bold">
            {t("wa.greeting")}
            <textarea rows={2} maxLength={300} value={wa.greeting} placeholder={bot.greeting} onChange={(e) => setWa({ greeting: e.target.value })} className={area} />
          </label>
          <div><PillButton size="md" busy={saving} disabled={!ready} onClick={() => void save(bot)}>{t("save")}</PillButton></div>
        </div>
      </Fold>

      <Fold summary={t("wa.sendTest")} hint={t("wa.sendHiFirst")}>
        <div className="grid gap-3">
          <label className="grid gap-1 text-[13.5px] font-bold">
            {t("wa.ownWhatsApp")}
            <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="+2348012345678" inputMode="tel" className={`${input} font-mono`} />
          </label>
          <div><PillButton size="md" tone="white" busy={testing} disabled={!testTo.trim()} onClick={() => void sendTest()}>{t("wa.sendTest")}</PillButton></div>
          {testMessage ? <Notice tone={testMessage.tone}>{testMessage.text}</Notice> : null}
        </div>
      </Fold>
    </div>
  );
}
