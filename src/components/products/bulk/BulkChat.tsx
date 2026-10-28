"use client";

import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { useT } from "@/components/i18n/I18nProvider";
import { eventLines, type BulkEvent, type BulkItem, type BulkT } from "@shared/bulk-products";
import { bulkApi, type BulkSession } from "./client";

// Peggy's side of "Add many with Peggy" on the web: the chat (her lines come from shared/bulk-products.ts eventLines,
// in the person's language), photo cards for what she's looked at, her "same product?" ideas and the reply box.

const MAX_CHARS = 2000;

export function BulkChat({ session, money, onSession, onError, onAct }: { session: BulkSession; money: (kobo: number) => string; onSession: (session: BulkSession) => void; onError: (message: string | null) => void; onAct: (run: () => Promise<BulkSession | null>) => Promise<void> }) {
  const t = useT("bulkAdd");
  const tt: BulkT = (key, values) => t.dynamic(`${key}`, key, values);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [ideas, setIdeas] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const byNumber = new Map(session.items.map((item) => [item.number, item]));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [session.thread.length, sending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setDraft("");
    setSending(message);
    onError(null);
    try {
      const answer = await bulkApi.reply(session.id, message);
      if (answer.session) onSession(answer.session);
    } catch (sendError) {
      setDraft(message);
      onError(sendError instanceof Error ? sendError.message : t("chat.failed"));
    } finally {
      setSending(null);
    }
  }

  return (
    <section className="flex h-[min(62vh,640px)] min-h-[420px] flex-col overflow-hidden rounded-[22px] border border-app-line bg-white" aria-label={t("tab.chat")}>
      <header className="flex items-center gap-3 border-b border-app-line px-4 py-3">
        <Mascot name="peggy" className="h-10 w-10" />
        <div className="min-w-0">
          <strong className="block text-[15px]">Peggy</strong>
          <span className="block truncate text-[12.5px] text-app-ink-soft">{t("entry.sub")}</span>
        </div>
      </header>
      {session.groups.length > 0 && (
        <div className="border-b border-app-line bg-app-canvas px-4 py-2.5" data-testid="bulk-ideas">
          <button type="button" onClick={() => setIdeas((open) => !open)} aria-expanded={ideas} className="flex w-full items-center gap-3 text-left text-[13.5px] font-bold">
            <span className="flex">{session.groups[0].numbers.slice(0, 3).map((n, index) => <span key={n} className={index ? "-ml-3" : ""}><Photo src={byNumber.get(n)?.photos[0]} size={30} label={String(n)} /></span>)}</span>
            <span className="flex-1">{t("group.banner", { count: session.groups.length })}</span>
            <Icon name={ideas ? "chevDown" : "chevRight"} size={16} />
          </button>
          {ideas && (
            <div className="mt-2.5 flex max-h-[300px] flex-col gap-2.5 overflow-y-auto">
              {session.groups.slice(0, 10).map((group) => (
          <div key={group.key} className="rounded-[16px] border border-app-line bg-white p-3 text-[14px]">
            <div className="mb-2 flex gap-1.5">
              {group.numbers.slice(0, 5).map((n) => <Photo key={n} src={byNumber.get(n)?.photos[0]} size={44} label={String(n)} />)}
            </div>
            <p className="m-0 mb-2">{group.kind === "colours" ? t("group.colours", { numbers: group.numbers.join(", "), name: group.name.toLowerCase(), count: group.colours.length }) : t("group.angles", { numbers: group.numbers.join(", "), name: group.name.toLowerCase() })}</p>
            <div className="flex gap-2">
              <button type="button" className="min-h-[36px] rounded-full bg-app-ink px-4 text-[13px] font-bold text-white" onClick={() => void onAct(() => bulkApi.items(session.id, { op: "join", ids: group.numbers.map((n) => byNumber.get(n)?.id).filter(Boolean), kind: group.kind }))}>{t("group.join")}</button>
              <button type="button" className="min-h-[36px] rounded-full border border-app-line bg-white px-4 text-[13px] font-bold" onClick={() => void onAct(() => bulkApi.items(session.id, { op: "dismiss", key: group.key }))}>{t("group.no")}</button>
            </div>
          </div>
        ))}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" data-testid="bulk-thread">
        {session.thread.map((event) => (
          <Turn key={event.id} event={event} items={session.items} byNumber={byNumber} t={tt} money={money} />
        ))}
        {sending && (
          <>
            <Bubble mine text={sending} />
            <div className="self-start rounded-[18px] rounded-tl-[6px] bg-app-mint px-4 py-3 text-[14px] text-app-ink-soft">{t("chat.thinking")}</div>
          </>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-app-line px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <label htmlFor="bulk-reply" className="sr-only">{t("chat.label")}</label>
        <textarea
          id="bulk-reply"
          rows={1}
          value={draft}
          maxLength={MAX_CHARS}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
          placeholder={t("chat.placeholder")}
          className="field-sizing-content max-h-[140px] min-h-[48px] flex-1 resize-none rounded-[24px] border border-app-line bg-app-canvas px-5 py-3 text-[15px] leading-[1.4] outline-none placeholder:text-app-ink-faint focus:border-app-line-strong"
        />
        <VoiceInputButton variant="icon" value={draft} onChange={setDraft} maxLength={MAX_CHARS} context="product names and prices for Peggy" disabled={Boolean(sending)} />
        <button type="submit" disabled={!draft.trim() || Boolean(sending)} aria-label={t("chat.send")} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-app-ink text-white disabled:opacity-40">
          <Icon name="arrowUp" size={18} />
        </button>
      </form>
    </section>
  );
}

function Bubble({ text, mine }: { text: string; mine?: boolean }) {
  return (
    <div className={cx("max-w-[88%] whitespace-pre-wrap break-words px-4 py-3 text-[14.5px] leading-[1.5]", mine ? "self-end rounded-[18px] rounded-br-[6px] bg-app-ink text-white" : "self-start rounded-[18px] rounded-tl-[6px] bg-app-mint text-app-ink")}>
      {text}
    </div>
  );
}

function Photo({ src, size, label }: { src?: string; size: number; label: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={label} width={size} height={size} loading="lazy" className="shrink-0 rounded-[10px] bg-app-canvas object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-[10px] bg-app-canvas text-[12px] font-bold text-app-ink-soft" style={{ width: size, height: size }}>{label}</span>
  );
}

function Turn({ event, items, byNumber, t, money }: { event: BulkEvent; items: BulkItem[]; byNumber: Map<number, BulkItem>; t: BulkT; money: (kobo: number) => string }) {
  if (event.from === "me") return <Bubble mine text={event.kind === "text" ? event.text : ""} />;
  const lines = eventLines(event, items, t, money);
  const cards = event.kind === "intro" ? event.numbers.slice(0, 10).map((n) => byNumber.get(n)).filter((item): item is BulkItem => Boolean(item)) : [];
  return (
    <div className="flex flex-col gap-2">
      {lines.slice(0, 1).map((line, index) => <Bubble key={index} text={line} />)}
      {cards.length > 0 && (
        <div className="grid max-w-[96%] grid-cols-2 gap-2 self-start" data-testid="bulk-cards">
          {cards.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-[14px] border border-app-line bg-white p-1.5 pr-2.5">
              <Photo src={item.photos[0]} size={46} label={String(item.number)} />
              <div className="min-w-0 text-[12.5px] leading-tight">
                <strong className="block truncate">{item.number}. {item.name || t("item.unnamed", { n: item.number })}</strong>
                {item.hintLowKobo ? <span className="block truncate text-app-ink-soft">~{money(item.hintLowKobo)}{item.hintHighKobo && item.hintHighKobo !== item.hintLowKobo ? `–${money(item.hintHighKobo)}` : ""}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
      {lines.slice(1).map((line, index) => <Bubble key={index + 1} text={line} />)}
    </div>
  );
}
