"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Card, CardHead } from "@/components/app-kit";
import { Notice, PillButton, Segmented, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { inboxApi } from "@/components/messaging/inbox-ui";
import { cleanKeywords, type ChatbotSettings } from "@/lib/inbox/assistant";
import { Mascot } from "@/components/brand/Mascot";
import { useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@shared/i18n/catalog";
import { friendlyError } from "@/lib/errors/report-client";

// The storefront chatbot: switch it on, how Peggy introduces herself, what she may use to answer, when she hands
// over to the seller, and a test chat that uses the settings on screen (saved or not).

const input = "h-11 w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px] outline-none focus:border-app-ink";
const area = "w-full rounded-[14px] border border-app-line bg-white px-3 py-2.5 text-[15px] leading-[1.5] outline-none focus:border-app-ink";

const SOURCES: Array<[keyof ChatbotSettings["sources"], MessageKey<"inbox">, MessageKey<"inbox">]> = [
  ["products", "bot.src.products", "bot.src.productsSub"],
  ["delivery", "bot.src.delivery", "bot.src.deliverySub"],
  ["policies", "bot.src.policies", "bot.src.policiesSub"],
  ["faqs", "bot.src.faqs", "bot.src.faqsSub"],
];
const SAMPLE_QUESTIONS: Array<MessageKey<"inbox">> = ["bot.q1", "bot.q2", "bot.q3", "bot.q4"];

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
  const t = useT("inbox");
  const [bot, setBot] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [turns, setTurns] = useState<TestTurn[]>([]);
  const [message, setMessage] = useState("");
  const [asking, setAsking] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length, asking]);

  async function save() {
    setSaving(true);
    setResult(null);
    try {
      const saved = await inboxApi<{ chatbot: ChatbotSettings }>("/api/app/inbox/automation", { method: "PUT", body: JSON.stringify({ chatbot: bot }) });
      setBot(saved.chatbot);
      setResult({ tone: "success", text: saved.chatbot.enabled ? t("bot.savedOn") : t("bot.savedOff") });
    } catch (error) {
      setResult({ tone: "error", text: friendlyError(error) });
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
      setTurns([...next, { from: "shop", body: answer.reply, note: answer.handoff ? t("bot.note.handoff") : answer.source === "keyword" ? t("bot.note.keyword") : answer.source === "fallback" ? t("bot.note.fallback") : undefined }]);
    } catch (error) {
      setTestError(friendlyError(error));
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid min-w-0 content-start gap-5">
        {!ready ? <Notice tone="info">{t("bot.needsUpdate")}</Notice> : null}
        {!aiAvailable ? (
          <Notice tone="info">{t("bot.noKey")} <Link href="/home/inbox/auto-replies" className="font-bold underline">{t("bot.noKeyLink")}</Link> {t("bot.instead")}</Notice>
        ) : null}
        {!widgetOn ? (
          <Notice tone="info">{t("bot.widgetOff")} <Link href="/home/marketing/chat" className="font-bold underline">{t("channel.livechat")}</Link> {t("bot.widgetOffAfter")}</Notice>
        ) : null}

        <Card className="grid gap-4 p-5">
          <CardHead title={t("ar.kindChatbot")} sub={t("bot.cardSub")} />
          <Switch label={t("bot.letPeggy")} on={bot.enabled} onChange={(on) => setBot((b) => ({ ...b, enabled: on }))} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-[13.5px] font-bold">
              {t("bot.nameShown")}
              <input value={bot.name} maxLength={40} onChange={(e) => setBot((b) => ({ ...b, name: e.target.value }))} className={input} />
            </label>
            <label className="grid gap-1 text-[13.5px] font-bold">
              {t("bot.tone")}
              <select value={bot.tone} onChange={(e) => setBot((b) => ({ ...b, tone: e.target.value as ChatbotSettings["tone"] }))} className={input}>
                <option value="friendly">{t("bot.friendly")}</option>
                <option value="professional">{t("bot.professional")}</option>
                <option value="playful">{t("bot.playful")}</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-[13.5px] font-bold">
            {t("bot.greeting")}
            <textarea rows={2} maxLength={300} value={bot.greeting} onChange={(e) => setBot((b) => ({ ...b, greeting: e.target.value }))} className={area} />
          </label>
          <div className="grid gap-1.5">
            <span className="text-[13.5px] font-bold">{t("bot.whenAnswers")}</span>
            <Segmented options={[{ value: "always", label: t("bot.always") }, { value: "outside_hours", label: hoursOn ? t("bot.outsideHours") : t("bot.whenAway") }]} value={bot.when} onChange={(when) => setBot((b) => ({ ...b, when }))} className="border border-app-line" />
            <span className="text-[12.5px] text-app-ink-soft">{hoursOn ? t("bot.usesHours") : <>{t("bot.setHours")} <Link href="/home/inbox/auto-replies" className="font-bold text-app-ink">{t("autoReplies")}</Link> {t("bot.setHoursAfter")}</>} {t("bot.quiet")}</span>
          </div>
          <label className="grid gap-1 text-[13.5px] font-bold">
            {t("bot.monthlyCap")}
            <input
              type="number"
              min={0}
              max={100000}
              step={1}
              inputMode="numeric"
              value={bot.monthlyCap}
              onChange={(e) => setBot((b) => ({ ...b, monthlyCap: Math.max(0, Math.min(100_000, Math.round(Number(e.target.value) || 0))) }))}
              className={input}
            />
            <span className="text-[12.5px] font-normal text-app-ink-soft">{t("bot.monthlyCapHelp")}</span>
          </label>
        </Card>

        <Card className="grid gap-3 p-5">
          <CardHead title={t("bot.mayUse")} sub={t("bot.mayUseSub")} />
          {SOURCES.map(([key, label, sub]) => (
            <Switch key={key} label={t(label)} sub={t(sub)} on={bot.sources[key]} onChange={(on) => setBot((b) => ({ ...b, sources: { ...b.sources, [key]: on } }))} />
          ))}
          <p className="m-0 text-[12.5px] text-app-ink-soft">
            {t("bot.keepCurrent")} <Link href="/products" className="font-bold text-app-ink">{t("bot.products")}</Link>, <Link href="/home/shipping" className="font-bold text-app-ink">{t("bot.deliverySettings")}</Link> {t("bot.and")} <Link href="/home/legal" className="font-bold text-app-ink">{t("bot.legal")}</Link>.
          </p>
        </Card>

        <Card className="grid gap-3 p-5">
          <CardHead title={t("bot.src.faqs")} sub={t("bot.faqsSub")} />
          {bot.faqs.map((faq, index) => (
            <div key={index} className="grid gap-2 rounded-[14px] border border-app-line p-3">
              <div className="flex items-center gap-2">
                <input aria-label={t("bot.question")} value={faq.q} maxLength={200} onChange={(e) => setBot((b) => ({ ...b, faqs: b.faqs.map((f, i) => (i === index ? { ...f, q: e.target.value } : f)) }))} className={`${input} font-bold`} placeholder={t("bot.questionPlaceholder")} />
                <button type="button" aria-label={t("bot.deleteQuestion")} onClick={() => setBot((b) => ({ ...b, faqs: b.faqs.filter((_, i) => i !== index) }))} className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-app-danger-tint hover:text-app-danger"><Icon name="trash" size={16} /></button>
              </div>
              <textarea aria-label={t("bot.answer")} rows={2} maxLength={1000} value={faq.a} onChange={(e) => setBot((b) => ({ ...b, faqs: b.faqs.map((f, i) => (i === index ? { ...f, a: e.target.value } : f)) }))} className={area} placeholder={t("bot.answerPlaceholder")} />
            </div>
          ))}
          <div>
            <button type="button" disabled={bot.faqs.length >= 30} onClick={() => setBot((b) => ({ ...b, faqs: [...b.faqs, { q: "", a: "" }] }))} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold hover:border-app-ink">
              <Icon name="plus" size={14} /> {t("bot.addQuestion")}
            </button>
          </div>
        </Card>

        <Card className="grid gap-3 p-5">
          <CardHead title={t("bot.handover")} sub={t("bot.handoverSub")} />
          <label className="grid gap-1 text-[13.5px] font-bold">
            {t("bot.alsoHandover")}
            <input defaultValue={bot.handoff.keywords.join(", ")} onBlur={(e) => setBot((b) => ({ ...b, handoff: { ...b.handoff, keywords: cleanKeywords(e.target.value) } }))} className={input} placeholder={t("bot.handoverPlaceholder")} />
          </label>
          <label className="grid gap-1 text-[13.5px] font-bold">
            {t("bot.handoverMessage")}
            <textarea rows={2} maxLength={400} value={bot.handoff.message} onChange={(e) => setBot((b) => ({ ...b, handoff: { ...b.handoff, message: e.target.value } }))} className={area} />
          </label>
        </Card>

        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-full bg-white/90 p-1.5 backdrop-blur sm:static sm:bg-transparent sm:p-0">
          <PillButton size="md" busy={saving} disabled={!ready} onClick={() => void save()}>{t("bot.save")}</PillButton>
        </div>
        {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
      </div>

      <Card className="grid h-[min(680px,calc(100dvh-140px))] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden xl:sticky xl:top-4">
        <div className="flex items-center gap-3 bg-app-ink px-4 py-3 text-white">
          <Mascot who="peggy" mood={asking ? "thinking" : testError ? "oops" : "idle"} className="h-9 w-9 rounded-full bg-white p-0.5" decorative />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold">{t("bot.test")}</div>
            <div className="truncate text-[12px] text-white/70">{t("bot.testSub", { store: storeName })}</div>
          </div>
          {turns.length ? <button type="button" onClick={() => setTurns([])} className="min-h-[36px] rounded-full px-3 text-[12.5px] font-bold hover:bg-white/10">{t("bot.startOver")}</button> : null}
        </div>
        <div className="flex flex-col gap-2 overflow-y-auto bg-app-canvas p-3" aria-live="polite">
          <div className="max-w-[85%] self-start rounded-[16px] rounded-bl-[6px] bg-white px-3 py-2 text-[14px] shadow-sm">
            <div className="mb-0.5 text-[11px] font-bold text-app-ink-soft">{t("bot.aiLabel", { name: bot.name })}</div>
            {bot.greeting}
          </div>
          {turns.map((turn, index) => (
            <div key={index} className={turn.from === "shopper" ? "max-w-[85%] self-end rounded-[16px] rounded-br-[6px] bg-app-ink px-3 py-2 text-[14px] text-white" : "max-w-[85%] self-start rounded-[16px] rounded-bl-[6px] bg-white px-3 py-2 text-[14px] shadow-sm"}>
              {turn.from === "shop" ? <div className="mb-0.5 text-[11px] font-bold text-app-ink-soft">{t("bot.aiLabel", { name: bot.name })}</div> : null}
              <span className="whitespace-pre-wrap">{turn.body}</span>
              {turn.note ? <div className="mt-1 text-[11.5px] font-semibold text-app-accent-ink">{turn.note}</div> : null}
            </div>
          ))}
          {asking ? <div className="self-start rounded-[16px] bg-white px-3 py-2 text-[13px] text-app-ink-soft shadow-sm" role="status">{t("bot.typing", { name: bot.name })}</div> : null}
          {!turns.length ? (
            <div className="mt-auto flex flex-wrap gap-1.5">
              {SAMPLE_QUESTIONS.map((key) => (
                <button key={key} type="button" onClick={() => void ask(t(key))} className="min-h-[34px] rounded-full border border-app-line bg-white px-3 text-[12.5px] font-semibold hover:border-app-ink">{t(key)}</button>
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
            <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1200} placeholder={t("bot.askLikeShopper")} aria-label={t("bot.testMessage")} className={`${input} min-w-0 flex-1`} />
            <button type="submit" disabled={asking || !message.trim()} aria-label={t("bot.sendTest")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-ink text-white disabled:opacity-50"><Icon name="send" size={16} /></button>
          </div>
        </form>
      </Card>
    </div>
  );
}
