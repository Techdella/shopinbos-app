"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Card, CardHead } from "@/components/app-kit";
import { Notice, PillButton, Segmented, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { inboxApi } from "@/components/messaging/inbox-ui";
import { cleanKeywords, type ChatbotSettings } from "@/lib/inbox/assistant";

// The storefront chatbot: switch it on, how Peggy introduces herself, what she may use to answer, when she hands
// over to the seller, and a test chat that uses the settings on screen (saved or not).

const input = "h-11 w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px] outline-none focus:border-app-ink";
const area = "w-full rounded-[14px] border border-app-line bg-white px-3 py-2.5 text-[15px] leading-[1.5] outline-none focus:border-app-ink";

const SOURCES: Array<[keyof ChatbotSettings["sources"], string, string]> = [
  ["products", "Products and prices", "Names, prices and whether they're in stock"],
  ["delivery", "Delivery and payment", "Your delivery areas, fees and times, and ways to pay"],
  ["policies", "Returns and delivery pages", "Your published returns and delivery policy pages"],
  ["faqs", "Your FAQs", "The questions and answers you add below"],
];

function Switch({ label, sub, on, onChange }: { label: string; sub?: string; on: boolean; onChange: (on: boolean) => void }) {
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

interface TestTurn {
  from: "shopper" | "shop";
  body: string;
  note?: string;
}

export function ChatbotClient({ initial, hoursOn, ready, aiAvailable, widgetOn, storeName }: { initial: ChatbotSettings; hoursOn: boolean; ready: boolean; aiAvailable: boolean; widgetOn: boolean; storeName: string }) {
  const [bot, setBot] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [turns, setTurns] = useState<TestTurn[]>([]);
  const [message, setMessage] = useState("");
  const [asking, setAsking] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [turns.length, asking]);

  async function save() {
    setSaving(true);
    setResult(null);
    try {
      const saved = await inboxApi<{ chatbot: ChatbotSettings }>("/api/app/inbox/automation", { method: "PUT", body: JSON.stringify({ chatbot: bot }) });
      setBot(saved.chatbot);
      setResult({ tone: "success", text: saved.chatbot.enabled ? "Saved. Peggy is answering your live chat." : "Saved. The chatbot is off." });
    } catch (error) {
      setResult({ tone: "error", text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function ask(text: string) {
    if (!text.trim()) return;
    const next: TestTurn[] = [...turns, { from: "shopper", body: text.trim() }];
    setTurns(next);
    setMessage("");
    setAsking(true);
    setTestError(null);
    try {
      const answer = await inboxApi<{ reply: string; handoff: boolean; source: string }>("/api/app/inbox/chatbot/test", {
        method: "POST",
        body: JSON.stringify({ chatbot: bot, messages: next.slice(-20).map(({ from, body }) => ({ from, body })) }),
      });
      setTurns([...next, { from: "shop", body: answer.reply, note: answer.handoff ? "You'd get a notification to take over this chat." : answer.source === "keyword" ? "Quick reply (no AI)" : answer.source === "fallback" ? "Away message (no AI)" : undefined }]);
    } catch (error) {
      setTestError((error as Error).message);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid min-w-0 content-start gap-5">
        {!ready ? <Notice tone="info">The chatbot needs a quick database update first (docs/migrations/2026-10-12-email-autoreply.sql). You can still try it on the right.</Notice> : null}
        {!aiAvailable ? (
          <Notice tone="info">Peggy needs an AI key on the server (ANTHROPIC_API_KEY or OPENAI_API_KEY) to chat. Until then, shoppers on live chat get your <Link href="/home/inbox/auto-replies" className="font-bold underline">quick replies and away message</Link> instead.</Notice>
        ) : null}
        {!widgetOn ? (
          <Notice tone="info">Your store&apos;s chat box isn&apos;t switched on yet. Turn it on in <Link href="/home/marketing/chat" className="font-bold underline">Live chat</Link> so shoppers can talk to Peggy.</Notice>
        ) : null}

        <Card className="grid gap-4 p-5">
          <CardHead title="Chatbot" sub="Peggy answers shoppers straight away, labelled as an AI assistant. She never makes up prices, stock or delivery times, and says when a person will follow up." />
          <Switch label="Let Peggy answer my live chat" on={bot.enabled} onChange={(on) => setBot((b) => ({ ...b, enabled: on }))} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-[13.5px] font-bold">
              Name shown to shoppers
              <input value={bot.name} maxLength={40} onChange={(e) => setBot((b) => ({ ...b, name: e.target.value }))} className={input} />
            </label>
            <label className="grid gap-1 text-[13.5px] font-bold">
              Tone
              <select value={bot.tone} onChange={(e) => setBot((b) => ({ ...b, tone: e.target.value as ChatbotSettings["tone"] }))} className={input}>
                <option value="friendly">Warm and friendly</option>
                <option value="professional">Professional</option>
                <option value="playful">Playful, with Naija flavour</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-[13.5px] font-bold">
            Greeting
            <textarea rows={2} maxLength={300} value={bot.greeting} onChange={(e) => setBot((b) => ({ ...b, greeting: e.target.value }))} className={area} />
          </label>
          <div className="grid gap-1.5">
            <span className="text-[13.5px] font-bold">When Peggy answers</span>
            <Segmented options={[{ value: "always", label: "All the time" }, { value: "outside_hours", label: hoursOn ? "Outside opening hours" : "When I'm away" }]} value={bot.when} onChange={(when) => setBot((b) => ({ ...b, when }))} className="border border-app-line" />
            <span className="text-[12.5px] text-app-ink-soft">{hoursOn ? "Uses the opening hours from Auto-replies." : <>Set opening hours in <Link href="/home/inbox/auto-replies" className="font-bold text-app-ink">Auto-replies</Link> to use them here.</>} She also goes quiet for 10 minutes whenever you reply to a chat yourself.</span>
          </div>
        </Card>

        <Card className="grid gap-3 p-5">
          <CardHead title="What Peggy may use" sub="She only answers from these. Anything else, she says the shop will confirm." />
          {SOURCES.map(([key, label, sub]) => (
            <Switch key={key} label={label} sub={sub} on={bot.sources[key]} onChange={(on) => setBot((b) => ({ ...b, sources: { ...b.sources, [key]: on } }))} />
          ))}
          <p className="m-0 text-[12.5px] text-app-ink-soft">
            Keep them current in <Link href="/products" className="font-bold text-app-ink">Products</Link>, <Link href="/home/shipping" className="font-bold text-app-ink">delivery settings</Link> and <Link href="/home/legal" className="font-bold text-app-ink">Legal pages</Link>.
          </p>
        </Card>

        <Card className="grid gap-3 p-5">
          <CardHead title="Your FAQs" sub="Short answers to questions you get a lot. Peggy uses your words." />
          {bot.faqs.map((faq, index) => (
            <div key={index} className="grid gap-2 rounded-[14px] border border-app-line p-3">
              <div className="flex items-center gap-2">
                <input aria-label="Question" value={faq.q} maxLength={200} onChange={(e) => setBot((b) => ({ ...b, faqs: b.faqs.map((f, i) => (i === index ? { ...f, q: e.target.value } : f)) }))} className={`${input} font-bold`} placeholder="Do you do custom sizes?" />
                <button type="button" aria-label="Delete question" onClick={() => setBot((b) => ({ ...b, faqs: b.faqs.filter((_, i) => i !== index) }))} className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-app-danger-tint hover:text-app-danger"><Icon name="trash" size={16} /></button>
              </div>
              <textarea aria-label="Answer" rows={2} maxLength={1000} value={faq.a} onChange={(e) => setBot((b) => ({ ...b, faqs: b.faqs.map((f, i) => (i === index ? { ...f, a: e.target.value } : f)) }))} className={area} placeholder="Yes! Send your measurements and we'll confirm the price and time." />
            </div>
          ))}
          <div>
            <button type="button" disabled={bot.faqs.length >= 30} onClick={() => setBot((b) => ({ ...b, faqs: [...b.faqs, { q: "", a: "" }] }))} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold hover:border-app-ink">
              <Icon name="plus" size={14} /> Add a question
            </button>
          </div>
        </Card>

        <Card className="grid gap-3 p-5">
          <CardHead title="Hand over to you" sub='When a shopper asks for a person ("talk to someone", "customer care"…), has a complaint, or asks something Peggy can&apos;t answer, she stops, tags the chat "needs-human" and you get a notification.' />
          <label className="grid gap-1 text-[13.5px] font-bold">
            Also hand over when they say (separate with commas)
            <input defaultValue={bot.handoff.keywords.join(", ")} onBlur={(e) => setBot((b) => ({ ...b, handoff: { ...b.handoff, keywords: cleanKeywords(e.target.value) } }))} className={input} placeholder="refund, wholesale, bulk order" />
          </label>
          <label className="grid gap-1 text-[13.5px] font-bold">
            What Peggy says when she hands over
            <textarea rows={2} maxLength={400} value={bot.handoff.message} onChange={(e) => setBot((b) => ({ ...b, handoff: { ...b.handoff, message: e.target.value } }))} className={area} />
          </label>
        </Card>

        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-full bg-white/90 p-1.5 backdrop-blur sm:static sm:bg-transparent sm:p-0">
          <PillButton size="md" busy={saving} disabled={!ready} onClick={() => void save()}>Save chatbot</PillButton>
        </div>
        {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
      </div>

      <Card className="grid h-[min(680px,calc(100dvh-140px))] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden xl:sticky xl:top-4">
        <div className="flex items-center gap-3 bg-app-ink px-4 py-3 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/app/peggy.png" alt="" className="h-9 w-9 rounded-full bg-white object-contain p-0.5" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold">Test the chatbot</div>
            <div className="truncate text-[12px] text-white/70">As shoppers see it on {storeName}. Uses the settings on screen.</div>
          </div>
          {turns.length ? <button type="button" onClick={() => setTurns([])} className="min-h-[36px] rounded-full px-3 text-[12.5px] font-bold hover:bg-white/10">Start over</button> : null}
        </div>
        <div className="flex flex-col gap-2 overflow-y-auto bg-app-canvas p-3" aria-live="polite">
          <div className="max-w-[85%] self-start rounded-[16px] rounded-bl-[6px] bg-white px-3 py-2 text-[14px] shadow-sm">
            <div className="mb-0.5 text-[11px] font-bold text-app-ink-soft">{bot.name} · AI assistant</div>
            {bot.greeting}
          </div>
          {turns.map((turn, index) => (
            <div key={index} className={turn.from === "shopper" ? "max-w-[85%] self-end rounded-[16px] rounded-br-[6px] bg-app-ink px-3 py-2 text-[14px] text-white" : "max-w-[85%] self-start rounded-[16px] rounded-bl-[6px] bg-white px-3 py-2 text-[14px] shadow-sm"}>
              {turn.from === "shop" ? <div className="mb-0.5 text-[11px] font-bold text-app-ink-soft">{bot.name} · AI assistant</div> : null}
              <span className="whitespace-pre-wrap">{turn.body}</span>
              {turn.note ? <div className="mt-1 text-[11.5px] font-semibold text-app-accent-ink">{turn.note}</div> : null}
            </div>
          ))}
          {asking ? <div className="self-start rounded-[16px] bg-white px-3 py-2 text-[13px] text-app-ink-soft shadow-sm" role="status">{bot.name} is typing…</div> : null}
          {!turns.length ? (
            <div className="mt-auto flex flex-wrap gap-1.5">
              {["How much is delivery to Abuja?", "Do you have this in size 42?", "Can I pay on delivery?", "I want to talk to a person"].map((q) => (
                <button key={q} type="button" onClick={() => void ask(q)} className="min-h-[34px] rounded-full border border-app-line bg-white px-3 text-[12.5px] font-semibold hover:border-app-ink">{q}</button>
              ))}
            </div>
          ) : null}
          <div ref={end} />
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void ask(message);
          }}
          className="grid gap-2 border-t border-app-line bg-white p-3"
        >
          {testError ? <p role="alert" className="m-0 text-[12.5px] font-semibold text-app-danger">{testError}</p> : null}
          <div className="flex items-end gap-2">
            <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1200} placeholder="Ask like a shopper would" aria-label="Test message" className={`${input} min-w-0 flex-1`} />
            <button type="submit" disabled={asking || !message.trim()} aria-label="Send test message" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-ink text-white disabled:opacity-50"><Icon name="send" size={16} /></button>
          </div>
        </form>
      </Card>
    </div>
  );
}
