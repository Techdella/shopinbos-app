"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AssistantNote, Card, CardHead, Pill } from "@/components/app-kit";
import { Notice, PillButton, Segmented, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { inboxApi } from "@/components/messaging/inbox-ui";
import {
  DEFAULT_AWAY_MESSAGE,
  KEYWORD_SUGGESTIONS,
  WEEKDAYS,
  WEEKDAY_LABELS,
  cleanKeywords,
  decideAutoReply,
  describeHours,
  isOpenNow,
  type AutoReplyRules,
} from "@/lib/inbox/assistant";
import { CHANNELS } from "@/lib/inbox/meta";

// Auto-replies: the master switch and away message (InboxSettings), plus business hours, per-channel switches,
// keyword quick replies and the instant "got it" (InboxAutomation). "Try a message" runs the same decision the
// inbox uses, so the seller sees exactly what a customer would get.

interface Settings {
  autoReplyEnabled: boolean;
  autoReplyMode: "message" | "peggy";
  awayMessage: string;
}

const input = "h-11 w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px] outline-none focus:border-app-ink";
const area = "w-full rounded-[14px] border border-app-line bg-white px-3 py-2.5 text-[15px] leading-[1.5] outline-none focus:border-app-ink";
const REPLY_CHANNELS = Object.values(CHANNELS).filter((channel) => channel.replies);

function Row({ label, sub, on, onChange }: { label: string; sub?: string; on: boolean; onChange: (on: boolean) => void }) {
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

export function AutoRepliesClient({ initial, ready, aiAvailable }: { initial: { settings: Settings; rules: AutoReplyRules }; ready: boolean; aiAvailable: boolean }) {
  const [settings, setSettings] = useState(initial.settings);
  const [rules, setRules] = useState(initial.rules);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [trial, setTrial] = useState("How much is delivery to Ikeja?");
  const [trialChannel, setTrialChannel] = useState("whatsapp");
  const [sellerAway, setSellerAway] = useState(true);

  const setDay = (day: (typeof WEEKDAYS)[number], patch: Partial<AutoReplyRules["hours"]["days"]["mon"]>) =>
    setRules((r) => ({ ...r, hours: { ...r.hours, days: { ...r.hours.days, [day]: { ...r.hours.days[day], ...patch } } } }));

  async function save() {
    setSaving(true);
    setResult(null);
    try {
      const saved = await inboxApi<Settings>("/api/app/inbox/settings", { method: "PUT", body: JSON.stringify(settings) });
      setSettings((s) => ({ ...s, ...saved }));
      if (ready) {
        const next = await inboxApi<{ autoReply: AutoReplyRules }>("/api/app/inbox/automation", { method: "PUT", body: JSON.stringify({ autoReply: rules }) });
        setRules(next.autoReply);
      }
      setResult({ tone: "success", text: "Saved. New messages get these replies from now on." });
    } catch (error) {
      setResult({ tone: "error", text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const outcome = useMemo(
    () =>
      decideAutoReply({
        enabled: settings.autoReplyEnabled,
        mode: settings.autoReplyMode,
        awayMessage: settings.awayMessage,
        rules,
        channel: trialChannel,
        channelReplies: true,
        message: trial,
        sellerOnline: !sellerAway,
        lastAutoReplyAt: null,
        chatbot: false,
      }),
    [settings, rules, trial, trialChannel, sellerAway],
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="grid min-w-0 content-start gap-5">
        {!ready ? (
          <Notice tone="info">Opening hours, quick replies and the instant reply need a quick database update (docs/migrations/2026-10-12-email-autoreply.sql). Until then, only the away message below works.</Notice>
        ) : null}

        <Card className="grid gap-4 p-5">
          <CardHead title="Away message" sub="Sent at most once every 12 hours per conversation: outside your opening hours, or (with no hours set) when your inbox hasn't been open for 5 minutes." />
          <Row label="Reply automatically" sub="The master switch for every auto-reply on this page" on={settings.autoReplyEnabled} onChange={(on) => setSettings((s) => ({ ...s, autoReplyEnabled: on }))} />
          <Segmented options={[{ value: "message", label: "My message" }, { value: "peggy", label: "Peggy answers" }]} value={settings.autoReplyMode} onChange={(mode) => setSettings((s) => ({ ...s, autoReplyMode: mode }))} className="border border-app-line" />
          {settings.autoReplyMode === "peggy" ? (
            <AssistantNote>
              {aiAvailable
                ? "Peggy answers from your products, prices and store details, says you'll follow up, and never makes up stock, prices or delivery times. If she can't answer, your away message is sent instead."
                : "Peggy needs an AI key on the server (ANTHROPIC_API_KEY or OPENAI_API_KEY). Until then your away message is sent."}
            </AssistantNote>
          ) : null}
          <label className="grid gap-1 text-[13.5px] font-bold">
            Away message
            <textarea rows={3} maxLength={600} value={settings.awayMessage} onChange={(e) => setSettings((s) => ({ ...s, awayMessage: e.target.value }))} placeholder={DEFAULT_AWAY_MESSAGE} className={area} />
          </label>
        </Card>

        <Card className="grid gap-4 p-5">
          <CardHead title="Opening hours" sub="Lagos time. Outside these hours customers get the away message, with when you're back." action={rules.hours.enabled ? <Pill tone={isOpenNow(rules.hours) ? "success" : "muted"} dot>{isOpenNow(rules.hours) ? "Open now" : "Closed now"}</Pill> : null} />
          <Row label="Use opening hours" sub={rules.hours.enabled ? describeHours(rules.hours) : "Off: the away message goes out whenever you're not in the inbox"} on={rules.hours.enabled} onChange={(on) => setRules((r) => ({ ...r, hours: { ...r.hours, enabled: on } }))} />
          {rules.hours.enabled ? (
            <>
              <ul className="m-0 grid list-none gap-2 p-0">
                {WEEKDAYS.map((day) => {
                  const h = rules.hours.days[day];
                  return (
                    <li key={day} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border border-app-line px-3 py-2">
                      <label className="flex min-h-[44px] w-[140px] items-center gap-2 text-[14px] font-bold">
                        <input type="checkbox" checked={h.open} onChange={(e) => setDay(day, { open: e.target.checked })} className="h-[18px] w-[18px] accent-[#16141F]" />
                        {WEEKDAY_LABELS[day]}
                      </label>
                      {h.open ? (
                        <span className="flex items-center gap-2 text-[14px]">
                          <input type="time" aria-label={`${WEEKDAY_LABELS[day]} opens`} value={h.from} onChange={(e) => setDay(day, { from: e.target.value })} className={`${input} w-[120px]`} />
                          to
                          <input type="time" aria-label={`${WEEKDAY_LABELS[day]} closes`} value={h.to} onChange={(e) => setDay(day, { to: e.target.value })} className={`${input} w-[120px]`} />
                        </span>
                      ) : (
                        <span className="text-[13.5px] text-app-ink-soft">Closed</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <label className="flex min-h-[44px] items-center gap-2 text-[14px]">
                <input type="checkbox" checked={rules.mentionHours} onChange={(e) => setRules((r) => ({ ...r, mentionHours: e.target.checked }))} className="h-[18px] w-[18px] accent-[#16141F]" />
                Add when we&apos;re back to the away message (&ldquo;We&apos;re back tomorrow at 9am.&rdquo;)
              </label>
            </>
          ) : null}
        </Card>

        <Card className="grid gap-4 p-5">
          <CardHead title="Instant reply" sub="While you're open, let people know their message arrived. Once every 12 hours per conversation." />
          <Row label='Send "Thanks, we got your message"' on={rules.ack.enabled} onChange={(on) => setRules((r) => ({ ...r, ack: { ...r.ack, enabled: on } }))} />
          {rules.ack.enabled ? (
            <textarea rows={2} maxLength={600} aria-label="Instant reply" value={rules.ack.message} onChange={(e) => setRules((r) => ({ ...r, ack: { ...r.ack, message: e.target.value } }))} className={area} />
          ) : null}
        </Card>

        <Card className="grid gap-4 p-5">
          <CardHead title="Quick replies to common questions" sub='When a message mentions a word like "price" or "delivery", send a ready answer straight away. Each one goes once every 12 hours per conversation.' />
          <Row label="Use quick replies" on={rules.keywordsEnabled} onChange={(on) => setRules((r) => ({ ...r, keywordsEnabled: on }))} />
          <ul className="m-0 grid list-none gap-3 p-0">
            {rules.keywords.map((rule, index) => (
              <li key={rule.id} className="grid gap-2 rounded-[14px] border border-app-line p-3">
                <div className="flex items-center gap-2">
                  <label className="grid min-w-0 flex-1 gap-1 text-[13px] font-bold">
                    When the message mentions (separate with commas)
                    <input
                      defaultValue={rule.keywords.join(", ")}
                      onBlur={(e) => setRules((r) => ({ ...r, keywords: r.keywords.map((k, i) => (i === index ? { ...k, keywords: cleanKeywords(e.target.value) } : k)) }))}
                      className={input}
                      placeholder="price, how much"
                    />
                  </label>
                  <button type="button" aria-label="Delete quick reply" onClick={() => setRules((r) => ({ ...r, keywords: r.keywords.filter((_, i) => i !== index) }))} className="mt-5 grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-app-danger-tint hover:text-app-danger"><Icon name="trash" size={16} /></button>
                </div>
                <label className="grid gap-1 text-[13px] font-bold">
                  Reply with
                  <textarea rows={2} maxLength={1000} value={rule.reply} onChange={(e) => setRules((r) => ({ ...r, keywords: r.keywords.map((k, i) => (i === index ? { ...k, reply: e.target.value } : k)) }))} className={area} />
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setRules((r) => ({ ...r, keywords: [...r.keywords, { id: `k${Date.now().toString(36)}`, keywords: [], reply: "" }] }))} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-ink px-4 text-[13.5px] font-bold text-white">
              <Icon name="plus" size={14} /> Add a quick reply
            </button>
            {KEYWORD_SUGGESTIONS.filter((s) => !rules.keywords.some((k) => k.keywords.includes(s.keywords[0]))).map((suggestion) => (
              <button
                key={suggestion.keywords[0]}
                type="button"
                onClick={() => setRules((r) => ({ ...r, keywordsEnabled: true, keywords: [...r.keywords, { id: `k${Date.now().toString(36)}${r.keywords.length}`, ...suggestion }] }))}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold hover:border-app-ink"
              >
                <Icon name="plus" size={14} /> &ldquo;{suggestion.keywords[0]}&rdquo;
              </button>
            ))}
          </div>
          <p className="m-0 text-[12.5px] text-app-ink-soft">
            Never put prices or delivery times here that might change without you updating them. For one-tap answers you send yourself, use <Link href="/home/inbox/settings" className="font-bold text-app-ink">saved replies</Link>.
          </p>
        </Card>

        <Card className="grid gap-3 p-5">
          <CardHead title="Channels" sub="Switch auto-replies off where you'd rather answer yourself." />
          <div className="grid gap-2 sm:grid-cols-2">
            {REPLY_CHANNELS.map((channel) => (
              <Row key={channel.key} label={channel.label} on={rules.channels[channel.key] !== false} onChange={(on) => setRules((r) => ({ ...r, channels: { ...r.channels, [channel.key]: on } }))} />
            ))}
          </div>
          <p className="m-0 text-[12.5px] text-app-ink-soft">On live chat, the <Link href="/home/inbox/chatbot" className="font-bold text-app-ink">Peggy chatbot</Link> answers instead when it&apos;s on.</p>
        </Card>

        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-full bg-white/90 p-1.5 backdrop-blur sm:static sm:bg-transparent sm:p-0">
          <PillButton size="md" busy={saving} onClick={() => void save()}>Save auto-replies</PillButton>
        </div>
        {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
      </div>

      <div className="grid min-w-0 content-start gap-5">
        <Card className="grid gap-3 p-5 xl:sticky xl:top-4">
          <CardHead title="Try a message" sub="What would a customer get right now? Nothing is sent." />
          <textarea rows={2} aria-label="Customer message" value={trial} onChange={(e) => setTrial(e.target.value)} className={area} />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <select aria-label="Channel" value={trialChannel} onChange={(e) => setTrialChannel(e.target.value)} className={input}>
              {REPLY_CHANNELS.map((channel) => <option key={channel.key} value={channel.key}>{channel.label}</option>)}
            </select>
            <Segmented options={[{ value: "away", label: "I'm away" }, { value: "here", label: "I'm in" }]} value={sellerAway ? "away" : "here"} onChange={(v) => setSellerAway(v === "away")} className="border border-app-line" />
          </div>
          <div className="rounded-[16px] bg-app-canvas p-3">
            {outcome ? (
              <>
                <p className="m-0 mb-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-app-ink-soft">
                  {outcome.kind === "keyword" ? "Quick reply" : outcome.kind === "ack" ? "Instant reply" : outcome.kind === "away" ? (outcome.peggy ? "Peggy's answer (or this away message)" : "Away message") : "Chatbot"}
                </p>
                <p className="m-0 whitespace-pre-wrap rounded-[14px] rounded-bl-[6px] bg-white px-3 py-2 text-[14px] shadow-sm">{"body" in outcome ? outcome.body : "Peggy answers live."}</p>
              </>
            ) : (
              <p className="m-0 text-[13.5px] text-app-ink-soft">{settings.autoReplyEnabled ? "No automatic reply: you'll answer this one yourself." : "Auto-replies are off."}</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
