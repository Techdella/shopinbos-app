"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { Notice, PillButton, Segmented, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { formatWhen, inboxApi } from "@/components/messaging/inbox-ui";
import type { ChatbotSettings, WhatsAppBotSettings } from "@/lib/inbox/assistant";
import type { ChannelView } from "@/lib/inbox/connect";
import { SetupHelpRequest } from "@/components/support/SetupHelpRequest";
import { plainMetaError } from "@/components/simple/plain";
import type { WhatsAppHealth } from "@/lib/inbox/whatsapp-bot.server";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate, type Locale, type TFunction } from "@shared/i18n";
import { EmbeddedSignupError, runEmbeddedSignup } from "@/components/meta/embedded-signup";
import type { MessageKey } from "@shared/i18n/catalog";

type InboxT = TFunction<MessageKey<"inbox"> | MessageKey<"common">>;

// "Put Peggy on your WhatsApp": 1. connect WhatsApp Business (one tap: Meta's sign-up popup; or "Ask us to connect
// it" when the platform has no Meta app), 2. choose what Peggy does there, 3. test on your own number, then go live.
// Health on top: last message in, Peggy's last reply, failures, token expiry. Keys never come back to the browser.

const input = "h-11 w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px] outline-none focus:border-app-ink";
const area = "w-full rounded-[14px] border border-app-line bg-white px-3 py-2.5 text-[15px] leading-[1.5] outline-none focus:border-app-ink";

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

function Step({ n, title, sub, done, children }: { n: number; title: string; sub: string; done?: boolean; children: ReactNode }) {
  return (
    <Card className="grid gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[14px] font-extrabold ${done ? "bg-app-success-tint text-app-success" : "bg-app-ink text-white"}`}>{done ? <Icon name="check" size={16} /> : n}</span>
        <CardHead title={title} sub={sub} className="min-w-0 flex-1" />
      </div>
      {children}
    </Card>
  );
}

const when = (iso: string | null, t: InboxT, locale: Locale) => (iso ? formatWhen(iso, locale) : t("wa.never"));

function tokenText(value: string | null, t: InboxT, locale: Locale) {
  if (!value) return t("wa.unknown");
  if (value === "never") return t("wa.noExpiry");
  const date = new Date(value);
  if (date.getTime() <= Date.now()) return t("wa.expired");
  return t("wa.expires", { date: locale === "en" ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : formatDate(date, locale) });
}

export function WhatsAppPeggyClient({
  initialBot,
  initialView,
  initialHealth,
  ready,
  aiAvailable,
  hoursOn,
  encryptionReady,
  signup,
  ownerPhone,
  storeName,
}: {
  initialBot: ChatbotSettings;
  initialView: ChannelView;
  initialHealth: WhatsAppHealth;
  ready: boolean;
  aiAvailable: boolean;
  hoursOn: boolean;
  encryptionReady: boolean;
  signup: { appId: string; configId: string } | null;
  ownerPhone: string;
  storeName: string;
}) {
  const t = useT("inbox", "common");
  const locale = useLocale();
  const [bot, setBot] = useState(initialBot);
  const [view, setView] = useState(initialView);
  const [health, setHealth] = useState(initialHealth);
  const connected = view.status === "connected";
  const wa = bot.whatsapp;
  const setWa = (patch: Partial<WhatsAppBotSettings>) => setBot((b) => ({ ...b, whatsapp: { ...b.whatsapp, ...patch } }));

  // Step 1
  const [askTeam, setAskTeam] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectMessage, setConnectMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checks, setChecks] = useState<Array<{ label: string; ok: boolean | null; detail: string }> | null>(null);

  // Step 3
  const [testTo, setTestTo] = useState(initialBot.whatsapp.testNumber || ownerPhone);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function connectEmbedded() {
    if (!signup) return;
    setConnecting(true);
    setConnectMessage(null);
    try {
      const info = await runEmbeddedSignup(signup);
      const result = await inboxApi<{ view: ChannelView; health: WhatsAppHealth }>("/api/app/inbox/whatsapp", { method: "POST", body: JSON.stringify({ action: "embedded_signup", code: info.code, phoneNumberId: info.phoneNumberId, wabaId: info.wabaId }) });
      setView(result.view);
      setHealth(result.health);
      setConnectMessage({ tone: "success", text: t("wa.connectedEmbedded") });
    } catch (error) {
      const code = error instanceof EmbeddedSignupError ? error.code : null;
      setConnectMessage({ tone: "error", text: code === "closed" ? t("wa.signupClosed") : code === "no_number" ? t("wa.noNumber") : (error as Error).message });
    } finally {
      setConnecting(false);
    }
  }

  async function testConnection() {
    setChecking(true);
    setChecks(null);
    try {
      const result = await inboxApi<{ checks: Array<{ label: string; ok: boolean | null; detail: string }>; health: WhatsAppHealth }>("/api/app/inbox/whatsapp", { method: "POST", body: JSON.stringify({ action: "test_connection" }) });
      setChecks(result.checks);
      setHealth(result.health);
    } catch (error) {
      setChecks([{ label: t("wa.connection"), ok: false, detail: (error as Error).message }]);
    } finally {
      setChecking(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestMessage(null);
    try {
      await inboxApi("/api/app/inbox/whatsapp", { method: "POST", body: JSON.stringify({ action: "send_test", to: testTo }) });
      setTestMessage({ tone: "success", text: t("wa.testSent") });
    } catch (error) {
      setTestMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setTesting(false);
    }
  }

  async function save(nextMode?: WhatsAppBotSettings["mode"]) {
    setSaving(true);
    setSaveMessage(null);
    const next = { ...bot, whatsapp: { ...bot.whatsapp, testNumber: testTo.trim(), ...(nextMode ? { mode: nextMode } : {}) } };
    try {
      const saved = await inboxApi<{ chatbot: ChatbotSettings }>("/api/app/inbox/automation", { method: "PUT", body: JSON.stringify({ chatbot: next }) });
      setBot(saved.chatbot);
      const mode = saved.chatbot.whatsapp.mode;
      setSaveMessage({ tone: "success", text: mode === "live" ? t("wa.live") : mode === "test" ? t("wa.testMode", { number: saved.chatbot.whatsapp.testNumber || t("wa.ownNumber") }) : t("wa.offSaved") });
    } catch (error) {
      setSaveMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const tokenWarn = health.tokenExpiresAt && health.tokenExpiresAt !== "never" && new Date(health.tokenExpiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60_000;
  const liveBlocked = !connected || !ready;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid min-w-0 content-start gap-5">
        {!ready ? <Notice tone="info">{t("wa.notReady")}</Notice> : null}
        {!aiAvailable ? (
          <Notice tone="info">{t("wa.noAi")} <Link href="/home/inbox/auto-replies" className="font-bold underline">{t("bot.noKeyLink")}</Link>.</Notice>
        ) : null}

        <Step n={1} title={t("wa.step1")} sub={t("wa.step1Sub")} done={connected}>
          {connected ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={view.lastError ? "warning" : "success"} dot>{view.lastError ? t("ch.attention") : t("ch.connected")}</Pill>
                <span className="text-[14px] font-semibold">{view.displayName}</span>
              </div>
              {view.lastError ? <Notice tone="error">{plainMetaError(view.lastError)}</Notice> : null}
              {view.lastError ? <SetupHelpRequest title={t("wa.fixTitle")} description={t("wa.fixDesc")} feature="whatsapp_connect" /> : null}
              <div className="flex flex-wrap gap-2">
                <PillButton size="md" tone="white" busy={checking} onClick={() => void testConnection()}>{t("wa.check")}</PillButton>
                <Link href="/home/inbox/channels" className="inline-flex min-h-[48px] items-center rounded-full px-5 text-[15px] font-bold text-app-ink no-underline hover:bg-black/[0.04]">{t("wa.change")}</Link>
              </div>
              {checks ? (
                <ul className="m-0 grid list-none gap-2 p-0">
                  {checks.map((check) => (
                    <li key={check.label} className="flex items-start gap-2 text-[13.5px]">
                      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${check.ok === true ? "bg-app-success-tint text-app-success" : check.ok === false ? "bg-app-danger-tint text-app-danger" : "bg-app-canvas text-app-ink-soft"}`}>
                        <Icon name={check.ok === true ? "check" : check.ok === false ? "x" : "info"} size={12} />
                      </span>
                      <span><strong>{check.label}:</strong> {check.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : !encryptionReady ? (
            <SetupHelpRequest title={t("wa.helpTitle")} description={t("wa.helpDesc")} feature="whatsapp_connect" softwareQuestion={t("wa.helpQuestion")} softwarePlaceholder="0803 123 4567" />
          ) : (
            <div className="grid gap-4">
              {signup ? (
                <div className="grid gap-2">
                  <div>
                    <PillButton size="md" busy={connecting} onClick={() => void connectEmbedded()}>
                      <Icon name="whatsapp" size={16} /> {t("wa.withFacebook")}
                    </PillButton>
                  </div>
                  <p className="m-0 text-[13px] text-app-ink-soft">{t("wa.withFacebookSub")}</p>
                </div>
              ) : null}
              {askTeam ? (
                <SetupHelpRequest title={t("wa.helpTitle")} description={t("wa.helpDesc")} feature="whatsapp_connect" softwareQuestion={t("wa.helpQuestion")} softwarePlaceholder="0803 123 4567" />
              ) : (
                <button type="button" onClick={() => setAskTeam(true)} className="w-fit min-h-[44px] text-[14px] font-bold text-app-ink underline">{t("wa.askUs")}</button>
              )}
            </div>
          )}
          {connectMessage ? <Notice tone={connectMessage.tone}>{connectMessage.text}</Notice> : null}
        </Step>

        <Step n={2} title={t("wa.step2")} sub={t("wa.step2Sub")}>
          <div className="rounded-[14px] bg-app-canvas px-4 py-3">
            <span className="block text-[14px] font-semibold">{t("wa.answers")}</span>
            <span className="block text-[12.5px] text-app-ink-soft">{t("wa.answersSub")} <Link href="/home/inbox/chatbot" className="font-bold text-app-ink">{t("wa.liveTab")}</Link>.</span>
          </div>
          <Switch label={t("wa.productList")} sub={t("wa.productListSub")} on={wa.productList} onChange={(on) => setWa({ productList: on })} />
          <div className="grid gap-1.5">
            <span className="text-[13.5px] font-bold">{t("wa.wantsBuy")}</span>
            <Segmented
              options={[{ value: "link", label: t("wa.sendLink") }, { value: "collect", label: t("wa.takeOrder") }, { value: "off", label: t("ch.off") }]}
              value={wa.ordering}
              onChange={(ordering) => setWa({ ordering })}
              className="border border-app-line"
            />
            <span className="text-[12.5px] text-app-ink-soft">
              {wa.ordering === "link" ? t("wa.linkHint") : wa.ordering === "collect" ? t("wa.collectHint") : t("wa.offHint")}
            </span>
          </div>
          <Switch label={t("wa.orderStatus")} sub={t("wa.orderStatusSub")} on={wa.orderStatus} onChange={(on) => setWa({ orderStatus: on })} />
          <div className="grid gap-1.5">
            <span className="text-[13.5px] font-bold">{t("bot.whenAnswers")}</span>
            <Segmented options={[{ value: "always", label: t("bot.always") }, { value: "outside_hours", label: hoursOn ? t("bot.outsideHours") : t("bot.whenAway") }]} value={wa.when} onChange={(value) => setWa({ when: value })} className="border border-app-line" />
            <span className="text-[12.5px] text-app-ink-soft">{hoursOn ? t("wa.usesHours") : <>{t("bot.setHours")} <Link href="/home/inbox/auto-replies" className="font-bold text-app-ink">{t("autoReplies")}</Link> {t("bot.setHoursAfter")}</>}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-[13.5px] font-bold">
              {t("bot.tone")}
              <select value={bot.tone} onChange={(e) => setBot((b) => ({ ...b, tone: e.target.value as ChatbotSettings["tone"] }))} className={input}>
                <option value="friendly">{t("bot.friendly")}</option>
                <option value="professional">{t("bot.professional")}</option>
                <option value="playful">{t("bot.playful")}</option>
              </select>
            </label>
            <label className="grid gap-1 text-[13.5px] font-bold">
              {t("wa.quiet")}
              <select value={wa.quietMinutes} onChange={(e) => setWa({ quietMinutes: Number(e.target.value) })} className={input}>
                {[10, 30, 60, 120, 240].map((m) => <option key={m} value={m}>{m < 60 ? t("wa.minutes", { count: m }) : t("wa.hours", { count: m / 60 })}</option>)}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-[13.5px] font-bold">
            {t("wa.greeting")}
            <textarea rows={2} maxLength={300} value={wa.greeting} placeholder={bot.greeting} onChange={(e) => setWa({ greeting: e.target.value })} className={area} />
            <span className="text-[12px] font-normal text-app-ink-soft">{t("wa.greetingHint")}</span>
          </label>
          <p className="m-0 rounded-[14px] bg-app-canvas px-4 py-3 text-[13px] leading-[1.5] text-app-ink-soft">
            <strong className="text-app-ink">{t("wa.handoff")}</strong> {t("wa.handoffBody")}
            <br />
            <strong className="text-app-ink">{t("wa.rule")}</strong> {t("wa.ruleBody")} <Link href="/home/marketing/whatsapp" className="font-bold underline">{t("wa.templates")}</Link>{t("wa.ruleAfter")}
          </p>
        </Step>

        <Step n={3} title={t("wa.step3")} sub={t("wa.step3Sub")} done={wa.mode === "live"}>
          <label className="grid gap-1 text-[13.5px] font-bold">
            {t("wa.ownWhatsApp")}
            <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="+2348012345678" inputMode="tel" className={`${input} font-mono`} />
          </label>
          <div className="flex flex-wrap gap-2">
            <PillButton size="md" tone="white" busy={testing} disabled={!connected || !testTo.trim()} onClick={() => void sendTest()}>{t("wa.sendTest")}</PillButton>
          </div>
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("wa.sendHiFirst")}</p>
          {testMessage ? <Notice tone={testMessage.tone}>{testMessage.text}</Notice> : null}
          <div className="grid gap-1.5">
            <span className="text-[13.5px] font-bold">{t("bot.waTitle")}</span>
            <Segmented
              options={[{ value: "off", label: t("ch.off") }, { value: "test", label: t("wa.modeTest") }, { value: "live", label: t("wa.modeLive") }]}
              value={wa.mode}
              onChange={(mode) => setWa({ mode })}
              className="border border-app-line"
            />
          </div>
          {liveBlocked && wa.mode !== "off" ? <Notice tone="info">{!connected ? t("wa.step1First") : t("wa.notOn")}</Notice> : null}
          <div className="flex flex-wrap items-center gap-3">
            <PillButton size="md" busy={saving} disabled={!ready || (wa.mode !== "off" && !connected)} onClick={() => void save()}>{wa.mode === "live" ? t("wa.saveLive") : t("save")}</PillButton>
          </div>
          {saveMessage ? <Notice tone={saveMessage.tone}>{saveMessage.text}</Notice> : null}
        </Step>
      </div>

      <Card className="grid h-fit content-start gap-3 p-5 xl:sticky xl:top-4">
        <CardHead title={t("wa.health")} sub={connected ? health.displayName ?? t("ch.connected") : t("wa.notConnectedYet")} />
        <div className="flex flex-wrap gap-2">
          <Pill tone={!connected ? "muted" : view.lastError || health.failedLastDay ? "warning" : "success"} dot>{!connected ? t("ch.notConnected") : view.lastError || health.failedLastDay ? t("ch.attention") : t("wa.working")}</Pill>
          <Pill tone={wa.mode === "live" ? "success" : wa.mode === "test" ? "info" : "muted"}>{wa.mode === "live" ? t("wa.peggyLive") : wa.mode === "test" ? t("wa.peggyTest") : t("wa.peggyOff")}</Pill>
        </div>
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13.5px]">
          <dt className="text-app-ink-soft">{t("wa.lastIn")}</dt>
          <dd className="m-0 text-right font-semibold">{when(health.lastInboundAt, t, locale)}</dd>
          <dt className="text-app-ink-soft">{t("wa.lastReply")}</dt>
          <dd className="m-0 text-right font-semibold">{when(health.lastPeggyReplyAt, t, locale)}</dd>
          <dt className="text-app-ink-soft">{t("wa.replies24")}</dt>
          <dd className="m-0 text-right font-semibold">{health.peggyRepliesToday}</dd>
          <dt className="text-app-ink-soft">{t("wa.failed24")}</dt>
          <dd className={`m-0 text-right font-semibold ${health.failedLastDay ? "text-app-danger" : ""}`}>{health.failedLastDay}</dd>
          <dt className="text-app-ink-soft">{t("wa.waitingForYou")}</dt>
          <dd className="m-0 text-right font-semibold">{health.handedOffOpen ? <Link href="/home/messages" className="text-app-ink underline">{t("wa.chats", { count: health.handedOffOpen })}</Link> : t("wa.none")}</dd>
          <dt className="text-app-ink-soft">{t("wa.lasts")}</dt>
          <dd className={`m-0 text-right font-semibold ${tokenWarn ? "text-app-danger" : ""}`}>{connected ? tokenText(health.tokenExpiresAt, t, locale) : "-"}</dd>
          {health.qualityRating ? (
            <>
              <dt className="text-app-ink-soft">{t("wa.quality")}</dt>
              <dd className="m-0 text-right font-semibold">{health.qualityRating}</dd>
            </>
          ) : null}
        </dl>
        {health.lastFailure ? <Notice tone="error"><span title={health.lastFailure}>{t("wa.lastFailure")}</span></Notice> : null}
        {tokenWarn ? <Notice tone="error">{t("wa.tokenWarn")}</Notice> : null}
        <p className="m-0 text-[12.5px] text-app-ink-soft">{t("wa.labelled", { name: bot.name, store: storeName })}</p>
      </Card>
    </div>
  );
}
