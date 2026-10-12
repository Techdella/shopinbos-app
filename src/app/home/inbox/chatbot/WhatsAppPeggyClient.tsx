"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { Notice, PillButton, Segmented, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { formatWhen, inboxApi } from "@/components/messaging/inbox-ui";
import type { ChatbotSettings, WhatsAppBotSettings } from "@/lib/inbox/assistant";
import type { ChannelView } from "@/lib/inbox/connect";
import type { WhatsAppHealth } from "@/lib/inbox/whatsapp-bot.server";

// "Put Peggy on your WhatsApp": 1. connect WhatsApp Business (Embedded Signup when the platform has a Meta app,
// otherwise the guided manual connect), 2. choose what Peggy does there, 3. test on your own number, then go live.
// Health on top: last message in, Peggy's last reply, failures, token expiry. Keys never come back to the browser.

const input = "h-11 w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px] outline-none focus:border-app-ink";
const area = "w-full rounded-[14px] border border-app-line bg-white px-3 py-2.5 text-[15px] leading-[1.5] outline-none focus:border-app-ink";
const GRAPH_VERSION = "v21.0";

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (callback: (response: { authResponse?: { code?: string } | null; status?: string }) => void, options: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

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

function CopyRow({ label, value }: { label: string; value: string }) {
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
          aria-label={`Copy ${label}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-white"
        >
          <Icon name={copied ? "check" : "copy"} size={15} />
        </button>
      </div>
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

const when = (iso: string | null) => (iso ? formatWhen(iso) : "Never");

function tokenText(value: string | null) {
  if (!value) return "Unknown";
  if (value === "never") return "Doesn't expire";
  const date = new Date(value);
  if (date.getTime() <= Date.now()) return "Expired";
  return `Expires ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

function loadFacebookSdk(appId: string): Promise<NonNullable<Window["FB"]>> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: GRAPH_VERSION });
      resolve(window.FB!);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => reject(new Error("Facebook sign-up couldn't load here. Use the manual connect below."));
    document.body.appendChild(script);
    window.setTimeout(() => reject(new Error("Facebook sign-up took too long to load. Use the manual connect below.")), 15_000);
  });
}

export function WhatsAppPeggyClient({
  initialBot,
  initialView,
  initialHealth,
  ready,
  aiAvailable,
  hoursOn,
  encryptionReady,
  platformSecret,
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
  platformSecret: boolean;
  signup: { appId: string; configId: string } | null;
  ownerPhone: string;
  storeName: string;
}) {
  const [bot, setBot] = useState(initialBot);
  const [view, setView] = useState(initialView);
  const [health, setHealth] = useState(initialHealth);
  const connected = view.status === "connected";
  const wa = bot.whatsapp;
  const setWa = (patch: Partial<WhatsAppBotSettings>) => setBot((b) => ({ ...b, whatsapp: { ...b.whatsapp, ...patch } }));

  // Step 1
  const [manual, setManual] = useState(!signup);
  const [keys, setKeys] = useState<Record<string, string>>({});
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

  async function connectManual() {
    setConnecting(true);
    setConnectMessage(null);
    try {
      const body = Object.fromEntries(Object.entries(keys).filter(([, v]) => v.trim()));
      const next = await inboxApi<ChannelView>("/api/app/inbox/channels/whatsapp", { method: "POST", body: JSON.stringify(body) });
      setView(next);
      setKeys({});
      setConnectMessage({ tone: "success", text: "WhatsApp is connected. Now paste the callback URL and verify token into your Meta app (below)." });
      setHealth(await inboxApi<WhatsAppHealth>("/api/app/inbox/whatsapp"));
    } catch (error) {
      setConnectMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setConnecting(false);
    }
  }

  async function connectEmbedded() {
    if (!signup) return;
    setConnecting(true);
    setConnectMessage(null);
    let session: { phone_number_id?: string; waba_id?: string } | null = null;
    const onMessage = (event: MessageEvent) => {
      let host = "";
      try {
        host = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (host !== "facebook.com" && !host.endsWith(".facebook.com")) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP" && typeof data.event === "string" && data.event.startsWith("FINISH")) session = data.data ?? null;
      } catch {
        // Other Facebook messages aren't JSON.
      }
    };
    window.addEventListener("message", onMessage);
    try {
      const FB = await loadFacebookSdk(signup.appId);
      const code = await new Promise<string | null>((resolve) => {
        FB.login((response) => resolve(response.authResponse?.code ?? null), { config_id: signup.configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, sessionInfoVersion: "3" } });
      });
      if (!code) throw new Error("WhatsApp sign-up was closed before it finished.");
      // The number and account ids arrive in a separate message from Facebook; give it a moment.
      for (let i = 0; i < 20 && !session; i++) await new Promise((r) => window.setTimeout(r, 150));
      const info = session as { phone_number_id?: string; waba_id?: string } | null;
      if (!info?.phone_number_id || !info?.waba_id) throw new Error("Facebook didn't send back your WhatsApp number. Try again, or use the manual connect.");
      const result = await inboxApi<{ view: ChannelView; health: WhatsAppHealth }>("/api/app/inbox/whatsapp", { method: "POST", body: JSON.stringify({ action: "embedded_signup", code, phoneNumberId: info.phone_number_id, wabaId: info.waba_id }) });
      setView(result.view);
      setHealth(result.health);
      setConnectMessage({ tone: "success", text: "WhatsApp is connected. Messages to your number now arrive in your inbox." });
    } catch (error) {
      setConnectMessage({ tone: "error", text: (error as Error).message });
    } finally {
      window.removeEventListener("message", onMessage);
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
      setChecks([{ label: "Connection", ok: false, detail: (error as Error).message }]);
    } finally {
      setChecking(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestMessage(null);
    try {
      await inboxApi("/api/app/inbox/whatsapp", { method: "POST", body: JSON.stringify({ action: "send_test", to: testTo }) });
      setTestMessage({ tone: "success", text: "Sent. Check WhatsApp on your phone. Put Peggy in test mode and reply to see her answer." });
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
      setSaveMessage({ tone: "success", text: mode === "live" ? "Peggy is live on your WhatsApp." : mode === "test" ? `Test mode: Peggy only answers ${saved.chatbot.whatsapp.testNumber || "your own number"}. Message your business number from it.` : "Saved. Peggy is off on WhatsApp." });
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
        {!ready ? <Notice tone="info">Peggy&apos;s settings need a quick database update first (docs/migrations/2026-10-12-email-autoreply.sql). You can connect WhatsApp now.</Notice> : null}
        {!aiAvailable ? (
          <Notice tone="info">Peggy needs an AI key on the server (ANTHROPIC_API_KEY or OPENAI_API_KEY) to answer open questions. Without it she still shows your products, takes orders, looks up order status and hands over to you; other messages get your <Link href="/home/inbox/auto-replies" className="font-bold underline">quick replies and away message</Link>.</Notice>
        ) : null}

        <Step n={1} title="Connect WhatsApp Business" sub="Your WhatsApp Business number on Meta's Cloud API. Customers' messages arrive in your Shopinbos inbox." done={connected}>
          {connected ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={view.lastError ? "warning" : "success"} dot>{view.lastError ? "Needs attention" : "Connected"}</Pill>
                <span className="text-[14px] font-semibold">{view.displayName}</span>
              </div>
              {view.lastError ? <Notice tone="error">{view.lastError}</Notice> : null}
              {health.via !== "embedded" && view.webhookUrl ? (
                <div className="grid gap-2">
                  <p className="m-0 text-[13px] text-app-ink-soft">In your Meta app → WhatsApp → Configuration, set this callback URL and verify token, then subscribe to <strong>messages</strong>.</p>
                  <CopyRow label="Callback URL" value={view.webhookUrl} />
                  {view.verifyToken ? <CopyRow label="Verify token" value={view.verifyToken} /> : null}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <PillButton size="md" tone="white" busy={checking} onClick={() => void testConnection()}>Test connection</PillButton>
                <Link href="/home/inbox/channels" className="inline-flex min-h-[48px] items-center rounded-full px-5 text-[15px] font-bold text-app-ink no-underline hover:bg-black/[0.04]">Change or disconnect</Link>
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
            <Notice tone="error">This server can&apos;t store WhatsApp keys safely yet. Your Shopinbos admin needs to set INBOX_ENCRYPTION_KEY.</Notice>
          ) : (
            <div className="grid gap-4">
              {signup ? (
                <div className="grid gap-2">
                  <div>
                    <PillButton size="md" busy={connecting && !manual} onClick={() => void connectEmbedded()}>
                      <Icon name="whatsapp" size={16} /> Connect with Facebook
                    </PillButton>
                  </div>
                  <p className="m-0 text-[12.5px] text-app-ink-soft">Log in to Facebook, pick or create your business, and add your WhatsApp number. It takes about 5 minutes. A number already in the WhatsApp Business app may need to be moved to the platform.</p>
                  <button type="button" onClick={() => setManual((m) => !m)} className="w-fit text-[13px] font-bold text-app-ink underline">{manual ? "Hide manual connect" : "I have my own Meta app (connect manually)"}</button>
                </div>
              ) : null}
              {manual ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void connectManual();
                  }}
                  className="grid gap-3"
                >
                  <ol className="m-0 grid gap-1.5 pl-5 text-[13px] leading-[1.5]">
                    <li>In <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="font-bold underline">Meta for Developers</a>, create a Business app and add WhatsApp.</li>
                    <li>In WhatsApp → API Setup, add and verify your business number. Copy its <strong>Phone number ID</strong> and <strong>WhatsApp Business Account ID</strong>.</li>
                    <li>In Business Settings → System users, create a system user with your WhatsApp account and generate a permanent token with <code>whatsapp_business_messaging</code> and <code>whatsapp_business_management</code>.</li>
                    <li>Paste them here. We check them with Meta before saving, and subscribe your account to messages.</li>
                    <li>Then set the callback URL and verify token we show you in your app&apos;s WhatsApp → Configuration.</li>
                  </ol>
                  {[
                    { name: "accessToken", label: "Permanent access token", secret: true },
                    { name: "phoneNumberId", label: "Phone number ID", placeholder: "1234567890123" },
                    { name: "wabaId", label: "WhatsApp Business Account ID", placeholder: "1029384756" },
                    { name: "appSecret", label: "App secret", secret: true, optional: platformSecret, hint: "App settings → Basic. We use it to check that messages really come from Meta." },
                  ].map((field) => (
                    <label key={field.name} className="grid gap-1 text-[13.5px] font-bold">
                      <span>{field.label}{field.optional ? <span className="font-normal text-app-ink-soft"> (optional)</span> : null}</span>
                      <input
                        type={field.secret ? "password" : "text"}
                        autoComplete="off"
                        spellCheck={false}
                        required={!field.optional}
                        value={keys[field.name] ?? ""}
                        onChange={(e) => setKeys((k) => ({ ...k, [field.name]: e.target.value }))}
                        placeholder={field.placeholder}
                        className={`${input} font-mono text-[14px] font-normal`}
                      />
                      {field.hint ? <span className="text-[12px] font-normal text-app-ink-soft">{field.hint}</span> : null}
                    </label>
                  ))}
                  {view.webhookUrl ? <CopyRow label="Callback URL (for your Meta app)" value={view.webhookUrl} /> : null}
                  <p className="m-0 text-[12.5px] text-app-ink-soft">The verify token appears after you connect.</p>
                  <div><PillButton type="submit" size="md" busy={connecting && manual}>Connect WhatsApp</PillButton></div>
                </form>
              ) : null}
            </div>
          )}
          {connectMessage ? <Notice tone={connectMessage.tone}>{connectMessage.text}</Notice> : null}
        </Step>

        <Step n={2} title="Choose what Peggy does" sub="She answers only from your products, prices, delivery settings, policies and FAQs. She never makes up stock, prices or delivery times.">
          <div className="rounded-[14px] bg-app-canvas px-4 py-3">
            <span className="block text-[14px] font-semibold">Answers questions</span>
            <span className="block text-[12.5px] text-app-ink-soft">About products, prices, delivery and your FAQs. Name, FAQs and what she may use are shared with live chat: edit them on the <Link href="/home/inbox/chatbot" className="font-bold text-app-ink">live chat tab</Link>.</span>
          </div>
          <Switch label="Show products as a WhatsApp list" sub={'"What do you sell?" gets a tap-to-browse list with prices (up to 10 products).'} on={wa.productList} onChange={(on) => setWa({ productList: on })} />
          <div className="grid gap-1.5">
            <span className="text-[13.5px] font-bold">When a customer wants to buy</span>
            <Segmented
              options={[{ value: "link", label: "Send checkout link" }, { value: "collect", label: "Take the order for me" }, { value: "off", label: "Off" }]}
              value={wa.ordering}
              onChange={(ordering) => setWa({ ordering })}
              className="border border-app-line"
            />
            <span className="text-[12.5px] text-app-ink-soft">
              {wa.ordering === "link" ? "Peggy sends the product's page on your store so they can pay there." : wa.ordering === "collect" ? "Peggy asks how many and where to deliver, adds an order request note to the chat and notifies you to confirm and send payment details." : "Peggy hands buying questions to you."}
            </span>
          </div>
          <Switch label="Order status lookup" sub="“Where is my order?” shows orders placed with the same WhatsApp number. Never anyone else's." on={wa.orderStatus} onChange={(on) => setWa({ orderStatus: on })} />
          <div className="grid gap-1.5">
            <span className="text-[13.5px] font-bold">When Peggy answers</span>
            <Segmented options={[{ value: "always", label: "All the time" }, { value: "outside_hours", label: hoursOn ? "Outside opening hours" : "When I'm away" }]} value={wa.when} onChange={(value) => setWa({ when: value })} className="border border-app-line" />
            <span className="text-[12.5px] text-app-ink-soft">{hoursOn ? "Uses your opening hours from Auto-replies." : <>Set opening hours in <Link href="/home/inbox/auto-replies" className="font-bold text-app-ink">Auto-replies</Link> to use them here.</>}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-[13.5px] font-bold">
              Tone
              <select value={bot.tone} onChange={(e) => setBot((b) => ({ ...b, tone: e.target.value as ChatbotSettings["tone"] }))} className={input}>
                <option value="friendly">Warm and friendly</option>
                <option value="professional">Professional</option>
                <option value="playful">Playful, with Naija flavour</option>
              </select>
            </label>
            <label className="grid gap-1 text-[13.5px] font-bold">
              Quiet after you reply
              <select value={wa.quietMinutes} onChange={(e) => setWa({ quietMinutes: Number(e.target.value) })} className={input}>
                {[10, 30, 60, 120, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}</option>)}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-[13.5px] font-bold">
            WhatsApp greeting
            <textarea rows={2} maxLength={300} value={wa.greeting} placeholder={bot.greeting} onChange={(e) => setWa({ greeting: e.target.value })} className={area} />
            <span className="text-[12px] font-normal text-app-ink-soft">Sent when a customer says hi, with buttons for products, their order and a person. Peggy always says she&apos;s an AI assistant.</span>
          </label>
          <p className="m-0 rounded-[14px] bg-app-canvas px-4 py-3 text-[13px] leading-[1.5] text-app-ink-soft">
            <strong className="text-app-ink">Hand-off:</strong> when a customer says &quot;agent&quot;, &quot;person&quot;, &quot;human&quot; or asks something Peggy can&apos;t answer, she stops on that chat, tags it &quot;needs-human&quot; and you get a notification. She also goes quiet when you reply yourself.
            <br />
            <strong className="text-app-ink">24-hour rule:</strong> WhatsApp only allows replies within 24 hours of the customer&apos;s last message. After that you need an approved message template (WhatsApp Manager → Message templates). Peggy never sends templates.
          </p>
        </Step>

        <Step n={3} title="Test, then go live" sub="Try Peggy from your own phone first. In test mode she answers only your number; everyone else gets your usual auto-replies." done={wa.mode === "live"}>
          <label className="grid gap-1 text-[13.5px] font-bold">
            Your own WhatsApp number
            <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="+2348012345678" inputMode="tel" className={`${input} font-mono`} />
          </label>
          <div className="flex flex-wrap gap-2">
            <PillButton size="md" tone="white" busy={testing} disabled={!connected || !testTo.trim()} onClick={() => void sendTest()}>Send me a test message</PillButton>
          </div>
          <p className="m-0 text-[12.5px] text-app-ink-soft">WhatsApp only lets your business message people who wrote to it in the last 24 hours, so send &quot;hi&quot; to your business number from this phone first.</p>
          {testMessage ? <Notice tone={testMessage.tone}>{testMessage.text}</Notice> : null}
          <div className="grid gap-1.5">
            <span className="text-[13.5px] font-bold">Peggy on WhatsApp</span>
            <Segmented
              options={[{ value: "off", label: "Off" }, { value: "test", label: "Test (my number only)" }, { value: "live", label: "Live for everyone" }]}
              value={wa.mode}
              onChange={(mode) => setWa({ mode })}
              className="border border-app-line"
            />
          </div>
          {liveBlocked && wa.mode !== "off" ? <Notice tone="info">{!connected ? "Connect WhatsApp in step 1 first." : "Run the database update first."}</Notice> : null}
          <div className="flex flex-wrap items-center gap-3">
            <PillButton size="md" busy={saving} disabled={!ready || (wa.mode !== "off" && !connected)} onClick={() => void save()}>{wa.mode === "live" ? "Save and go live" : "Save"}</PillButton>
          </div>
          {saveMessage ? <Notice tone={saveMessage.tone}>{saveMessage.text}</Notice> : null}
        </Step>
      </div>

      <Card className="grid h-fit content-start gap-3 p-5 xl:sticky xl:top-4">
        <CardHead title="WhatsApp health" sub={connected ? health.displayName ?? "Connected" : "Not connected yet"} />
        <div className="flex flex-wrap gap-2">
          <Pill tone={!connected ? "muted" : view.lastError || health.failedLastDay ? "warning" : "success"} dot>{!connected ? "Not connected" : view.lastError || health.failedLastDay ? "Needs attention" : "Working"}</Pill>
          <Pill tone={wa.mode === "live" ? "success" : wa.mode === "test" ? "info" : "muted"}>{wa.mode === "live" ? "Peggy live" : wa.mode === "test" ? "Peggy in test mode" : "Peggy off"}</Pill>
        </div>
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13.5px]">
          <dt className="text-app-ink-soft">Last message in</dt>
          <dd className="m-0 text-right font-semibold">{when(health.lastInboundAt)}</dd>
          <dt className="text-app-ink-soft">Peggy&apos;s last reply</dt>
          <dd className="m-0 text-right font-semibold">{when(health.lastPeggyReplyAt)}</dd>
          <dt className="text-app-ink-soft">Peggy replies (24h)</dt>
          <dd className="m-0 text-right font-semibold">{health.peggyRepliesToday}</dd>
          <dt className="text-app-ink-soft">Failed sends (24h)</dt>
          <dd className={`m-0 text-right font-semibold ${health.failedLastDay ? "text-app-danger" : ""}`}>{health.failedLastDay}</dd>
          <dt className="text-app-ink-soft">Waiting for you</dt>
          <dd className="m-0 text-right font-semibold">{health.handedOffOpen ? <Link href="/home/messages" className="text-app-ink underline">{health.handedOffOpen} chat{health.handedOffOpen === 1 ? "" : "s"}</Link> : "None"}</dd>
          <dt className="text-app-ink-soft">Token</dt>
          <dd className={`m-0 text-right font-semibold ${tokenWarn ? "text-app-danger" : ""}`}>{connected ? tokenText(health.tokenExpiresAt) : "-"}</dd>
          {health.qualityRating ? (
            <>
              <dt className="text-app-ink-soft">Meta quality</dt>
              <dd className="m-0 text-right font-semibold">{health.qualityRating}</dd>
            </>
          ) : null}
        </dl>
        {health.lastFailure ? <Notice tone="error">Last failure: {health.lastFailure}</Notice> : null}
        {tokenWarn ? <Notice tone="error">Your token expires soon. Reconnect with a permanent System User token so Peggy doesn&apos;t stop.</Notice> : null}
        <p className="m-0 text-[12.5px] text-app-ink-soft">Peggy&apos;s replies show in your inbox labelled &quot;{bot.name} (WhatsApp bot)&quot;, so you can see everything she told {storeName}&apos;s customers.</p>
      </Card>
    </div>
  );
}
